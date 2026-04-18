import os
from google import genai
from google.genai import types

from db import relational, vector
from pipeline import embedder


def _gemini_client():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set.")
    return genai.Client(api_key=api_key)


def ingest_deck(file_path: str, title: str, filename: str) -> int:
    from pipeline.parser import parse_file

    slides = parse_file(file_path)
    deck_id = relational.insert_deck(title, filename)

    texts = [s["text"] for s in slides]
    embeddings = embedder.embed(texts)

    for slide, emb in zip(slides, embeddings):
        slide_id = relational.insert_slide(deck_id, slide["slide_number"], slide["text"])
        vector.upsert_slide(slide_id, deck_id, slide["slide_number"], emb, slide["text"])

    return deck_id


def remove_deck(deck_id: int) -> None:
    vector.delete_deck_vectors(deck_id)
    relational.delete_deck(deck_id)


def answer(question: str, session_id: int) -> tuple[str, list[dict]]:
    deck_ids = relational.get_session_sources(session_id)
    if not deck_ids:
        return "Please select at least one source deck before asking a question.", []

    query_emb = embedder.embed_one(question)
    chunks = vector.query_slides(query_emb, deck_ids, n_results=6)

    if not chunks:
        return "No relevant content found in the selected sources.", []

    deck_cache: dict[int, str] = {}

    def deck_title(did: int) -> str:
        if did not in deck_cache:
            row = relational.get_deck(did)
            deck_cache[did] = row["title"] if row else f"Deck {did}"
        return deck_cache[did]

    context_parts = []
    for c in chunks:
        label = f'[{deck_title(c["deck_id"])}, Slide {c["slide_number"]}]'
        context_parts.append(f"{label}\n{c['text']}")

    context = "\n\n---\n\n".join(context_parts)

    prompt = f"""You are a helpful study assistant. Answer the question using ONLY the slide content provided below.
For every claim you make, cite the source using the label format shown (e.g. [Deck Title, Slide N]).
If the slides do not contain enough information, say so clearly.

=== SLIDE CONTENT ===
{context}

=== QUESTION ===
{question}

=== ANSWER ==="""

    client = _gemini_client()
    response = client.models.generate_content(
        model="models/gemini-2.5-flash",
        contents=prompt,
    )
    answer_text = response.text.strip()

    relational.save_message(session_id, "user", question)
    relational.save_message(session_id, "assistant", answer_text)

    return answer_text, chunks
