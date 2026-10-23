import Link from 'next/link';
import RiskStrip from '@/components/RiskStrip';
import LockSimulator from '@/components/LockSimulator';
import {
  STAGES,
  REFERRAL_CATEGORIES,
  PLATFORM_RULES,
  bpsToPct,
  usdt,
} from '@/lib/plan';

const KPI = [
  { value: '1.0%', unit: '/ day', label: 'Target value appreciation', tone: 'text-gold' },
  { value: '7 & 14', unit: 'days', label: 'Fixed token lock terms', tone: 'text-bright' },
  { value: '5', unit: 'stages', label: 'Progressive participation tiers', tone: 'text-success' },
  { value: '5', unit: 'gens', label: 'Referral generations, when funded', tone: 'text-[#3B82F6]' },
];

const STEPS = [
  {
    n: '01',
    title: 'Register & activate',
    body: 'Create an account and activate membership. Activation is a recorded 20 USDT fee — nothing is charged until fees are switched on.',
  },
  {
    n: '02',
    title: 'Lock a cycle',
    body: 'Choose 7 days (+7% target) or 14 days (+14% target) at 1% per day, simple and non-compounded. Your stage sets the purchase ceiling.',
  },
  {
    n: '03',
    title: 'List at maturity',
    body: 'At maturity the position auto-lists at its target price. Multiple buyers can take small portions; you settle per portion. A listing is not a sale.',
  },
  {
    n: '04',
    title: 'Advance a stage',
    body: 'Build 42 cumulative lock days — 6 × 7-day or 3 × 14-day cycles — to move up. Higher stages widen limits and generations.',
  },
];

export default function Home() {
  return (
    <div className="space-y-14 sm:space-y-20">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero-glow relative overflow-hidden rounded-3xl border border-edge/70 bg-surface px-6 py-12 sm:px-10 sm:py-16">
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="eyebrow">Simulated pilot — no real funds</span>

          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-bright sm:text-5xl lg:text-6xl">
            Trade. Connect.
            <br />
            <span className="text-gold">Grow Globally.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-mist sm:text-lg">
            Purchase pilot tokens in USDT, lock them for{' '}
            <strong className="font-semibold text-bright">7 or 14 days</strong>, then list at
            maturity for partial fills. Every step is simulated — and every target price still
            needs a willing buyer.
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
            Stage 1 from 50 USDT · 42 cumulative lock days per stage
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

      {/* ── Simulator + cycle targets ────────────────────────── */}
      <section aria-label="Lock simulator" className="grid gap-4 lg:grid-cols-2">
        <LockSimulator />

        <div className="space-y-4">
          {([7, 14] as const).map((d) => {
            const mult = d === 7 ? PLATFORM_RULES.sevenDayTarget : PLATFORM_RULES.fourteenDayTarget;
            return (
              <div key={d} className="rounded-2xl border border-edge/70 bg-surface p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-bright">{d}-day cycle</h3>
                  <span className="badge-sim">Target</span>
                </div>
                <p className="mt-3 font-mono text-sm text-mist tnum">
                  100.00 <span className="text-mist">→</span>{' '}
                  <span className="text-lg font-bold text-gold">{usdt(100 * mult)}</span>{' '}
                  <span className="text-success">(+{((mult - 1) * 100).toFixed(0)}%)</span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-mist">
                  {d} days at 1% per day, simple and non-compounded. The target is a listing
                  price, not a payout — it is only realised if a buyer takes the position.
                </p>
              </div>
            );
          })}
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
              Every stage requires the same 42 cumulative lock days — 6 × 7-day or 3 × 14-day
              cycles. What changes is the ceiling and how many generations you can qualify for.
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
                {usdt(s.minBuy, 0)} – {usdt(s.maxBuy, 0)} USDT
              </p>
              <dl className="mt-3 space-y-1 text-[11px] text-mist">
                <div className="flex justify-between gap-2">
                  <dt>Generations</dt>
                  <dd className="font-mono font-semibold text-bright tnum">{s.generations}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Upgrade</dt>
                  <dd className="font-mono font-semibold text-bright tnum">
                    {s.upgradeFee === 0 ? '—' : `${usdt(s.upgradeFee, 0)}`}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Renewal</dt>
                  <dd className="font-mono font-semibold text-bright tnum">{usdt(s.renewalFee, 0)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* ── Referral categories ──────────────────────────────── */}
      <section aria-label="Referral compensation categories">
        <div className="mb-6">
          <span className="eyebrow">Compensation</span>
          <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-bright sm:text-3xl">
            Eight approved categories
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">
            Categories are defined and versioned, but <strong className="text-bright">none are
            active</strong>. A category pays only after it is approved and funded, and only on
            verified sales — never on recruitment.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-edge/70 bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge/70 text-left text-[11px] uppercase tracking-wider text-mist">
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Qualifying basis</th>
                <th className="px-4 py-3 font-semibold">Scope</th>
                <th className="px-4 py-3 text-right font-semibold">Rate</th>
                <th className="px-4 py-3 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {REFERRAL_CATEGORIES.map((c) => (
                <tr key={c.id} className="border-b border-edge/40 last:border-0">
                  <td className="px-4 py-3 font-medium text-bright">{c.name}</td>
                  <td className="hidden px-4 py-3 text-xs text-mist sm:table-cell">{c.basis}</td>
                  <td className="px-4 py-3 font-mono text-xs text-mist">{c.scope}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-bright tnum">
                    {bpsToPct(c.rateBps)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="rounded-full border border-edge/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mist">
                      Inactive
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/[0.08] to-transparent px-6 py-12 text-center sm:px-10">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-bright sm:text-3xl">
          Start with a simulated cycle
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-mist">
          Create an account, activate, and run a 7-day lock end to end. Nothing moves real money
          while the pilot is in this state.
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
