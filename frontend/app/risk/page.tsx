import Link from 'next/link';

const SECTIONS: [string, string[]][] = [
  [
    '1. No real funds yet',
    [
      'TOCKINAX is not live for real money. Every balance, token, listing, fill and payout shown today is a record only.',
      'Do not send real money, real crypto, or real payment credentials to any address or person claiming to represent TOCKINAX.',
    ],
  ],
  [
    '2. Target prices are not guaranteed',
    [
      'Target prices are not guaranteed — sale requires a willing buyer; unsold stays unsold.',
      'A matured position that auto-lists may sit unsold indefinitely. There is no buy-back, no floor price, and no promised exit.',
      'Example math (100 → TARGET 104.20 / 110.50 / 130.00) is arithmetic on example sticker prices, not a yield and not a forecast.',
    ],
  ],
  [
    '3. Commissions and categories',
    [
      'Referral rewards cover three generations only and pay only on eligible registrations after approval and funding; payouts stay disabled until then.',
      'Referral rewards are allocated across three generations. Internal allocation amounts are configured by administrators and are not published to members.',
      'No reward pays for recruitment beyond the published registration fee. Abuse leads to suspension and forfeiture of pending rewards.',
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
      'Account activation: register, then activate membership. Stage limits and stage entry fees follow the approved compensation plan; fees are recorded but not enforced until live.',
      'Locking options: 7-day (0.60%/day, 4.20%), 14-day (0.75%/day, 10.50%) or 30-day (1.00%/day, 30.00%), simple and non-compounded. Example: purchase 100 → TARGET 104.20 / 110.50 / 130.00. Targets, not guarantees.',
      'Settlement: marketplace listings are not sales; buyers may take small portions and proceeds are credited per portion as bought. Unsold stays unsold. Company-funded settlement charges 10% of the projected profit and is paid from the company reserve after admin approval.',
      'Stage entry fees: Stage 1 $20 (registration), Stage 2 $25, Stage 3 $50, Stage 4 $100, Stage 5 $250. Each fee is paid once when entering that stage; the approved plan publishes no separate renewal fee.',
      'Stage-limitation rule: when a downline member advances but the sponsor stays, the sponsor keeps their own-stage rate.',
    ],
  ],
];

export default function RiskPage() {
  return (
    <div className="card space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">
          Risk disclosure
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
