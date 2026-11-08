'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import RiskStrip from '@/components/RiskStrip';
import ModuleEmpty from '@/components/ModuleEmpty';
import Countdown from '@/components/Countdown';
import { LOCK_TERMS, targetResale, usdt, type LockTermDays } from '@/lib/plan';
import { api, errMsg, fetchModule, listOf, num, ApiError, type Holding, type ModuleState } from '@/lib/api';

type SettlementOption = 'marketplace' | 'company_reserve';

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
  if (rows.length === 0) return <Empty title="No holdings yet." hint="Use the buy & lock form to open your first position." />;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Token</th>
            <th scope="col">Qty</th>
            <th scope="col">Cost</th>
            <th scope="col">Lock</th>
            <th scope="col">Settlement</th>
            <th scope="col">Matures in</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => (
            <tr key={h.id || i}>
              <td className="text-white">{h.token_code || 'TKX'}</td>
              <td>{String(h.qty ?? h.quantity ?? '—')}</td>
              <td>{String(h.cost_usdt ?? h.cost ?? h.cost_basis ?? '—')}</td>
              <td>{h.lock_days ? `${h.lock_days}-day` : h.cycle_days ? `${h.cycle_days}-day` : '—'}</td>
              <td>{h.settlement_option === 'company_reserve' ? 'Company reserve' : 'Marketplace'}</td>
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
            Insurance is account-level — it is not tied to a token or a lock term.
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
  const [cycle, setCycle] = useState<LockTermDays>(7);
  const [settlement, setSettlement] = useState<SettlementOption>('marketplace');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  const [deploying, setDeploying] = useState(false);

  const term = LOCK_TERMS.find((t) => t.days === cycle) ?? LOCK_TERMS[0];
  const target = useMemo(() => {
    const a = num(amount);
    if (!a) return 0;
    return targetResale(a, cycle);
  }, [amount, cycle]);
  const settlementPreview = useMemo(() => {
    const a = num(amount);
    if (!a || settlement !== 'company_reserve') return null;
    const total = targetResale(a, cycle);
    const profit = Math.round((total - a) * 100) / 100;
    const fee = Math.round(profit * 0.1 * 100) / 100;
    return { total, profit, fee, net: Math.round((total - fee) * 100) / 100 };
  }, [amount, cycle, settlement]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk('');
    setError('');
    setDeploying(false);
    try {
      await api.post('/tokens/purchase', {
        amount: num(amount),
        cycle_days: cycle,
        settlement_option: settlement,
        agreed_risk: agreed,
      });
      setOk(`Submitted ${amount} for ${cycle} days (${settlement === 'company_reserve' ? 'company-funded settlement' : 'marketplace settlement'}). The system admin will review and activate your purchase shortly.`);
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
        <label className="label" htmlFor="buy-amount">Amount (USDT)</label>
        <input id="buy-amount" className="input" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} min="1" />
      </div>
      <fieldset>
        <legend className="label">Lock term</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Lock term">
          {LOCK_TERMS.map((t) => (
            <label key={t.days} className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${cycle === t.days ? 'border-gold bg-brand-500/10 text-white' : 'border-line/20 text-mist'}`}>
              <input type="radio" name="cycle" className="sr-only" checked={cycle === t.days} onChange={() => setCycle(t.days)} />
              {t.days}-day → {usdt(100 * t.target, 2)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Settlement at maturity</legend>
        <div className="space-y-2" role="radiogroup" aria-label="Settlement option">
          <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${settlement === 'marketplace' ? 'border-gold bg-brand-500/10 text-white' : 'border-line/20 text-mist'}`}>
            <input type="radio" name="settlement" className="mt-1 accent-[#F0B90B]" checked={settlement === 'marketplace'} onChange={() => setSettlement('marketplace')} />
            <span>
              <strong className="text-white">Marketplace</strong> — list at the target price at maturity.
              A listing is not a sale; unsold stays unsold.
            </span>
          </label>
          <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${settlement === 'company_reserve' ? 'border-gold bg-brand-500/10 text-white' : 'border-line/20 text-mist'}`}>
            <input type="radio" name="settlement" className="mt-1 accent-[#F0B90B]" checked={settlement === 'company_reserve'} onChange={() => setSettlement('company_reserve')} />
            <span>
              <strong className="text-white">Company-funded</strong> — the company reserve settles you
              at maturity; a 10% charge on the projected profit applies.
            </span>
          </label>
        </div>
      </fieldset>
      <p className="alert-warn" role="note">
        Target preview: <strong>{target ? usdt(target) : '—'} USDT</strong> at {(term.termRate * 100).toFixed(2)}% over {cycle} days
        ({(term.ratePerDay * 100).toFixed(2)}%/day, simple). Targets are not guaranteed.
      </p>
      {settlementPreview && (
        <p className="alert-info" role="note">
          Company-funded preview: projected profit <strong>{usdt(settlementPreview.profit)}</strong>,
          10% charge <strong>{usdt(settlementPreview.fee)}</strong>, net maturity amount{' '}
          <strong>{usdt(settlementPreview.net)}</strong>.
        </p>
      )}
      <div className="flex items-start gap-2 text-sm">
        <input id="buy-risk" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 accent-[#F0B90B]" required />
        <label htmlFor="buy-risk" className="text-mist">
          I understand the target is not a guarantee, and I have read the <Link href="/risk" className="text-gold underline">risk disclosure</Link>.
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
