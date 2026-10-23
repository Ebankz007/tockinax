import Link from 'next/link';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';

export default function HowItWorksPage() {
  const steps: [string, string][] = [
    ['Register & Activate', 'Create your account and activate membership. SIMULATED pilot — no real funds.'],
    ['Select Token Lock', 'Lock for 7 days (+7%) or 14 days (+14%) — 1%/day, non-compounded. Locked positions cannot be sold or transferred until maturity. Example: 100 → TARGET 107 / 114. Targets, not guarantees.'],
    ['Auto Resale on Market', 'At maturity your position auto-lists on the token market at its target price. Multiple buyers can purchase small portions; you receive USDT as each portion is bought. Automatic listing is not automatic sale — unsold stays unsold.'],
    ['Advance & Earn', 'Build 42 cumulative locked days (6×7 or 3×14) to advance Stage 1→5 and unlock up to 5 generations. Commissions pay only on verified sales after approval.'],
  ];
  const rules: string[] = [
    'Account activation: register, then activate membership. Stage limits and stage fees follow the approved compensation plan; activation fees are recorded but not enforced in this pilot.',
    'Locking options: 7-day (+7%) or 14-day (+14%), 1%/day non-compounded. Example: purchase 100 → TARGET 107 / TARGET 114. Simple math on the sticker price — targets, not guarantees.',
    'Auto-list + partial sales: matured positions auto-list at target; buyers may take small portions; proceeds credited per portion as bought. Unsold stays unsold.',
    '42-day rule: 3×14 or 6×7 cumulative locked days qualifies for stage advancement. Upgrades then cost 100 / 250 / 600 / 1500 USDT to leave stages 1–4; renewals are 25 / 50 / 120 / 300 / 600 USDT at the current stage.',
    'Stage-limitation rule: when a downline member advances but the sponsor stays, the sponsor keeps their own-stage rate — earnings follow your own stage.',
  ];
  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h1 className="font-display text-2xl font-bold text-white">
          How it works <SimBadge />
        </h1>
        <div className="alert-info" role="note">
          Orders and token fills are recorded, not held — no escrow implied. Members settle
          directly via approved methods; the pilot simulates every transfer.
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
{`register & activate → select token lock → auto resale on market → advance & earn`}
        </pre>
        <h2 className="font-display font-semibold text-white">Business rules (condensed)</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-mist">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-sm text-mist">
          Settlement is simulated end-to-end; withdrawals use the Pay2Crypto sandbox (USDT TRC20 only).
          Evidence ≠ proof: submitting a reference number does not mark an order paid. Completion
          requires seller confirmation or manual review. Commissions pay only on verified sales
          after approval and funding — the eight categories are the approved plan, payouts gated.
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
