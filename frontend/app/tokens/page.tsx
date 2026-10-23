'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RiskStrip from '@/components/RiskStrip';
import { LiveChip, SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { fetchModule, listOf, type ModuleState, type TokenDef } from '@/lib/api';

const EXAMPLES = [
  { days: 7, buy: 100, target: 107, note: '7-day lock: 100 → TARGET 107 (simple math: 100 + 7). 1%/day, non-compounded.' },
  { days: 14, buy: 100, target: 114, note: '14-day lock: 100 → TARGET 114 (simple math: 100 + 14). 1%/day, non-compounded.' },
];

function TokenCalculator() {
  const [amount, setAmount] = useState('100');
  const [days, setDays] = useState<7 | 14>(7);
  const parsed = Number.parseFloat(amount);
  const initial = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const rate = days === 7 ? 0.07 : 0.14;
  const appreciation = initial * rate;
  const resale = initial + appreciation;
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <section className="rounded-lg border border-line/10 bg-coal p-4 space-y-3" aria-label="Target calculator (simulation)">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display font-semibold text-white">Target calculator</h2>
        <span className="badge-sim">SIMULATION — TARGETS, NOT GUARANTEES</span>
      </div>
      <p className="text-sm text-mist">
        Plain arithmetic at maturity only — no daily accrual. Enter an amount, pick a cycle, and see
        the target math. Targets are labels, not promises; sale requires a willing buyer.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="calc-amount">Amount (USDT, simulated)</label>
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
          <span className="label" id="calc-cycle-label">Cycle</span>
          <div className="flex gap-2" role="group" aria-labelledby="calc-cycle-label">
            <button
              type="button"
              onClick={() => setDays(7)}
              aria-pressed={days === 7}
              className={days === 7 ? 'btn-primary' : 'btn-secondary'}
            >
              7 days (+7%)
            </button>
            <button
              type="button"
              onClick={() => setDays(14)}
              aria-pressed={days === 14}
              className={days === 14 ? 'btn-primary' : 'btn-secondary'}
            >
              14 days (+14%)
            </button>
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
          <dd className="font-semibold text-gold">{fmt(appreciation)} <span className="badge-sim ml-1">TARGET</span></dd>
        </div>
        <div className="rounded-lg border border-line/10 bg-surface p-3">
          <dt className="text-mist">Target Resale</dt>
          <dd className="font-semibold text-gold">{fmt(resale)} <span className="badge-sim ml-1">TARGET</span></dd>
        </div>
        <div className="rounded-lg border border-success/40 bg-surface p-3">
          <dt className="text-mist">Gross Gain</dt>
          <dd className="font-semibold text-success">{fmt(appreciation)} <span className="badge-sim ml-1">TARGET</span></dd>
        </div>
      </dl>
      <p className="text-xs text-mist">
        Simulation — targets, not guarantees. {days}-day math: resale = amount × {days === 7 ? '1.07' : '1.14'} at
        maturity. Automatic listing is not automatic sale; unsold stays unsold.
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
          Token cycles <SimBadge />
        </h1>
        <p className="text-sm text-mist">
          Two lock cycles. Purchase at the sticker price, hold through the lock, mature to a{' '}
          <strong className="text-white">TARGET</strong> price. Targets are labels on math — not
          returns, not promises.
        </p>
        <p className="text-sm text-mist">
          You don&apos;t have to wait for a single buyer to take all your tokens. Multiple buyers
          can purchase small portions. You receive USDT as each portion is bought — but automatic
          listing is not automatic sale; unsold stays unsold.
        </p>
        <div className="rounded-lg border border-line/10 bg-coal p-4 space-y-2" aria-label="Auto-list mechanics">
          <h2 className="font-display font-semibold text-white">Auto-list mechanics</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-mist">
            <li>Locked for the exact period you selected (7 or 14 days) — no mid-lock withdrawal.</li>
            <li>At maturity, immediate listing on the token market at the 107% / 114% target price.</li>
            <li>Proceeds credited per portion as each portion is bought. Unsold stays unsold.</li>
          </ul>
        </div>
        <LiveChip live={mod.state === 'live' ? true : mod.state === 'loading' ? null : false} what="Tokens API" />
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
                    <span className="text-gold">{d.target_price ?? '—'}</span>{' '}
                    <span className="badge-sim">TARGET</span>
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
                  <th scope="col">Cycle</th>
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
                      <span className="text-gold">{e.target}</span>{' '}
                      <span className="badge-sim">TARGET</span>
                    </td>
                    <td>{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="alert-warn" role="note">
              Simple-math note: 100 → 107 and 100 → 114 are arithmetic on example sticker prices
              (100 + 7, 100 + 14). They are TARGETS, not yields and not guarantees. Target prices
              are not guaranteed — sale requires a willing buyer; unsold stays unsold.
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

