'use client';

import { useState } from 'react';
import { PLATFORM_RULES, targetResale, usdt } from '@/lib/plan';

const PRESETS = [100, 500, 1000, 5000];

/**
 * Lock simulator. Deliberately labelled "target": the maths is simple and real,
 * but a target price is not a return until a buyer pays it.
 */
export default function LockSimulator() {
  const [amount, setAmount] = useState(1000);
  const [days, setDays] = useState<7 | 14>(14);

  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const target = targetResale(safeAmount, days);
  const gain = Math.round((target - safeAmount) * 100) / 100;
  const pct = days === 7 ? 7 : 14;

  return (
    <div className="rounded-2xl border border-edge/70 bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-bright">Lock simulator</h3>
          <p className="text-xs text-mist">Simple, non-compounded. Targets only.</p>
        </div>
        <div className="inline-flex rounded-xl border border-edge/70 bg-ink p-1">
          {([7, 14] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                days === d ? 'bg-gold text-black' : 'text-mist hover:text-bright'
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      <label htmlFor="sim-amount" className="mt-5 block text-xs font-semibold uppercase tracking-wider text-mist">
        Purchase amount (USDT)
      </label>
      <div className="mt-1.5 flex items-center rounded-xl border border-edge/70 bg-ink px-3 focus-within:border-gold/60">
        <input
          id="sim-amount"
          type="number"
          min={0}
          step={50}
          value={Number.isFinite(amount) ? amount : ''}
          onChange={(e) => setAmount(parseFloat(e.target.value))}
          className="w-full bg-transparent py-2.5 font-mono text-lg font-semibold text-bright outline-none tnum"
          aria-describedby="sim-note"
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

      <p id="sim-note" className="mt-4 text-xs leading-relaxed text-mist">
        {days}-day lock at {PLATFORM_RULES.dailyTargetRate * 100}% per day, simple and
        non-compounded, gives a <strong className="text-bright">{pct}% target</strong> over the
        period. This is arithmetic on a sticker price, not a return: the position must find a
        willing buyer at that price. Unsold stays unsold.
      </p>
    </div>
  );
}
