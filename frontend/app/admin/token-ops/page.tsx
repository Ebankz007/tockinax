'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { api, errMsg, fetchModule, listOf, ApiError, type ModuleState, type TokenDef, type PricingVersion, type TokenListing } from '@/lib/api';

function useModule(path: string) {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  useEffect(() => {
    fetchModule<unknown>(path).then(setMod);
  }, [path]);
  return mod;
}

function TokenOpsInner() {
  const defs = useModule('/tokens/definitions');
  const pricing = useModule('/tokens/pricing-versions');
  const listings = useModule('/tokenmarket/admin/listings');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setMsg('');
    setError('');
    try {
      await api.post(`/tokenmarket/admin/listings/${id}/decision`, { approve });
      setMsg(`Listing ${id} ${approve ? 'approved' : 'rejected'} (simulated).`);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status >= 500)) {
        setError('Token-ops backend deploying — decision unavailable.');
      } else setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const liveListings = listings.state === 'live' ? listOf<TokenListing>(listings.data) : [];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Token ops <SimBadge />
      </h1>
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}

      <div className="card space-y-2">
        <h2 className="font-display font-semibold text-white">Definitions (read-only)</h2>
        {defs.state === 'loading' && <p role="status">Loading…</p>}
        {defs.state === 'deploying' && <ModuleEmpty title="Definitions module deploying." showRiskLink={false} />}
        {defs.state === 'forbidden' && <p className="alert-error" role="alert">Gated: super_admin role required.</p>}
        {defs.state === 'error' && <p className="alert-error" role="alert">{defs.message}</p>}
        {defs.state === 'live' && (() => {
          const rows = listOf<TokenDef>(defs.data);
          return rows.length === 0 ? <Empty title="No definitions published." /> : (
            <table className="table">
              <thead><tr><th scope="col">Code</th><th scope="col">Cycle</th><th scope="col">Purchase</th><th scope="col">Target</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {rows.map((d, i) => (
                  <tr key={d.id || i}>
                    <td className="text-white">{d.code || d.name || '—'}</td>
                    <td>{d.cycle_days ?? '—'}</td>
                    <td>{d.purchase_price ?? '—'}</td>
                    <td className="text-gold">{d.target_price ?? '—'}</td>
                    <td>{d.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>

      <div className="card space-y-2">
        <h2 className="font-display font-semibold text-white">Pricing versions</h2>
        {pricing.state === 'loading' && <p role="status">Loading…</p>}
        {pricing.state === 'deploying' && <ModuleEmpty title="Pricing module deploying." showRiskLink={false} />}
        {pricing.state === 'forbidden' && <p className="alert-error" role="alert">Gated: super_admin role required.</p>}
        {pricing.state === 'error' && <p className="alert-error" role="alert">{pricing.message}</p>}
        {pricing.state === 'live' && (() => {
          const rows = listOf<PricingVersion>(pricing.data);
          return rows.length === 0 ? <Empty title="No pricing versions." /> : (
            <table className="table">
              <thead><tr><th scope="col">Version</th><th scope="col">Token</th><th scope="col">Purchase</th><th scope="col">Target</th><th scope="col">Effective</th></tr></thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={String(p.id ?? p.version ?? i)}>
                    <td className="text-white">{String(p.version ?? '—')}</td>
                    <td>{p.token_code || '—'}</td>
                    <td>{String(p.purchase_price ?? '—')}</td>
                    <td className="text-gold">{String(p.target_price ?? '—')}</td>
                    <td>{p.effective_from || p.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>

      <div className="card space-y-2">
        <h2 className="font-display font-semibold text-white">Listings oversight</h2>
        {listings.state === 'loading' && <p role="status">Loading…</p>}
        {listings.state === 'deploying' && <ModuleEmpty title="Listings oversight deploying." hint="Approve/reject buttons activate when the backend lands. Until then they stay disabled. SIMULATED pilot — no real funds." showRiskLink={false} />}
        {listings.state === 'forbidden' && <p className="alert-error" role="alert">Gated: super_admin role required.</p>}
        {listings.state === 'error' && <p className="alert-error" role="alert">{listings.message}</p>}
        {listings.state === 'live' && liveListings.length === 0 && <Empty title="No listings to review." />}
        {liveListings.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/10 bg-coal p-3 text-sm">
            <span className="text-white">{l.token_code || 'Pilot token'} · {String(l.price)} · {l.status || 'open'}</span>
            <span className="flex gap-2">
              <button className="btn-primary px-3 py-1 text-sm" disabled={busy !== null} onClick={() => decide(l.id, true)}>
                {busy === l.id ? '…' : 'Approve'}
              </button>
              <button className="btn-danger px-3 py-1 text-sm" disabled={busy !== null} onClick={() => decide(l.id, false)}>
                Reject
              </button>
            </span>
          </div>
        ))}
        {listings.state === 'deploying' && (
          <div className="flex gap-2">
            <button className="btn-primary px-3 py-1 text-sm" disabled>Approve</button>
            <button className="btn-danger px-3 py-1 text-sm" disabled>Reject</button>
          </div>
        )}
      </div>

      <p className="text-sm">
        <Link href="/admin" className="text-gold underline">← Admin overview</Link>
      </p>
    </div>
  );
}

export default function TokenOpsPage() {
  return (
    <RequireAuth>
      <TokenOpsInner />
    </RequireAuth>
  );
}
