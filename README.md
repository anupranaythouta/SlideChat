# SlideChat

A RAG-based lecture slide study assistant. Upload PDF or PPTX slide decks, then ask questions and get cited, grounded answers drawn from your own material.

---

## Features

- Upload PDF / PPTX slide decks (text extracted per-slide, with OCR fallback for image-only slides)
- Create chat sessions scoped to one or more decks
- Answers cite exact slides; click a citation chip to read the extracted slide text
- Rename or delete sessions and decks
- Statistics dashboard — overview counters, most-queried decks, most active sessions, daily activity timeline, unused decks

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (in-browser Babel, no build step) |
| Backend | FastAPI + Uvicorn |
| Relational DB | MySQL 8.0+ (`slidechat` database) |
| Vector DB | ChromaDB (`data/chroma/`) |
| Document Parser | Docling (PDF + PPTX) + RapidOCR (image-only slides) |
| Embeddings | `all-MiniLM-L6-v2` (SentenceTransformers, 384-dim) |
| LLM | Google Gemini 2.5 Flash |

---

## Prerequisites

- Python 3.11+
- MySQL 8.0+ running locally (or accessible via network)
- A Google Gemini API key — [get one at Google AI Studio](https://aistudio.google.com/app/apikey)

---

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd SlideChat
```

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

> **Note:** Docling downloads layout models (~1 GB) from HuggingFace on first run. On Windows, enable Developer Mode (Settings → System → Developer Mode) so HuggingFace can create symlinks in its model cache.

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here

# MySQL connection (defaults shown — change if your setup differs)
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=slidechat
```

Do **not** commit `.env` to git.

### 5. Set up the database

The app creates the `slidechat` database and all tables automatically on first startup — no manual SQL required. Just make sure MySQL is running and the credentials in `.env` are correct.

To verify MySQL is reachable before starting:

```bash
mysql -u root -p -e "SHOW DATABASES;"
```

### 6. Run the server

```bash
uvicorn server:app --reload
```

Then open [http://localhost:8000](http://localhost:8000) in your browser.

---

## Database Schema

Five MySQL tables with InnoDB engine and `utf8mb4` character set:

```sql
decks (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    title       TEXT NOT NULL,
    filename    VARCHAR(512) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

slides (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    deck_id      INT,              -- FK → decks(id)
    slide_number INT NOT NULL,
    text_content LONGTEXT,
    FOREIGN KEY (deck_id) REFERENCES decks(id)
)

sessions (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

session_sources (                  -- many-to-many: sessions ↔ decks
    session_id INT NOT NULL,       -- FK → sessions(id)
    deck_id    INT NOT NULL,       -- FK → decks(id)
    PRIMARY KEY (session_id, deck_id)
)

messages (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT,                -- FK → sessions(id)
    role       ENUM('user', 'assistant'),
    content    LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

Performance indexes (created automatically on startup):

```sql
idx_slides_deck_id       ON slides(deck_id)
idx_messages_session_id  ON messages(session_id)
idx_messages_role        ON messages(role)
idx_session_sources_deck ON session_sources(deck_id)
```

### Seed data

There is no pre-loaded seed data. The app starts with an empty database.

To populate it:
1. Upload one or more PDF or PPTX files through the UI (left sidebar → upload button).
2. Create a chat session, attach decks, and start asking questions.

There are no user accounts — the app is single-user by design.

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
├── server.py              # FastAPI app and all route handlers
├── db/
│   └── relational.py      # MySQL schema, CRUD functions, stats queries
├── pipeline/
│   ├── parser.py          # PDF / PPTX text extraction (Docling + RapidOCR)
│   ├── embedder.py        # SentenceTransformers embedding wrapper
│   └── rag.py             # Ingest, retrieve, and generate (ChromaDB + Gemini)
├── frontend/
│   ├── index.html         # Single-page app shell
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
│   └── chroma/            # ChromaDB persistent storage (auto-created)
├── requirements.txt
└── .env                   # API key + DB credentials (not committed)
```

---

## Usage

1. **Upload a deck** — click the upload button in the left sidebar and select a PDF or PPTX file.
2. **Create a session** — click the `+` button next to "Conversations".
3. **Attach sources** — select which decks this session should query via the source picker in the chat header.
4. **Ask questions** — type in the composer and press Enter or click Send.
5. **Explore citations** — click any citation chip in an answer to open the slide drawer and read the exact slide text.
6. **View stats** — click the chart icon in the top-right of the chat header.

---

## Security Notes

- All SQL queries use parameterized placeholders (`%s`) — no string interpolation.
- File uploads are validated by extension (`.pdf`, `.pptx` only) before processing.
- The API key and database credentials are loaded from `.env` and never exposed to the frontend.
