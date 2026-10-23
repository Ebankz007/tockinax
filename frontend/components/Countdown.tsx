'use client';
import { useEffect, useState } from 'react';

function parts(ms: number): string {
  if (ms <= 0) return 'matured';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Live countdown to matures_at. Client-side only. */
export default function Countdown({ at }: { at?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [at]);
  if (!at) return <span className="text-mist">—</span>;
  const target = new Date(at).getTime();
  if (Number.isNaN(target)) return <span className="text-mist">—</span>;
  const done = target <= now;
  return (
    <span className={done ? 'text-green-300' : 'text-gold'} title={new Date(at).toLocaleString()}>
      {done ? 'matured ✓' : parts(target - now)}
    </span>
  );
}
