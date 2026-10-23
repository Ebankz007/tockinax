'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RiskStrip from '@/components/RiskStrip';
import { LiveChip, SimBadge } from '@/components/Badges';
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

// Approved compensation plan — fallback only, while the stages API is unavailable.
const APPROVED: StageDef[] = [
  { n: 1, name: 'Entry', min: 50, max: 500, upgrade_fee: 100, renewal_fee: 25 },
  { n: 2, name: 'Growth', min: 500, max: 2500, upgrade_fee: 250, renewal_fee: 50 },
  { n: 3, name: 'Advancement', min: 2500, max: 10000, upgrade_fee: 600, renewal_fee: 120 },
  { n: 4, name: 'Premium', min: 10000, max: 25000, upgrade_fee: 1500, renewal_fee: 300 },
  { n: 5, name: 'Elite', min: 25000, max: 100000, upgrade_fee: 0, renewal_fee: 600 },
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
          Membership stages <SimBadge />
        </h1>
        <p className="text-sm text-mist">
          Five stages gate lock limits, generation depth and marketplace access. Values below are the
          approved compensation plan (USDT). An <strong className="text-white">upgrade fee</strong> is the
          fee to leave your current stage; a <strong className="text-white">renewal fee</strong> is charged
          at your current stage.
        </p>
        <LiveChip live={mod.state === 'live' ? true : mod.state === 'loading' ? null : false} what="Stages API" />
        {mod.state === 'loading' && <p role="status">Loading stages…</p>}
        {mod.state === 'deploying' && <ModuleEmpty title="Stages module deploying." />}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {mod.state !== 'loading' && (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Buy limits</th>
                <th scope="col">Upgrade fee</th>
                <th scope="col">Renewal fee</th>
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
                    <td className="text-gold">{fee(s.upgrade_fee ?? s.fee)}</td>
                    <td className="text-gold">{fee(s.renewal_fee)}</td>
                    <td className="text-mist">{n >= 5 ? 'Top stage — cannot upgrade further.' : `Fee to leave stage ${n}.`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-sm text-mist">
          Nothing charges until a fee is disclosed and you confirm. Upgrades and renewals create a pending
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
