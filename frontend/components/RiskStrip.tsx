import Link from 'next/link';

/** Safeguard strip reused on the home hero and every money page. */
const ITEMS = [
  'SIMULATED pilot — no real funds',
  'Target prices are not guaranteed — sale requires a willing buyer; unsold stays unsold',
  'Commissions pay only on verified sales after approval and funding — eight approved categories, payouts gated',
  'USDT TRC20 only via Pay2Crypto sandbox until approvals. Never share private keys.',
];

export default function RiskStrip({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-label="Risk disclosure summary"
      className="rounded-xl border border-gold/30 bg-brand-500/5 p-4"
    >
      <p className="text-sm font-semibold text-gold">
        Risk disclosure{' '}
        <Link href="/risk" className="ml-1 font-normal underline">
          Full disclosure →
        </Link>
      </p>
      <ul className={`mt-2 space-y-1 text-sm text-white/90 ${compact ? 'list-disc pl-5' : 'list-disc pl-5'}`}>
        {ITEMS.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
