import Link from 'next/link';
import { SimBadge } from '@/components/Badges';

const SECTIONS: [string, string[]][] = [
  [
    '1. Simulated pilot — no real funds',
    [
      'SIMULATED pilot — no real funds. Every balance, token, listing, fill and payout in this pilot is a simulated record.',
      'Do not send real money, real crypto, or real payment credentials to any address or person claiming to represent the pilot.',
    ],
  ],
  [
    '2. Target prices are not guaranteed',
    [
      'Target prices are not guaranteed — sale requires a willing buyer; unsold stays unsold.',
      'A matured position that auto-lists may sit unsold indefinitely. There is no buy-back, no floor price, and no promised exit.',
      'Example math (100 → TARGET 107 / 114) is arithmetic on example sticker prices, not a yield and not a forecast.',
    ],
  ],
  [
    '3. Commissions and categories',
    [
      'Commissions pay only on verified sales after approval and funding — the eight categories are the approved plan; payouts stay disabled until then.',
      'Registration fees, deposits and member transfers never qualify for commissions.',
      'No category pays for recruitment. Abuse leads to suspension and forfeiture of pending commissions.',
    ],
  ],
  [
    '4. Crypto and custody',
    [
      'USDT TRC20 only via Pay2Crypto sandbox until approvals. Never share private keys.',
      'Never share private keys, seed phrases, or mnemonics — not with support, sellers, or anyone. Support forms reject such fields.',
      'Crypto/USDT features stay disabled until provider, network, legal and operations approvals are complete.',
    ],
  ],
  [
    '5. Orders, evidence and escrow',
    [
      'Orders and token fills are recorded, not held — no escrow implied.',
      'Evidence (references, notes) is information for review — it is not proof of payment and never auto-completes an order.',
      'Completion requires seller confirmation or manual review; either party can raise a dispute.',
    ],
  ],
  [
    '6. No profit promises',
    [
      'Nothing on TOCKINAX is a profit promise. There are no guaranteed returns, no fake statistics, and no testimonials used as earnings claims.',
      'If anyone guarantees you a profit using the TOCKINAX name, treat it as fraud and report it via Contact support.',
    ],
  ],
  [
    '7. Token business rules (condensed)',
    [
      'Account activation: register, then activate membership. Stage limits and stage fees follow the approved compensation plan; activation fees are recorded but not enforced in this pilot.',
      'Locking options: 7-day (+7%) or 14-day (+14%), 1%/day non-compounded. Example: purchase 100 → TARGET 107 / TARGET 114. Targets, not guarantees.',
      'Auto-list + partial sales: matured positions auto-list at target; buyers may take small portions; proceeds credited per portion as bought. Automatic listing is not automatic sale; unsold stays unsold.',
      '42-day rule: 3×14 or 6×7 cumulative locked days qualifies for stage advancement. Then choose upgrade vs renewal — upgrades cost 100 / 250 / 600 / 1500 USDT to leave stages 1–4; renewals are 25 / 50 / 120 / 300 / 600 USDT at the current stage.',
      'Stage-limitation rule: when a downline member advances but the sponsor stays, the sponsor keeps their own-stage rate.',
    ],
  ],
];

export default function RiskPage() {
  return (
    <div className="card space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">
          Risk disclosure <SimBadge />
        </h1>
        <p className="mt-1 text-sm text-mist">
          Read this before using any money feature. It is linked from the footer and from every
          page that touches funds, tokens, stages, deposits, withdrawals or commissions.
        </p>
      </div>
      {SECTIONS.map(([title, points]) => (
        <section key={title} aria-label={title}>
          <h2 className="font-display font-semibold text-gold">{title}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-white/90">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-mist">
        Questions? <Link href="/contact" className="text-gold underline">Contact support</Link> ·{' '}
        <Link href="/faq" className="text-gold underline">FAQ</Link>
      </p>
    </div>
  );
}
