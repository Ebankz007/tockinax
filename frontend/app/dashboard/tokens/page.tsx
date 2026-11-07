'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import RiskStrip from '@/components/RiskStrip';
import ModuleEmpty from '@/components/ModuleEmpty';
import Countdown from '@/components/Countdown';
import { api, errMsg, fetchModule, listOf, num, ApiError, type Holding, type ModuleState } from '@/lib/api';

const TARGETS: Record<number, number> = { 7: 107, 14: 114 };

function Portfolio({ reloadKey }: { reloadKey: number }) {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  useEffect(() => {
    setMod({ state: 'loading' });
    fetchModule<unknown>('/tokens/holdings').then(setMod);
  }, [reloadKey]);

  if (mod.state === 'loading') return <p role="status">Loading holdings…</p>;
  if (mod.state === 'deploying')
    return <ModuleEmpty title="Holdings module deploying." hint="Your portfolio will appear here once the tokens backend deploys." />;
  if (mod.state === 'forbidden') return <p className="alert-error" role="alert">Gated: please log in again.</p>;
  if (mod.state === 'error') return <p className="alert-error" role="alert">{mod.message}</p>;
  const rows = listOf<Holding>(mod.data);
  if (rows.length === 0) return <Empty title="No holdings yet." hint="Use the buy & lock form to open your first pilot position." />;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Token</th>
            <th scope="col">Qty</th>
            <th scope="col">Cost</th>
            <th scope="col">Lock</th>
            <th scope="col">Matures in</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => (
            <tr key={h.id || i}>
              <td className="text-white">{h.token_code || 'Pilot token'}</td>
              <td>{String(h.qty ?? h.quantity ?? '—')}</td>
              <td>{String(h.cost ?? h.cost_basis ?? '—')}</td>
              <td>{h.cycle_days ? `${h.cycle_days}-day` : h.lock || '—'}</td>
              <td><Countdown at={h.matures_at} /></td>
              <td>{h.lock_status || h.lock || h.status || 'locked'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsuranceCard({ active, onChanged }: { active: boolean | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function activate() {
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/insurance/activate', { insurance_type: 'standard' });
      onChanged();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-2">
      <h2 className="font-display font-semibold text-white">Account insurance</h2>
      {active === null ? (
        <p role="status" className="text-mist">Checking insurance status…</p>
      ) : active ? (
        <p className="alert-ok" role="status">Insurance is active on your account. Token purchases can be submitted for admin review.</p>
      ) : (
        <>
          <p className="alert-warn" role="note">
            Insurance is not active on your account. Activate it before you can purchase tokens.
          </p>
          {error && <p className="alert-error" role="alert">{error}</p>}
          <button className="btn-primary" onClick={activate} disabled={busy}>
            {busy ? 'Activating…' : 'Activate insurance'}
          </button>
        </>
      )}
    </div>
  );
}

function BuyLock({ onDone, insuranceActive }: { onDone: () => void; insuranceActive: boolean | null }) {
  const [amount, setAmount] = useState('100');
  const [cycle, setCycle] = useState<7 | 14>(7);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  const [deploying, setDeploying] = useState(false);

  const target = useMemo(() => {
    const a = num(amount);
    if (!a) return 0;
    // Simple-math preview scaled from the 100-unit example rate.
    const rate = TARGETS[cycle] / 100;
    return Math.round(a * rate * 100) / 100;
  }, [amount, cycle]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk('');
    setError('');
    setDeploying(false);
    try {
      await api.post('/tokens/purchase', { amount: num(amount), cycle_days: cycle, agreed_risk: agreed });
      setOk(`Submitted ${amount} for ${cycle} days. The system admin will review and activate your purchase shortly.`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status >= 500)) {
        setDeploying(true);
      } else {
        setError(errMsg(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card-raised space-y-3" onSubmit={submit} aria-label="Buy and lock form">
      <h2 className="font-display font-semibold text-white">
        Buy &amp; lock
      </h2>
      {ok && <p className="alert-ok" role="status">{ok}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {deploying && (
        <ModuleEmpty title="Purchase module deploying." hint="Your order was not placed — the tokens backend is not reachable yet. Nothing moved." />
      )}
      <div>
        <label className="label" htmlFor="buy-amount">Amount (pilot units)</label>
        <input id="buy-amount" className="input" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} min="1" />
      </div>
      <fieldset>
        <legend className="label">Lock cycle</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Lock cycle">
          {[7, 14].map((d) => (
            <label key={d} className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${cycle === d ? 'border-gold bg-brand-500/10 text-white' : 'border-line/20 text-mist'}`}>
              <input type="radio" name="cycle" className="sr-only" checked={cycle === d} onChange={() => setCycle(d as 7 | 14)} />
              {d}-day → TARGET {TARGETS[d]}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="alert-warn" role="note">
        Target preview: <strong>{target || '—'}</strong> — Target prices are not guaranteed — sale requires a willing buyer; unsold stays unsold.
      </p>
      <div className="flex items-start gap-2 text-sm">
        <input id="buy-risk" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 accent-[#F0B90B]" required />
        <label htmlFor="buy-risk" className="text-mist">
          I understand this is not live yet, and I have read the <Link href="/risk" className="text-gold underline">risk disclosure</Link>.
        </label>
      </div>
      {insuranceActive === false && (
        <p className="alert-warn" role="note">Activate account insurance above to enable token purchases.</p>
      )}
      <button className="btn-primary w-full" disabled={busy || !agreed || insuranceActive !== true}>
        {busy ? 'Submitting…' : `Submit ${amount || '0'} for ${cycle} days`}
      </button>
      <p className="hint">Purchases are reviewed and activated manually by the system admin.</p>
    </form>
  );
}

function TokensInner() {
  const [reloadKey, setReloadKey] = useState(0);
  const [insuranceActive, setInsuranceActive] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<{ insurance_active: boolean }>('/auth/insurance/status')
      .then((d) => { if (alive) setInsuranceActive(!!d.insurance_active); })
      .catch(() => { if (alive) setInsuranceActive(false); });
    return () => { alive = false; };
  }, [reloadKey]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-white">
        Tokens &amp; portfolio
      </h1>
      <InsuranceCard active={insuranceActive} onChanged={() => setReloadKey((k) => k + 1)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="font-display font-semibold text-white">Holdings</h2>
          <Portfolio reloadKey={reloadKey} />
        </div>
        <BuyLock insuranceActive={insuranceActive} onDone={() => setReloadKey((k) => k + 1)} />
      </div>
      <p className="text-sm">
        <Link href="/dashboard/token-market" className="text-gold underline">Go to token market →</Link>{' '}
        <Link href="/risk" className="ml-2 text-gold underline">Risk disclosure</Link>
      </p>
      <RiskStrip compact />
    </div>
  );
}

export default function TokensPage() {
  return (
    <RequireAuth>
      <TokensInner />
    </RequireAuth>
  );
}
