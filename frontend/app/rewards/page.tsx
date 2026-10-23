'use client';
import { useEffect, useState } from 'react';
import { api, errMsg, type Campaign } from '@/lib/api';
import Empty from '@/components/Empty';

export default function RewardsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Campaign[] | { items?: Campaign[] }>('/rewards/campaigns')
      .then((d) => setItems(Array.isArray(d) ? d : d.items || []))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <h1 className="text-2xl font-bold">Activity rewards</h1>
        <p className="alert-info">Activity rewards disabled until budget + funding + approval. Not returns on deposits.</p>
        <p className="text-sm text-slate-600">
          Campaigns reward qualifying community activity (for example listing quality or completed-order
          participation) — never deposits, and never as interest or profit. Every campaign requires a
          published budget cap, an identified funding source, and formal approval before any payout.
        </p>
      </div>
      {loading && <p role="status">Loading campaigns…</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <Empty title="No campaigns published." hint="When campaigns are approved and funded, they will appear here." />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((c) => (
          <article key={c.id} className="card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">{c.name}</h2>
              <span className="badge-disabled">DISABLED</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{c.description || 'Qualifying activity campaign.'}</p>
            <dl className="mt-2 text-xs text-slate-500 space-y-1">
              <div>Status: {c.status}{c.funded ? ' · funded' : ' · unfunded'}</div>
              <div>Budget cap: {c.budget_cap || 'not set — required before approval'}</div>
              <div>Rate: {c.reward_rate_bps ?? '—'} bps (activity rate, not a return)</div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">{c.note || 'Requires budget + funding source + formal approval.'}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
