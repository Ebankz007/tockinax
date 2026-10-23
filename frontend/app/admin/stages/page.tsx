'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { api, errMsg, fetchModule, listOf, ApiError, type ModuleState } from '@/lib/api';

type StageCfg = {
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

const limit = (s: StageCfg) => {
  const lo = s.min_buy ?? s.min;
  const hi = s.max_buy ?? s.max;
  if (lo == null && hi == null) return '—';
  return `${lo ?? '—'} – ${hi ?? '—'}`;
};
const fee = (v: string | number | null | undefined) => (v == null ? '—' : String(v));

function StagesInner() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  const [drafts, setDrafts] = useState<Record<number, { fee: string; limit: string }>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchModule<unknown>('/tokens/stages/config').then(setMod);
  }, []);

  const live = mod.state === 'live' ? listOf<StageCfg>(mod.data) : [];
  const rows: StageCfg[] = live.length > 0 ? live : [1, 2, 3, 4, 5].map((n) => ({ n, name: `Stage ${n}` }));

  const editable = mod.state === 'live';

  async function save(n: number) {
    setBusy(n);
    setMsg('');
    setError('');
    try {
      await api.put('/tokens/stages/config', { stage: n, ...drafts[n] });
      setMsg(`Stage ${n} saved (simulated).`);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status >= 500)) {
        setError('Stages config is read-only — the API does not allow edits. Showing published values.');
      } else setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Stages config <SimBadge />
      </h1>
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      <div className="card space-y-3">
        <p className="alert-info" role="note">
          Approved compensation plan values. Stage config is read-only; edits stay locked.
        </p>
        {mod.state === 'loading' && <p role="status">Loading stages config…</p>}
        {mod.state === 'deploying' && <ModuleEmpty title="Stages config deploying." hint="Editing unlocks only if the API allows it." showRiskLink={false} />}
        {mod.state === 'forbidden' && <p className="alert-error" role="alert">Gated: super_admin role required.</p>}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        <table className="table">
          <thead><tr><th scope="col">Stage</th><th scope="col">Buy limits</th><th scope="col">Upgrade fee</th><th scope="col">Renewal fee</th><th scope="col">Edit</th></tr></thead>
          <tbody>
            {rows.map((s, i) => {
              const n = s.stage ?? s.n ?? i + 1;
              const d = drafts[n] || { fee: '', limit: '' };
              return (
                <tr key={n}>
                  <td className="text-white font-semibold">{s.name || `Stage ${n}`}</td>
                  <td>{limit(s)}</td>
                  <td className="text-gold">{fee(s.upgrade_fee ?? s.fee)}</td>
                  <td className="text-gold">{fee(s.renewal_fee)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <label className="sr-only" htmlFor={`fee-${n}`}>Fee for stage {n}</label>
                      <input id={`fee-${n}`} className="input max-w-[110px]" placeholder="Fee" disabled={!editable || busy !== null} value={d.fee}
                        onChange={(e) => setDrafts({ ...drafts, [n]: { ...d, fee: e.target.value } })} />
                      <button className="btn-secondary px-2 py-1 text-sm" disabled={!editable || busy !== null} onClick={() => save(n)}>
                        {busy === n ? '…' : 'Save'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        <Link href="/admin" className="text-gold underline">← Admin overview</Link>
      </p>
    </div>
  );
}

export default function AdminStagesPage() {
  return (
    <RequireAuth>
      <StagesInner />
    </RequireAuth>
  );
}
