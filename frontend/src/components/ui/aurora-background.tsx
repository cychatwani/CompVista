// Adapted from Aceternity UI's Aurora Background registry component.
// https://ui.aceternity.com/components/aurora-background
export function AuroraBackground() {
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"><div className="auth-aurora absolute -inset-4 opacity-30 blur-xl [background-image:var(--aurora-stripes),var(--aurora-colors)] [background-position:50%_50%,50%_50%] [background-size:300%,200%] [mask-image:radial-gradient(ellipse_at_70%_40%,black_10%,transparent_75%)] after:absolute after:inset-0 after:bg-[image:var(--aurora-stripes),var(--aurora-colors)] after:bg-[length:200%,100%] after:mix-blend-difference after:content-['']" /></div>;
}
