'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import RiskStrip from '@/components/RiskStrip';
import ModuleEmpty from '@/components/ModuleEmpty';
import { api, errMsg, fetchModule, listOf, type PaymentConfirmation, type ModuleState, ApiError } from '@/lib/api';

function PaymentsInner() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  const [myRole, setMyRole] = useState<'buyer' | 'seller' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    order_id: '',
    amount: '',
    currency: 'USDT',
    network: 'TRC20',
    proof_tx_hash: '',
  });
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<PaymentConfirmation[]>('/payments/mine')
      .then((rows) => {
        setMod({ state: 'live', data: rows });
        const me = rows.find((r) => r.my_role);
        if (me) setMyRole(me.my_role);
      })
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 404 || e.status >= 500)) {
          setMod({ state: 'deploying' });
        } else {
          setMod({ state: 'error', message: errMsg(e) });
        }
      });
  }, []);

  const rows = mod.state === 'live' ? listOf<PaymentConfirmation>(mod.data) : [];

  const submitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('submit');
    setOk('');
    setError('');
    try {
      await api.post('/payments/confirm', {
        order_id: form.order_id || undefined,
        amount: form.amount,
        currency: form.currency,
        network: form.network,
        proof_tx_hash: form.proof_tx_hash.trim(),
      });
      setOk('Payment proof submitted. Waiting for seller confirmation.');
      setForm({ order_id: '', amount: '', currency: 'USDT', network: 'TRC20', proof_tx_hash: '' });
      const rows = await api.get<PaymentConfirmation[]>('/payments/mine');
      setMod({ state: 'live', data: rows });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(null);
    }
  };

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await api.post(`/payments/${id}/decision`, { decision });
      setOk(`Payment ${decision}d.`);
      const rows = await api.get<PaymentConfirmation[]>('/payments/mine');
      setMod({ state: 'live', data: rows });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(null);
    }
  };

  const dispute = async (id: string, reason: string) => {
    setBusy(id);
    try {
      await api.post(`/payments/${id}/dispute`, { reason });
      setOk('Dispute opened. Admin will review.');
      const rows = await api.get<PaymentConfirmation[]>('/payments/mine');
      setMod({ state: 'live', data: rows });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(null);
    }
  };

  const statusColor = (s: string): string => {
    switch (s) {
      case 'approved':
        return 'text-green-400';
      case 'paid':
        return 'text-green-400';
      case 'rejected':
        return 'text-red-400';
      case 'disputed':
        return 'text-brand-500';
      case 'proof_submitted':
        return 'text-brand-300';
      default:
        return 'text-mist';
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">Payment confirmations</h1>
      <p className="text-sm text-mist">
        As a buyer, submit proof of payment to the seller's wallet. As a seller, review
        pending payments and approve once you see the funds.
      </p>

      {mod.state === 'loading' && <p role="status">Loading payments…</p>}
      {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}

      <div className="card space-y-4">
        <h2 className="font-display font-semibold text-white">Submit payment proof</h2>
        <p className="text-xs text-mist">
          After paying the seller directly to their saved wallet, paste the transaction
          hash here. The seller must approve before your payment is confirmed.
        </p>
        {ok && <p className="alert-ok" role="status">{ok}</p>}
        {error && <p className="alert-error" role="alert">{error}</p>}
        <form onSubmit={submitProof} className="space-y-3">
          <div>
            <label className="label">Order number (optional)</label>
            <input
              name="order_id"
              className="input"
              value={form.order_id}
              onChange={(e) => setForm({ ...form, order_id: e.target.value })}
              placeholder="Leave blank if standalone"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Amount (USDT)</label>
              <input
                name="amount"
                className="input"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Network</label>
              <select
                name="network"
                className="input"
                value={form.network}
                onChange={(e) =>
                  setForm({ ...form, network: e.target.value as 'TRC20' | 'BEP20' })
                }
              >
                <option value="TRC20">TRC20</option>
                <option value="BEP20">BEP20</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Transaction hash (proof)</label>
            <input
              name="proof_tx_hash"
              className="input font-mono"
              value={form.proof_tx_hash}
              onChange={(e) => setForm({ ...form, proof_tx_hash: e.target.value })}
              required
              placeholder="Paste the on-chain tx hash"
            />
            <p className="hint">
              The seller verifies this on-chain before approving. Fake hashes will be rejected.
            </p>
          </div>
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={busy === 'submit' || !form.amount || !form.proof_tx_hash}
          >
            {busy === 'submit' ? 'Submitting…' : 'Submit proof'}
          </button>
        </form>
      </div>

      <div className="card space-y-4">
        <h2 className="font-display font-semibold text-white">
          {myRole === 'seller' ? 'Payments awaiting your decision' : 'Your payment confirmations'}
        </h2>
        {mod.state === 'live' && rows.length === 0 && (
          <p className="text-mist">
            {myRole === 'seller'
              ? 'No pending payments waiting for your approval.'
              : 'No payment confirmations yet.'}
          </p>
        )}
        {rows.map((p) => (
          <div key={p.id} className="card p-3 border-line/20">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="font-semibold text-sm">{p.amount} {p.currency}</span>
              <span
                className={`inline-block text-[10px] font-bold rounded px-2 py-0.5 uppercase ${statusColor(p.status)}`}
              >
                {p.status.replace(/_/g, ' ')}
              </span>
              <span className="font-mono text-xs text-mist">{p.network}</span>
            </div>
            <p className="text-xs text-mist mb-2">
              Counterparty: {p.counterparty_email || '—'}
              {p.order_no ? <span className="ml-2 font-mono">#{p.order_no}</span> : null}
            </p>
            {p.proof_tx_hash && (
              <div className="text-xs text-mist mb-2">
                Tx: <span className="font-mono break-all">{p.proof_tx_hash}</span>
              </div>
            )}
            {myRole === 'seller' && p.status === 'pending' && (
              <div className="flex gap-2">
                <button
                  onClick={() => decide(p.id, 'approve')}
                  disabled={busy === p.id}
                  className="text-[10px] px-2 py-1 rounded bg-success/10 text-success hover:bg-success/20"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide(p.id, 'reject')}
                  disabled={busy === p.id}
                  className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20"
                >
                  Reject
                </button>
              </div>
            )}
            {p.status === 'pending' && myRole === 'buyer' && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    const reason = window.prompt('Reason for dispute:');
                    if (reason) dispute(p.id, reason);
                  }}
                  className="text-[10px] text-brand-300 hover:underline"
                >
                  Dispute this payment
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <RiskStrip compact />
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <RequireAuth>
      <PaymentsInner />
    </RequireAuth>
  );
}
