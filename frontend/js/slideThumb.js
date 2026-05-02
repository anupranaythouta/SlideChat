// Procedural slide thumbnails — SVG that looks like a lecture slide
// Kind: 'title' | 'concept' | 'diagram' | 'code'

const SlideThumb = ({ slide, deck, w = 320, h = 180, detail = 'medium' }) => {
  const bg = 'oklch(0.985 0.004 255)';
  const ink = 'oklch(0.20 0.02 265)';
  const muted = 'oklch(0.62 0.02 265)';
  const accent = deck?.color || 'oklch(0.55 0.16 265)';

  const content = () => {
    switch (slide.kind) {
      case 'title':
        return (
          <>
            <rect x="0" y={h - 6} width={w} height="6" fill={accent} />
            <text x={w/2} y={h/2 - 8} textAnchor="middle" fill={ink} fontFamily="Inter, sans-serif" fontWeight="700" fontSize={w * 0.055}>
              {truncate(deck?.short || 'Lecture', 28)}
            </text>
            <text x={w/2} y={h/2 + 14} textAnchor="middle" fill={muted} fontFamily="Inter, sans-serif" fontSize={w * 0.032}>
              {truncate(slide.title, 44)}
            </text>
          </>
        );
      case 'concept':
        return (
          <>
            <text x="18" y="28" fill={ink} fontFamily="Inter, sans-serif" fontWeight="600" fontSize={w * 0.045}>{truncate(slide.title, 36)}</text>
            <rect x="18" y="38" width={w * 0.1} height="2" fill={accent} />
            {[0,1,2,3].map(i => (
              <g key={i}>
                <circle cx="26" cy={62 + i*22} r="2.2" fill={accent} />
                <rect x="36" y={58 + i*22} width={(w - 60) * (0.85 - i*0.08)} height="3" rx="1.5" fill={ink} opacity="0.75" />
                <rect x="36" y={65 + i*22} width={(w - 60) * (0.55 - i*0.04)} height="3" rx="1.5" fill={muted} opacity="0.5" />
              </g>
            ))}
          </>
        );
      case 'diagram':
        return (
          <>
            <text x="18" y="28" fill={ink} fontFamily="Inter, sans-serif" fontWeight="600" fontSize={w * 0.045}>{truncate(slide.title, 36)}</text>
            <rect x="18" y="38" width={w * 0.1} height="2" fill={accent} />
            {/* nodes */}
            <circle cx={w*0.25} cy={h*0.62} r={w*0.055} fill="none" stroke={ink} strokeWidth="1.4" />
            <circle cx={w*0.5} cy={h*0.42} r={w*0.055} fill={accent} opacity="0.85" />
            <circle cx={w*0.75} cy={h*0.62} r={w*0.055} fill="none" stroke={ink} strokeWidth="1.4" />
            <circle cx={w*0.5} cy={h*0.82} r={w*0.055} fill="none" stroke={ink} strokeWidth="1.4" />
            {/* edges */}
            <line x1={w*0.29} y1={h*0.58} x2={w*0.46} y2={h*0.46} stroke={muted} strokeWidth="1.2" />
            <line x1={w*0.54} y1={h*0.46} x2={w*0.71} y2={h*0.58} stroke={muted} strokeWidth="1.2" />
            <line x1={w*0.29} y1={h*0.66} x2={w*0.46} y2={h*0.78} stroke={muted} strokeWidth="1.2" />
            <line x1={w*0.54} y1={h*0.78} x2={w*0.71} y2={h*0.66} stroke={muted} strokeWidth="1.2" />
            <line x1={w*0.29} y1={h*0.62} x2={w*0.71} y2={h*0.62} stroke={muted} strokeWidth="1.2" strokeDasharray="3 2" />
          </>
        );
      case 'code':
        return (
          <>
            <text x="18" y="28" fill={ink} fontFamily="Inter, sans-serif" fontWeight="600" fontSize={w * 0.045}>{truncate(slide.title, 36)}</text>
            <rect x="18" y="38" width={w * 0.1} height="2" fill={accent} />
            <rect x="18" y="52" width={w - 36} height={h - 70} rx="4" fill="oklch(0.96 0.008 265)" />
            {[0.72, 0.55, 0.82, 0.4, 0.68, 0.3].map((frac, i) => (
              <rect key={i} x="28" y={64 + i*12} width={(w - 56) * frac} height="3" rx="1.5" fill={i % 3 === 0 ? accent : ink} opacity={i % 3 === 0 ? 0.9 : 0.55} />
            ))}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', background: bg, borderRadius: 6 }}>
      <rect x="0" y="0" width={w} height={h} fill={bg} />
      {content()}
      <text x={w - 14} y={h - 10} textAnchor="end" fill={muted} fontFamily="JetBrains Mono, monospace" fontSize={w * 0.028} opacity="0.7">
        {slide.n}
      </text>
    </svg>
  );
};

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

window.SlideThumb = SlideThumb;
