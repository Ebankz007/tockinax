'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RiskStrip from '@/components/RiskStrip';
import ModuleEmpty from '@/components/ModuleEmpty';
import { LOCK_TERMS, targetResale, type LockTermDays } from '@/lib/plan';
import { fetchModule, listOf, type ModuleState, type TokenDef } from '@/lib/api';

const EXAMPLES = LOCK_TERMS.map((t) => ({
  days: t.days,
  buy: 100,
  target: targetResale(100, t.days),
  note: `${t.days}-day lock: 100 → TARGET ${targetResale(100, t.days).toFixed(2)} (simple math: ${(t.ratePerDay * 100).toFixed(2)}%/day × ${t.days} days = ${(t.termRate * 100).toFixed(2)}%).`,
}));

function TokenCalculator() {
  const [amount, setAmount] = useState('100');
  const [days, setDays] = useState<LockTermDays>(7);
  const parsed = Number.parseFloat(amount);
  const initial = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const term = LOCK_TERMS.find((t) => t.days === days) ?? LOCK_TERMS[0];
  const resale = targetResale(initial, days);
  const appreciation = Math.round((resale - initial) * 100) / 100;
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <section className="rounded-lg border border-line/10 bg-coal p-4 space-y-3" aria-label="Target calculator">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display font-semibold text-white">Target calculator</h2>
      </div>
      <p className="text-sm text-mist">
        Plain arithmetic at maturity only — no daily accrual. Enter an amount, pick a term, and see
        the target math. Targets are labels, not promises; sale requires a willing buyer or the
        company-funded settlement option.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="calc-amount">Amount (USDT)</label>
          <input
            id="calc-amount"
            className="input"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
          />
        </div>
        <div>
          <span className="label" id="calc-cycle-label">Term</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="calc-cycle-label">
            {LOCK_TERMS.map((t) => (
              <button
                key={t.days}
                type="button"
                onClick={() => setDays(t.days)}
                aria-pressed={days === t.days}
                className={days === t.days ? 'btn-primary' : 'btn-secondary'}
              >
                {t.days} days (+{(t.termRate * 100).toFixed(2)}%)
              </button>
            ))}
          </div>
        </div>
      </div>
      <dl className="grid gap-2 sm:grid-cols-4 text-sm">
        <div className="rounded-lg border border-line/10 bg-surface p-3">
          <dt className="text-mist">Initial</dt>
          <dd className="font-semibold text-white">{fmt(initial)}</dd>
        </div>
        <div className="rounded-lg border border-line/10 bg-surface p-3">
          <dt className="text-mist">Target Appreciation</dt>
          <dd className="font-semibold text-gold">{fmt(appreciation)} <span className="text-xs font-bold">TARGET</span></dd>
        </div>
        <div className="rounded-lg border border-line/10 bg-surface p-3">
          <dt className="text-mist">Target Resale</dt>
          <dd className="font-semibold text-gold">{fmt(resale)} <span className="text-xs font-bold">TARGET</span></dd>
        </div>
        <div className="rounded-lg border border-success/40 bg-surface p-3">
          <dt className="text-mist">Gross Gain</dt>
          <dd className="font-semibold text-success">{fmt(appreciation)} <span className="text-xs font-bold">TARGET</span></dd>
        </div>
      </dl>
      <p className="text-xs text-mist">
        Illustration — targets, not guarantees. {days}-day math: resale = amount × {term.target.toFixed(3)} at
        maturity ({(term.ratePerDay * 100).toFixed(2)}% per day, simple). Automatic listing is not
        automatic sale; unsold stays unsold.
      </p>
    </section>
  );
}

export default function TokensPage() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  useEffect(() => {
    fetchModule<unknown>('/tokens/definitions').then(setMod);
  }, []);

  const defs = mod.state === 'live' ? listOf<TokenDef>(mod.data) : [];

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h1 className="font-display text-2xl font-bold text-white">
          Token cycles
        </h1>
        <p className="text-sm text-mist">
          Three lock terms. Purchase at the sticker price, hold through the lock, and settle at a{' '}
          <strong className="text-white">TARGET</strong> price through the marketplace or the
          company-funded option. Targets are labels on math — not returns, not promises.
        </p>
        <div className="rounded-lg border border-line/10 bg-coal p-4 space-y-2" aria-label="Settlement mechanics">
          <h2 className="font-display font-semibold text-white">Maturity &amp; settlement</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-mist">
            <li>Locked for the exact term you selected (7, 14 or 30 days) — no mid-lock withdrawal.</li>
            <li>Marketplace option: at maturity the position is listed at its target price. Proceeds credit per portion as each portion is bought.</li>
            <li>Company-funded option: selected before locking; 10% of the projected profit is charged and the company reserve settles the position at maturity.</li>
            <li>Unsold stays unsold; a listing is not a sale until a buyer pays.</li>
          </ul>
        </div>
        {mod.state === 'loading' && <p role="status">Loading token definitions…</p>}
        {mod.state === 'live' && defs.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Cycle</th>
                <th scope="col">Purchase</th>
                <th scope="col">Target</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d, i) => (
                <tr key={d.id || i}>
                  <td className="text-white">{d.code || d.name || `Pilot token ${i + 1}`}</td>
                  <td>{d.cycle_days ?? '—'} days</td>
                  <td>{d.purchase_price ?? '—'}</td>
                  <td>
                    <span className="text-gold">{d.target_price ?? '—'}</span>
                  </td>
                  <td>{d.status || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(mod.state === 'deploying' || (mod.state === 'live' && defs.length === 0)) && (
          <div className="space-y-3">
            {mod.state === 'deploying' && (
              <ModuleEmpty title="Token definitions module deploying." />
            )}
            <table className="table" aria-label="Example target math">
              <thead>
                <tr>
                  <th scope="col">Term</th>
                  <th scope="col">Purchase</th>
                  <th scope="col">Target</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((e) => (
                  <tr key={e.days}>
                    <td className="text-white">{e.days}-day lock</td>
                    <td>{e.buy}</td>
                    <td>
                      <span className="text-gold">{e.target.toFixed(2)}</span>
                    </td>
                    <td>{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="alert-warn" role="note">
              Simple-math note: the figures above are arithmetic on example sticker prices using the
              approved daily target rates. They are TARGETS, not yields and not guarantees. Target
              prices are not guaranteed — sale requires a willing buyer; unsold stays unsold.
            </p>
          </div>
        )}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {mod.state === 'forbidden' && (
          <p className="alert-error" role="alert">Access gated — please log in.</p>
        )}
        <TokenCalculator />
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/dashboard/tokens" className="btn-primary">Buy &amp; lock</Link>
          <Link href="/risk" className="btn-secondary">Risk disclosure</Link>
        </div>
      </div>
      <RiskStrip compact />
    </div>
  );
}
