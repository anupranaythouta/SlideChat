// Top-level App shell — wired to real API
const { useState, useEffect, useMemo, useRef, useCallback } = React;

const App = () => {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('sc.theme') || 'dark'; } catch { return 'dark'; }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Decks & sessions loaded from server
  const [decks, setDecks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);

  // Per-session state
  const [selectedDeckIds, setSelectedDeckIds] = useState([]);
  const [messagesBySession, setMessagesBySession] = useState({});
  const [streamingId, setStreamingId] = useState(null);

  // UI state
  const [pendingRenameId, setPendingRenameId] = useState(null);
  const [composerValue, setComposerValue] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [drawer, setDrawer] = useState(null); // { deckId, slideN }
  const [searchOpen, setSearchOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [density, setDensity] = useState('comfortable');
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState(null);

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('sc.theme', theme); } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') { e.preventDefault(); setUploadOpen(true); }
      if (e.key === 'Escape') { setSearchOpen(false); setUploadOpen(false); setDrawer(null); setStatsOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Bootstrap: load decks + sessions ──────────────────────────────────────
  useEffect(() => {
    Promise.all([API.getDecks(), API.getSessions()])
      .then(([d, s]) => {
        setDecks(d);
        setSessions(s);
      })
      .catch(err => setError('Failed to load data: ' + err.message));
  }, []);

  // ── Switch session ─────────────────────────────────────────────────────────
  const selectSession = useCallback(async (sid) => {
    if (sid === activeSessionId) return;
    setActiveSessionId(sid);
    setLoadingSession(true);
    try {
      const [msgs, sourceIds] = await Promise.all([
        API.getMessages(sid),
        API.getSources(sid),
      ]);
      // Convert stored messages to local format
      const converted = msgs.map((m, i) => {
        if (m.role === 'user') return { id: `u${sid}_${i}`, role: 'user', text: m.content };
        // For assistant messages, parse the stored text back into blocks
        // We don't have chunk data for old messages, so parse without cite mapping
        const blocks = parseAnswerToBlocks(m.content, []);
        return { id: `a${sid}_${i}`, role: 'assistant', content: blocks };
      });
      setMessagesBySession(prev => ({ ...prev, [sid]: converted }));
      setSelectedDeckIds(sourceIds);
    } catch (err) {
      setError('Failed to load session: ' + err.message);
    } finally {
      setLoadingSession(false);
    }
  }, [activeSessionId]);

  // ── New session ────────────────────────────────────────────────────────────
  const newSession = async () => {
    try {
      const sess = await API.createSession('New conversation');
      setSessions(prev => [sess, ...prev]);
      setActiveSessionId(sess.id);
      setSelectedDeckIds(decks.map(d => d.id));
      setMessagesBySession(prev => ({ ...prev, [sess.id]: [] }));
      setPendingRenameId(sess.id);
      if (decks.length > 0) {
        await API.setSources(sess.id, decks.map(d => d.id)).catch(() => {});
      }
    } catch (err) {
      setError('Failed to create session: ' + err.message);
    }
  };

  // ── Rename deck ────────────────────────────────────────────────────────────
  const renameDeck = useCallback(async (deckId, title) => {
    try {
      await API.renameDeck(deckId, title);
      const short = title.length <= 34 ? title : title.slice(0, 31) + '…';
      setDecks(prev => prev.map(d => d.id === deckId ? { ...d, title, short } : d));
      showToast('Deck renamed', 'success');
    } catch (err) {
      showToast('Failed to rename deck: ' + err.message, 'error');
    }
  }, []);

  // ── Rename session ─────────────────────────────────────────────────────────
  const renameSession = useCallback(async (sessionId, name) => {
    try {
      await API.renameSession(sessionId, name);
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: name } : s));
      showToast('Session renamed', 'success');
    } catch (err) {
      showToast('Failed to rename session: ' + err.message, 'error');
    }
  }, []);

  // ── Toggle deck source ─────────────────────────────────────────────────────
  const toggleDeck = useCallback(async (deckId) => {
    const next = selectedDeckIds.includes(deckId)
      ? selectedDeckIds.filter(x => x !== deckId)
      : [...selectedDeckIds, deckId];
    setSelectedDeckIds(next);
    if (activeSessionId) {
      API.setSources(activeSessionId, next).catch(() => {});
    }
  }, [selectedDeckIds, activeSessionId]);

  const toggleAllDecks = useCallback(async () => {
    const allOn = selectedDeckIds.length === decks.length && decks.length > 0;
    const next = allOn ? [] : decks.map(d => d.id);
    setSelectedDeckIds(next);
    if (activeSessionId) {
      API.setSources(activeSessionId, next).catch(() => {});
    }
  }, [selectedDeckIds, decks, activeSessionId]);

  // ── Delete session ─────────────────────────────────────────────────────────
  const deleteSession = useCallback(async (sessionId) => {
    try {
      await API.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setSelectedDeckIds([]);
      }
      setMessagesBySession(prev => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      showToast('Session deleted', 'success');
    } catch (err) {
      showToast('Failed to delete session: ' + err.message, 'error');
    }
  }, [activeSessionId]);

  // ── Delete deck ────────────────────────────────────────────────────────────
  const deleteDeck = useCallback(async (deckId) => {
    try {
      await API.deleteDeck(deckId);
      setDecks(prev => prev.filter(d => d.id !== deckId));
      setSelectedDeckIds(prev => prev.filter(x => x !== deckId));
      showToast('Deck deleted', 'success');
    } catch (err) {
      showToast('Failed to delete deck: ' + err.message, 'error');
    }
  }, []);

  // ── Upload deck ────────────────────────────────────────────────────────────
  const handleUploadComplete = useCallback((deck) => {
    setDecks(prev => [deck, ...prev]);
    setSelectedDeckIds(prev => [...prev, deck.id]);
    setUploadOpen(false);
    showToast(`"${deck.title}" uploaded successfully`, 'success');
    if (activeSessionId) {
      API.setSources(activeSessionId, [...selectedDeckIds, deck.id]).catch(() => {});
    }
  }, [activeSessionId, selectedDeckIds]);

  // ── Send message ───────────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    if (!activeSessionId) {
      // Auto-create a session if none is active
      let sess;
      try { sess = await API.createSession('New conversation'); }
      catch (err) { setError('Could not create session: ' + err.message); return; }
      setSessions(prev => [sess, ...prev]);
      setActiveSessionId(sess.id);
      if (decks.length > 0) {
        const ids = decks.map(d => d.id);
        setSelectedDeckIds(ids);
        await API.setSources(sess.id, ids).catch(() => {});
      }
      setMessagesBySession(prev => ({ ...prev, [sess.id]: [] }));
      // Give state a tick to settle then send
      setTimeout(() => sendToSession(sess.id, text), 50);
      return;
    }
    sendToSession(activeSessionId, text);
  }, [activeSessionId, decks, selectedDeckIds]);

  const sendToSession = async (sessionId, text) => {
    const userMsg = { id: 'u' + Date.now(), role: 'user', text };
    const aiId = 'a' + (Date.now() + 1);
    const aiMsg = { id: aiId, role: 'assistant', content: [] };

    setMessagesBySession(prev => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] || []), userMsg, aiMsg],
    }));
    setStreamingId(aiId);

    try {
      const result = await API.ask(sessionId, text);
      const blocks = parseAnswerToBlocks(result.text, result.chunks);
      setMessagesBySession(prev => ({
        ...prev,
        [sessionId]: (prev[sessionId] || []).map(m =>
          m.id === aiId ? { ...m, content: blocks } : m
        ),
      }));
      // Refresh session list to update message count
      API.getSessions().then(setSessions).catch(() => {});
    } catch (err) {
      setMessagesBySession(prev => ({
        ...prev,
        [sessionId]: (prev[sessionId] || []).map(m =>
          m.id === aiId ? { ...m, content: [], error: err.message } : m
        ),
      }));
    } finally {
      setStreamingId(null);
    }
  };

  const sendStarter = (s) => { setComposerValue(''); send(s); };

  // ── Regenerate ─────────────────────────────────────────────────────────────
  const regenMsg = useCallback((msg) => {
    if (!activeSessionId) return;
    const msgs = messagesBySession[activeSessionId] || [];
    const idx = msgs.findIndex(m => m.id === msg.id);
    const prevUser = msgs.slice(0, idx).filter(m => m.role === 'user').slice(-1)[0];
    if (!prevUser) return;
    setStreamingId(msg.id);
    setMessagesBySession(prev => ({
      ...prev,
      [activeSessionId]: (prev[activeSessionId] || []).map(m =>
        m.id === msg.id ? { ...m, content: [] } : m
      ),
    }));
    API.ask(activeSessionId, prevUser.text)
      .then(result => {
        const blocks = parseAnswerToBlocks(result.text, result.chunks);
        setMessagesBySession(prev => ({
          ...prev,
          [activeSessionId]: (prev[activeSessionId] || []).map(m =>
            m.id === msg.id ? { ...m, content: blocks, error: undefined } : m
          ),
        }));
      })
      .catch(err => {
        setMessagesBySession(prev => ({
          ...prev,
          [activeSessionId]: (prev[activeSessionId] || []).map(m =>
            m.id === msg.id ? { ...m, content: [], error: err.message } : m
          ),
        }));
      })
      .finally(() => setStreamingId(null));
  }, [activeSessionId, messagesBySession]);

  const copyMsg = (msg) => {
    const text = (msg.content || [])
      .map(b => b.type === 'p' || b.type === 'h' ? b.text : (b.items || []).map(i => i.text).join('\n'))
      .join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const messages = messagesBySession[activeSessionId] || [];
  const clearMessages = () => {
    if (!activeSessionId) return;
    setMessagesBySession(prev => ({ ...prev, [activeSessionId]: [] }));
  };
  const activeSess = sessions.find(s => s.id === activeSessionId);
  const hasDecks = decks.length > 0;
  const hasConvo = messages.length > 0;
  const drawerDeck = drawer ? decks.find(d => d.id === drawer.deckId) : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`sc-app sc-theme-${theme} sc-density-${density} ${drawer ? 'sc-drawer-open' : ''}`}>
      <Sidebar
        decks={decks}
        selectedDecks={selectedDeckIds}
        onToggleDeck={toggleDeck}
        onSelectAll={toggleAllDecks}
        onDeleteDeck={deleteDeck}
        onRenameDeck={renameDeck}
        sessions={sessions}
        activeSession={activeSessionId}
        onSelectSession={selectSession}
        onNewSession={newSession}
        onUploadClick={() => setUploadOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        theme={theme}
        onRenameSession={renameSession}
        onDeleteSession={deleteSession}
        pendingRenameId={pendingRenameId}
        onClearPendingRename={() => setPendingRenameId(null)}
      />

      <main className="sc-main">
        <ChatHeader
          session={activeSess}
          selectedDeckCount={selectedDeckIds.length}
          onOpenSearch={() => setSearchOpen(true)}
          onExport={() => {}}
          onClear={clearMessages}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenStats={() => setStatsOpen(true)}
        />

        <div className="sc-main-scroll">
          {error && (
            <div style={{ padding: '12px 24px', color: 'var(--danger)', fontSize: 13 }}>
              {error}
              <button
                onClick={() => setError(null)}
                style={{ marginLeft: 12, color: 'var(--ink-4)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
              >
                Dismiss
              </button>
            </div>
          )}
          {!hasDecks ? (
            <EmptyState onUpload={(file) => { if (file instanceof File) handleUploadComplete._uploading = file; setUploadOpen(true); }} />
          ) : !hasConvo && !loadingSession ? (
            <WelcomeView
              decks={decks.filter(d => selectedDeckIds.includes(d.id))}
              onPickStarter={sendStarter}
            />
          ) : loadingSession ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', color: 'var(--ink-4)' }}>
              Loading…
            </div>
          ) : (
            <Conversation
              messages={messages}
              decks={decks}
              onOpenCite={(deckId, slideN) => setDrawer({ deckId, slideN })}
              streamingId={streamingId}
              onCopy={copyMsg}
              onRegen={regenMsg}
            />
          )}
        </div>

        {hasDecks && (
          <Composer
            onSend={send}
            disabled={!!streamingId || selectedDeckIds.length === 0}
            value={composerValue}
            setValue={setComposerValue}
            sources={selectedDeckIds.length}
          />
        )}
      </main>

      {drawer && drawerDeck && (
        <SlideDrawer
          open={!!drawer}
          deck={drawerDeck}
          slideN={drawer.slideN}
          onClose={() => setDrawer(null)}
          onNav={(n) => setDrawer(d => ({ ...d, slideN: n }))}
        />
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploadComplete={handleUploadComplete}
      />

      {statsOpen && (
        <StatsPanel onClose={() => setStatsOpen(false)} />
      )}

      {searchOpen && (
        <CommandK
          decks={decks}
          onClose={() => setSearchOpen(false)}
          onOpenCite={(deckId, slideN) => { setDrawer({ deckId, slideN }); setSearchOpen(false); }}
        />
      )}

      <ToastContainer />

      {tweaksOpen && (
        <TweaksPanel
          theme={theme}
          onTheme={toggleTheme}
          density={density}
          onDensity={setDensity}
          onClose={() => setTweaksOpen(false)}
        />
      )}
    </div>
  );
};

// Welcome view — shown when decks exist but no conversation yet
const WelcomeView = ({ decks, onPickStarter }) => (
  <div className="sc-welcome">
    <div className="sc-welcome-hero">
      <div className="sc-welcome-eyebrow">
        <span className="sc-pill">
          <span className="sc-pill-dot" />
          Indexed {decks.reduce((a, d) => a + (d.pages || 0), 0)} slides across {decks.length} {decks.length === 1 ? 'deck' : 'decks'}
        </span>
      </div>
      <h1 className="sc-welcome-h1">What would you like to learn today?</h1>
      <p className="sc-welcome-p">Ask anything: definitions, comparisons, exam focus areas. Every answer links back to the slide it came from.</p>
    </div>
    <StartersRow onPick={onPickStarter} />
    {decks.length > 0 && (
      <div className="sc-welcome-decks">
        <div className="sc-welcome-decks-h">Your sources</div>
        <div className="sc-welcome-decks-grid">
          {decks.map(d => (
            <div key={d.id} className="sc-deckcard">
              <div className="sc-deckcard-thumb">
                {d.slides && d.slides.length > 0
                  ? <SlideThumb slide={d.slides[0]} deck={d} w={280} h={158} />
                  : <div style={{ width: '100%', height: '100%', background: 'var(--bg-3)' }} />
                }
              </div>
              <div className="sc-deckcard-body">
                <div className="sc-deckcard-title">{d.short}</div>
                <div className="sc-deckcard-meta">{d.pages} slides · uploaded {d.uploaded}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

// ⌘K command palette
const CommandK = ({ decks, onClose, onOpenCite }) => {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const all = [];
    decks.forEach(d => (d.slides || []).forEach(s => all.push({ deck: d, slide: s })));
    if (!q.trim()) return all.slice(0, 8);
    const lq = q.toLowerCase();
    return all.filter(r =>
      r.slide.title.toLowerCase().includes(lq) ||
      r.deck.short.toLowerCase().includes(lq)
    ).slice(0, 12);
  }, [q, decks]);

  return (
    <div className="sc-modal-scrim" onClick={onClose}>
      <div className="sc-cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="sc-cmdk-input-wrap">
          <span className="sc-cmdk-ic">{Icons.search}</span>
          <input
            autoFocus
            className="sc-cmdk-input"
            placeholder="Search slides, concepts, sessions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="sc-cmdk-kbd">esc</span>
        </div>
        <div className="sc-cmdk-results">
          {results.length === 0 && <div className="sc-cmdk-empty">No matches</div>}
          {results.map((r, i) => (
            <button key={i} className="sc-cmdk-item" onClick={() => onOpenCite(r.deck.id, r.slide.n)}>
              <div className="sc-cmdk-thumb">
                <SlideThumb slide={r.slide} deck={r.deck} w={80} h={46} />
              </div>
              <div className="sc-cmdk-item-body">
                <div className="sc-cmdk-item-title">{r.slide.title}</div>
                <div className="sc-cmdk-item-meta">{r.deck.short} · slide {r.slide.n}</div>
              </div>
              <span className="sc-cmdk-item-arrow">{Icons.arrowRight}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Tweaks panel (theme + density)
const TweaksPanel = ({ theme, onTheme, density, onDensity, onClose }) => (
  <div className="sc-tweaks">
    <div className="sc-tweaks-head">
      <div className="sc-tweaks-title">Tweaks</div>
      <button className="sc-iconbtn" onClick={onClose}>{Icons.x}</button>
    </div>
    <div className="sc-tweaks-row">
      <div className="sc-tweaks-label">Theme</div>
      <div className="sc-tweaks-seg">
        <button className={theme === 'dark' ? 'on' : ''} onClick={() => theme !== 'dark' && onTheme()}>Dark</button>
        <button className={theme === 'light' ? 'on' : ''} onClick={() => theme !== 'light' && onTheme()}>Light</button>
      </div>
    </div>
    <div className="sc-tweaks-row">
      <div className="sc-tweaks-label">Density</div>
      <div className="sc-tweaks-seg">
        <button className={density === 'compact' ? 'on' : ''} onClick={() => onDensity('compact')}>Compact</button>
        <button className={density === 'comfortable' ? 'on' : ''} onClick={() => onDensity('comfortable')}>Comfortable</button>
      </div>
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
