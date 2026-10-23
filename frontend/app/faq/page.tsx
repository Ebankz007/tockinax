import Link from 'next/link';
import RiskStrip from '@/components/RiskStrip';

const QA: [string, string][] = [
  ['Who can join?', 'Anyone who accepts the current Terms and Privacy versions, verifies their email, and completes member verification. Some actions (like selling) need extra enablement.'],
  ['How do I become a seller?', 'Request seller enablement. An admin reviews your account before you can publish listings. New listings start in review.'],
  ['How do orders work?', 'You order from an active listing. The platform records the order with server-side pricing. Orders are recorded, not held — no escrow implied. You pay the seller directly via an approved method.'],
  ['What is evidence?', 'After paying the seller directly, you submit evidence: a provider reference and/or note. Evidence is information for review — it is not proof of payment and never auto-completes an order.'],
  ['When is an order completed?', 'Only after the seller confirms receipt or an admin completes manual review. Unconfirmed orders may move to dispute.'],
  ['How do disputes work?', 'Either party can dispute from the order thread or support page. Provide references and dates. Admins review and decide: complete or keep disputed.'],
  ['When do referral commissions pay?', 'Commissions follow the approved plan categories and rates (see Referrals) and pay only on verified sales after approval and funding. Eligible completed sales count after a confirmation period. Registration fees, deposits and transfers never qualify.'],
  ['What are the referral rates?', 'Approved plan rates run 10% / 5% / 3% / 4% / 3% / 2% / 1.5% / 1% across the eight categories, stage-gated by generation depth (see Referrals). They pay only on verified sales after approval and funding.'],
  ['Are rewards guaranteed income?', 'No. Activity rewards are disabled until budget + funding + approval, and they are never returns on deposits. There are no profit claims anywhere on this platform.'],
  ['How do payouts work?', 'Request payouts only from eligible, confirmed balances (payable commissions/rewards). Requests go through review before release. USDT TRC20 only via Pay2Crypto sandbox until approvals.'],
  ['Which payment methods are approved?', 'Fiat methods listed at checkout (for example bank transfer). USDT TRC20 only via Pay2Crypto sandbox until approvals.'],
  ['Should I ever share private keys?', 'No. Never share private keys, seed phrases, or mnemonics — not with support, sellers, or anyone. Payout forms reject such fields automatically.'],
  // --- Token Q&As (+12) ---
  ['What is a TOCKINAX pilot token?', 'A simulated unit you purchase at a sticker price and lock for a fixed cycle (7 or 14 days). SIMULATED pilot — no real funds.'],
  ['What does 7-day → 107 mean?', 'An example TARGET: buy at 100, lock 7 days, mature toward a target of 107. Simple math (100 + 7) — a label, not a return and not a promise.'],
  ['What does 14-day → 114 mean?', 'An example TARGET: buy at 100, lock 14 days, mature toward a target of 114. Simple math (100 + 14) — a label, not a return and not a promise.'],
  ['What is a lock?', 'A timed hold (7 or 14 days) during which your position cannot be sold or transferred. The dashboard shows a live countdown to matures_at.'],
  ['What happens at maturity?', 'Your position matures automatically and auto-lists on the token market at its target price. No action is needed from you.'],
  ['What is auto-listing?', 'Matured positions appear as listings on the token market without you creating a listing manually.'],
  ['What are partial fills?', 'A buyer may purchase part of your listing quantity. The remainder stays listed with a visible remaining bar until sold or delisted.'],
  ['How does settlement work?', 'Fills settle to simulated balances in the pilot. Nothing of real value moves. Withdrawals are simulated via the Pay2Crypto sandbox.'],
  ['Are target prices guaranteed?', 'No. Target prices are not guaranteed — sale requires a willing buyer; unsold stays unsold. There is no buy-back and no floor price.'],
  ['What are the 5 stages?', 'Membership stages 1–5 gate lock limits and generation depth (1 through 1-5). Approved buy limits: S1 50–500, S2 500–2,500, S3 2,500–10,000, S4 10,000–25,000, S5 25,000–100,000 USDT.'],
  ['How do stage upgrades and renewals work?', 'From your Stage page: the upgrade fee is the fee to leave your current stage (100 / 250 / 600 / 1500 USDT for 1→2 … 4→5) and renewal is 25 / 50 / 120 / 300 / 600 USDT. Submitting creates a pending request; nothing charges until the fee is disclosed, approved and funded.'],
  ['How do token deposits work?', 'Create a Pay2Crypto intent (USDT TRC20 only), then simulate sandbox payment to receive a transaction hash. History shows every intent and hash. SIMULATED pilot — no real funds.'],
  ['How do token withdrawals work?', 'Request a withdrawal to your TRC20 address from confirmed balances. Requests are reviewed; the pilot simulates release. Never share private keys.'],
  ['Do holding tokens earn commissions?', 'No. Commissions follow the approved plan categories and rates and pay only on verified sales after approval and funding. Merely holding locked tokens earns nothing.'],
];

export default function FaqPage() {
  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h1 className="font-display text-2xl font-bold text-white">Frequently asked questions</h1>
        <div className="space-y-3">
          {QA.map(([q, a]) => (
            <details key={q} className="rounded-lg border border-line/10 bg-coal p-3">
              <summary className="cursor-pointer font-semibold text-white">{q}</summary>
              <p className="mt-1 text-sm text-mist">{a}</p>
            </details>
          ))}
        </div>
        <p className="text-sm text-mist">
          Still unsure? <Link href="/risk" className="text-gold underline">Risk disclosure</Link> ·{' '}
          <Link href="/contact" className="text-gold underline">Contact support</Link>
        </p>
      </div>
      <RiskStrip compact />
    </div>
  );
}
