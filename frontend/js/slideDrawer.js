// Right-side slide drawer — opens when a citation is clicked
const SlideDrawer = ({ open, deck, slideN, onClose, onNav }) => {
  const [slideText, setSlideText] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || !deck || !slideN) return;
    setLoading(true);
    setSlideText(null);
    API.getSlideText(deck.id, slideN)
      .then(data => setSlideText(data.text_content))
      .catch(() => setSlideText(null))
      .finally(() => setLoading(false));
  }, [deck?.id, slideN, open]);

  if (!open || !deck) return null;

  const idx = deck.slides.findIndex(s => s.n === slideN);
  const slide = deck.slides[idx] || deck.slides[0];
  const prev = () => idx > 0 && onNav(deck.slides[idx - 1].n);
  const next = () => idx < deck.slides.length - 1 && onNav(deck.slides[idx + 1].n);

  return (
    <div className="sc-drawer">
      <div className="sc-drawer-head">
        <div>
          <div className="sc-drawer-eyebrow">{deck.short}</div>
          <div className="sc-drawer-title">{slide.title}</div>
        </div>
        <button className="sc-iconbtn" onClick={onClose} title="Close">{Icons.x}</button>
      </div>

      <div className="sc-drawer-controls">
        <button className="sc-btn-ghost sm" onClick={prev} disabled={idx === 0}>← Previous</button>
        <div className="sc-slide-counter">
          <span className="sc-mono">{slide.n}</span>
          <span className="sc-drawer-of"> / {deck.pages}</span>
        </div>
        <button className="sc-btn-ghost sm" onClick={next} disabled={idx === deck.slides.length - 1}>Next →</button>
      </div>

      <div className="sc-drawer-body">
        <div className="sc-drawer-section-h">Slide content</div>
        {loading && (
          <div className="sc-drawer-loading">Loading…</div>
        )}
        {!loading && slideText && (
          <pre className="sc-drawer-text-content">{slideText}</pre>
        )}
        {!loading && !slideText && (
          <p className="sc-drawer-empty">No text content available for this slide.</p>
        )}
      </div>
    </div>
  );
};

window.SlideDrawer = SlideDrawer;
