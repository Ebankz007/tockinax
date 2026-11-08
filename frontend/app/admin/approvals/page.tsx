'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, ApiError } from '@/lib/api';

type PendingPurchase = {
  id: string;
  user_id: string;
  user_email?: string;
  token_code: string;
  qty: string;
  cost_usdt: string;
  lock_days: number;
  settlement_option?: 'marketplace' | 'company_reserve';
  status: string;
  purchased_at: string;
  matures_at: string;
  insurance_active?: boolean;
};

type PendingSettlement = PendingPurchase & {
  rate_bps_per_day?: number;
};

type InsuranceMember = {
  id: string;
  email: string;
  insurance_activated_at: string | null;
};

/** Company-funded payout: cost + profit, less 10% of the projected profit. */
function settlementPreview(cost: string, days: number, bps: number | undefined) {
  const c = Number(cost);
  const d = Number(days);
  const r = Number(bps || 0);
  if (!Number.isFinite(c) || !Number.isFinite(d)) return null;
  const total = c * (1 + (r * d) / 10000);
  const fee = (total - c) * 0.1;
  return { total, fee, net: total - fee };
}

function AdminApprovalsInner() {
  const [items, setItems] = useState<PendingPurchase[]>([]);
  const [settlements, setSettlements] = useState<PendingSettlement[]>([]);
  const [members, setMembers] = useState<InsuranceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    setForbidden(false);
    try {
      const [p, s, m] = await Promise.all([
        api.get<{ items: PendingPurchase[] }>('/admin/token-purchases?status=pending_approval'),
        api.get<{ items: PendingSettlement[] }>('/admin/token-settlements?status=settlement_pending').catch(() => ({ items: [] as PendingSettlement[] })),
        api.get<{ items: InsuranceMember[] }>('/admin/insurance-members').catch(() => ({ items: [] as InsuranceMember[] })),
      ]);
      setItems(p.items || []);
      setSettlements(s.items || []);
      setMembers(m.items || []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setForbidden(true);
        return;
      }
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setError('');
    setMsg('');
    try {
      await api.post(`/admin/token-purchases/${id}/${approve ? 'approve' : 'reject'}`, approve ? {} : { reason: 'rejected_by_admin' });
      setMsg(`Purchase ${approve ? 'approved and activated' : 'rejected'}.`);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function approveSettlement(id: string) {
    setBusy(id);
    setError('');
    setMsg('');
    try {
      await api.post(`/admin/token-settlements/${id}/approve`, {});
      setMsg('Company-funded settlement approved and paid from the company reserve.');
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => { void load(); }, []);

  if (loading) return <p role="status">Loading approvals…</p>;
  if (forbidden) {
    return (
      <div className="card space-y-2">
        <h1 className="font-display text-2xl font-bold text-white">Purchase approvals</h1>
        <p className="alert-error" role="alert">Gated: super_admin role required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">Purchase approvals</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-white">Pending token purchases</h2>
        {items.length === 0 ? (
          <div className="mt-2"><Empty title="No pending purchases." hint="New token purchases appear here for manual review." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Token</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Cost (USDT)</th>
                  <th scope="col">Lock</th>
                  <th scope="col">Settlement</th>
                  <th scope="col">Insurance</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="text-white">{p.user_email || p.user_id}</td>
                    <td>{p.token_code}</td>
                    <td>{p.qty}</td>
                    <td>{p.cost_usdt}</td>
                    <td>{p.lock_days}-day</td>
                    <td>{p.settlement_option === 'company_reserve' ? 'Company reserve' : 'Marketplace'}</td>
                    <td>{p.insurance_active ? 'Active' : 'Not active'}</td>
                    <td>{new Date(p.purchased_at).toLocaleString()}</td>
                    <td className="flex gap-2">
                      <button className="btn-primary text-sm" disabled={busy === p.id || !p.insurance_active} onClick={() => decide(p.id, true)}>
                        {busy === p.id ? 'Working…' : 'Approve'}
                      </button>
                      <button className="btn-danger text-sm" disabled={busy === p.id} onClick={() => decide(p.id, false)}>
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-white">Company-funded settlements due</h2>
        {settlements.length === 0 ? (
          <div className="mt-2"><Empty title="No settlements due." hint="Company-funded positions appear here at maturity for manual payout." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Cost (USDT)</th>
                  <th scope="col">Lock</th>
                  <th scope="col">Payout (net)</th>
                  <th scope="col">Matured</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="text-white">{s.user_email || s.user_id}</td>
                    <td>{s.cost_usdt}</td>
                    <td>{s.lock_days}-day</td>
                    <td className="text-gold">
                      {(() => {
                        const p = settlementPreview(s.cost_usdt, s.lock_days, s.rate_bps_per_day);
                        return p ? `${p.net.toFixed(2)} (10% fee ${p.fee.toFixed(2)})` : '—';
                      })()}
                    </td>
                    <td>{new Date(s.matures_at).toLocaleString()}</td>
                    <td>
                      <button className="btn-primary text-sm" disabled={busy === s.id} onClick={() => approveSettlement(s.id)}>
                        {busy === s.id ? 'Working…' : 'Approve & pay'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-white">Accounts with insurance</h2>
        {members.length === 0 ? (
          <div className="mt-2"><Empty title="No insured accounts yet." /></div>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {members.map((m) => (
              <li key={m.id} className="border-b border-line/10 py-1">
                <span className="text-white">{m.email}</span>
                {m.insurance_activated_at ? ` — activated ${new Date(m.insurance_activated_at).toLocaleDateString()}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm">
        <Link href="/admin" className="text-gold underline">← Back to admin</Link>
      </p>
    </div>
  );
}

export default function AdminApprovalsPage() {
  return (
    <RequireAuth>
      <AdminApprovalsInner />
    </RequireAuth>
  );
}
