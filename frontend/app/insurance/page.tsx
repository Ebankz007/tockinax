'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { api, errMsg, type InsuranceClaim } from '@/lib/api';

type Tab = 'claims' | 'file';

function InsurancePage() {
  const [tab, setTab] = useState<Tab>('claims');
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [accountActive, setAccountActive] = useState<boolean | null>(null);
  const [insBusy, setInsBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [c, s] = await Promise.all([
        api.get<{ items: InsuranceClaim[] }>('/insurance/claims/mine').catch(() => ({ items: [] as InsuranceClaim[] })),
        api.get<{ insurance_active: boolean }>('/auth/insurance/status').catch(() => ({ insurance_active: false })),
      ]);
      setClaims(c.items);
      setAccountActive(!!s.insurance_active);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function activateInsurance() {
    setInsBusy(true); setError(''); setMsg('');
    try {
      await api.post('/auth/insurance/activate', { insurance_type: 'standard' });
      setMsg('Account insurance activated.');
      await load();
    } catch (e) { setError(errMsg(e)); }
    finally { setInsBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMsg('');
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const amount = fd.get('amount') as string;
    const reason = fd.get('reason') as string;
    const ref = fd.get('evidence_ref') as string || undefined;
    try {
      await api.post('/insurance/claim', { amount, reason, evidence_ref: ref });
      setMsg('Claim filed — pending admin review.');
      await load();
      setTab('claims');
    } catch (e) { setError(errMsg(e)); }
  }

  if (loading) {
    return <p role="status">Loading insurance…</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">Insurance</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}

      <section className="card space-y-2">
        <h2 className="font-display font-semibold text-white">Account insurance</h2>
        {accountActive === null ? (
          <p role="status" className="text-mist">Checking insurance status…</p>
        ) : accountActive ? (
          <p className="alert-ok" role="status">Insurance is active on your account. Token purchases can be submitted for admin review.</p>
        ) : (
          <>
            <p className="alert-warn" role="note">
              Insurance is not active on your account. Activate it once here — it covers the
              account and is not tied to any token, holding, or lock term.
            </p>
            <button className="btn-primary" onClick={activateInsurance} disabled={insBusy}>
              {insBusy ? 'Activating…' : 'Activate insurance'}
            </button>
          </>
        )}
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Insurance tabs">
        <button className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${tab === 'claims' ? 'bg-gold text-black' : 'border-edge/70 text-mist hover:border-gold/40'}`} onClick={() => setTab('claims')} aria-pressed={tab === 'claims'}>
          My claims
        </button>
        {accountActive && (
          <button className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${tab === 'file' ? 'bg-gold text-black' : 'border-edge/70 text-mist hover:border-gold/40'}`} onClick={() => setTab('file')} aria-pressed={tab === 'file'}>
            File a claim
          </button>
        )}
      </nav>

      {/* ── My claims ────────────────────────────────────────── */}
      {tab === 'claims' && (
        <section className="card space-y-3">
          <h2 className="font-display font-semibold text-white">Claims history</h2>
          {claims.length === 0 ? (
            <p className="text-mist text-sm">No claims filed yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" className="text-xs text-mist uppercase">Amount</th>
                  <th scope="col" className="text-xs text-mist uppercase">Reason</th>
                  <th scope="col" className="text-xs text-mist uppercase">Status</th>
                  <th scope="col" className="text-xs text-mist uppercase">Filed</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className="border-b border-edge/40 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-bright tnum">{String(c.amount)} USDT</td>
                    <td className="px-4 py-3 font-mono text-xs text-mist">{c.reason.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${c.status === 'approved' ? 'border-success/40 bg-success/10 text-success' : c.status === 'rejected' ? 'border-text/20 bg-text/5 text-mist' : 'border-gold/40 bg-gold/10 text-gold'}`}>{c.status}</span></td>
                    <td className="px-4 py-3 font-mono text-xs text-mist tnum">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ── File a claim ─────────────────────────────────────── */}
      {tab === 'file' && (
        <section className="card space-y-3">
          <h2 className="font-display font-semibold text-white">File a claim</h2>
          <p className="text-xs text-mist">
            Claims are filed against your account insurance — no policy or token selection is
            needed. Enter the claim amount and reason; an admin reviews and pays only after approval.
          </p>
          <form onSubmit={claim} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-mist mb-1">Amount (USDT)</label>
                <input name="amount" type="number" step="0.0001" min="0" className="input w-full" required />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-mist mb-1">Reason</label>
                <select name="reason" className="input w-full" required>
                  <option value="unsold_at_maturity">Unsold at maturity</option>
                  <option value="partial_fill_loss">Partial fill loss</option>
                  <option value="platform_fault">Platform fault</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-mist mb-1">Evidence reference (optional)</label>
                <input name="evidence_ref" placeholder="Storage key or ticket ref" className="input w-full" />
              </div>
            </div>
            <button className="btn-primary" type="submit">File claim</button>
          </form>
        </section>
      )}

      <p className="text-xs text-mist">
        Insurance is an account-level platform protection product. Coverage limits and claim
        outcomes are set by the platform and are not guaranteed. Read the{' '}
        <Link href="/risk" className="text-gold underline">risk disclosure</Link>.
      </p>
    </div>
  );
}

export default function InsurancePageWrapper() {
  return (
    <RequireAuth>
      <InsurancePage />
    </RequireAuth>
  );
}
