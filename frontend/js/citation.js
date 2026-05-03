// Citation chip — click to open the slide drawer
const CiteChip = ({ cite, decks, onOpen }) => {
  const [deckId, slideStr] = cite.split(':');
  const slideN = parseInt(slideStr, 10);
  const deck = decks.find(d => d.id === deckId);

  if (!deck) return null;

  return (
    <span
      className="sc-cite"
      onClick={() => onOpen(deckId, slideN)}
      style={{ '--deck-color': deck.color }}
    >
      <span className="sc-cite-dot" />
      <span className="sc-cite-label">{deck.short}</span>
      <span className="sc-cite-n">· {slideN}</span>
    </span>
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

    // Markdown table row
    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      const isSeparator = cells.every(c => /^:?-+:?$/.test(c));
      if (!isSeparator) {
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'table') {
          last.rows.push(cells);
        } else {
          flushList();
          blocks.push({ type: 'table', rows: [cells] });
        }
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
        if (block.type === 'table' && block.rows.length > 0) {
          const [head, ...body] = block.rows;
          return (
            <div key={i} className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>{head.map((c, j) => <th key={j}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {body.map((row, j) => (
                    <tr key={j}>{row.map((c, k) => <td key={k}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
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
