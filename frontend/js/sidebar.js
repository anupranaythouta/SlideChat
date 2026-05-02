// Left sidebar — decks + sessions
const Sidebar = ({
  decks, selectedDecks, onToggleDeck, onSelectAll, onDeleteDeck, onRenameDeck,
  sessions, activeSession, onSelectSession, onNewSession,
  onUploadClick, collapsed, onToggleCollapse, theme,
  onRenameSession, onDeleteSession, pendingRenameId, onClearPendingRename,
}) => {
  // Session rename state
  const [editingId, setEditingId] = React.useState(null);
  const [editDraft, setEditDraft] = React.useState('');
  const inputRef = React.useRef(null);

  // Deck rename state
  const [editingDeckId, setEditingDeckId] = React.useState(null);
  const [editDeckDraft, setEditDeckDraft] = React.useState('');
  const deckInputRef = React.useRef(null);

  React.useEffect(() => {
    if (editingDeckId && deckInputRef.current) {
      deckInputRef.current.focus();
      deckInputRef.current.select();
    }
  }, [editingDeckId]);

  const startDeckEditing = (d, e) => {
    e.stopPropagation();
    setEditingDeckId(d.id);
    setEditDeckDraft(d.title);
  };

  const commitDeckRename = () => {
    if (editingDeckId) {
      const trimmed = editDeckDraft.trim();
      if (trimmed) onRenameDeck(editingDeckId, trimmed);
    }
    setEditingDeckId(null);
    setEditDeckDraft('');
  };

  React.useEffect(() => {
    if (pendingRenameId) {
      const sess = sessions.find(s => s.id === pendingRenameId);
      if (sess) {
        setEditingId(pendingRenameId);
        setEditDraft(sess.title);
        onClearPendingRename();
      }
    }
  }, [pendingRenameId, sessions]);

  React.useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const commitRename = () => {
    if (editingId) {
      const trimmed = editDraft.trim();
      if (trimmed) onRenameSession(editingId, trimmed);
    }
    setEditingId(null);
    setEditDraft('');
  };

  const startEditing = (s, e) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditDraft(s.title);
  };

  if (collapsed) {
    return (
      <aside className="sc-sidebar sc-sidebar-collapsed">
        <button className="sc-iconbtn" onClick={onToggleCollapse} title="Expand sidebar">
          {Icons.menu}
        </button>
        <button className="sc-iconbtn" onClick={onUploadClick} title="Upload deck">
          {Icons.upload}
        </button>
        <button className="sc-iconbtn" onClick={onNewSession} title="New session">
          {Icons.plus}
        </button>
      </aside>
    );
  }

  const allOn = selectedDecks.length === decks.length && decks.length > 0;

  return (
    <aside className="sc-sidebar">
      <div className="sc-brand">
        <div className="sc-brand-mark">{Icons.logo(20)}</div>
        <div className="sc-brand-text">
          <div className="sc-brand-name">SlideChat</div>
          <div className="sc-brand-sub">RAG · lecture decks</div>
        </div>
        <button className="sc-iconbtn sc-brand-collapse" onClick={onToggleCollapse} title="Collapse">
          {Icons.menu}
        </button>
      </div>

      <button className="sc-upload" onClick={onUploadClick}>
        <span className="sc-upload-ic">{Icons.upload}</span>
        <span>Upload a deck</span>
        <span className="sc-upload-kbd">⌘U</span>
      </button>
      <div className="sc-upload-hint">PDF or PPTX · up to 200 MB</div>

      <div className="sc-section">
        <div className="sc-section-head">
          <span className="sc-section-title">Sources</span>
          <button className={`sc-chip ${allOn ? 'on' : ''}`} onClick={onSelectAll}>
            {allOn ? 'All on' : 'All'}
          </button>
        </div>
        <div className="sc-deck-list">
          {decks.map(d => {
            const on = selectedDecks.includes(d.id);
            const renamingThis = editingDeckId === d.id;
            return (
              <div key={d.id} className={`sc-deck ${on ? 'on' : ''}`} onClick={() => !renamingThis && onToggleDeck(d.id)}>
                <div className="sc-deck-check" style={{ borderColor: on ? d.color : undefined, background: on ? d.color : 'transparent' }}>
                  {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0b0c10" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>}
                </div>
                <div className="sc-deck-body">
                  {renamingThis ? (
                    <input
                      ref={deckInputRef}
                      className="sc-session-rename-input"
                      value={editDeckDraft}
                      onChange={e => setEditDeckDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitDeckRename();
                        if (e.key === 'Escape') { setEditingDeckId(null); setEditDeckDraft(''); }
                      }}
                      onBlur={commitDeckRename}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <div className="sc-deck-title" onDoubleClick={e => startDeckEditing(d, e)}>{d.short}</div>
                      <div className="sc-deck-meta">
                        <span>{d.pages} slides</span>
                        <span className="sc-dot">·</span>
                        <span>{d.uploaded}</span>
                      </div>
                    </>
                  )}
                </div>
                <button className="sc-deck-del" onClick={(e) => { e.stopPropagation(); onDeleteDeck(d.id); }} title="Remove deck">
                  {Icons.trash}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sc-section sc-section-grow">
        <div className="sc-section-head">
          <span className="sc-section-title">Sessions</span>
          <button className="sc-chip" onClick={onNewSession}>
            <span style={{display:'inline-flex',marginRight:4}}>{Icons.plus}</span>
            New
          </button>
        </div>
        <div className="sc-session-list">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`sc-session ${activeSession === s.id ? 'active' : ''}`}
              onClick={() => editingId !== s.id && onSelectSession(s.id)}
            >
              {editingId === s.id ? (
                <input
                  ref={inputRef}
                  className="sc-session-rename-input"
                  value={editDraft}
                  onChange={e => setEditDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') { setEditingId(null); setEditDraft(''); }
                  }}
                  onBlur={commitRename}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <div className="sc-session-body">
                    <div className="sc-session-title" onDoubleClick={e => startEditing(s, e)}>{s.title}</div>
                    <div className="sc-session-meta">{s.when} · {s.count} msgs</div>
                  </div>
                  <button
                    className="sc-session-del"
                    onClick={e => { e.stopPropagation(); onDeleteSession(s.id); }}
                    title="Delete session"
                  >
                    {Icons.trash}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

    </aside>
  );
};

window.Sidebar = Sidebar;
