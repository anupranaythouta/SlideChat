import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent.parent / "data" / "slides.db"


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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

            CREATE INDEX IF NOT EXISTS idx_slides_deck_id
                ON slides(deck_id);

            CREATE INDEX IF NOT EXISTS idx_messages_session_id
                ON messages(session_id);

            CREATE INDEX IF NOT EXISTS idx_messages_role
                ON messages(role);

            CREATE INDEX IF NOT EXISTS idx_session_sources_deck_id
                ON session_sources(deck_id);
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


# --- Stats ---

def get_stats() -> dict:
    with get_conn() as conn:
        # Query 1: Overview — subquery for avg questions per session
        overview = conn.execute("""
            SELECT
                (SELECT COUNT(*) FROM decks) as total_decks,
                (SELECT COUNT(*) FROM sessions) as total_sessions,
                (SELECT COUNT(*) FROM messages WHERE role = 'user') as total_questions,
                (SELECT ROUND(AVG(q_count), 1) FROM (
                    SELECT COUNT(*) as q_count FROM messages
                    WHERE role = 'user' GROUP BY session_id
                )) as avg_questions_per_session
        """).fetchone()

        # Query 2: Most queried decks — multi-table JOIN + GROUP BY
        top_decks = conn.execute("""
            SELECT d.id, d.title,
                   COUNT(DISTINCT ss.session_id) as session_count,
                   COUNT(m.id) as question_count
            FROM decks d
            LEFT JOIN session_sources ss ON ss.deck_id = d.id
            LEFT JOIN messages m ON m.session_id = ss.session_id AND m.role = 'user'
            GROUP BY d.id
            ORDER BY question_count DESC
        """).fetchall()

        # Query 3: Most active sessions — JOIN + CASE + GROUP BY
        top_sessions = conn.execute("""
            SELECT s.id, s.name,
                   COUNT(DISTINCT ss.deck_id) as deck_count,
                   SUM(CASE WHEN m.role = 'user' THEN 1 ELSE 0 END) as question_count
            FROM sessions s
            LEFT JOIN messages m ON m.session_id = s.id
            LEFT JOIN session_sources ss ON ss.session_id = s.id
            GROUP BY s.id
            ORDER BY question_count DESC
            LIMIT 8
        """).fetchall()

        # Query 4: Study activity over time — GROUP BY DATE
        activity = conn.execute("""
            SELECT DATE(created_at) as day, COUNT(*) as questions
            FROM messages
            WHERE role = 'user'
            GROUP BY DATE(created_at)
            ORDER BY day
        """).fetchall()

        # Query 5: Unused decks — NOT EXISTS subquery
        unused = conn.execute("""
            SELECT id, title FROM decks
            WHERE NOT EXISTS (
                SELECT 1 FROM session_sources ss WHERE ss.deck_id = decks.id
            )
        """).fetchall()

        return {
            "overview": dict(overview),
            "top_decks": [dict(r) for r in top_decks],
            "top_sessions": [dict(r) for r in top_sessions],
            "activity": [dict(r) for r in activity],
            "unused_decks": [dict(r) for r in unused],
        }


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
