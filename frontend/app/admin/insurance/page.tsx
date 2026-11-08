'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, ApiError, type InsuranceClaim } from '@/lib/api';

type InsuranceMember = {
  id: string;
  email: string;
  insurance_active: boolean;
  insurance_activated_at?: string | null;
  created_at?: string;
};

function AdminInsurancePage() {
  const [members, setMembers] = useState<InsuranceMember[]>([]);
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [forbidden, setForbidden] = useState(false);

  async function load() {
    setLoading(true); setError(''); setForbidden(false);
    try {
      const [m, c] = await Promise.all([
        api.get<{ items: InsuranceMember[] }>('/admin/insurance-members').catch(() => ({ items: [] as InsuranceMember[] })),
        api.get<{ items: InsuranceClaim[] }>('/admin/insurance/claims').catch(() => ({ items: [] as InsuranceClaim[] })),
      ]);
      setMembers(m.items);
      setClaims(c.items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setForbidden(true);
        return;
      }
      setError(errMsg(e));
    } finally { setLoading(false); }
  }

  async function reviewClaim(id: string, decision: 'approve' | 'reject') {
    setError(''); setMsg('');
    try {
      await api.post(`/admin/insurance/claims/${id}/review`, { decision });
      setMsg(`Claim ${decision}d.`);
      await load();
    } catch (e) { setError(errMsg(e)); }
  }

  useEffect(() => { void load(); }, []);

  if (loading) return <p role="status">Loading insurance admin…</p>;
  if (forbidden) return (
    <div className="card space-y-2"><h1 className="font-display text-2xl font-bold text-white">Insurance admin</h1><p className="alert-error" role="alert">Gated: super_admin role required.</p></div>
  );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">Insurance admin</h1>
      <p className="text-sm text-mist">
        Insurance is account-level. It is activated once per member account and is never attached
        to a token, holding, or lock term. Claims are reviewed here and paid only after approval.
      </p>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-white">Accounts with insurance</h2>
        {members.length === 0 ? <div className="mt-2"><Empty title="No insured accounts." /></div> : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="text-xs text-mist uppercase">Member</th>
                <th scope="col" className="text-xs text-mist uppercase">Scope</th>
                <th scope="col" className="text-xs text-mist uppercase">Status</th>
                <th scope="col" className="text-xs text-mist uppercase">Activated</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-edge/40 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-mist tnum">{m.email || m.id}</td>
                  <td className="px-4 py-3 text-sm text-bright">Account</td>
                  <td className="px-4 py-3"><span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">active</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-mist tnum">{m.insurance_activated_at ? new Date(m.insurance_activated_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-white">Claims review</h2>
        {claims.length === 0 ? <div className="mt-2"><Empty title="No claims." /></div> : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="text-xs text-mist uppercase">User</th>
                <th scope="col" className="text-xs text-mist uppercase">Scope</th>
                <th scope="col" className="text-xs text-mist uppercase">Amount</th>
                <th scope="col" className="text-xs text-mist uppercase">Reason</th>
                <th scope="col" className="text-xs text-mist uppercase">Status</th>
                <th scope="col" className="text-xs text-mist uppercase">Filed</th>
                <th scope="col" className="text-xs text-mist uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-b border-edge/40 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-mist tnum">{c.user_email || c.user_id}</td>
                  <td className="px-4 py-3 text-sm text-bright">{c.policy_id ? 'Legacy policy' : 'Account'}</td>

                  <td className="px-4 py-3 font-mono text-xs text-bright tnum">{String(c.amount)} USDT</td>
                  <td className="px-4 py-3 font-mono text-xs text-mist">{c.reason.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${c.status === 'approved' ? 'border-success/40 bg-success/10 text-success' : c.status === 'rejected' ? 'border-text/20 bg-text/5 text-mist' : 'border-gold/40 bg-gold/10 text-gold'}`}>{c.status}</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-mist tnum">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    {c.status === 'pending' && (
                      <div className="flex gap-1">
                        <button className="btn-primary px-3 py-1 text-xs" onClick={() => void reviewClaim(c.id, 'approve')}>Approve</button>
                        <button className="btn-danger px-3 py-1 text-xs" onClick={() => void reviewClaim(c.id, 'reject')}>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-sm">
        <Link href="/admin" className="text-gold underline">← Admin overview</Link>
      </p>
    </div>
  );
}

export default function AdminInsurancePageWrapper() {
  return (
    <RequireAuth>
      <AdminInsurancePage />
    </RequireAuth>
  );
}
