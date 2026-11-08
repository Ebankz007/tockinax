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
  ['What are the referral rates?', 'The approved plan has three referral generations. Each eligible $20 registration allocates $5 to the direct referrer, $2 to the second generation and $1 to the third generation. Rewards pay only after approval and funding (see Referrals).'],
  ['Are rewards guaranteed income?', 'No. Activity rewards are disabled until budget + funding + approval, and they are never returns on deposits. There are no profit claims anywhere on this platform.'],
  ['How do payouts work?', 'Request payouts only from eligible, confirmed balances (payable commissions/rewards). Requests go through review before release. USDT TRC20 only via Pay2Crypto sandbox until approvals.'],
  ['Which payment methods are approved?', 'Fiat methods listed at checkout (for example bank transfer). USDT TRC20 only via Pay2Crypto sandbox until approvals.'],
  ['Should I ever share private keys?', 'No. Never share private keys, seed phrases, or mnemonics — not with support, sellers, or anyone. Payout forms reject such fields automatically.'],
  // --- Token Q&As (+12) ---
  ['What is a TOCKINAX token?', 'A unit you purchase at a sticker price and lock for a fixed term (7, 14 or 30 days).'],
  ['What does 7-day → 104.20 mean?', 'An example TARGET: buy at 100, lock 7 days at 0.60% per day, mature toward a target of 104.20. Simple, non-compounded math — a label, not a return and not a promise.'],
  ['What does 14-day → 110.50 mean?', 'An example TARGET: buy at 100, lock 14 days at 0.75% per day, mature toward a target of 110.50. Simple, non-compounded math — a label, not a return and not a promise.'],
  ['What does 30-day → 130.00 mean?', 'An example TARGET: buy at 100, lock 30 days at 1.00% per day, mature toward a target of 130.00. Simple, non-compounded math — a label, not a return and not a promise.'],
  ['What is a lock?', 'A timed hold (7, 14 or 30 days) during which your position cannot be sold or transferred. The dashboard shows a live countdown to matures_at.'],
  ['What happens at maturity?', 'Your position matures and is settled by the option you chose when locking: marketplace settlement lists it at the target price; company-funded settlement is paid manually from the company reserve after admin approval.'],
  ['What is marketplace settlement?', 'Matured positions appear as listings on the token market without you creating a listing manually. A listing is not a sale until a buyer pays.'],
  ['What are partial fills?', 'A buyer may purchase part of your listing quantity. The remainder stays listed with a visible remaining bar until sold or delisted.'],
  ['How does company-funded settlement work?', 'Choose it before locking. At maturity the company reserve settles the position and charges 10% of the projected profit. The admin reviews and approves each payout.'],
  ['How does settlement work?', 'Fills settle to balances in the platform. Nothing of real value moves until live payments are enabled. Withdrawals use the Pay2Crypto sandbox until approvals.'],
  ['Are target prices guaranteed?', 'No. Target prices are not guaranteed — sale requires a willing buyer; unsold stays unsold. There is no buy-back and no floor price.'],
  ['What are the 5 stages?', 'Membership stages 1–5 gate the eligible locking range and referral depth. Approved ranges: S1 50–500 (1 generation), S2 500.01–2,000 (2), S3 2,000.01–5,000 (3), S4 5,000.01–50,000 (3), S5 50,000.01–100,000 (3).'],
  ['How do stage fees work?', 'Each stage fee is paid once when entering that stage: Stage 1 is the $20 registration, then $25, $50, $100 and $250. Submitting an upgrade creates a pending request; nothing charges until the fee is disclosed, approved and funded.'],
  ['How do token deposits work?', 'Create a Pay2Crypto intent (USDT TRC20 only), then confirm sandbox payment to receive a transaction hash. History shows every intent and hash.'],
  ['How do token withdrawals work?', 'Request a withdrawal to your TRC20 address from confirmed balances. Requests are reviewed; release uses the Pay2Crypto sandbox until approvals. Never share private keys.'],
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
