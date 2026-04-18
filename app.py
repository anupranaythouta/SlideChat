import os
import tempfile
import streamlit as st

from db.relational import (
    init_db,
    get_all_decks,
    get_all_sessions,
    create_session,
    rename_session,
    delete_session,
    get_session_sources,
    set_session_sources,
    get_messages,
)
from pipeline.rag import ingest_deck, remove_deck, answer

# ── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="SlideChat",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Bootstrap DB ─────────────────────────────────────────────────────────────
init_db()

# ── Session state defaults ────────────────────────────────────────────────────
if "active_session_id" not in st.session_state:
    st.session_state.active_session_id = None
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "selected_deck_ids" not in st.session_state:
    st.session_state.selected_deck_ids = []
if "processed_uploads" not in st.session_state:
    st.session_state.processed_uploads = set()

# ── Custom CSS ────────────────────────────────────────────────────────────────
st.markdown("""
<style>
/* Dark theme base */
[data-testid="stAppViewContainer"] {
    background-color: #1a1a2e;
    color: #e0e0e0;
}
[data-testid="stSidebar"] {
    background-color: #16213e;
    border-right: 1px solid #2d2d4e;
}
[data-testid="stSidebar"] .stMarkdown h3 {
    color: #a0aec0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.25rem;
}

/* Chat messages */
.user-msg {
    background: #2d3748;
    border-radius: 12px 12px 4px 12px;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    margin-left: 20%;
    color: #e2e8f0;
}
.assistant-msg {
    background: #1e2a3a;
    border-radius: 4px 12px 12px 12px;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    margin-right: 10%;
    color: #e2e8f0;
    border-left: 3px solid #4a90d9;
}
.citation-badge {
    display: inline-block;
    background: #2b4c7e;
    color: #90cdf4;
    font-size: 0.7rem;
    border-radius: 4px;
    padding: 1px 6px;
    margin: 2px;
}
.suggested-q {
    background: #1e2a3a;
    border: 1px solid #2d3748;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
    color: #a0aec0;
    margin-bottom: 0.4rem;
    transition: background 0.15s;
}
.suggested-q:hover {
    background: #2d3748;
}
.deck-item {
    background: #1e2a3a;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.4rem;
    border: 1px solid #2d3748;
}
.session-active {
    background: #2b4c7e !important;
    border-color: #4a90d9 !important;
}

/* Header */
.app-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0 1rem 0;
    border-bottom: 1px solid #2d3748;
    margin-bottom: 1rem;
}
.app-header h1 {
    font-size: 1.4rem;
    font-weight: 700;
    color: #e2e8f0;
    margin: 0;
}
</style>
""", unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
# SIDEBAR — Sources
# ═══════════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown("### Sources")

    # Upload button
    uploaded_file = st.file_uploader(
        "Add source",
        type=["pdf", "pptx"],
        label_visibility="collapsed",
        key="file_uploader",
    )

    if uploaded_file:
        file_key = f"{uploaded_file.name}:{uploaded_file.size}"
        if file_key not in st.session_state.processed_uploads:
            st.session_state.processed_uploads.add(file_key)
            with st.spinner(f"Processing **{uploaded_file.name}**…"):
                suffix = os.path.splitext(uploaded_file.name)[1]
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(uploaded_file.read())
                    tmp_path = tmp.name
                try:
                    ingest_deck(
                        tmp_path,
                        title=os.path.splitext(uploaded_file.name)[0],
                        filename=uploaded_file.name,
                    )
                    st.success(f"Uploaded: {uploaded_file.name}")
                    st.rerun()
                except Exception as e:
                    st.session_state.processed_uploads.discard(file_key)
                    st.error(f"Failed to process file: {e}")
                finally:
                    os.unlink(tmp_path)

    # Deck list with checkboxes
    decks = get_all_decks()

    if decks:
        st.divider()

        # Select-all toggle
        all_ids = [d["id"] for d in decks]
        col1, col2 = st.columns([3, 1])
        with col1:
            st.markdown("<small style='color:#a0aec0'>Select sources for chat</small>", unsafe_allow_html=True)
        with col2:
            if st.button("All", key="sel_all", use_container_width=True):
                st.session_state.selected_deck_ids = list(all_ids)
                if st.session_state.active_session_id:
                    set_session_sources(st.session_state.active_session_id, all_ids)

        for deck in decks:
            did = deck["id"]
            checked = did in st.session_state.selected_deck_ids
            col_cb, col_del = st.columns([5, 1])
            with col_cb:
                new_val = st.checkbox(
                    deck["title"],
                    value=checked,
                    key=f"deck_{did}",
                )
                if new_val != checked:
                    if new_val:
                        if did not in st.session_state.selected_deck_ids:
                            st.session_state.selected_deck_ids.append(did)
                    else:
                        st.session_state.selected_deck_ids = [
                            x for x in st.session_state.selected_deck_ids if x != did
                        ]
                    if st.session_state.active_session_id:
                        set_session_sources(
                            st.session_state.active_session_id,
                            st.session_state.selected_deck_ids,
                        )
            with col_del:
                if st.button("🗑", key=f"del_{did}", help="Remove deck"):
                    with st.spinner("Removing…"):
                        remove_deck(did)
                    st.session_state.selected_deck_ids = [
                        x for x in st.session_state.selected_deck_ids if x != did
                    ]
                    st.rerun()
    else:
        st.info("No sources yet. Upload a PDF or PPTX to get started.", icon="📎")

    # ── Session list ──────────────────────────────────────────────────────────
    st.divider()
    st.markdown("### Sessions")

    if st.button("＋ New session", use_container_width=True):
        sessions = get_all_sessions()
        name = f"Session {len(sessions) + 1}"
        sid = create_session(name)
        st.session_state.active_session_id = sid
        st.session_state.chat_history = []
        st.session_state.selected_deck_ids = []
        st.rerun()

    sessions = get_all_sessions()
    for sess in sessions:
        sid = sess["id"]
        is_active = sid == st.session_state.active_session_id
        label = f"{'→ ' if is_active else ''}{sess['name']}"
        if st.button(label, key=f"sess_{sid}", use_container_width=True):
            st.session_state.active_session_id = sid
            msgs = get_messages(sid)
            st.session_state.chat_history = [
                {"role": m["role"], "content": m["content"]} for m in msgs
            ]
            st.session_state.selected_deck_ids = get_session_sources(sid)
            st.rerun()


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN — Chat area
# ═══════════════════════════════════════════════════════════════════════════════

# Header
st.markdown(
    '<div class="app-header"><span style="font-size:2rem">📚</span>'
    '<h1>SlideChat</h1></div>',
    unsafe_allow_html=True,
)

if st.session_state.active_session_id is None:
    # Landing state
    st.markdown("## Welcome to SlideChat")
    st.markdown(
        "Upload your lecture slides on the left, then create a session to start chatting with them."
    )
    col1, col2, col3 = st.columns(3)
    with col1:
        st.markdown("**1. Upload slides**\nDrop a PDF or PPTX in the sidebar.")
    with col2:
        st.markdown("**2. Select sources**\nCheck the decks you want to query.")
    with col3:
        st.markdown("**3. Ask questions**\nGet cited answers grounded in your slides.")

    if st.button("Create first session", type="primary"):
        sid = create_session("Session 1")
        st.session_state.active_session_id = sid
        st.session_state.chat_history = []
        st.session_state.selected_deck_ids = []
        st.rerun()

else:
    session_id = st.session_state.active_session_id
    sessions = get_all_sessions()
    current = next((s for s in sessions if s["id"] == session_id), None)

    # Session name + rename
    col_name, col_rename, col_delete = st.columns([6, 1, 1])
    with col_name:
        session_display_name = current["name"] if current else "Session"
        st.markdown(f"#### {session_display_name}")
    with col_rename:
        if st.button("✏️", help="Rename session"):
            st.session_state["renaming"] = True
    with col_delete:
        if st.button("🗑️", help="Delete session"):
            delete_session(session_id)
            st.session_state.active_session_id = None
            st.session_state.chat_history = []
            st.session_state.selected_deck_ids = []
            st.rerun()

    if st.session_state.get("renaming"):
        new_name = st.text_input("New session name", value=session_display_name, key="rename_input")
        if st.button("Save name"):
            rename_session(session_id, new_name)
            st.session_state["renaming"] = False
            st.rerun()

    # Source summary
    selected = st.session_state.selected_deck_ids
    all_decks = get_all_decks()
    deck_map = {d["id"]: d["title"] for d in all_decks}
    if selected:
        badges = " ".join(
            f'<span class="citation-badge">{deck_map.get(did, did)}</span>'
            for did in selected
        )
        st.markdown(f"Active sources: {badges}", unsafe_allow_html=True)
    else:
        st.warning("No sources selected. Check decks in the sidebar to activate them.", icon="⚠️")

    st.divider()

    # ── Chat history ──────────────────────────────────────────────────────────
    chat_container = st.container()
    with chat_container:
        if not st.session_state.chat_history:
            st.markdown(
                "<div style='text-align:center;color:#4a5568;padding:3rem 0;'>"
                "Start asking questions about your slides…"
                "</div>",
                unsafe_allow_html=True,
            )
        for msg in st.session_state.chat_history:
            if msg["role"] == "user":
                st.markdown(
                    f'<div class="user-msg">{msg["content"]}</div>',
                    unsafe_allow_html=True,
                )
            else:
                st.markdown(
                    f'<div class="assistant-msg">{msg["content"]}</div>',
                    unsafe_allow_html=True,
                )

    # ── Suggested questions (when chat is empty) ──────────────────────────────
    if not st.session_state.chat_history and selected:
        st.markdown("**Try asking:**")
        suggestions = [
            "Summarise the key concepts covered in these slides.",
            "What are the main takeaways from these slides?",
            "List any definitions or formulas mentioned.",
            "What topics should I focus on for the exam?",
        ]
        for s in suggestions:
            if st.button(s, key=f"sugg_{s[:20]}", use_container_width=False):
                st.session_state["prefill_question"] = s
                st.rerun()

    # ── Input area ────────────────────────────────────────────────────────────
    st.divider()

    prefill = st.session_state.pop("prefill_question", "") if "prefill_question" in st.session_state else ""

    with st.form(key="chat_form", clear_on_submit=True):
        user_input = st.text_area(
            "Ask a question",
            value=prefill,
            placeholder="Start typing…",
            label_visibility="collapsed",
            height=80,
            key="chat_input",
        )
        col_submit, col_clear = st.columns([6, 1])
        with col_submit:
            submitted = st.form_submit_button("Send →", type="primary", use_container_width=True)
        with col_clear:
            clear = st.form_submit_button("Clear", use_container_width=True)

    if clear:
        st.session_state.chat_history = []
        st.rerun()

    if submitted and user_input.strip():
        question = user_input.strip()

        if not selected:
            st.error("Select at least one source deck in the sidebar first.")
        else:
            with st.spinner("Searching slides and generating answer…"):
                try:
                    response_text, chunks = answer(question, session_id)
                    st.session_state.chat_history.append({"role": "user", "content": question})
                    st.session_state.chat_history.append({"role": "assistant", "content": response_text})

                    if chunks:
                        sources_used = set(
                            (c["deck_id"], c["slide_number"]) for c in chunks
                        )
                        source_labels = [
                            f"{deck_map.get(did, f'Deck {did}')}, Slide {sn}"
                            for did, sn in sorted(sources_used)
                        ]
                        with st.expander("Sources retrieved", expanded=False):
                            for label in source_labels:
                                st.markdown(f"- {label}")

                    st.rerun()
                except ValueError as e:
                    st.error(str(e))
                except Exception as e:
                    st.error(f"Error: {e}")
