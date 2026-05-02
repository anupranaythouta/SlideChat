import os
import tempfile
from dotenv import load_dotenv
load_dotenv()
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from db.relational import (
    init_db,
    get_all_decks,
    get_deck,
    update_deck,
    delete_deck,
    get_stats,
    get_slides_for_deck,
    get_all_sessions,
    create_session,
    rename_session,
    delete_session,
    get_session_sources,
    set_session_sources,
    get_messages,
    save_message,
)
from pipeline.rag import ingest_deck, remove_deck, answer

app = FastAPI(title="SlideChat API")

init_db()

# ── Helpers ───────────────────────────────────────────────────────────────────

DECK_COLORS = [
    "oklch(0.72 0.14 160)",
    "oklch(0.72 0.14 70)",
    "oklch(0.72 0.14 280)",
    "oklch(0.72 0.14 30)",
    "oklch(0.72 0.14 220)",
    "oklch(0.72 0.14 120)",
]

SLIDE_KINDS = ["concept", "diagram", "code", "concept", "concept", "diagram", "code"]


def _format_date(ts_str: Optional[str]) -> str:
    """Format a DB timestamp string relative to today."""
    if not ts_str:
        return "Just now"
    try:
        dt = datetime.fromisoformat(ts_str)
        now = datetime.now()
        diff = (now.date() - dt.date()).days
        if diff == 0:
            return "Today"
        if diff == 1:
            return "Yesterday"
        return dt.strftime("%b %d")
    except Exception:
        return ts_str


def _slide_title(text_content: Optional[str], slide_number: int) -> str:
    """Extract a readable title from the first line of slide text."""
    if not text_content:
        return f"Slide {slide_number}"
    first = text_content.strip().split("\n")[0].strip()
    if len(first) > 60:
        first = first[:57] + "…"
    return first or f"Slide {slide_number}"


def _slide_kind(slide_number: int) -> str:
    if slide_number == 1:
        return "title"
    return SLIDE_KINDS[slide_number % len(SLIDE_KINDS)]


def _deck_to_api(deck_row, index: int) -> dict:
    deck_id = deck_row["id"]
    slides_db = get_slides_for_deck(deck_id)
    slides = [
        {
            "n": s["slide_number"],
            "title": _slide_title(s["text_content"], s["slide_number"]),
            "kind": _slide_kind(s["slide_number"]),
        }
        for s in slides_db
    ]
    title = deck_row["title"]
    short = title if len(title) <= 34 else title[:31] + "…"
    return {
        "id": str(deck_id),
        "title": title,
        "short": short,
        "pages": len(slides),
        "uploaded": _format_date(deck_row["uploaded_at"]),
        "color": DECK_COLORS[index % len(DECK_COLORS)],
        "slides": slides,
    }


def _session_to_api(sess_row, msg_counts: dict) -> dict:
    sid = sess_row["id"]
    return {
        "id": str(sid),
        "title": sess_row["name"],
        "when": _format_date(sess_row["created_at"]),
        "count": msg_counts.get(sid, 0),
    }


# ── Deck endpoints ────────────────────────────────────────────────────────────

@app.get("/api/decks")
def api_get_decks():
    rows = get_all_decks()
    return [_deck_to_api(r, i) for i, r in enumerate(rows)]


@app.post("/api/decks", status_code=201)
async def api_upload_deck(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".pdf", ".pptx"):
        raise HTTPException(400, "Only PDF and PPTX files are supported.")
    title = Path(file.filename).stem.replace("_", " ")
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        deck_id = ingest_deck(tmp_path, title=title, filename=file.filename)
    finally:
        os.unlink(tmp_path)
    rows = get_all_decks()
    idx = next((i for i, r in enumerate(rows) if r["id"] == deck_id), 0)
    deck_row = get_deck(deck_id)
    return _deck_to_api(deck_row, idx)


class DeckRename(BaseModel):
    title: str


@app.patch("/api/decks/{deck_id}")
def api_rename_deck(deck_id: int, body: DeckRename):
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title cannot be empty.")
    if not get_deck(deck_id):
        raise HTTPException(404, "Deck not found.")
    update_deck(deck_id, title)
    return {"ok": True}


@app.delete("/api/decks/{deck_id}", status_code=204)
def api_delete_deck(deck_id: int):
    if not get_deck(deck_id):
        raise HTTPException(404, "Deck not found.")
    remove_deck(deck_id)


# ── Session endpoints ─────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    name: str = "New conversation"


class SessionRename(BaseModel):
    name: str


@app.get("/api/sessions")
def api_get_sessions():
    from db.relational import get_conn
    rows = get_all_sessions()
    # Count messages per session in one query
    with get_conn() as conn:
        counts = conn.execute(
            "SELECT session_id, COUNT(*) as cnt FROM messages GROUP BY session_id"
        ).fetchall()
    msg_counts = {r["session_id"]: r["cnt"] for r in counts}
    return [_session_to_api(r, msg_counts) for r in rows]


@app.post("/api/sessions", status_code=201)
def api_create_session(body: SessionCreate):
    sid = create_session(body.name)
    from db.relational import get_conn
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
    return _session_to_api(row, {})


@app.patch("/api/sessions/{session_id}")
def api_rename_session(session_id: int, body: SessionRename):
    rename_session(session_id, body.name)
    return {"ok": True}


@app.delete("/api/sessions/{session_id}", status_code=204)
def api_delete_session(session_id: int):
    delete_session(session_id)


@app.get("/api/sessions/{session_id}/sources")
def api_get_sources(session_id: int):
    ids = get_session_sources(session_id)
    return [str(i) for i in ids]


class SourcesBody(BaseModel):
    deck_ids: list[str]


@app.put("/api/sessions/{session_id}/sources")
def api_set_sources(session_id: int, body: SourcesBody):
    int_ids = [int(x) for x in body.deck_ids]
    set_session_sources(session_id, int_ids)
    return {"ok": True}


@app.get("/api/sessions/{session_id}/messages")
def api_get_messages(session_id: int):
    rows = get_messages(session_id)
    return [{"role": r["role"], "content": r["content"]} for r in rows]


# ── Ask endpoint ──────────────────────────────────────────────────────────────

class AskBody(BaseModel):
    question: str


@app.post("/api/sessions/{session_id}/ask")
def api_ask(session_id: int, body: AskBody):
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty.")

    deck_ids = get_session_sources(session_id)
    if not deck_ids:
        raise HTTPException(400, "No source decks selected for this session.")

    response_text, chunks = answer(question, session_id)

    # Build deck title → id map for citation resolution
    decks_rows = get_all_decks()
    deck_id_to_str = {r["id"]: str(r["id"]) for r in decks_rows}
    deck_title_map = {r["title"]: str(r["id"]) for r in decks_rows}

    serialized_chunks = [
        {
            "deck_id": deck_id_to_str.get(c["deck_id"], str(c["deck_id"])),
            "deck_title": next(
                (r["title"] for r in decks_rows if r["id"] == c["deck_id"]), ""
            ),
            "slide_number": c["slide_number"],
            "text": c["text"],
        }
        for c in chunks
    ]

    return {
        "text": response_text,
        "chunks": serialized_chunks,
    }


# ── Stats endpoint ────────────────────────────────────────────────────────────

@app.get("/api/stats")
def api_get_stats():
    return get_stats()


# ── Static frontend ───────────────────────────────────────────────────────────

FRONTEND = Path(__file__).parent / "frontend"
if FRONTEND.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")
