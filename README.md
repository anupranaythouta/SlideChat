# SlideChat

A RAG-based lecture slide study assistant. Upload PDF or PPTX slide decks, then ask questions and get cited, grounded answers drawn from your own material.

---

## Features

- Upload PDF / PPTX slide decks (extracted text, per-slide)
- Create chat sessions scoped to one or more decks
- Answers cite exact slides; click a citation to read the extracted slide text
- Rename or delete sessions and decks
- Statistics dashboard — query patterns, deck usage, activity timeline

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (in-browser Babel, no build step) |
| Backend | FastAPI + Uvicorn |
| Relational DB | SQLite (`data/slides.db`) |
| Vector DB | ChromaDB (`data/chroma/`) |
| Embeddings | `all-MiniLM-L6-v2` (SentenceTransformers, 384-dim) |
| LLM | Google Gemini 2.5 Flash |

---

## Setup

### 1. Prerequisites

- Python 3.11+
- A Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

### 2. Create a virtual environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your_api_key_here
```

The app reads this via `python-dotenv` on startup. Do **not** commit `.env` to git.

### 5. Run the server

```bash
uvicorn server:app --reload
```

Then open [http://localhost:8000](http://localhost:8000) in your browser.

The database and ChromaDB collection are created automatically on first run inside `data/`.

---

## Database Schema

Five SQLite tables, with foreign-key enforcement enabled on every connection (`PRAGMA foreign_keys = ON`):

```sql
decks            -- uploaded slide decks (id, title, filename, uploaded_at)
slides           -- per-slide extracted text (id, deck_id→decks, slide_number, text_content)
sessions         -- chat sessions (id, name, created_at)
session_sources  -- many-to-many: which decks a session can query (session_id→sessions, deck_id→decks)
messages         -- chat history (id, session_id→sessions, role, content, created_at)
```

Performance indexes:

```sql
idx_slides_deck_id          ON slides(deck_id)
idx_messages_session_id     ON messages(session_id)
idx_messages_role           ON messages(role)
idx_session_sources_deck_id ON session_sources(deck_id)
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/decks` | List all decks |
| POST | `/api/decks` | Upload a deck (multipart/form-data) |
| PATCH | `/api/decks/{id}` | Rename a deck |
| DELETE | `/api/decks/{id}` | Delete a deck and its slides |
| GET | `/api/decks/{id}/slides/{n}` | Get extracted text for slide n |
| GET | `/api/sessions` | List all sessions |
| POST | `/api/sessions` | Create a session |
| PATCH | `/api/sessions/{id}` | Rename a session |
| DELETE | `/api/sessions/{id}` | Delete a session and its messages |
| GET | `/api/sessions/{id}/sources` | Get deck IDs attached to a session |
| PUT | `/api/sessions/{id}/sources` | Set deck IDs attached to a session |
| GET | `/api/sessions/{id}/messages` | Get chat history |
| POST | `/api/sessions/{id}/ask` | Ask a question (RAG) |
| GET | `/api/stats` | Usage statistics |

---

## Project Structure

```
SlideChat/
├── server.py           # FastAPI app and all route handlers
├── db/
│   └── relational.py   # SQLite schema, CRUD functions, stats queries
├── pipeline/
│   ├── parser.py       # PDF / PPTX text extraction (pdfplumber, python-pptx)
│   ├── embedder.py     # SentenceTransformers embedding wrapper
│   └── rag.py          # Ingest, retrieve, and generate (ChromaDB + Gemini)
├── frontend/
│   ├── index.html      # Single-page app shell; loads all scripts
│   ├── styles.css
│   └── js/
│       ├── api.js          # Fetch wrappers for every backend endpoint
│       ├── app.js          # Root React component and shared state
│       ├── sidebar.js      # Deck list, session list, upload flow
│       ├── chat.js         # Chat header, message list, composer
│       ├── citation.js     # Citation chips and answer block renderer
│       ├── slideDrawer.js  # Side drawer: slide text viewer
│       ├── stats.js        # Statistics dashboard modal
│       ├── toast.js        # Global toast notification system
│       └── icons.js        # SVG icon constants
├── data/
│   ├── slides.db       # SQLite database (auto-created)
│   └── chroma/         # ChromaDB persistent storage (auto-created)
├── requirements.txt
├── .env                # API key (not committed)
└── REPORT.md           # Technical project report
```

---

## Usage

1. **Upload a deck** — click the upload button in the left sidebar and select a PDF or PPTX file.
2. **Create a session** — click the `+` button next to "Conversations".
3. **Attach sources** — select which decks this session should query using the source picker in the chat header.
4. **Ask questions** — type in the composer and press Enter or click Send.
5. **Explore citations** — click any citation chip in the answer to open the slide drawer and read the exact slide text.
6. **View stats** — click the chart icon in the top-right of the chat header.

---

## Security Notes

- All SQL queries use parameterized placeholders (`?`) — no string interpolation.
- `PRAGMA foreign_keys = ON` is set on every connection to enforce referential integrity.
- File uploads are validated by extension (`.pdf`, `.pptx` only) before processing.
- The API key is loaded from `.env` and never exposed to the frontend.
