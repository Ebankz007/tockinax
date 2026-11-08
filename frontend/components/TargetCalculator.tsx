'use client';

import { useState } from 'react';
import { LOCK_TERMS, targetResale, usdt, type LockTermDays } from '@/lib/plan';

const PRESETS = [100, 500, 1000, 5000];

/**
 * Target-price calculator. The maths is real — the approved daily target rates
 * are simple and non-compounded — but a target resale price is not a return
 * until a buyer pays it.
 */
export default function TargetCalculator() {
  const [amount, setAmount] = useState(1000);
  const [days, setDays] = useState<LockTermDays>(14);

  const term = LOCK_TERMS.find((t) => t.days === days) ?? LOCK_TERMS[0];
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const target = targetResale(safeAmount, days);
  const gain = Math.round((target - safeAmount) * 100) / 100;

  return (
    <div className="rounded-2xl border border-edge/70 bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-bright">Target-price calculator</h3>
          <p className="text-xs text-mist">Simple, non-compounded. Target resale price, not a guaranteed payout.</p>
        </div>
        <div className="inline-flex rounded-xl border border-edge/70 bg-ink p-1">
          {LOCK_TERMS.map((t) => (
            <button
              key={t.days}
              type="button"
              onClick={() => setDays(t.days)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                days === t.days ? 'bg-gold text-black' : 'text-mist hover:text-bright'
              }`}
            >
              {t.days} days
            </button>
          ))}
        </div>
      </div>

      <label htmlFor="calc-amount" className="mt-5 block text-xs font-semibold uppercase tracking-wider text-mist">
        Purchase amount (USDT)
      </label>
      <div className="mt-1.5 flex items-center rounded-xl border border-edge/70 bg-ink px-3 focus-within:border-gold/60">
        <input
          id="calc-amount"
          type="number"
          min={0}
          step={50}
          value={Number.isFinite(amount) ? amount : ''}
          onChange={(e) => setAmount(parseFloat(e.target.value))}
          className="w-full bg-transparent py-2.5 font-mono text-lg font-semibold text-bright outline-none tnum"
          aria-describedby="calc-note"
        />
        <span className="font-mono text-xs font-semibold text-mist">USDT</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(p)}
            className="rounded-lg border border-edge/70 px-2.5 py-1 font-mono text-xs text-mist transition-colors hover:border-gold/40 hover:text-bright tnum"
          >
            {p.toLocaleString('en-US')}
          </button>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-edge/70 bg-ink p-3">
          <dt className="text-[11px] font-medium text-mist">Target resale value</dt>
          <dd className="mt-0.5 font-mono text-xl font-bold text-gold tnum">{usdt(target)}</dd>
        </div>
        <div className="rounded-xl border border-edge/70 bg-ink p-3">
          <dt className="text-[11px] font-medium text-mist">Target gross gain</dt>
          <dd className="mt-0.5 font-mono text-xl font-bold text-success tnum">+{usdt(gain)}</dd>
        </div>
      </dl>

      <p id="calc-note" className="mt-4 text-xs leading-relaxed text-mist">
        {days}-day lock at {(term.ratePerDay * 100).toFixed(2)}% per day, simple and
        non-compounded, gives a{' '}
        <strong className="text-bright">{(term.termRate * 100).toFixed(2)}% target</strong> over
        the period. This is arithmetic on a sticker price, not a return: the position must find
        a willing buyer at that price. Unsold stays unsold.
      </p>
    </div>
  );
}
