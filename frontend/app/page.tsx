import Link from 'next/link';
import RiskStrip from '@/components/RiskStrip';
import TargetCalculator from '@/components/TargetCalculator';
import {
  STAGES,
  LOCK_TERMS,
  REFERRAL_REWARDS,
  REGISTRATION_SPLIT,
  usdt,
} from '@/lib/plan';

const KPI = [
  { value: '0.60–1.00%', unit: '/ day', label: 'Target rate by lock term', tone: 'text-gold' },
  { value: '7 · 14 · 30', unit: 'days', label: 'Fixed token lock terms', tone: 'text-bright' },
  { value: '5', unit: 'stages', label: 'Progressive participation tiers', tone: 'text-success' },
  { value: '3', unit: 'gens', label: 'Referral generations, when funded', tone: 'text-[#3B82F6]' },
];

const STEPS = [
  {
    n: '01',
    title: 'Register & activate',
    body: 'Create an account and activate membership. Registration is a recorded $20 USDT fee, split across referrals, the leadership pool, processing and administration.',
  },
  {
    n: '02',
    title: 'Choose stage & term',
    body: 'Pick the stage that matches your locking amount and pay its entry fee. Choose 7 days (4.20% target), 14 days (10.50%) or 30 days (30.00%), simple and non-compounded.',
  },
  {
    n: '03',
    title: 'Choose settlement',
    body: 'Select marketplace settlement at maturity, or the company-funded option where 10% of the projected profit is charged and the company reserve settles you.',
  },
  {
    n: '04',
    title: 'Track maturity',
    body: 'Keep the transaction record and follow the maturity date and settlement status. A marketplace listing is not a sale until a buyer pays.',
  },
];

export default function Home() {
  return (
    <div className="space-y-14 sm:space-y-20">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero-glow relative overflow-hidden rounded-3xl border border-edge/70 bg-surface px-6 py-12 sm:px-10 sm:py-16">
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="eyebrow">Token purchase → timed lock → maturity → settlement</span>

          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-bright sm:text-5xl lg:text-6xl">
            Trade. Connect.
            <br />
            <span className="text-gold">Grow Globally.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-mist sm:text-lg">
            Purchase tokens in USDT, lock them for{' '}
            <strong className="font-semibold text-bright">7, 14 or 30 days</strong>, then settle at
            maturity through the marketplace or the company-funded option. Every target price still
            needs a willing buyer — a listing is not a sale.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="rounded-xl bg-gold px-6 py-3 text-sm font-bold text-black shadow-gold transition-colors hover:bg-goldhover"
            >
              Create an account
            </Link>
            <Link
              href="/token-market"
              className="rounded-xl border border-edge/70 bg-ink px-6 py-3 text-sm font-semibold text-bright transition-colors hover:border-gold/40 hover:bg-white/5"
            >
              Explore the token market
            </Link>
          </div>

          <p className="mt-6 font-mono text-xs text-mist tnum">
            Stage 1 from 50 USDT · $20 registration · 7, 14 or 30-day locks
          </p>
        </div>
      </section>

      {/* ── KPI strip ────────────────────────────────────────── */}
      <section aria-label="Platform at a glance" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {KPI.map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border border-edge/70 bg-surface p-5 text-center"
          >
            <p className={`font-mono text-2xl font-extrabold tnum sm:text-3xl ${k.tone}`}>
              {k.value}
              <span className="ml-1 text-xs font-medium text-mist">{k.unit}</span>
            </p>
            <p className="mt-1.5 text-xs leading-snug text-mist">{k.label}</p>
          </div>
        ))}
      </section>

      <RiskStrip />

      {/* ── How it works ─────────────────────────────────────── */}
      <section aria-label="How TOCKINAX works">
        <div className="mb-8 text-center">
          <span className="eyebrow">The mechanism</span>
          <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-bright sm:text-3xl">
            Four steps, one cycle
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-mist">
            From registration to settlement, every movement is recorded and auditable.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-edge/70 bg-surface p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold font-mono text-sm font-extrabold text-black tnum">
                {s.n}
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-bright">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-mist">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Target calculator + cycle targets ────────────────── */}
      <section aria-label="Target-price calculator" className="grid gap-4 lg:grid-cols-2">
        <TargetCalculator />

        <div className="space-y-3">
          {LOCK_TERMS.map((t) => (
            <div key={t.days} className="rounded-2xl border border-edge/70 bg-surface p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-bright">{t.days}-day cycle</h3>
                <span className="text-xs font-bold text-success">
                  +{(t.termRate * 100).toFixed(2)}% target
                </span>
              </div>
              <p className="mt-2 font-mono text-sm text-mist tnum">
                100.00 <span className="text-mist">→</span>{' '}
                <span className="text-lg font-bold text-gold">{usdt(100 * t.target)}</span>{' '}
                <span className="text-mist">({(t.ratePerDay * 100).toFixed(2)}%/day)</span>
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-mist">
                {t.days} days at {(t.ratePerDay * 100).toFixed(2)}% per day, simple and
                non-compounded. The target is a settlement price, not a payout — it is only
                realised if a buyer takes the position or the company-funded option applies.
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stages ───────────────────────────────────────────── */}
      <section aria-label="Participation stages">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="eyebrow">Progression</span>
            <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-bright sm:text-3xl">
              Five stages
            </h2>
            <p className="mt-2 max-w-xl text-sm text-mist">
              Choose the stage that matches your eligible locking amount. Each stage fee is paid
              once when entering that stage; Stage 1&apos;s $20 fee is the registration fee.
            </p>
          </div>
          <Link href="/stages" className="text-sm font-semibold text-gold hover:underline">
            Full stage table →
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STAGES.map((s) => (
            <div
              key={s.stage}
              className="rounded-2xl border border-edge/70 bg-surface p-4 transition-colors hover:border-gold/30"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.accent }}
                  aria-hidden="true"
                />
                <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-mist tnum">
                  Stage {s.stage}
                </p>
              </div>
              <h3 className="mt-1.5 font-display text-base font-bold text-bright">{s.name}</h3>
              <p className="mt-2 font-mono text-xs text-mist tnum">
                {usdt(s.minBuy, 2)} – {usdt(s.maxBuy, 0)} USDT
              </p>
              <dl className="mt-3 space-y-1 text-[11px] text-mist">
                <div className="flex justify-between gap-2">
                  <dt>Generations</dt>
                  <dd className="font-mono font-semibold text-bright tnum">{s.generations}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{s.stage === 1 ? 'Registration' : 'Entry fee'}</dt>
                  <dd className="font-mono font-semibold text-bright tnum">{usdt(s.entryFee, 0)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* ── Referral structure ───────────────────────────────── */}
      <section aria-label="Referral compensation">
        <div className="mb-6">
          <span className="eyebrow">Compensation</span>
          <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-bright sm:text-3xl">
            Three referral generations
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">
            Each eligible $20 registration allocates <strong className="text-bright">$5</strong> to
            the direct referrer, <strong className="text-bright">$2</strong> to the second
            generation and <strong className="text-bright">$1</strong> to the third. Rewards are
            recorded but <strong className="text-bright">not active</strong> until approved and funded.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-edge/70 bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge/70 text-left text-[11px] uppercase tracking-wider text-mist">
                  <th className="px-4 py-3 font-semibold">Generation</th>
                  <th className="px-4 py-3 font-semibold">Who qualifies</th>
                  <th className="px-4 py-3 text-right font-semibold">Reward</th>
                </tr>
              </thead>
              <tbody>
                {REFERRAL_REWARDS.map((r) => (
                  <tr key={r.generation} className="border-b border-edge/40 last:border-0">
                    <td className="px-4 py-3 font-medium text-bright">{r.name}</td>
                    <td className="px-4 py-3 text-xs text-mist">{r.basis}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gold tnum">
                      ${r.amountUsdt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-2xl border border-edge/70 bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge/70 text-left text-[11px] uppercase tracking-wider text-mist">
                  <th className="px-4 py-3 font-semibold">$20 registration split</th>
                  <th className="px-4 py-3 font-semibold">Purpose</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {REGISTRATION_SPLIT.map((r) => (
                  <tr key={r.key} className="border-b border-edge/40 last:border-0">
                    <td className="px-4 py-3 font-medium text-bright">{r.label}</td>
                    <td className="px-4 py-3 text-xs text-mist">{r.purpose}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-bright tnum">
                      ${r.amountUsdt}
                    </td>
                  </tr>
                ))}
                <tr className="bg-ink/60">
                  <td className="px-4 py-3 font-bold text-bright">Total</td>
                  <td className="px-4 py-3 text-xs text-mist">Registration fee</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gold tnum">$20</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/[0.08] to-transparent px-6 py-12 text-center sm:px-10">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-bright sm:text-3xl">
          Start with a cycle
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-mist">
          Create an account, activate, and run a 7-day lock end to end. Every target price is a
          settlement price, not a payout — it is only realised if a buyer takes the position or the
          company-funded option applies.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="rounded-xl bg-gold px-6 py-3 text-sm font-bold text-black shadow-gold transition-colors hover:bg-goldhover"
          >
            Create an account
          </Link>
          <Link
            href="/how-it-works"
            className="rounded-xl border border-edge/70 bg-ink px-6 py-3 text-sm font-semibold text-bright transition-colors hover:border-gold/40"
          >
            Read how it works
          </Link>
        </div>
      </section>
    </div>
  );
}
