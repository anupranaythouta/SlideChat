// Right-side slide drawer — opens when a citation is clicked
const SlideDrawer = ({ open, deck, slideN, onClose, onNav }) => {
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

      <div className="sc-drawer-big">
        <SlideThumb slide={slide} deck={deck} w={640} h={360} />
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
        <div className="sc-drawer-section-h">Why this was cited</div>
        <p className="sc-drawer-text">
          This slide introduces the {slide.title.toLowerCase()}. The retrieval pass matched your query against the
          heading and bullet text, with a relevance score of <span className="sc-mono">0.{82 + (slide.n % 18)}</span>.
        </p>

        <div className="sc-drawer-section-h" style={{ marginTop: 18 }}>Nearby slides</div>
        <div className="sc-drawer-strip">
          {deck.slides.slice(Math.max(0, idx - 2), idx + 3).map(s => (
            <button key={s.n} className={`sc-strip-thumb ${s.n === slide.n ? 'active' : ''}`} onClick={() => onNav(s.n)}>
              <div className="sc-strip-thumb-img"><SlideThumb slide={s} deck={deck} w={120} h={68} /></div>
              <div className="sc-strip-thumb-n">{s.n}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

window.SlideDrawer = SlideDrawer;
