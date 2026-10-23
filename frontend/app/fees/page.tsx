'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';
import Empty from '@/components/Empty';
import { api, errMsg } from '@/lib/api';

type Fee = { key: string; amount: string; currency: string; description?: string; refund_policy?: string };

const PLACEHOLDERS: [string, string, string][] = [
  ['Token purchase', 'Per pricing version (1%/day simple)', 'Sticker price per cycle; set by the active pricing version (7d → +7%, 14d → +14%).'],
  ['Stage upgrade', 'Per stage (approved)', 'Fee to leave your current stage: 1→2 100, 2→3 250, 3→4 600, 4→5 1500 USDT.'],
  ['Stage renewal', 'Per stage (approved)', 'Renewal at your current stage: S1 25, S2 50, S3 120, S4 300, S5 600 USDT.'],
  ['Marketplace order', '~1% platform accounting (configurable)', 'Recorded on completed orders; configurable by admin.'],
  ['Token market fill fee', 'None (simulated)', 'Fills settle at the listing target price; no separate fill fee in the simulated pilot.'],
  ['Payout / withdrawal', 'Method-dependent', 'Only from eligible, confirmed balances.'],
];

export default function FeesPage() {
  const [fees, setFees] = useState<Fee[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Fee[] | { items?: Fee[] }>('/content/settings/public')
      .then((d) => setFees(Array.isArray(d) ? d : d.items || []))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h1 className="font-display text-2xl font-bold text-white">
          Fees &amp; refunds <SimBadge />
        </h1>
        <p className="text-sm text-mist">
          Transparent pricing: registration, token and marketplace fees are disclosed before you
          pay. Stage upgrade and renewal fees follow the approved compensation plan.
          There are no hidden investment-style charges and no guaranteed returns of any kind.
        </p>
        {loading && <p role="status">Loading fee schedule…</p>}
        {error && <p className="alert-error" role="alert">{error} — showing default disclosure instead.</p>}
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Fee</th>
              <th scope="col">Amount</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {fees && fees.length > 0
              ? fees.map((f) => (
                  <tr key={f.key}>
                    <td className="text-white">{f.key}</td>
                    <td>{f.amount} {f.currency}</td>
                    <td>{f.description || ''}</td>
                  </tr>
                ))
              : (!loading &&
                  PLACEHOLDERS.map(([k, a, d]) => (
                    <tr key={k}>
                      <td className="text-white">{k}</td>
                      <td>{a.startsWith('TBD') ? <span className="badge-disabled">{a}</span> : a}</td>
                      <td>{d}</td>
                    </tr>
                  )))}
          </tbody>
        </table>
        {fees && fees.length === 0 && !loading && <Empty title="Fee schedule not published yet." />}
        <h2 className="font-display font-semibold text-white">Refund policy</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-mist">
          <li>Registration fees are refundable only as stated in the fee disclosure shown at signup.</li>
          <li>Token purchases in SIMULATED pilot move no real funds; lock positions are pilot records only.</li>
          <li>Marketplace payments go directly between members; the platform holds no funds and cannot reverse peer transfers.</li>
          <li>Disputed orders are reviewed case-by-case; completion requires confirmation or manual review.</li>
        </ul>
        <p className="text-sm">
          <Link href="/risk" className="text-gold underline">Read the full risk disclosure →</Link>
        </p>
      </div>
      <RiskStrip compact />
    </div>
  );
}
