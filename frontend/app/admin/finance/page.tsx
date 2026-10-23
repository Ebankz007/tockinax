'use client';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, ApiError, type Payout } from '@/lib/api';

function FinanceInner() {
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [queue, setQueue] = useState<Payout[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, q] = await Promise.all([
        api.get<Record<string, unknown>>('/finance/ledger/summary').catch(() => null),
        api.get<Payout[] | { items?: Payout[] }>('/admin/payouts?status=requested').catch(() => ({ items: [] as Payout[] })),
      ]);
      setSummary(s);
      setQueue(Array.isArray(q) ? q : q.items || []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setForbidden(true);
      else setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function review(id: string, action: 'approve' | 'reject') {
    setError('');
    setMsg('');
    try {
      await api.post(`/admin/payouts/${id}/review`, { action });
      setMsg(`Payout ${action}d.`);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function recon() {
    setError('');
    setMsg('');
    try {
      const r = await api.post<{ mismatches?: number }>('/finance/reconciliation/run', {});
      setMsg(`Reconciliation complete. Mismatches: ${r.mismatches ?? 'see report'}.`);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  if (loading) return <p role="status">Loading finance…</p>;
  if (forbidden) return <p className="alert-error" role="alert">Gated: super_admin role required.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Finance</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      <section className="card">
        <h2 className="font-semibold">Ledger summary</h2>
        {!summary ? <div className="mt-2"><Empty title="Ledger summary unavailable." /></div> : (
          <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-green-200">{JSON.stringify(summary, null, 2)}</pre>
        )}
        <button className="btn-secondary mt-2" onClick={() => void recon()}>Run reconciliation</button>
      </section>
      <section className="card">
        <h2 className="font-semibold">Payout queue</h2>
        {queue.length === 0 ? <div className="mt-2"><Empty title="Payout queue empty." /></div> : (
          <ul className="mt-2 space-y-2 text-sm">
            {queue.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2">
                <span>{p.kind} · {p.amount} {p.currency} · {p.status}</span>
                <span className="ml-auto flex gap-1">
                  <button className="btn-primary px-2 py-1 text-xs" onClick={() => void review(p.id, 'approve')}>Approve</button>
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void review(p.id, 'reject')}>Reject</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminFinancePage() {
  return (
    <RequireAuth>
      <FinanceInner />
    </RequireAuth>
  );
}
