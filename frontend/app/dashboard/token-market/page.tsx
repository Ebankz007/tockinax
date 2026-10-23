'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { api, errMsg, fetchModule, listOf, num, ApiError, type ModuleState, type TokenListing } from '@/lib/api';

function PartialBuy({ listingId, max, onDone }: { listingId: string; max: number; onDone: () => void }) {
  const [qty, setQty] = useState('1');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  const [deploying, setDeploying] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk('');
    setError('');
    setDeploying(false);
    const q = num(qty);
    if (!q || q <= 0 || (max > 0 && q > max)) {
      setError(max > 0 ? `Quantity must be between 1 and ${max}.` : 'Enter a quantity of at least 1.');
      setBusy(false);
      return;
    }
    try {
      await api.post(`/tokenmarket/listings/${listingId}/buy`, { qty: q, agreed_risk: agreed });
      setOk(`Bought ${q} unit(s) from listing ${listingId} (simulated).`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status >= 500)) setDeploying(true);
      else setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2" aria-label={`Partial buy for ${listingId}`}>
      <label className="sr-only" htmlFor={`qty-${listingId}`}>Quantity</label>
      <input id={`qty-${listingId}`} className="input max-w-[110px]" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
      <label className="flex items-center gap-1 text-xs text-mist" title="SIMULATED pilot — no real funds. Target prices are not guaranteed.">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-4 w-4 accent-[#F0B90B]" required />
        Accept risk
      </label>
      <button className="btn-primary px-3 py-1.5 text-sm" disabled={busy || !agreed}>
        {busy ? 'Buying…' : 'Buy qty'}
      </button>
      {ok && <span className="alert-ok w-full" role="status">{ok}</span>}
      {error && <span className="alert-error w-full" role="alert">{error}</span>}
      {deploying && <span className="w-full"><ModuleEmpty title="Market buy module deploying." showRiskLink={false} /></span>}
    </form>
  );
}

function MarketInner() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setMod({ state: 'loading' });
    fetchModule<unknown>('/tokenmarket/listings').then(setMod);
  }, [reloadKey]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Token marketplace <SimBadge />
      </h1>
      <div className="card space-y-3">
        {mod.state === 'loading' && <p role="status">Loading listings…</p>}
        {mod.state === 'deploying' && (
          <ModuleEmpty title="Token market module deploying." hint="Listing and partial-buy actions will activate here once the backend deploys. SIMULATED pilot — no real funds." />
        )}
        {mod.state === 'forbidden' && <p className="alert-error" role="alert">Gated: please log in again.</p>}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {mod.state === 'live' && (() => {
          const rows = listOf<TokenListing>(mod.data);
          if (rows.length === 0) return <p className="alert-info" role="status">No open listings. Matured positions auto-list here.</p>;
          return (
            <div className="space-y-4">
              {rows.map((l) => {
                const total = num(l.qty_total ?? l.quantity) || 0;
                const left = num(l.qty_remaining ?? l.remaining);
                const pct = total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
                return (
                  <article key={l.id} className="rounded-lg border border-line/10 bg-coal p-3" aria-label={`Listing ${l.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-white">{l.token_code || 'Pilot token'} · <span className="text-gold">{String(l.price)}</span></p>
                      <span className="badge-info">{l.status || 'open'}</span>
                    </div>
                    <div className="bar mt-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Remaining">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-mist">{left} of {total} remaining</p>
                    <div className="mt-2">
                      <PartialBuy listingId={l.id} max={left || 0} onDone={() => setReloadKey((k) => k + 1)} />
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })()}
      </div>
      <p className="text-sm text-mist">
        Target prices are not guaranteed — sale requires a willing buyer; unsold stays unsold.{' '}
        <Link href="/risk" className="text-gold underline">Risk disclosure</Link>
      </p>
      <RiskStrip compact />
    </div>
  );
}

export default function MemberTokenMarketPage() {
  return (
    <RequireAuth>
      <MarketInner />
    </RequireAuth>
  );
}
