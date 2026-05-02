// Minimal stroke icons — 1.5px weight, 20px default
const Icon = ({ path, size = 20, fill = false, stroke = 'currentColor', sw = 1.6, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
    {typeof path === 'string' ? <path d={path} /> : path}
  </svg>
);

const Icons = {
  logo: (size = 22) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      <rect x="7" y="10" width="14" height="10" rx="2" fill="currentColor" opacity="0.18" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  ),
  upload: <Icon path="M12 16V4M12 4l-4 4M12 4l4 4M4 20h16" />,
  send: <Icon path="M4 12l16-8-6 16-2-7-8-1z" />,
  plus: <Icon path="M12 5v14M5 12h14" />,
  trash: <Icon path="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  settings: <Icon path="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.6 1.7 1.7 0 00-1.8.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1.1 1.7 1.7 0 00-.4-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />,
  chat: <Icon path="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  doc: <Icon path="M8 3h8l4 4v14H4V3z M14 3v5h5" />,
  sparkles: <Icon path="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />,
  check: <Icon path="M5 13l4 4L19 7" sw={2} />,
  x: <Icon path="M6 6l12 12M18 6L6 18" />,
  arrowRight: <Icon path="M5 12h14M13 6l6 6-6 6" />,
  sun: <Icon path="M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6l-1.4-1.4M19.4 19.4L18 18M6 18l-1.4 1.4M19.4 4.6L18 6M12 17a5 5 0 100-10 5 5 0 000 10z" />,
  moon: <Icon path="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
  copy: <Icon path="M8 8h11v13H8zM5 5h11v3M5 5v11h3" />,
  regen: <Icon path="M4 4v6h6M20 20v-6h-6M5 14a8 8 0 0014 4M19 10A8 8 0 005 6" />,
  search: <Icon path="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" />,
  slide: <Icon path="M3 5h18v12H3zM8 21h8M12 17v4" />,
  pin: <Icon path="M12 2v7l4 4-1 3h-6l-1-3 4-4V2M12 16v6" />,
  chevron: <Icon path="M9 6l6 6-6 6" />,
  menu: <Icon path="M4 7h16M4 12h16M4 17h16" />,
  file: <Icon path="M7 3h7l5 5v13H7zM14 3v5h5" />,
  bolt: <Icon path="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  chart: <Icon path="M3 20h18M7 20V10M12 20V4M17 20v-6" />,
};

window.Icon = Icon;
window.Icons = Icons;
