# SlideChat — Full Technical Report
**Course:** Databases Final Project  
**Author:** Anupranay Thouta  
**Stack:** FastAPI · SQLite · ChromaDB · React · Gemini 2.5 Flash · SentenceTransformers

---

## Table of Contents
1. [Project Motivation](#1-project-motivation)
2. [Tech Stack + Justification](#2-tech-stack--justification)
3. [How the App Works — Full Input Flows](#3-how-the-app-works--full-input-flows)
4. [Database Design](#4-database-design)
5. [Five Non-Trivial SQL Queries](#5-five-non-trivial-sql-queries)
6. [Security Plan + Implementation](#6-security-plan--implementation)
7. [Testing](#7-testing)
8. [Challenges Faced + Lessons Learned](#8-challenges-faced--lessons-learned)
9. [Feedback to the Instructor](#9-feedback-to-the-instructor)

---

## 1. Project Motivation

Students in technical courses receive large volumes of lecture slides — often 200–400 slides per course. When studying for exams, they have to manually open PDFs, scroll through dozens of slides, and try to remember where a concept was explained. This is slow, frustrating, and ineffective.

**SlideChat** solves this by turning your own lecture slides into a conversational study assistant. You upload your slides once, and then ask questions in plain English. The system finds the most relevant slide content and generates an answer that cites the exact slide it came from. Every answer is grounded in your own course material — not the internet, not a general model, but your professor's slides.

**The core user need:**
> "I remember my professor talked about B+ trees and indexing, but I can't remember which slide. I want to ask a question and get an answer with a link to the exact slide."

This is a real problem for real students. The solution requires a non-trivial combination of file parsing, semantic search (vector database), language model generation, and a clean relational database to track everything. That makes it a meaningful project — not a CRUD demo.

---

## 2. Tech Stack + Justification

### 2.1 Backend — FastAPI (Python)

**What it is:** FastAPI is a modern Python web framework that automatically validates request/response data and generates API documentation.

**Why FastAPI over Flask:**
- Pydantic models automatically validate every incoming API request body. If a field is missing or the wrong type, FastAPI returns a 422 error before your code even runs. Flask requires you to do this manually.
- It's async-capable (we use `async def` for file uploads).
- Auto-generates OpenAPI docs at `/docs` — useful for debugging and presentation.

**Example — Pydantic model protecting the ask endpoint:**
```python
class AskBody(BaseModel):
    question: str  # if this is missing from the request, FastAPI returns 422 automatically

@app.post("/api/sessions/{session_id}/ask")
def api_ask(session_id: int, body: AskBody):
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty.")
```

### 2.2 Relational Database — SQLite

**What it is:** SQLite is a file-based relational database engine. The entire database lives in a single file: `data/slides.db`.

**Why SQLite is the right choice here (not MongoDB, not MySQL):**

| Concern | Reasoning |
|---|---|
| Data structure | All entities (decks, slides, sessions, messages) have fixed, known schemas. There is no "flexible document" need — MongoDB's flexibility buys nothing here. |
| Relationships | The many-to-many between sessions and decks, and the one-to-many chains, are exactly what relational algebra handles best. |
| Integrity | Messages must belong to valid sessions. Slides must belong to valid decks. FK constraints enforce this at the DB level. |
| Scale | A student uploads tens of decks, runs hundreds of sessions. SQLite handles millions of rows with no issue. |
| Infrastructure | SQLite requires zero server setup — one file, runs anywhere. Perfect for a local academic tool. |
| Concurrency | Single-user application — SQLite's write lock limitation is irrelevant. |

**Why not MySQL?** MySQL adds a server process, authentication, port configuration, and setup complexity with no benefit at this scale. The professor approved SQLite as an alternative RDBMS.

### 2.3 Vector Database — ChromaDB

**What it is:** ChromaDB is an open-source embedding database that stores high-dimensional vectors and retrieves the most semantically similar ones for a given query vector.

**Why it's needed:** SQL cannot answer "which slides are most relevant to the question about B+ trees?" — that requires semantic (meaning-based) similarity, not keyword matching. ChromaDB stores 384-dimensional float vectors and finds the closest ones using cosine similarity via an HNSW (Hierarchical Navigable Small World) index.

**What it stores:** For each slide ingested, ChromaDB stores:
- The vector embedding (384 floats)
- The raw slide text (as a document)
- Metadata: `deck_id` and `slide_number`

The SQLite `slides` table and ChromaDB are kept in sync — every INSERT to `slides` triggers an `upsert` to ChromaDB. Every DELETE from `decks` triggers a vector delete from ChromaDB.

### 2.4 Embedding Model — all-MiniLM-L6-v2

**What it is:** A SentenceTransformers model that converts any piece of text into a 384-dimensional vector where semantic similarity is preserved as cosine similarity between vectors.

**Technical details:**
- Library: `sentence-transformers` (PyTorch-based)
- Model: `all-MiniLM-L6-v2`
- Output dimensionality: **384 floats per vector**
- Speed: ~14,000 sentences/second on CPU — fast enough that even a 100-slide deck embeds in under a second
- The model is downloaded once and cached locally on first run
- The **same model** embeds both the stored slides (at upload time) and the user's question (at query time). This is critical — if you used different models, the vector spaces would not be comparable.

**Why this model specifically:**
- It's a distilled version of a much larger BERT model, optimized for semantic similarity tasks
- Small enough to run on CPU (no GPU needed)
- High quality for its size — benchmarks well on semantic textual similarity tasks
- Free and runs locally — no API calls needed for embeddings

### 2.5 Language Model — Gemini 2.5 Flash

**What it is:** Google's Gemini 2.5 Flash is a fast, instruction-following language model accessed via API.

**Technical details:**
- Model ID: `models/gemini-2.5-flash`
- Context window: **1,000,000 tokens** (1M tokens — effectively unlimited for our use case)
- API: `google-genai` Python SDK
- In practice, we send roughly 6 slide chunks (~300 words each) + the question = roughly **2,000–4,000 tokens** per request, far below the limit

**Why Gemini 2.5 Flash (not GPT-4, not Claude):**
- Free tier available through Google AI Studio
- Fast response times (Flash variant is optimized for speed)
- Strong instruction-following — it respects the "cite every claim" instruction reliably

### 2.6 Frontend — React 18 (In-Browser Babel)

**What it is:** React is a JavaScript UI library for building component-based interfaces. We use it without a build step — Babel compiles JSX in the browser at runtime.

**Why no build step (no Vite, no webpack):**
- No Node.js installation required
- The FastAPI server serves the `frontend/` folder as static files directly
- Simpler development: edit a JS file, refresh the browser
- Trade-off: Babel compilation happens in the browser on each load (~200ms). Acceptable for a development project.

**Frontend component architecture:**
```
app.js          ← top-level state, all callbacks, renders everything
├── sidebar.js  ← left panel: decks, sessions, rename/delete
├── chat.js     ← header, message list, composer, starters
├── citation.js ← citation badge linking to slide drawer
├── slideDrawer.js ← right panel: slide content viewer
├── slideThumb.js  ← slide thumbnail renderer
├── emptyState.js  ← welcome screen, upload prompt
├── stats.js    ← statistics modal (5 SQL queries visualized)
├── api.js      ← all fetch() calls to backend
└── icons.js    ← SVG icon definitions
```

All state lives in `app.js`. Child components receive data and callbacks as props — unidirectional data flow.

---

## 3. How the App Works — Full Input Flows

### 3.1 Deck Upload Flow

When a user uploads a PDF or PPTX, this is what happens step by step:

**Step 1 — Frontend**  
User clicks "Upload a deck" or presses ⌘U. A modal opens with a file picker. On file selection:
```javascript
// api.js
uploadDeck: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/decks', { method: 'POST', body: fd })
}
```
The file is sent as `multipart/form-data`.

**Step 2 — Server receives and validates**
```python
# server.py
async def api_upload_deck(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".pdf", ".pptx"):
        raise HTTPException(400, "Only PDF and PPTX files are supported.")
```
File type is validated before anything else. Then the file is written to a temporary location on disk.

**Step 3 — Parsing (pipeline/parser.py)**

For PDF files (`pdfplumber`):
```python
with pdfplumber.open(file_path) as pdf:
    for i, page in enumerate(pdf.pages, start=1):
        text = page.extract_text() or ""
        slides.append({"slide_number": i, "text": text.strip()})
```
Each PDF page becomes one "slide" — the text content is extracted as a plain string.

For PPTX files (`python-pptx`):
```python
for i, slide in enumerate(prs.slides, start=1):
    parts = []
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                line = " ".join(run.text for run in para.runs).strip()
                if line:
                    parts.append(line)
    slides.append({"slide_number": i, "text": "\n".join(parts)})
```
Each PowerPoint slide is walked shape-by-shape. Every text frame, every paragraph, every run of text is extracted and joined. The result is one string per slide containing all readable text from that slide.

**Step 4 — Embedding (pipeline/embedder.py)**
```python
MODEL_NAME = "all-MiniLM-L6-v2"

def embed(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    vectors = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return vectors.tolist()
```
All slide texts are embedded in a single batch call. Each text → 384 floats. For a 50-slide deck, this produces a (50 × 384) matrix.

**Step 5 — Storing in SQLite**
```python
deck_id = relational.insert_deck(title, filename)
# INSERT INTO decks (title, filename) VALUES (?, ?)

for slide, emb in zip(slides, embeddings):
    slide_id = relational.insert_slide(deck_id, slide["slide_number"], slide["text"])
    # INSERT INTO slides (deck_id, slide_number, text_content) VALUES (?, ?, ?)
```

**Step 6 — Storing vectors in ChromaDB**
```python
vector.upsert_slide(slide_id, deck_id, slide["slide_number"], emb, slide["text"])
# col.upsert(ids=[str(slide_id)], embeddings=[embedding],
#            documents=[text], metadatas=[{"deck_id": deck_id, "slide_number": slide_number}])
```
The slide's integer ID is used as the ChromaDB document ID, linking the two stores together.

**Step 7 — Cleanup and response**  
The temp file is deleted. The server returns the deck object with title, page count, slide list, and color. The frontend adds the deck to the sidebar immediately.

---

### 3.2 The Full RAG Pipeline — Question to Answer

RAG stands for **Retrieval-Augmented Generation**. The idea: instead of asking an AI model a question from memory, you first *retrieve* relevant facts from your own data, then give those facts to the model along with the question. The model's answer is grounded in your data, not its training.

Here is the exact flow for a question like *"What is a B+ tree and how does it differ from a B tree?"*:

**Step 1 — Frontend sends the question**
```javascript
// api.js
ask: (sessionId, question) =>
    request('POST', `/sessions/${sessionId}/ask`, { question })
```

**Step 2 — Server validates**
```python
question = body.question.strip()
if not question:
    raise HTTPException(400, "Question cannot be empty.")

deck_ids = get_session_sources(session_id)
if not deck_ids:
    raise HTTPException(400, "No source decks selected for this session.")
```
Two business rules enforced: question must be non-empty, and the session must have at least one deck selected.

**Step 3 — Embed the question**
```python
query_emb = embedder.embed_one(question)
```
The question *"What is a B+ tree and how does it differ from a B tree?"* is converted into a 384-dimensional vector using the same `all-MiniLM-L6-v2` model that embedded the slides. This is critical — same model = same vector space = meaningful similarity.

**Step 4 — Retrieve the top-6 most relevant slides from ChromaDB**
```python
chunks = vector.query_slides(query_emb, deck_ids, n_results=6)

# In vector.py:
where = {"deck_id": {"$in": deck_ids}}  # filter to only this session's decks
results = col.query(
    query_embeddings=[query_embedding],
    n_results=6,
    where=where,
    include=["documents", "metadatas", "distances"],
)
```
ChromaDB finds the 6 slides whose embedding vectors have the highest cosine similarity to the question vector, **filtered to only the decks selected for this session**. The `score` returned is `1 - cosine_distance` (closer to 1.0 = more relevant).

A concrete example — if the session has the "Week11 Storage Query Indexing" deck selected, and you ask about B+ trees, ChromaDB returns the 6 slides that talk most about tree structures, indexing, and storage — because their embeddings are close to the question embedding in the 384-dimensional vector space.

**Step 5 — Build the prompt**
```python
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
```

The prompt contains:
- A system instruction (role, behavior, citation requirement)
- Up to 6 slide excerpts, each labeled with `[Deck Title, Slide N]`
- The user's question

Total token count per request: roughly 2,000–5,000 tokens depending on slide length. Well within Gemini's 1M token window.

**Step 6 — Call Gemini**
```python
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
response = client.models.generate_content(
    model="models/gemini-2.5-flash",
    contents=prompt,
)
answer_text = response.text.strip()
```

Gemini reads the slide context and generates an answer that:
- Is grounded only in the provided slides (not its training data)
- Cites every claim in `[Deck Title, Slide N]` format

**Step 7 — Save to database**
```python
relational.save_message(session_id, "user", question)
relational.save_message(session_id, "assistant", answer_text)
# INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)
```
Both the question and the answer are persisted to the `messages` table with their roles, so the conversation history survives page refreshes.

**Step 8 — Parse citations on the frontend**  
The frontend receives `{ text: "...", chunks: [...] }`. The `chat.js` component parses the answer text, finds citation patterns like `[Week11 Storage, Slide 14]`, and replaces them with clickable badge components. Clicking a badge opens the slide drawer showing the full slide content.

---

### 3.3 Session Lifecycle

```
User clicks "New" 
    → POST /api/sessions → row in sessions table
    → Session title becomes editable (auto-renames inline)
    → All decks pre-selected as sources
    → PUT /api/sessions/{id}/sources → rows in session_sources table

User toggles a deck on/off
    → PUT /api/sessions/{id}/sources → full replace of session_sources rows

User asks a question
    → POST /api/sessions/{id}/ask → RAG pipeline → two rows in messages

User double-clicks session title
    → PATCH /api/sessions/{id} → UPDATE sessions SET name = ?

User deletes session
    → DELETE /api/sessions/{id} → cascade-deletes messages + session_sources rows
```

---

## 4. Database Design

### 4.1 Entity-Relationship Diagram (ERD)

```
┌──────────────────────┐         ┌──────────────────────────┐
│        decks         │         │          slides           │
├──────────────────────┤         ├──────────────────────────┤
│ id (PK, AUTOINCR)    │◄────────│ id (PK, AUTOINCR)        │
│ title    TEXT NN     │  1    * │ deck_id (FK → decks.id)  │
│ filename TEXT NN     │         │ slide_number INT NN       │
│ uploaded_at TIMESTAMP│         │ text_content TEXT         │
└──────────────────────┘         └──────────────────────────┘
          │
          │ (via session_sources)
          │
          ▼  *                    * ▼
┌──────────────────────┐         ┌──────────────────────────┐
│   session_sources    │         │         sessions          │
├──────────────────────┤         ├──────────────────────────┤
│ session_id (FK, PK)  │────────►│ id (PK, AUTOINCR)        │
│ deck_id    (FK, PK)  │         │ name      TEXT NN         │
└──────────────────────┘         │ created_at TIMESTAMP      │
                                 └──────────────────────────┘
                                           │
                                           │ 1
                                           │
                                           ▼ *
                                 ┌──────────────────────────┐
                                 │         messages          │
                                 ├──────────────────────────┤
                                 │ id (PK, AUTOINCR)        │
                                 │ session_id (FK → sess.id)│
                                 │ role TEXT CHECK(IN ...)   │
                                 │ content   TEXT NN         │
                                 │ created_at TIMESTAMP      │
                                 └──────────────────────────┘
```

**Relationships summary:**
- `decks` → `slides`: one-to-many (one deck has many slides)
- `sessions` ↔ `decks`: many-to-many via `session_sources` (one session uses many decks; one deck appears in many sessions)
- `sessions` → `messages`: one-to-many (one session has many messages in order)

### 4.2 Full Schema

```sql
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
```

### 4.3 Constraints Explained

| Constraint | Where | What it enforces |
|---|---|---|
| `PRIMARY KEY AUTOINCREMENT` | All tables | Unique, non-null integer ID for every row, auto-assigned |
| `NOT NULL` on title/name | `decks.title`, `decks.filename`, `sessions.name`, `messages.content` | These fields must always have a value — a deck without a title or a message without content makes no sense |
| `FOREIGN KEY` (via REFERENCES) | `slides.deck_id`, `session_sources.*`, `messages.session_id` | Declares referential integrity — a slide must belong to a real deck |
| `PRIMARY KEY (session_id, deck_id)` | `session_sources` | Composite PK — prevents duplicate source entries (a deck can only be added to a session once) |
| `CHECK(role IN ('user', 'assistant'))` | `messages.role` | Enforces the domain — only these two values are valid roles. Any other value is rejected at the DB level |
| `DEFAULT CURRENT_TIMESTAMP` | `uploaded_at`, `created_at` | Automatically records when rows were created without requiring the application to pass a timestamp |

### 4.4 Cascade Delete Strategy

SQLite does not enforce FK constraints by default (requires `PRAGMA foreign_keys = ON`). To ensure referential integrity, the application manually cascades deletes in the correct order:

**Deleting a deck:**
```python
conn.execute("DELETE FROM slides WHERE deck_id = ?", (deck_id,))
conn.execute("DELETE FROM session_sources WHERE deck_id = ?", (deck_id,))
conn.execute("DELETE FROM decks WHERE id = ?", (deck_id,))
```
Also removes vectors from ChromaDB: `vector.delete_deck_vectors(deck_id)`

**Deleting a session:**
```python
conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
conn.execute("DELETE FROM session_sources WHERE session_id = ?", (session_id,))
conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
```

### 4.5 Indexes (Recommended for Production)

The following indexes are justified by the application's query patterns. They should be added to `init_db()`:

```sql
-- Slides are always fetched by deck_id
CREATE INDEX IF NOT EXISTS idx_slides_deck_id ON slides(deck_id);

-- Messages are always fetched by session_id, and frequently counted
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

-- session_sources is joined on both columns constantly
CREATE INDEX IF NOT EXISTS idx_session_sources_session ON session_sources(session_id);
CREATE INDEX IF NOT EXISTS idx_session_sources_deck ON session_sources(deck_id);
```

**Justification:** Every message fetch (`GET /api/sessions/{id}/messages`) does `WHERE session_id = ?`. Without an index, SQLite scans every row in `messages`. With the index, it jumps directly to the relevant rows — O(log n) vs O(n). At 1,000+ messages this difference becomes meaningful.

---

## 5. Five Non-Trivial SQL Queries

All five queries live in `db/relational.py` inside `get_stats()` and are served via `GET /api/stats`. They power the Statistics panel in the app.

---

### Query 1 — Overview with Nested Subquery

**What it does:** Computes four global aggregate statistics in a single query, including a nested subquery to compute the average.

```sql
SELECT
    (SELECT COUNT(*) FROM decks) as total_decks,
    (SELECT COUNT(*) FROM sessions) as total_sessions,
    (SELECT COUNT(*) FROM messages WHERE role = 'user') as total_questions,
    (SELECT ROUND(AVG(q_count), 1) FROM (
        SELECT COUNT(*) as q_count
        FROM messages
        WHERE role = 'user'
        GROUP BY session_id
    )) as avg_questions_per_session
```

**Why it's non-trivial:**
- Four correlated scalar subqueries in a single SELECT
- The fourth subquery contains a **nested subquery**: the inner query groups messages by session and counts them; the outer query averages those counts. You cannot compute this average in a flat query without first grouping.
- The `ROUND(..., 1)` aggregate is applied to the result of a derived table.

**Example output:** `{ total_decks: 5, total_sessions: 9, total_questions: 33, avg_questions_per_session: 6.6 }`

---

### Query 2 — Most Queried Decks (Multi-Table JOIN + GROUP BY)

**What it does:** Ranks decks by how many user questions were asked in sessions that used each deck.

```sql
SELECT d.id, d.title,
       COUNT(DISTINCT ss.session_id) as session_count,
       COUNT(m.id) as question_count
FROM decks d
LEFT JOIN session_sources ss ON ss.deck_id = d.id
LEFT JOIN messages m ON m.session_id = ss.session_id AND m.role = 'user'
GROUP BY d.id
ORDER BY question_count DESC
```

**Why it's non-trivial:**
- Three tables joined: `decks`, `session_sources`, `messages`
- `LEFT JOIN` ensures decks with zero sessions or zero messages still appear (with count 0)
- Two different aggregate functions on the same result set: `COUNT(DISTINCT ss.session_id)` (how many unique sessions used this deck) and `COUNT(m.id)` (total questions across all those sessions)
- The JOIN condition `AND m.role = 'user'` filters at join time, not in a WHERE clause — this is important with LEFT JOIN because WHERE would convert it to an inner join

**Business meaning:** Tells you which lecture decks students (or you) consult most when asking questions. In the demo: "Week11 Storage Query Indexing Optimization" has the highest question count because it was used in 4 out of 5 seed sessions.

---

### Query 3 — Most Active Sessions (JOIN + CASE Expression + GROUP BY)

**What it does:** Ranks sessions by question count, showing how many source decks each session had.

```sql
SELECT s.id, s.name,
       COUNT(DISTINCT ss.deck_id) as deck_count,
       SUM(CASE WHEN m.role = 'user' THEN 1 ELSE 0 END) as question_count
FROM sessions s
LEFT JOIN messages m ON m.session_id = s.id
LEFT JOIN session_sources ss ON ss.session_id = s.id
GROUP BY s.id
ORDER BY question_count DESC
LIMIT 8
```

**Why it's non-trivial:**
- Uses a `CASE` expression inside `SUM()` — this is a conditional aggregate, equivalent to `COUNT(... WHERE role = 'user')` but expressed inline
- Two independent `LEFT JOIN`s on the same base table (`sessions`), with different join keys
- `COUNT(DISTINCT ss.deck_id)` counts unique decks rather than total source rows (a session with the same deck listed twice should still count as 1)
- `LIMIT` applied after `ORDER BY` — returns only the top 8 most active sessions

**Why CASE instead of just filtering:** If we added `WHERE m.role = 'user'`, sessions with zero messages would be excluded. The `CASE` expression keeps all sessions visible, with zero counts for empty ones.

---

### Query 4 — Study Activity Over Time (DATE Aggregation)

**What it does:** Counts how many questions were asked per calendar day, for an activity timeline.

```sql
SELECT DATE(created_at) as day, COUNT(*) as questions
FROM messages
WHERE role = 'user'
GROUP BY DATE(created_at)
ORDER BY day
```

**Why it's non-trivial:**
- Uses `DATE()` — a SQLite datetime function — to extract only the date portion from a full `TIMESTAMP` column. Without this function, each unique timestamp would be its own group, giving useless results.
- `GROUP BY DATE(created_at)` groups by the derived/computed value, not a stored column
- The `WHERE` clause pre-filters to user messages only before the grouping happens (more efficient than filtering in HAVING)

**Business meaning:** Shows on which days the student was actively studying. Useful for tracking study habits and demonstrating the app has real usage history.

---

### Query 5 — Unused Decks (NOT EXISTS Subquery)

**What it does:** Finds decks that have been uploaded but never added to any session.

```sql
SELECT id, title FROM decks
WHERE NOT EXISTS (
    SELECT 1 FROM session_sources ss WHERE ss.deck_id = decks.id
)
```

**Why it's non-trivial:**
- Uses `NOT EXISTS` — a set membership test using a correlated subquery
- The subquery references `decks.id` from the outer query (correlated subquery — it's re-evaluated for each row of `decks`)
- `SELECT 1` is the conventional form inside EXISTS — it means "I only care if any row exists, not what the values are"
- Semantically equivalent to a `LEFT JOIN ... WHERE ss.deck_id IS NULL` but more readable and often optimized differently by the query planner

**Business meaning:** Identifies uploaded decks that are just sitting there unused — a useful "cleanup" indicator. Shown in the Statistics panel only when such decks exist.

---

## 6. Security Plan + Implementation

### 6.1 SQL Injection Prevention — Parameterized Queries

**The threat:** If user input is concatenated into SQL strings, an attacker can inject SQL. Example of what we do NOT do:
```python
# VULNERABLE — never do this:
conn.execute(f"SELECT * FROM sessions WHERE name = '{user_input}'")
# If user_input = "' OR 1=1 --", this returns ALL sessions
```

**What we do instead — every single query uses `?` placeholders:**
```python
# SAFE — what the app actually does:
conn.execute("SELECT * FROM sessions WHERE name = ?", (user_input,))
conn.execute("UPDATE decks SET title = ? WHERE id = ?", (title, deck_id))
conn.execute("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
             (session_id, role, content))
```

The `?` placeholder tells SQLite to treat the value as data, never as SQL syntax. Even if a user types `'; DROP TABLE sessions; --` as a question, it is stored as a literal string, not executed as SQL.

This applies to **100% of database operations** in `db/relational.py` — there is no string formatting used in any SQL query.

### 6.2 Input Validation — Pydantic + Manual Checks

Every API endpoint that accepts a request body is protected by a Pydantic model:

```python
class AskBody(BaseModel):
    question: str  # FastAPI rejects requests missing this field

class SessionRename(BaseModel):
    name: str  # Same — empty body → 422 Unprocessable Entity

class DeckRename(BaseModel):
    title: str
```

Additional manual validation layered on top:
```python
# Empty question blocked
if not question:
    raise HTTPException(400, "Question cannot be empty.")

# File type whitelist
if suffix not in (".pdf", ".pptx"):
    raise HTTPException(400, "Only PDF and PPTX files are supported.")

# Empty title blocked on rename
if not title:
    raise HTTPException(400, "Title cannot be empty.")

# 404 for missing resources
if not get_deck(deck_id):
    raise HTTPException(404, "Deck not found.")
```

### 6.3 API Key / Secrets Handling

The Gemini API key is never hardcoded in source code:

```python
# server.py — loaded from environment at startup
from dotenv import load_dotenv
load_dotenv()

# rag.py — accessed only when needed
api_key = os.environ.get("GEMINI_API_KEY", "")
if not api_key:
    raise ValueError("GEMINI_API_KEY environment variable is not set.")
```

The `.env` file (containing the real key) is listed in `.gitignore` and never committed to the repository. Any collaborator cloning the repo needs to create their own `.env` file.

### 6.4 XSS Protection

The frontend uses React, which escapes all string values rendered into the DOM by default. For example:
```jsx
<div className="sc-session-title">{s.title}</div>
```
If `s.title` contains `<script>alert('xss')</script>`, React renders it as a literal string — never as executable HTML. This is React's built-in XSS protection.

### 6.5 Safe Error Handling

API errors return structured JSON with HTTP status codes, not raw Python stack traces:
```python
raise HTTPException(400, "Only PDF and PPTX files are supported.")
# Response: {"detail": "Only PDF and PPTX files are supported."}, HTTP 400
```

Internal errors (database failures, embedding failures) are caught before they can leak implementation details to the client.

### 6.6 Authentication Note

SlideChat is designed as a single-user local tool — it runs on `localhost` and is not exposed to the internet. There is no authentication layer. If deployed publicly, JWT-based session authentication would be the appropriate addition. This is a known and conscious design decision for the project scope.

---

## 7. Testing

### 7.1 Test Data (Seed Sessions)

Five real sessions were created using the app with real lecture decks from the databases course:

| Session | Decks Used | Questions Asked |
|---|---|---|
| seed_session_1 | ER Diagrams, Dimensional Modeling | 5 |
| seed_session_2 | Storage/Indexing, CAP Theorem/MongoDB | 4 |
| seed_session_3 | Storage/Indexing, MongoDB slides | 6 |
| seed_session_4 | Storage/Indexing, ER Diagrams, MongoDB | 8 |
| seed_session_5 | All 5 decks | 9 |

All questions were asked through the live app UI — the answers are real Gemini responses grounded in the actual slide content. This tests the full end-to-end pipeline: file parsing → embedding → vector retrieval → LLM generation → citation rendering.

### 7.2 Core Workflow Verification

| Workflow | Test Method | Result |
|---|---|---|
| Upload PDF | Uploaded 5 real lecture PDFs | Slides extracted, embeddings stored, deck appears in sidebar |
| Upload invalid file | Tried uploading a `.txt` file | HTTP 400 returned, error shown in UI |
| New session | Clicked "New", typed name | Session created, title editable inline, Enter to save |
| Ask question with no deck | Cleared all sources, asked a question | HTTP 400 "No source decks selected" returned |
| Ask empty question | Submitted empty composer | "Question cannot be empty" error |
| Rename session | Double-clicked session title | Inline input appeared, Enter saved, Escape cancelled |
| Rename deck | Double-clicked deck title | Same behavior |
| Delete session | Hovered session, clicked trash icon | Session, messages, and sources deleted; UI cleared |
| Delete deck | Hovered deck, clicked trash icon | Deck, slides, session_sources, and vectors deleted |
| Stats page | Opened Statistics panel | All 5 queries ran, cards and bars rendered with real data |
| Citation click | Clicked a `[Deck, Slide N]` badge | Slide drawer opened to correct slide |

### 7.3 Edge Case Testing

- **Deck with empty slides:** A slide with no extractable text stores an empty string in `text_content` and an embedding of all-zeros (the model handles empty strings without crashing).
- **Session with no messages:** Appears in sessions list with `0 msgs`, correctly excluded from the "most active sessions" stat.
- **Concurrent deck delete:** If a deck is deleted while it is selected in a session, the session's source list automatically updates (session_sources rows are deleted by cascade).
- **Very long session name:** Truncated to 35 chars in the UI with an ellipsis, stored in full in the DB.

---

## 8. Challenges Faced + Lessons Learned

### Challenge 1 — Browser Scope Conflicts with In-Browser Babel

**What happened:** React hooks (`useState`, `useEffect`, `useRef`) were declared at the top of `sidebar.js` as `const { useState } = React`. Since `app.js` also declared the same constants, and all scripts share the global scope via in-browser Babel, these conflicted — silently breaking the rename feature.

**How it was fixed:** Removed the top-level destructuring from `sidebar.js` entirely. Instead, the component now calls `React.useState(...)`, `React.useEffect(...)`, `React.useRef(...)` directly. Since `React` is a globally available CDN object, this works regardless of script load order.

**Lesson:** When using in-browser Babel without ES modules, `const` declarations at the top level of a script are globals. Any name collision across scripts causes silent failures. The safest pattern is to always namespace to the global object (`React.useState`) rather than destructuring into variables.

### Challenge 2 — Two Databases Must Stay in Sync

**What happened:** ChromaDB (vector store) and SQLite (relational store) are separate systems. Early on, deleting a deck from SQLite left orphaned vectors in ChromaDB. The next upload could retrieve stale vectors for slides that no longer existed in the relational DB.

**How it was fixed:** Every deck deletion now explicitly calls `vector.delete_deck_vectors(deck_id)` before the SQLite delete. The `remove_deck()` function in `rag.py` is the single point of truth for deck deletion and handles both stores atomically.

**Lesson:** When you have two persistence systems (relational + vector), you must treat them as a unit. Every write operation needs to update both, every delete needs to clean both. The application layer becomes responsible for the consistency that a single database would give you for free.

### Challenge 3 — SQLite FK Constraints Are Silently Disabled

**What happened:** The schema declares `REFERENCES decks(id)` on `slides.deck_id`, but SQLite does not enforce these constraints unless you explicitly run `PRAGMA foreign_keys = ON` on each connection. This means you can insert a slide with a `deck_id` that doesn't exist, and SQLite won't complain.

**How it was mitigated:** Application-level cascade logic explicitly deletes child rows before parent rows. The ordering is always: messages → session_sources → sessions (or slides → session_sources → decks).

**Lesson:** SQLite's FK behavior is a known footgun. In a production system, either add `PRAGMA foreign_keys = ON` to every connection, or use a database that enforces constraints by default (PostgreSQL, MySQL).

### Challenge 4 — Semantic Chunking at the Slide Level

**What happened:** Each entire slide is embedded as a single chunk. If a slide covers two unrelated topics (which sometimes happens in lecture slides), the embedding is a "blended" vector that isn't strongly similar to either topic's query.

**What this means in practice:** A question about "deadlocks" might not retrieve a slide that discusses both deadlocks and semaphores, because the combined embedding scores lower than a slide focused purely on deadlocks.

**The trade-off accepted:** Splitting slides into sub-paragraph chunks would improve recall but dramatically complicate the citation system (you'd need to cite a paragraph, not a slide). For this project, slide-level chunking is an acceptable simplification.

**Lesson:** Chunk size is one of the most important decisions in a RAG system. Larger chunks = better context in the answer. Smaller chunks = more precise retrieval. There is no universal right answer — it depends on the structure of your source documents.

---

## 9. Feedback to the Instructor

### What I Learned

**Relational database design matters more than I expected.** Before this project, I thought of databases as "just storage." Building SlideChat showed me how the schema shapes everything else — the queries you can write, the constraints you can enforce, the performance characteristics you get. Spending time on the ER diagram upfront made the implementation much smoother.

**Two databases is harder than one.** Running a relational DB alongside a vector DB forced me to think carefully about consistency. Every operation that touches one store might need to touch the other. This is a real architectural challenge that taught me why database systems work hard to provide atomicity.

**The difference between embedding and generation.** I came in thinking "AI" was a monolith. This project split that clearly: the embedding model (`all-MiniLM-L6-v2`) converts meaning into numbers; the generation model (Gemini) reasons over text. These are completely different capabilities, served by different tools, for different parts of the pipeline.

**SQL is still the right tool for structured data.** I was tempted to use MongoDB because it felt "modern." But once I mapped the entities and relationships on paper, it was obvious that relational was correct. The JOIN queries I needed — especially the stats queries — would have been significantly more complex in MongoDB's aggregation pipeline.

**FastAPI's validation saved me from bugs.** Having Pydantic automatically validate request bodies meant I caught malformed inputs at the API boundary, before they could cause confusing errors deeper in the pipeline.

### Suggestions for Future Cohorts

1. **Require a one-page schema design before coding starts.** I wasted time refactoring the schema mid-project. An upfront schema review checkpoint would catch design mistakes before they become expensive to fix.

2. **Introduce the distinction between OLTP and OLAP earlier.** The stats queries (analytical) feel completely different from the CRUD queries (transactional). Understanding that these are two different ways of using the same data is genuinely useful and not obvious until you've hit the wall trying to write a complex GROUP BY.

3. **Teach SQLite's FK gotcha explicitly.** The fact that `REFERENCES` in SQLite is purely cosmetic without `PRAGMA foreign_keys = ON` is a trap that wastes debugging time. A 5-minute mention of this would save students hours.

4. **Add a demo/presentation checkpoint at Week 12.** The Week 10 check-in is good for scope control, but a short "does your app run cleanly for a demo?" checkpoint at Week 12 would help students fix presentation-level issues (loading states, error messages, UI polish) with enough time to spare.
