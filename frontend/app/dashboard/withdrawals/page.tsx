'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { api, errMsg, fetchModule, listOf, num, ApiError, type WithdrawalReq, type ModuleState } from '@/lib/api';

function txOf(w: WithdrawalReq): string {
  return String(w.tx_hash ?? w.txHash ?? '');
}

function WithdrawalsInner() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [amount, setAmount] = useState('20');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMod({ state: 'loading' });
    fetchModule<unknown>('/withdrawals/mine').then(setMod);
  }, [reloadKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk('');
    setError('');
    if (!/^T[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address.trim()) && address.trim().length < 5) {
      setError('Enter a valid TRC20 address (starts with T). Public address only — never private keys.');
      setBusy(false);
      return;
    }
    try {
      await api.post('/withdrawals/request', { amount: num(amount), currency: 'USDT', network: 'TRC20', address: address.trim() });
      setOk('Withdrawal requested (simulated). It will show in history after review.');
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status >= 500)) {
        setError('Withdrawals module deploying — request unavailable. Nothing moved.');
      } else setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = mod.state === 'live' ? listOf<WithdrawalReq>(mod.data) : [];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Withdrawals <SimBadge />
      </h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="card space-y-3" onSubmit={submit} aria-label="Withdrawal request form">
          <h2 className="font-display font-semibold text-white">Request withdrawal (TRC20)</h2>
          {ok && <p className="alert-ok" role="status">{ok}</p>}
          {error && <p className="alert-error" role="alert">{error}</p>}
          <p className="alert-warn" role="note">
            USDT TRC20 only via Pay2Crypto sandbox until approvals. Never share private keys.
          </p>
          <div>
            <label className="label" htmlFor="wd-amount">Amount (USDT)</label>
            <input id="wd-amount" className="input" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="wd-addr">Destination TRC20 address</label>
            <input id="wd-addr" className="input font-mono" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="T…" autoComplete="off" />
            <p className="hint">Public address only. This form has no private-key field — never paste one.</p>
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Submitting…' : 'Request withdrawal'}</button>
        </form>
        <div className="card space-y-2">
          <h2 className="font-display font-semibold text-white">History</h2>
          {mod.state === 'loading' && <p role="status">Loading withdrawals…</p>}
          {mod.state === 'deploying' && <ModuleEmpty title="Withdrawals module deploying." />}
          {mod.state === 'forbidden' && <p className="alert-error" role="alert">Gated: please log in again.</p>}
          {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
          {mod.state === 'live' && rows.length === 0 && <Empty title="No withdrawals yet." />}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th scope="col">Amount</th><th scope="col">Address</th><th scope="col">Tx hash</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {rows.map((w, i) => (
                    <tr key={w.id || i}>
                      <td className="text-white">{String(w.amount ?? '—')} {w.currency || 'USDT'}</td>
                      <td className="break-all font-mono text-xs">{w.address || '—'}</td>
                      <td className="break-all font-mono text-xs">{txOf(w) || '—'}</td>
                      <td>{w.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <p className="text-sm text-mist">
        SIMULATED pilot — no real funds.{' '}
        <Link href="/risk" className="text-gold underline">Risk disclosure</Link>
      </p>
      <RiskStrip compact />
    </div>
  );
}

export default function WithdrawalsPage() {
  return (
    <RequireAuth>
      <WithdrawalsInner />
    </RequireAuth>
  );
}
