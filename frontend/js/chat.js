// Chat view — composer, message list, streaming indicator, starters
const ChatHeader = ({ session, selectedDeckCount, onOpenSearch, onExport, onClear, theme, onToggleTheme, onOpenStats }) => (
  <header className="sc-chat-head">
    <div className="sc-chat-head-l">
      <div className="sc-chat-title">{session?.title || 'New conversation'}</div>
      <div className="sc-chat-sub">
        <span className="sc-pill">
          <span className="sc-pill-dot" />
          {selectedDeckCount} {selectedDeckCount === 1 ? 'source' : 'sources'} active
        </span>
        <span className="sc-chat-sub-sep">·</span>
        <span className="sc-chat-sub-muted">Gemini · SlideChat RAG</span>
      </div>
    </div>
    <div className="sc-chat-head-r">
      <button className="sc-iconbtn" onClick={onOpenSearch} title="Search (⌘K)">{Icons.search}</button>
      <button className="sc-iconbtn" onClick={onOpenStats} title="Statistics">{Icons.chart}</button>
      <button className="sc-iconbtn" onClick={onToggleTheme} title="Toggle theme">
        {theme === 'dark' ? Icons.sun : Icons.moon}
      </button>
      <div className="sc-head-divider" />
      <button className="sc-btn-ghost sm" onClick={onClear}>Clear</button>
    </div>
  </header>
);

const STARTERS = [
  'Summarize the key concepts across these slides',
  'What are the main takeaways from this lecture?',
  'List every definition and formula mentioned',
  'What should I focus on for the final exam?',
];

const StartersRow = ({ onPick }) => (
  <div className="sc-starters">
    <div className="sc-starters-h">
      <span style={{ display: 'inline-flex', marginRight: 8, opacity: 0.6 }}>{Icons.sparkles}</span>
      Try asking
    </div>
    <div className="sc-starters-grid">
      {STARTERS.map((s, i) => (
        <button key={i} className="sc-starter" onClick={() => onPick(s)}>
          <span className="sc-starter-arrow">{Icons.arrowRight}</span>
          <span>{s}</span>
        </button>
      ))}
    </div>
  </div>
);

const Composer = ({ onSend, disabled, value, setValue, sources }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + 'px';
    }
  }, [value]);

  const submit = () => {
    const v = value.trim();
    if (!v || disabled) return;
    onSend(v);
    setValue('');
  };

  return (
    <div className="sc-composer-wrap">
      <div className="sc-composer">
        <textarea
          ref={ref}
          className="sc-composer-input"
          placeholder="Ask about the slides…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={1}
        />
        <div className="sc-composer-row">
          <div className="sc-composer-meta">
            <span className="sc-source-chip">
              <span className="sc-source-dot" />
              {sources} {sources === 1 ? 'source' : 'sources'}
            </span>
            <span className="sc-composer-kbd">⏎ send · ⇧⏎ newline</span>
          </div>
          <button className="sc-send" onClick={submit} disabled={disabled || !value.trim()}>
            <span>Send</span>
            <span className="sc-send-arrow">{Icons.arrowRight}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const UserBubble = ({ text }) => (
  <div className="sc-msg sc-msg-user">
    <div className="sc-msg-body">{text}</div>
  </div>
);

const AssistantBubble = ({ content, decks, onOpenCite, streaming, onCopy, onRegen, error }) => (
  <div className="sc-msg sc-msg-ai">
    <div className="sc-msg-avatar">{Icons.logo(18)}</div>
    <div className="sc-msg-col">
      <div className="sc-msg-body sc-msg-body-ai">
        {streaming ? (
          <div className="sc-typing">
            <span /><span /><span />
            <span className="sc-typing-label">searching slides and generating answer…</span>
          </div>
        ) : error ? (
          <p className="sc-p" style={{ color: 'var(--danger)' }}>{error}</p>
        ) : (
          <AnswerBlock content={content} decks={decks} onOpenCite={onOpenCite} />
        )}
      </div>
      {!streaming && !error && (
        <div className="sc-msg-actions">
          <button className="sc-msg-action" onClick={onCopy}>
            <span style={{ marginRight: 6, display: 'inline-flex' }}>{Icons.copy}</span>Copy
          </button>
          <button className="sc-msg-action" onClick={onRegen}>
            <span style={{ marginRight: 6, display: 'inline-flex' }}>{Icons.regen}</span>Regenerate
          </button>
        </div>
      )}
    </div>
  </div>
);

const Conversation = ({ messages, decks, onOpenCite, streamingId, onCopy, onRegen }) => {
  const endRef = React.useRef(null);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingId]);

  return (
    <div className="sc-convo">
      {messages.map(m => m.role === 'user'
        ? <UserBubble key={m.id} text={m.text} />
        : <AssistantBubble
            key={m.id}
            content={m.content || []}
            decks={decks}
            onOpenCite={onOpenCite}
            streaming={m.id === streamingId}
            error={m.error}
            onCopy={() => onCopy(m)}
            onRegen={() => onRegen(m)}
          />
      )}
      <div ref={endRef} style={{ height: 20 }} />
    </div>
  );
};

window.ChatHeader = ChatHeader;
window.StartersRow = StartersRow;
window.Composer = Composer;
window.Conversation = Conversation;
