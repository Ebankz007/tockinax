import Link from 'next/link';
import RiskStrip from '@/components/RiskStrip';

export default function HowItWorksPage() {
  const steps: [string, string][] = [
    ['Register & Activate', 'Create your account and activate membership. Registration is a recorded $20 USDT fee, split $5 / $2 / $1 / $2 / $2 / $8 across referrals, the leadership pool, processing and administration.'],
    ['Select Token Lock', 'Lock for 7 days (0.60%/day, 4.20% target), 14 days (0.75%/day, 10.50% target) or 30 days (1.00%/day, 30.00% target) — simple and non-compounded. Locked positions cannot be sold or transferred until maturity. Example: 100 → TARGET 104.20 / 110.50 / 130.00. Targets, not guarantees.'],
    ['Choose Settlement', 'Before locking, pick marketplace settlement or the company-funded option. Marketplace settlement lists the position at its target price at maturity; company-funded settlement pays from the company reserve and charges 10% of the projected profit, approved manually by an admin.'],
    ['Track Maturity & Advance', 'Follow the maturity date and settlement status. Stage advancement depends on the eligible locking range and the stage entry fee, not on counting cycles. Referral depth is capped at three generations.'],
  ];
  const rules: string[] = [
    'Account activation: register, then activate membership. Stage limits and stage entry fees follow the approved compensation plan; fees are recorded but not enforced until live.',
    'Locking options: 7-day (0.60%/day, 4.20%), 14-day (0.75%/day, 10.50%) or 30-day (1.00%/day, 30.00%), simple and non-compounded. Example: purchase 100 → TARGET 104.20 / 110.50 / 130.00. Simple math on the sticker price — targets, not guarantees.',
    'Settlement: marketplace listings are not sales; unsold stays unsold. Company-funded settlement charges 10% of the projected profit and is paid from the company reserve after admin approval.',
    'Stage entry fees: Stage 1 $20 (registration), Stage 2 $25, Stage 3 $50, Stage 4 $100, Stage 5 $250. Each fee is paid once when entering that stage; there is no separate renewal fee in the approved plan.',
    'Stage-limitation rule: when a downline member advances but the sponsor stays, the sponsor keeps their own-stage rate — earnings follow your own stage.',
  ];
  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h1 className="font-display text-2xl font-bold text-white">
          How it works
        </h1>
        <div className="alert-info" role="note">
          Orders and token fills are recorded, not held — no escrow implied. Members settle directly via approved methods.
        </div>
        <ol className="space-y-3">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-lg border border-line/10 bg-coal p-3">
              <p className="font-semibold text-white">
                {i + 1}. {t}
              </p>
              <p className="text-sm text-mist">{d}</p>
            </li>
          ))}
        </ol>
        <pre
          className="overflow-x-auto rounded bg-black p-3 text-xs text-gold"
          aria-label="Token lifecycle diagram"
        >
{`register & activate → select token lock → choose settlement → track maturity`}
        </pre>
        <h2 className="font-display font-semibold text-white">Business rules (condensed)</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-mist">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-sm text-mist">
          Settlement is end-to-end; withdrawals use the Pay2Crypto sandbox (USDT TRC20 only).
          Evidence ≠ proof: submitting a reference number does not mark an order paid. Completion
          requires seller confirmation or manual review. Referral rewards cover three generations
          only and pay only on eligible registrations after approval and funding.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/tokens" className="btn-secondary">Token cycles</Link>
          <Link href="/token-market" className="btn-secondary">Token market</Link>
          <Link href="/risk" className="btn-secondary">Risk disclosure</Link>
        </div>
      </div>
      <RiskStrip compact />
    </div>
  );
}
