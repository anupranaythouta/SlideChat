// Empty state — friendly upload hero with drag-drop
const EmptyState = ({ onUpload }) => {
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onUpload(files[0]);
  };

  return (
    <div className="sc-empty">
      <div
        className={`sc-drop ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
      >
        <div className="sc-drop-inner">
          <div className="sc-drop-icon">
            <svg width="56" height="56" viewBox="0 0 64 64" fill="none" aria-hidden>
              <rect x="8" y="14" width="34" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
              <rect x="18" y="24" width="34" height="24" rx="3" fill="currentColor" opacity="0.10"/>
              <rect x="18" y="24" width="34" height="24" rx="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M35 38v-8m0 0l-3 3m3-3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="sc-empty-h1">Drop a deck to start chatting</h1>
          <p className="sc-empty-p">
            Upload your lecture slides and SlideChat will index every concept, diagram, and definition.
            Ask questions in plain English and get answers rooted in the exact slide they came from.
          </p>
          <div className="sc-drop-actions">
            <button className="sc-btn-primary" onClick={() => inputRef.current?.click()}>
              <span style={{ display: 'inline-flex', marginRight: 8 }}>{Icons.upload}</span>
              Choose a file
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.pptx"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
          />
          <div className="sc-drop-meta">
            <span><kbd>PDF</kbd> or <kbd>PPTX</kbd></span>
            <span className="sc-sep">·</span>
            <span>up to 200 MB</span>
            <span className="sc-sep">·</span>
            <span>indexed in ~30s</span>
          </div>
        </div>
      </div>

      <div className="sc-empty-feats">
        <div className="sc-feat">
          <div className="sc-feat-ic">{Icons.chat}</div>
          <div>
            <div className="sc-feat-h">Chat across every slide</div>
            <div className="sc-feat-p">Combine multiple decks into one conversation.</div>
          </div>
        </div>
        <div className="sc-feat">
          <div className="sc-feat-ic">{Icons.pin}</div>
          <div>
            <div className="sc-feat-h">Hover to see the source</div>
            <div className="sc-feat-p">Every claim links back to the exact slide.</div>
          </div>
        </div>
        <div className="sc-feat">
          <div className="sc-feat-ic">{Icons.sparkles}</div>
          <div>
            <div className="sc-feat-h">Study-ready answers</div>
            <div className="sc-feat-p">Summaries, definitions, and exam focus areas.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Upload modal — real file input + progress bar while server processes
const UploadModal = ({ open, onClose, onUploadComplete }) => {
  const [drag, setDrag] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [error, setError] = React.useState(null);
  const inputRef = React.useRef(null);
  const intervalRef = React.useRef(null);

  const startUpload = async (file) => {
    setError(null);
    setProgress({ name: file.name, pct: 0, stage: 'Uploading' });

    // Animate the progress bar while the real upload runs
    let pct = 0;
    intervalRef.current = setInterval(() => {
      pct += 4 + Math.random() * 6;
      let stage = 'Uploading';
      if (pct > 35) stage = 'Extracting slides';
      if (pct > 65) stage = 'Indexing with embeddings';
      if (pct >= 90) {
        pct = 90; // hold at 90 until real response
        clearInterval(intervalRef.current);
      }
      setProgress(p => p ? { ...p, pct: Math.min(pct, 90), stage } : p);
    }, 280);

    try {
      const deck = await API.uploadDeck(file);
      clearInterval(intervalRef.current);
      setProgress(p => p ? { ...p, pct: 100, stage: 'Ready' } : p);
      setTimeout(() => {
        setProgress(null);
        onUploadComplete(deck);
      }, 500);
    } catch (err) {
      clearInterval(intervalRef.current);
      setProgress(null);
      setError(err.message || 'Upload failed. Please try again.');
    }
  };

  React.useEffect(() => () => clearInterval(intervalRef.current), []);

  if (!open) return null;
  return (
    <div className="sc-modal-scrim" onClick={() => { if (!progress) onClose(); }}>
      <div className="sc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sc-modal-head">
          <div className="sc-modal-title">Upload a deck</div>
          <button className="sc-iconbtn" onClick={() => { if (!progress) onClose(); }}>{Icons.x}</button>
        </div>
        {!progress ? (
          <>
            <div
              className={`sc-modal-drop ${drag ? 'drag' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault(); setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) startUpload(f);
              }}
              onClick={() => inputRef.current?.click()}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ fontSize: 28, opacity: 0.7, marginBottom: 12 }}>{Icons.upload}</div>
              <div className="sc-modal-drop-h">Drop a file, or click to browse</div>
              <div className="sc-modal-drop-p">.pdf, .pptx — up to 200 MB</div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.pptx"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) startUpload(f); e.target.value = ''; }}
              />
            </div>
            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, padding: '0 18px 16px', margin: 0 }}>{error}</p>
            )}
          </>
        ) : (
          <div className="sc-modal-progress">
            <div className="sc-progress-name">{progress.name}</div>
            <div className="sc-progress-bar">
              <div className="sc-progress-fill" style={{ width: `${progress.pct}%` }} />
            </div>
            <div className="sc-progress-stage">
              <span>{progress.stage}</span>
              <span>{Math.round(progress.pct)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

window.EmptyState = EmptyState;
window.UploadModal = UploadModal;
