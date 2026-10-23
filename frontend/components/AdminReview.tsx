'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { api, errMsg, fetchModule, listOf, ApiError, type DepositIntent, type ModuleState } from '@/lib/api';

function ReviewInner({ kind }: { kind: 'deposits' | 'withdrawals' }) {
  const path = kind === 'deposits' ? '/deposits/admin/queue' : '/withdrawals/admin/queue';
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchModule<unknown>(path).then(setMod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  async function decide(id: string, action: string) {
    setBusy(id + action);
    setMsg('');
    setError('');
    try {
      await api.post(`/${kind}/admin/${id}/decision`, { action });
      setMsg(`${kind} ${id}: ${action} recorded (simulated).`);
      setMod(await fetchModule<unknown>(path));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status >= 500)) {
        setError('Review backend deploying — buttons inactive until the module lands.');
      } else setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const rows = mod.state === 'live' ? listOf<DepositIntent & { address?: string }>(mod.data) : [];
  const liveOff = mod.state === 'deploying' || mod.state === 'error';

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        {kind === 'deposits' ? 'Deposits review' : 'Withdrawals review'} <SimBadge />
      </h1>
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      <div className="card space-y-3">
        <p className="alert-warn" role="note">
          USDT TRC20 only via Pay2Crypto sandbox until approvals. Never share private keys. SIMULATED pilot — no real funds.
        </p>
        {mod.state === 'loading' && <p role="status">Loading queue…</p>}
        {mod.state === 'deploying' && <ModuleEmpty title={`${kind} review module deploying.`} hint="Approve / reject / execute buttons stay disabled until the backend lands. SIMULATED pilot — no real funds." showRiskLink={false} />}
        {mod.state === 'forbidden' && <p className="alert-error" role="alert">Gated: super_admin role required.</p>}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {mod.state === 'live' && rows.length === 0 && <Empty title={`No ${kind} awaiting review.`} />}
        {rows.map((r, i) => (
          <div key={r.id || i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/10 bg-coal p-3 text-sm">
            <span className="text-white">
              {String(r.amount ?? '—')} {r.currency || 'USDT'} · {r.status || 'pending'}
              {r.tx_hash || r.txHash ? <span className="ml-2 font-mono text-xs text-mist">{String(r.tx_hash ?? r.txHash)}</span> : null}
            </span>
            <span className="flex flex-wrap gap-2">
              <button className="btn-primary px-3 py-1 text-sm" disabled={busy !== null} onClick={() => decide(String(r.id), 'approve')}>
                {busy === `${r.id}approve` ? '…' : 'Approve'}
              </button>
              <button className="btn-danger px-3 py-1 text-sm" disabled={busy !== null} onClick={() => decide(String(r.id), 'reject')}>
                Reject
              </button>
              <button className="btn-secondary px-3 py-1 text-sm" disabled={busy !== null} onClick={() => decide(String(r.id), 'execute')}>
                Execute
              </button>
            </span>
          </div>
        ))}
        {liveOff && (
          <div className="flex flex-wrap gap-2" aria-label="Disabled review actions">
            <button className="btn-primary px-3 py-1 text-sm" disabled>Approve</button>
            <button className="btn-danger px-3 py-1 text-sm" disabled>Reject</button>
            <button className="btn-secondary px-3 py-1 text-sm" disabled>Execute</button>
          </div>
        )}
      </div>
      <p className="text-sm">
        <Link href="/admin" className="text-gold underline">← Admin overview</Link>
      </p>
    </div>
  );
}

export function DepositsReviewPage() {
  return (
    <RequireAuth>
      <ReviewInner kind="deposits" />
    </RequireAuth>
  );
}

export function WithdrawalsReviewPage() {
  return (
    <RequireAuth>
      <ReviewInner kind="withdrawals" />
    </RequireAuth>
  );
}
