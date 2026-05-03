import os
import mysql.connector
from contextlib import contextmanager
from typing import Optional


# ── Connection ────────────────────────────────────────────────────────────────

def _ensure_database() -> None:
    """Create the MySQL database if it does not exist yet."""
    db = os.getenv("MYSQL_DATABASE", "slidechat")
    conn = mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
        charset="utf8mb4",
        autocommit=True,
    )
    conn.cursor().execute(
        f"CREATE DATABASE IF NOT EXISTS `{db}` "
        f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    )
    conn.close()


@contextmanager
def get_conn():
    """Open a MySQL connection as a transaction context.

    Commits on clean exit, rolls back on exception, always closes.
    """
    conn = mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
        database=os.getenv("MYSQL_DATABASE", "slidechat"),
        charset="utf8mb4",
        autocommit=False,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Schema ────────────────────────────────────────────────────────────────────

def init_db() -> None:
    _ensure_database()
    with get_conn() as conn:
        cur = conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS decks (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                title       TEXT NOT NULL,
                filename    VARCHAR(512) NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS slides (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                deck_id      INT,
                slide_number INT NOT NULL,
                text_content LONGTEXT,
                FOREIGN KEY (deck_id) REFERENCES decks(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                name       VARCHAR(500) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS session_sources (
                session_id INT NOT NULL,
                deck_id    INT NOT NULL,
                PRIMARY KEY (session_id, deck_id),
                FOREIGN KEY (session_id) REFERENCES sessions(id),
                FOREIGN KEY (deck_id)    REFERENCES decks(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                session_id INT,
                role       ENUM('user', 'assistant'),
                content    LONGTEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # Indexes — IF NOT EXISTS requires MySQL 8.0+; fall back silently
        for idx in [
            "CREATE INDEX IF NOT EXISTS idx_slides_deck_id       ON slides(deck_id)",
            "CREATE INDEX IF NOT EXISTS idx_messages_session_id  ON messages(session_id)",
            "CREATE INDEX IF NOT EXISTS idx_messages_role        ON messages(role)",
            "CREATE INDEX IF NOT EXISTS idx_session_sources_deck ON session_sources(deck_id)",
        ]:
            try:
                cur.execute(idx)
            except mysql.connector.Error:
                pass  # index already exists (or MySQL < 8.0 — both are fine)


# ── Deck operations ───────────────────────────────────────────────────────────

def insert_deck(title: str, filename: str) -> int:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO decks (title, filename) VALUES (%s, %s)", (title, filename)
        )
        return cur.lastrowid


def get_all_decks() -> list:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM decks ORDER BY uploaded_at DESC")
        return cur.fetchall()


def get_deck(deck_id: int) -> Optional[dict]:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM decks WHERE id = %s", (deck_id,))
        return cur.fetchone()


def update_deck(deck_id: int, title: str) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE decks SET title = %s WHERE id = %s", (title, deck_id))


def delete_deck(deck_id: int) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM slides         WHERE deck_id    = %s", (deck_id,))
        cur.execute("DELETE FROM session_sources WHERE deck_id   = %s", (deck_id,))
        cur.execute("DELETE FROM decks           WHERE id        = %s", (deck_id,))


# ── Slide operations ──────────────────────────────────────────────────────────

def insert_slide(deck_id: int, slide_number: int, text_content: str) -> int:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO slides (deck_id, slide_number, text_content) VALUES (%s, %s, %s)",
            (deck_id, slide_number, text_content),
        )
        return cur.lastrowid


def get_slides_for_deck(deck_id: int) -> list:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT * FROM slides WHERE deck_id = %s ORDER BY slide_number", (deck_id,)
        )
        return cur.fetchall()


# ── Session operations ────────────────────────────────────────────────────────

def create_session(name: str) -> int:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO sessions (name) VALUES (%s)", (name,))
        return cur.lastrowid


def get_all_sessions() -> list:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM sessions ORDER BY created_at DESC")
        return cur.fetchall()


def get_session(session_id: int) -> Optional[dict]:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM sessions WHERE id = %s", (session_id,))
        return cur.fetchone()


def rename_session(session_id: int, name: str) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE sessions SET name = %s WHERE id = %s", (name, session_id))


def delete_session(session_id: int) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM messages       WHERE session_id = %s", (session_id,))
        cur.execute("DELETE FROM session_sources WHERE session_id = %s", (session_id,))
        cur.execute("DELETE FROM sessions        WHERE id         = %s", (session_id,))


# ── Session sources ───────────────────────────────────────────────────────────

def set_session_sources(session_id: int, deck_ids: list[int]) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM session_sources WHERE session_id = %s", (session_id,))
        if deck_ids:
            cur.executemany(
                "INSERT IGNORE INTO session_sources (session_id, deck_id) VALUES (%s, %s)",
                [(session_id, did) for did in deck_ids],
            )


def get_session_sources(session_id: int) -> list[int]:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT deck_id FROM session_sources WHERE session_id = %s", (session_id,)
        )
        return [r["deck_id"] for r in cur.fetchall()]


# ── Messages ──────────────────────────────────────────────────────────────────

def save_message(session_id: int, role: str, content: str) -> None:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (%s, %s, %s)",
            (session_id, role, content),
        )


def get_messages(session_id: int) -> list:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT * FROM messages WHERE session_id = %s ORDER BY created_at",
            (session_id,),
        )
        return cur.fetchall()


def get_message_counts() -> dict:
    """Return {session_id: question_count} for all sessions."""
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT session_id, COUNT(*) AS cnt FROM messages GROUP BY session_id"
        )
        return {r["session_id"]: r["cnt"] for r in cur.fetchall()}


# ── Stats ─────────────────────────────────────────────────────────────────────

def get_stats() -> dict:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)

        # Query 1: Overview — scalar subqueries + nested subquery for avg
        cur.execute("""
            SELECT
                (SELECT COUNT(*) FROM decks)    AS total_decks,
                (SELECT COUNT(*) FROM sessions) AS total_sessions,
                (SELECT COUNT(*) FROM messages WHERE role = 'user') AS total_questions,
                (SELECT ROUND(AVG(q_count), 1) FROM (
                    SELECT COUNT(*) AS q_count
                    FROM messages
                    WHERE role = 'user'
                    GROUP BY session_id
                ) AS sub) AS avg_questions_per_session
        """)
        overview = cur.fetchone()

        # Query 2: Most queried decks — multi-table JOIN + GROUP BY
        cur.execute("""
            SELECT d.id, d.title,
                   COUNT(DISTINCT ss.session_id) AS session_count,
                   COUNT(m.id)                   AS question_count
            FROM decks d
            LEFT JOIN session_sources ss ON ss.deck_id    = d.id
            LEFT JOIN messages m         ON m.session_id  = ss.session_id
                                        AND m.role        = 'user'
            GROUP BY d.id, d.title
            ORDER BY question_count DESC
        """)
        top_decks = cur.fetchall()

        # Query 3: Most active sessions — JOIN + CASE expression + GROUP BY
        cur.execute("""
            SELECT s.id, s.name,
                   COUNT(DISTINCT ss.deck_id) AS deck_count,
                   COUNT(DISTINCT CASE WHEN m.role = 'user' THEN m.id END) AS question_count
            FROM sessions s
            LEFT JOIN messages       m  ON m.session_id  = s.id
            LEFT JOIN session_sources ss ON ss.session_id = s.id
            GROUP BY s.id, s.name
            ORDER BY question_count DESC
            LIMIT 8
        """)
        top_sessions = cur.fetchall()

        # Query 4: Study activity over time — GROUP BY DATE()
        cur.execute("""
            SELECT DATE(created_at) AS day, COUNT(*) AS questions
            FROM messages
            WHERE role = 'user'
            GROUP BY DATE(created_at)
            ORDER BY day
        """)
        activity = cur.fetchall()

        # Query 5: Unused decks — NOT EXISTS correlated subquery
        cur.execute("""
            SELECT id, title FROM decks
            WHERE NOT EXISTS (
                SELECT 1 FROM session_sources ss WHERE ss.deck_id = decks.id
            )
        """)
        unused = cur.fetchall()

        return {
            "overview":     dict(overview) if overview else {},
            "top_decks":    [dict(r) for r in top_decks],
            "top_sessions": [dict(r) for r in top_sessions],
            "activity":     [dict(r) for r in activity],
            "unused_decks": [dict(r) for r in unused],
        }
