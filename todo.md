Makes your queries non-trivial (15 pts)

Deck analytics page — a dashboard showing: which decks get queried most, average messages per session, which slides get cited most often. This forces you to write aggregations, GROUP BY, ORDER BY, all naturally.
"Dead decks" view — show decks that have never been used as a source in any session. Classic NOT EXISTS or LEFT JOIN ... WHERE NULL query, looks great in a report.
Session history with stats — each session shows message count, decks used, and last active time. Requires a multi-table join across sessions, messages, session_sources, decks.


Satisfies CRUD for 2 entities (part of scope)

Deck management page — rename a deck, delete it (with a confirmation dialog), re-upload a corrected version. Covers full CRUD on decks.
Session management — rename sessions, archive/delete old ones, duplicate a session with the same source selection. Covers full CRUD on sessions.


Makes the app genuinely cooler

Slide preview panel — when the LLM cites a slide, show the raw extracted text from that slide inline in the chat. Simple SQLite lookup but makes citations feel real and interactive.
"Ask across all decks" mode — a toggle that bypasses source selection and queries everything. Good contrast to show why filtering matters.
Suggested questions — when a user selects their sources, auto-generate 3 starter questions about those decks using the LLM. Looks impressive in a demo and is like 10 lines of code.
Confidence / relevance score — Chroma returns a distance score with every result. Show a small relevance indicator next to each citation. Makes the RAG pipeline visible to the grader.


Security (15 pts — don't leave these on the table)

.env file for your API key with python-dotenv — one line of setup, easy points
All SQLite queries through parameterized statements — ? placeholders, never f-strings in SQL
File upload validation — reject anything that isn't .pdf or .pptx, check file size limit
Sanitize deck/session names before storing


Testing + demo prep (10 pts)

Pre-load 3-4 interesting slide decks as seed data so your demo works instantly without live uploading
Write a seed.py script that populates the DB with sample sessions and messages — shows the grader a working system with real data immediately


Deployment
Best option for your use case: Railway (~$5/mo)

Streamlit Community Cloud is free but kills you here — it doesn't persist the filesystem between restarts, so ChromaDB and SQLite get wiped. Railway gives you a persistent disk, a public URL, and one-command deploys.

Steps:

Prep the repo

Push to GitHub (private is fine)
Add a .env file locally (never commit it), set GEMINI_API_KEY in Railway's dashboard instead
Add this Procfile at the root:

web: streamlit run app.py --server.port=$PORT --server.address=0.0.0.0
Railway setup

Create account at railway.app → New Project → Deploy from GitHub repo
Add environment variable: GEMINI_API_KEY = your-key
Add a persistent volume mounted at /app/data (this is where slides.db and chroma/ live)
Railway auto-detects Python and installs from requirements.txt
One problem to solve first — your data/ paths in relational.py and vector.py use Path(__file__).parent.parent / "data", which works locally. On Railway with a mounted volume you'd point it to /data instead. Easiest fix: make the path an env var:


DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent.parent / "data"))
sentence-transformers model caching — first cold start downloads ~90MB. Set SENTENCE_TRANSFORMERS_HOME=/data/models so it caches to the persistent volume and doesn't re-download on every deploy.

Alternative: Streamlit Community Cloud (free) — only works if you swap ChromaDB for Pinecone (free tier) and SQLite for a hosted Postgres (Supabase free tier). More work, but $0/mo.

Features to consider
Generally useful (polish the app):

Streaming responses — Gemini supports it, makes the app feel much faster
Markdown rendering in chat — responses with bullet points and headers render properly instead of raw **text**
Deck management — reorder, rename decks after upload
Export chat as markdown/PDF
For the classroom demo specifically (high impact, low effort):

Feature	Why it matters for 30 students
Shared deck mode	You upload the lecture slides once, everyone queries the same deck — no one needs to upload anything
Read-only student view	Students can't delete your decks
Quiz generator	Button that says "Generate 5 practice questions from these slides" — crowd pleaser for a demo
No-login simplicity	Keep it as-is — just give them the URL. Students just create a session and go
Suggested questions pre-loaded	Seed the UI with 4-5 topic-specific questions from the actual lecture content
The one I'd prioritize before the presentation:
Quiz/practice question generator — it's a single extra prompt call, takes maybe 2 hours to build, and it's the most "wow" feature for a databases class audience. Students can hit a button and get 5 MCQs generated from the selected slides. That alone makes the demo memorable.

On the seed script — yes, write one. A seed.py that uploads your actual lecture PDFs, creates a demo session, and pre-populates a few example Q&A pairs means your demo starts with live content rather than an empty state. You demo with real slides, real answers, real citations — much more convincing than starting from scratch in front of 30 people.

