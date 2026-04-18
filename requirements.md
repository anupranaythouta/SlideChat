# SlideChat — Project Requirements

RAG-powered Q&A over slide decks | Databases course final project

---

## Functional Requirements

- **Upload s![alt text](image.png)lide decks** — Accept PDF and PPTX files. Parse into per-slide text chunks. Store metadata in SQLite and embeddings in Chroma.
- **Source selection** — User picks 1+ uploaded decks as active sources for a session. Stored as a join table in SQLite.
- **Grounded chat** — User asks questions. System retrieves relevant slide chunks filtered to selected sources, passes to LLM, returns cited response.
- **Session management** — Each chat is a named session. Sessions persist — user can revisit and continue old ones.
- **Citations** — Each response indicates which deck and slide number the answer came from.

---

## Tech Stack

| Layer | Library | Notes |
|---|---|---|
| UI | `streamlit` | Single-file app, no separate server process |
| Relational DB | `sqlite3` | Built-in stdlib, or SQLAlchemy for ORM |
| Vector DB | `chromadb` | Local persistent storage, no Docker, no accounts |
| Embeddings | `sentence-transformers` | Free, fully local — use `all-MiniLM-L6-v2` |
| LLM | `gemini` | I have gemini API key |
| Slide parsing | `pdfplumber` + `python-pptx` | PDF and PPTX → per-slide plain text |

```
pip install streamlit chromadb sentence-transformers anthropic pdfplumber python-pptx
```

---

## Relational DB Schema

```sql
CREATE TABLE decks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    filename    TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE slides (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id      INTEGER REFERENCES decks(id),
    slide_number INTEGER NOT NULL,
    text_content TEXT
);

CREATE TABLE sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE session_sources (
    session_id INTEGER REFERENCES sessions(id),
    deck_id    INTEGER REFERENCES decks(id),
    PRIMARY KEY (session_id, deck_id)
);

CREATE TABLE messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id),
    role       TEXT CHECK(role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Key Pipelines

### Upload flow
1. Parse file → per-slide text (`parser.py`)
2. Save deck + slide rows to SQLite (`relational.py`)
3. Embed each slide chunk (`embedder.py`)
4. Upsert vectors to Chroma with `deck_id` metadata (`vector.py`)

### Chat query flow
1. Fetch selected `deck_id`s for session from SQLite
2. Run filtered vector search in Chroma — `where={"deck_id": {"$in": selected_ids}}`
3. Build prompt with retrieved chunks + source citations
4. Call LLM → stream response back
5. Save user + assistant messages to SQLite

---

## Folder Structure

```
notebooklm/
├── app.py                  # streamlit entry point
├── db/
│   ├── relational.py       # sqlite schema + queries (create, insert, fetch)
│   └── vector.py           # chroma client wrapper (upsert, query)
├── pipeline/
│   ├── parser.py           # pdf/pptx → per-slide text
│   ├── embedder.py         # text → embeddings
│   └── rag.py              # retrieve → prompt → llm response
├── data/
│   ├── slides.db           # sqlite file (auto-created)
│   └── chroma/             # chroma persistent storage (auto-created)
└── requirements.txt
```

---

## Tips

- The **filtered Chroma query** is the key integration point between both DBs — you fetch `deck_id`s from SQLite, then use them as a metadata filter in Chroma.
- Initialize SQLite tables on app startup with `CREATE TABLE IF NOT EXISTS` so the DB bootstraps itself.
- Use `st.session_state` in Streamlit to hold the active session ID and chat history across reruns.
- Chroma collections are per-project — use one collection (`slides`) and rely on metadata filtering rather than separate collections per deck.