// Hoverable citation chip — shows a floating slide preview on hover
// Adapted: cite format is "deckId:slideN" where deckId is a string ID
const CiteChip = ({ cite, decks, onOpen }) => {
  const [deckId, slideStr] = cite.split(':');
  const slideN = parseInt(slideStr, 10);
  const deck = decks.find(d => d.id === deckId);
  const slide = deck?.slides?.find(s => s.n === slideN)
    || (deck ? { n: slideN, title: `Slide ${slideN}`, kind: 'concept' } : null);
  const ref = React.useRef(null);
  const [hover, setHover] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    if (!hover || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const previewW = 320;
    const previewH = 220;
    const pad = 10;
    let left = r.left + r.width / 2 - previewW / 2;
    left = Math.max(pad, Math.min(window.innerWidth - previewW - pad, left));
    let top = r.top - previewH - 10;
    if (top < pad) top = r.bottom + 10;
    setPos({ top, left });
  }, [hover]);

  if (!deck) return null;

  return (
    <>
      <span
        ref={ref}
        className="sc-cite"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => onOpen(deckId, slideN)}
        style={{ '--deck-color': deck.color }}
      >
        <span className="sc-cite-dot" />
        <span className="sc-cite-label">{deck.short}</span>
        <span className="sc-cite-n">· {slideN}</span>
      </span>
      {hover && ReactDOM.createPortal(
        <div className="sc-cite-preview" style={{ top: pos.top, left: pos.left }}>
          <div className="sc-cite-preview-thumb">
            {slide && <SlideThumb slide={slide} deck={deck} w={320} h={180} />}
          </div>
          <div className="sc-cite-preview-body">
            <div className="sc-cite-preview-deck">{deck.short}</div>
            <div className="sc-cite-preview-title">{slide?.title || `Slide ${slideN}`}</div>
            <div className="sc-cite-preview-foot">
              <span className="sc-cite-preview-n">slide {slideN} of {deck.pages}</span>
              <span className="sc-cite-preview-open">Click to open {Icons.arrowRight}</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// Parse raw answer text (with [Title, Slide N] markers) into structured blocks
// chunkMap: { "deck_title|slide_number": "deckId:slideN" }
function parseAnswerToBlocks(text, chunks) {
  const citeMap = {};
  (chunks || []).forEach(c => {
    const key = `${c.deck_title}|${c.slide_number}`;
    citeMap[key] = `${c.deck_id}:${c.slide_number}`;
  });

  const CITE_RE = /\[([^\[\]\n]+?),\s*[Ss]lide\s*(\d+)\]/g;

  function extractCites(rawText) {
    const found = [];
    let m;
    const re = new RegExp(CITE_RE.source, CITE_RE.flags);
    while ((m = re.exec(rawText)) !== null) {
      const title = m[1].trim();
      const slideN = parseInt(m[2], 10);
      const key = `${title}|${slideN}`;
      if (citeMap[key]) found.push(citeMap[key]);
    }
    return [...new Set(found)];
  }

  function stripCites(rawText) {
    return rawText.replace(CITE_RE, '').replace(/\s{2,}/g, ' ').trim();
  }

  const lines = text.split('\n');
  const blocks = [];
  let currentList = null;
  let currentListType = null;

  const flushList = () => {
    if (currentList) {
      blocks.push({ type: currentListType, items: currentList });
      currentList = null;
      currentListType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushList(); continue; }

    // Markdown-style headers
    if (/^#{1,4}\s/.test(line)) {
      flushList();
      blocks.push({ type: 'h', text: line.replace(/^#+\s*/, '').replace(/\*\*/g, '') });
      continue;
    }

    // Bold-only lines as headers (e.g. **Title**)
    if (/^\*\*[^*]+\*\*:?\s*$/.test(line)) {
      flushList();
      blocks.push({ type: 'h', text: line.replace(/\*\*/g, '').replace(/:$/, '').trim() });
      continue;
    }

    // Ordered list item
    if (/^\d+\.\s/.test(line)) {
      const itemText = line.replace(/^\d+\.\s/, '');
      const item = { text: stripCites(itemText).replace(/\*\*/g, ''), cites: extractCites(itemText) };
      if (currentListType === 'ol') {
        currentList.push(item);
      } else {
        flushList();
        currentListType = 'ol';
        currentList = [item];
      }
      continue;
    }

    // Unordered list item
    if (/^[-*•]\s/.test(line)) {
      const itemText = line.replace(/^[-*•]\s/, '');
      const item = { text: stripCites(itemText).replace(/\*\*/g, ''), cites: extractCites(itemText) };
      if (currentListType === 'ul') {
        currentList.push(item);
      } else {
        flushList();
        currentListType = 'ul';
        currentList = [item];
      }
      continue;
    }

    // Regular paragraph
    flushList();
    blocks.push({
      type: 'p',
      text: stripCites(line).replace(/\*\*/g, ''),
      cites: extractCites(line),
    });
  }
  flushList();
  return blocks.filter(b => b.type === 'h' ? b.text : true);
}

// Renders a parsed answer block array with inline citation chips
const AnswerBlock = ({ content, decks, onOpenCite }) => {
  return (
    <div className="sc-answer">
      {content.map((block, i) => {
        if (block.type === 'p') {
          return (
            <p key={i} className="sc-p">
              {block.text}
              {block.cites && block.cites.length > 0 && (
                <span className="sc-cites-inline">
                  {block.cites.map(c => <CiteChip key={c} cite={c} decks={decks} onOpen={onOpenCite} />)}
                </span>
              )}
            </p>
          );
        }
        if (block.type === 'h') return <h4 key={i} className="sc-h">{block.text}</h4>;
        if (block.type === 'ul') {
          return (
            <ul key={i} className="sc-ul">
              {block.items.map((it, j) => (
                <li key={j}>
                  <span>{it.text}</span>
                  {it.cites && it.cites.length > 0 && (
                    <span className="sc-cites-inline">
                      {it.cites.map(c => <CiteChip key={c} cite={c} decks={decks} onOpen={onOpenCite} />)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="sc-ol">
              {block.items.map((it, j) => (
                <li key={j}>
                  <span>{it.text}</span>
                  {it.cites && it.cites.length > 0 && (
                    <span className="sc-cites-inline">
                      {it.cites.map(c => <CiteChip key={c} cite={c} decks={decks} onOpen={onOpenCite} />)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          );
        }
        return null;
      })}
    </div>
  );
};

window.CiteChip = CiteChip;
window.AnswerBlock = AnswerBlock;
window.parseAnswerToBlocks = parseAnswerToBlocks;
