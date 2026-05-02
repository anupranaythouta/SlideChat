import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent.parent / "data" / "slides.db"


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS decks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL,
                filename    TEXT NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS slides (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                deck_id      INTEGER REFERENCES decks(id),
                slide_number INTEGER NOT NULL,
                text_content TEXT
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS session_sources (
                session_id INTEGER REFERENCES sessions(id),
                deck_id    INTEGER REFERENCES decks(id),
                PRIMARY KEY (session_id, deck_id)
            );

            CREATE TABLE IF NOT EXISTS messages (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER REFERENCES sessions(id),
                role       TEXT CHECK(role IN ('user', 'assistant')),
                content    TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)


# --- Deck operations ---

def insert_deck(title: str, filename: str) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO decks (title, filename) VALUES (?, ?)", (title, filename)
        )
        return cur.lastrowid


def get_all_decks() -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM decks ORDER BY uploaded_at DESC").fetchall()


def get_deck(deck_id: int) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM decks WHERE id = ?", (deck_id,)).fetchone()


def update_deck(deck_id: int, title: str) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE decks SET title = ? WHERE id = ?", (title, deck_id))


def delete_deck(deck_id: int) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM slides WHERE deck_id = ?", (deck_id,))
        conn.execute("DELETE FROM session_sources WHERE deck_id = ?", (deck_id,))
        conn.execute("DELETE FROM decks WHERE id = ?", (deck_id,))


# --- Slide operations ---

def insert_slide(deck_id: int, slide_number: int, text_content: str) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO slides (deck_id, slide_number, text_content) VALUES (?, ?, ?)",
            (deck_id, slide_number, text_content),
        )
        return cur.lastrowid


def get_slides_for_deck(deck_id: int) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM slides WHERE deck_id = ? ORDER BY slide_number", (deck_id,)
        ).fetchall()


# --- Session operations ---

def create_session(name: str) -> int:
    with get_conn() as conn:
        cur = conn.execute("INSERT INTO sessions (name) VALUES (?)", (name,))
        return cur.lastrowid


def get_all_sessions() -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM sessions ORDER BY created_at DESC").fetchall()


def rename_session(session_id: int, name: str) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE sessions SET name = ? WHERE id = ?", (name, session_id))


def delete_session(session_id: int) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM session_sources WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


# --- Session sources ---

def set_session_sources(session_id: int, deck_ids: list[int]) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM session_sources WHERE session_id = ?", (session_id,))
        conn.executemany(
            "INSERT OR IGNORE INTO session_sources (session_id, deck_id) VALUES (?, ?)",
            [(session_id, did) for did in deck_ids],
        )


def get_session_sources(session_id: int) -> list[int]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT deck_id FROM session_sources WHERE session_id = ?", (session_id,)
        ).fetchall()
        return [r["deck_id"] for r in rows]


# --- Messages ---

def save_message(session_id: int, role: str, content: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
            (session_id, role, content),
        )


def get_messages(session_id: int) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at",
            (session_id,),
        ).fetchall()
