import { useId } from 'react';

// Lightweight inline SVG flags for the supported countries. Stored data is always the ISO code;
// the flag is presentation only. Unknown codes fall back to a neutral code chip.
export const countryNames: Record<string, string> = { IN: 'India', US: 'United States', GB: 'United Kingdom', DE: 'Germany', AE: 'United Arab Emirates', SG: 'Singapore' };

function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 ? r * 0.4 : r;
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    return `${(x + radius * Math.cos(angle)).toFixed(2)},${(y + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
  return <polygon points={points} fill={fill} />;
}

function Artwork({ code, id }: { code: string; id: string }) {
  switch (code) {
    case 'IN': return <>
      <rect width="30" height="20" fill="#fff" /><rect width="30" height="6.67" fill="#FF9933" /><rect y="13.33" width="30" height="6.67" fill="#138808" />
      <circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" strokeWidth="0.6" /><circle cx="15" cy="10" r="0.6" fill="#000080" />
    </>;
    case 'US': return <>
      <rect width="30" height="20" fill="#fff" />
      {Array.from({ length: 7 }, (_, index) => <rect key={index} y={index * (20 / 6.5)} width="30" height={20 / 13} fill="#B22234" />)}
      <rect width="12" height={20 * 7 / 13} fill="#3C3B6E" />
      {Array.from({ length: 12 }, (_, index) => <circle key={index} cx={1.6 + (index % 4) * 2.9} cy={1.6 + Math.floor(index / 4) * 3.4} r="0.55" fill="#fff" />)}
    </>;
    case 'GB': return <>
      <clipPath id={`${id}-t`}><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <g transform="scale(0.5 0.6667)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}-t)`} stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </>;
    case 'DE': return <><rect width="30" height="6.67" fill="#000" /><rect y="6.67" width="30" height="6.67" fill="#DD0000" /><rect y="13.33" width="30" height="6.67" fill="#FFCE00" /></>;
    case 'AE': return <><rect width="30" height="6.67" fill="#00732F" /><rect y="6.67" width="30" height="6.67" fill="#fff" /><rect y="13.33" width="30" height="6.67" fill="#000" /><rect width="7.5" height="20" fill="#FF0000" /></>;
    case 'SG': return <>
      <rect width="30" height="10" fill="#EF3340" /><rect y="10" width="30" height="10" fill="#fff" />
      <circle cx="6" cy="5" r="3.4" fill="#fff" /><circle cx="7.3" cy="5" r="3.1" fill="#EF3340" />
      {[[10, 2.6], [12.1, 4.1], [11.3, 6.6], [8.7, 6.6], [7.9, 4.1]].map(([x, y]) => <Star key={`${x}-${y}`} x={x} y={y} r={0.85} fill="#fff" />)}
    </>;
    default: return null;
  }
}

/** A country flag at text size. Decorative by default; pass `label` when the flag stands alone. */
export function Flag({ code, label, className = '' }: { code: string; label?: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const known = code in countryNames;
  if (!known) return <span aria-hidden={label ? undefined : true} aria-label={label} className={`inline-grid h-[0.875em] w-[1.3125em] shrink-0 place-items-center rounded-[2px] bg-[#E3ECEA] text-[0.5em] font-bold text-[var(--muted-text)] ${className}`}>{code}</span>;
  return <svg viewBox="0 0 30 20" preserveAspectRatio="none" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    className={`inline-block h-[0.875em] w-[1.3125em] shrink-0 overflow-hidden rounded-[2px] align-[-0.1em] shadow-[0_0_0_0.5px_rgba(23,33,38,.18)] ${className}`}>
    <Artwork code={code} id={id} />
  </svg>;
}

/** Flag followed by the country name. */
export function Country({ code, name, className = '' }: { code: string; name?: string; className?: string }) {
  return <span className={`inline-flex items-center gap-1.5 ${className}`}><Flag code={code} /><span>{name ?? countryNames[code] ?? code}</span></span>;
}
