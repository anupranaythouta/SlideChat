import chromadb
from pathlib import Path

CHROMA_PATH = Path(__file__).parent.parent / "data" / "chroma"
COLLECTION_NAME = "slides"

_client = None
_collection = None


def _get_collection():
    global _client, _collection
    if _collection is None:
        CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        _collection = _client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def upsert_slide(slide_id: int, deck_id: int, slide_number: int, embedding: list[float], text: str) -> None:
    col = _get_collection()
    col.upsert(
        ids=[str(slide_id)],
        embeddings=[embedding],
        documents=[text],
        metadatas=[{"deck_id": deck_id, "slide_number": slide_number}],
    )


def delete_deck_vectors(deck_id: int) -> None:
    col = _get_collection()
    results = col.get(where={"deck_id": deck_id})
    if results["ids"]:
        col.delete(ids=results["ids"])


def query_slides(query_embedding: list[float], deck_ids: list[int], n_results: int = 5) -> list[dict]:
    col = _get_collection()
    total = col.count()
    if total == 0:
        return []
    n_results = min(n_results, total)

    where = {"deck_id": {"$in": deck_ids}} if len(deck_ids) > 1 else {"deck_id": deck_ids[0]}

    results = col.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    chunks = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        chunks.append({
            "text": doc,
            "deck_id": meta["deck_id"],
            "slide_number": meta["slide_number"],
            "score": 1 - dist,
        })
    return chunks
