'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { api, errMsg, fetchModule, listOf, num, ApiError, type DepositIntent, type ModuleState } from '@/lib/api';

function txOf(d: DepositIntent): string {
  return String(d.tx_hash ?? d.txHash ?? '');
}

function DepositsInner() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [amount, setAmount] = useState('50');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  const [intent, setIntent] = useState<DepositIntent | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setMod({ state: 'loading' });
    fetchModule<unknown>('/deposits/mine').then(setMod);
  }, [reloadKey]);

  async function createIntent(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk('');
    setError('');
    try {
      const d = await api.post<DepositIntent>('/deposits/intents', {
        amount: num(amount),
        currency: 'USDT',
        network: 'TRC20',
      });
      setIntent(d);
      setOk(`Intent created: send ${amount} USDT (TRC20) in the sandbox to complete.`);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status >= 500)) {
        setError('Deposits module deploying — intent unavailable. Nothing moved.');
      } else setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function simulatePay() {
    if (!intent) return;
    setPaying(true);
    setError('');
    try {
      const d = await api.post<DepositIntent>(`/deposits/${intent.id}/simulate-pay`, {});
      setIntent(d);
      setOk(`Sandbox payment simulated. Tx hash: ${txOf(d) || '(pending)'}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status >= 500)) {
        setError('Sandbox pay endpoint deploying — try again after the backend lands.');
      } else setError(errMsg(err));
    } finally {
      setPaying(false);
    }
  }

  const rows = mod.state === 'live' ? listOf<DepositIntent>(mod.data) : [];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Deposits <SimBadge />
      </h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="card space-y-3" onSubmit={createIntent} aria-label="Pay2Crypto intent form">
          <h2 className="font-display font-semibold text-white">New deposit intent (TRC20 only)</h2>
          {ok && <p className="alert-ok" role="status">{ok}</p>}
          {error && <p className="alert-error" role="alert">{error}</p>}
          <p className="alert-warn" role="note">
            USDT TRC20 only via Pay2Crypto sandbox until approvals. Never share private keys.
          </p>
          <div>
            <label className="label" htmlFor="dep-amount">Amount (USDT)</label>
            <input id="dep-amount" className="input" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="dep-net">Network</label>
            <input id="dep-net" className="input" value="TRC20 (only)" disabled aria-label="Network: TRC20 only" />
          </div>
          <div>
            <label className="label" htmlFor="dep-addr">Your TRC20 address (for reference only)</label>
            <input id="dep-addr" className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="T…" autoComplete="off" />
            <p className="hint">Public address only. Never enter private keys or seed phrases anywhere.</p>
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create sandbox intent'}</button>
          {intent && (
            <div className="rounded-lg border border-gold/40 bg-brand-500/5 p-3 text-sm" aria-live="polite">
              <p className="text-white">Intent <strong>{intent.id}</strong> · status: {intent.status || 'pending'}</p>
              <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-sm" disabled={paying} onClick={simulatePay}>
                {paying ? 'Simulating…' : 'Simulate sandbox payment'}
              </button>
            </div>
          )}
        </form>
        <div className="card space-y-2">
          <h2 className="font-display font-semibold text-white">History + tx hashes</h2>
          {mod.state === 'loading' && <p role="status">Loading deposits…</p>}
          {mod.state === 'deploying' && <ModuleEmpty title="Deposits module deploying." />}
          {mod.state === 'forbidden' && <p className="alert-error" role="alert">Gated: please log in again.</p>}
          {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
          {mod.state === 'live' && rows.length === 0 && <Empty title="No deposits yet." />}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th scope="col">Amount</th><th scope="col">Tx hash</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {rows.map((d, i) => (
                    <tr key={d.id || i}>
                      <td className="text-white">{String(d.amount ?? '—')} {d.currency || 'USDT'}</td>
                      <td className="break-all font-mono text-xs">{txOf(d) || '—'}</td>
                      <td>{d.status || '—'}</td>
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

export default function DepositsPage() {
  return (
    <RequireAuth>
      <DepositsInner />
    </RequireAuth>
  );
}
