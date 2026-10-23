'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { fetchModule, listOf, num, type CycleInfo, type ModuleState } from '@/lib/api';

function CycleCard({ c, i }: { c: CycleInfo; i: number }) {
  const total = num(c.total) || (c.cycle_days === 14 ? 3 * 14 : 6 * 7);
  const done = num(c.completed ?? c.progress);
  const pct = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
  const label = c.cycle_days === 14 ? '3×14' : '6×7';
  return (
    <article className="rounded-lg border border-line/10 bg-coal p-3" aria-label={`Cycle ${i + 1}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-white">Cycle {c.cycle_no ?? i + 1} · {label}</p>
        {c.eligible ? (
          <span className="badge-ok">eligible</span>
        ) : (
          <span className="badge-disabled">not eligible</span>
        )}
      </div>
      <div className="bar mt-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Cycle progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-mist">{done} of {total} steps · status: {c.status || 'in progress'}</p>
    </article>
  );
}

function CyclesInner() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  useEffect(() => {
    fetchModule<unknown>('/tokens/cycles').then(setMod);
  }, []);

  const rows = mod.state === 'live' ? listOf<CycleInfo>(mod.data) : [];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        My cycles <SimBadge />
      </h1>
      <div className="card space-y-3">
        <p className="text-sm text-mist">
          7-day tokens run <strong className="text-white">6×7</strong> progress steps; 14-day tokens
          run <strong className="text-white">3×14</strong>. Eligibility unlocks maturity and auto-listing.
        </p>
        {mod.state === 'loading' && <p role="status">Loading cycles…</p>}
        {mod.state === 'deploying' && <ModuleEmpty title="Cycles module deploying." />}
        {mod.state === 'forbidden' && <p className="alert-error" role="alert">Gated: please log in again.</p>}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {mod.state === 'live' && rows.length === 0 && (
          <Empty title="No cycles yet." hint="Cycles appear after your first buy & lock." />
        )}
        {rows.map((c, i) => (
          <CycleCard key={c.id || i} c={c} i={i} />
        ))}
        <p className="text-sm">
          <Link href="/dashboard/tokens" className="text-gold underline">Buy &amp; lock →</Link>{' '}
          <Link href="/risk" className="ml-2 text-gold underline">Risk disclosure</Link>
        </p>
      </div>
      <RiskStrip compact />
    </div>
  );
}

export default function CyclesPage() {
  return (
    <RequireAuth>
      <CyclesInner />
    </RequireAuth>
  );
}
