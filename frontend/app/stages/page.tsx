'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RiskStrip from '@/components/RiskStrip';
import ModuleEmpty from '@/components/ModuleEmpty';
import { fetchModule, listOf, type ModuleState } from '@/lib/api';

type StageDef = {
  stage?: number;
  n?: number;
  name?: string;
  min_buy?: string | number | null;
  max_buy?: string | number | null;
  min?: string | number | null;
  max?: string | number | null;
  upgrade_fee?: string | number | null;
  renewal_fee?: string | number | null;
  fee?: string | number | null;
};

// Approved plan — fallback only, while the stages API is unavailable.
const APPROVED: StageDef[] = [
  { n: 1, name: 'Entry', min: 50, max: 500, upgrade_fee: 20 },
  { n: 2, name: 'Growth', min: 500.01, max: 2000, upgrade_fee: 25 },
  { n: 3, name: 'Advanced', min: 2000.01, max: 5000, upgrade_fee: 50 },
  { n: 4, name: 'Premium', min: 5000.01, max: 50000, upgrade_fee: 100 },
  { n: 5, name: 'Elite', min: 50000.01, max: 100000, upgrade_fee: 250 },
];

const limit = (s: StageDef) => {
  const lo = s.min_buy ?? s.min;
  const hi = s.max_buy ?? s.max;
  if (lo == null && hi == null) return '—';
  return `${lo ?? '—'} – ${hi ?? '—'} USDT`;
};
const fee = (v: string | number | null | undefined) => (v == null ? '—' : String(v));

export default function StagesPage() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  useEffect(() => {
    fetchModule<unknown>('/tokens/stages').then(setMod);
  }, []);

  const live = mod.state === 'live' ? listOf<StageDef>(mod.data) : [];
  const rows = live.length > 0 ? live : APPROVED;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h1 className="font-display text-2xl font-bold text-white">
          Membership stages
        </h1>
        <p className="text-sm text-mist">
          Five stages gate the eligible locking range. Each stage fee is paid once when entering
          that stage: Stage 1 is the $20 registration, then $25, $50, $100 and $250. Upgrade fees
          are separate from the amount locked.
        </p>
        {mod.state === 'loading' && <p role="status">Loading stages…</p>}
        {mod.state === 'deploying' && <ModuleEmpty title="Stages module deploying." />}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {mod.state !== 'loading' && (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Eligible locking range</th>
                <th scope="col">Fee</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const n = s.stage ?? s.n ?? i + 1;
                return (
                  <tr key={n}>
                    <td className="text-white font-semibold">{s.name || `Stage ${n}`}</td>
                    <td>{limit(s)}</td>
                    <td className="text-gold">
                      {n === 1 ? `$${fee(s.upgrade_fee ?? s.fee)} registration` : `$${fee(s.upgrade_fee ?? s.fee)} upgrade`}
                    </td>
                    <td className="text-mist">
                      {n === 1
                        ? 'Initial registration fee.'
                        : n >= 5
                          ? 'Top stage — cannot upgrade further.'
                          : `Paid once when entering stage ${n}.`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-sm text-mist">
          Nothing charges until a fee is disclosed and you confirm. Upgrades create a pending
          request reviewed before any fee applies.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/dashboard/stage" className="btn-primary">My stage</Link>
          <Link href="/fees" className="btn-secondary">Fees &amp; refunds</Link>
          <Link href="/risk" className="btn-secondary">Risk disclosure</Link>
        </div>
      </div>
      <RiskStrip compact />
    </div>
  );
}
