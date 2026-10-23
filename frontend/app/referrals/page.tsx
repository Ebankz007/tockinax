import Link from 'next/link';
import RiskStrip from '@/components/RiskStrip';
import { SimBadge } from '@/components/Badges';

const GEN_RATES: [string, string][] = [
  ['Generation 1 (direct)', 'Pays on eligible verified sales after approval.'],
  ['Generation 1-2', 'Stage-gated: deeper generations unlock at higher stages.'],
  ['Generation 1-3', 'Stage-gated.'],
  ['Generation 1-4', 'Stage-gated.'],
  ['Generation 1-5', 'Stage-gated: widest depth at the top stage.'],
];

// Approved compensation plan categories (name, generation, rate) — recorded, payouts gated.
const CATEGORIES: [string, string, string][] = [
  ['Direct Customer Acquisition Reward', 'Gen 1', '10%'],
  ['Direct Marketplace Activity Commission', 'Gen 1', '5%'],
  ['Customer Retention Reward', 'Gen 1 & 2', '3%'],
  ['Stage Advancement Recognition', 'Gen 1–3', '4%'],
  ['Second-Generation Marketplace Commission', 'Gen 2', '3%'],
  ['Third-Generation Marketplace Commission', 'Gen 3', '2%'],
  ['Fourth-Generation Marketplace Commission', 'Gen 4', '1.5%'],
  ['Fifth-Generation Marketplace Commission', 'Gen 5', '1%'],
];

export default function ReferralsPage() {
  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h1 className="font-display text-2xl font-bold text-white">
          Referrals <SimBadge />
        </h1>
        <p className="alert-info" role="note">
          Rates below are the approved compensation plan. Commissions pay only on verified sales
          after approval and funding. Registration fees, deposits and member transfers never qualify.
        </p>
        <h2 className="font-display font-semibold text-white">Generation depth by stage</h2>
        <p className="text-sm text-mist">
          Your stage dictates which generations you can earn from. Stage 1 unlocks Gen 1 …
          Stage 5 unlocks all 5. Depth is stage-gated; commissions pay only on verified sales after
          approval and funding.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Depth</th>
              <th scope="col">Eligibility</th>
            </tr>
          </thead>
          <tbody>
            {GEN_RATES.map(([g, s]) => (
              <tr key={g}>
                <td className="text-white">{g}</td>
                <td>{s}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="font-display font-semibold text-white">
          Eight commission categories <span className="badge-disabled ml-1">approved plan — payouts gated</span>
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Generation</th>
              <th scope="col">Rate</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map(([name, gen, rate]) => (
              <tr key={name}>
                <td className="text-white">{name}</td>
                <td>{gen}</td>
                <td className="text-gold">{rate}</td>
                <td><span className="badge-disabled">DISABLED</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-mist">
          All categories ship disabled; they enable only on verified sales after approval and funding.
        </p>
        <h2 className="font-display font-semibold text-white">Anti-fraud rules</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-mist">
          <li>No self-referral: you cannot earn on your own purchases.</li>
          <li>No duplicate or fake accounts to simulate a network.</li>
          <li>Commissions require a completed, confirmed sale plus approval.</li>
          <li>Disputed or reversed sales void the related commission.</li>
          <li>Abuse leads to suspension and forfeiture of pending commissions.</li>
        </ul>
        <p className="text-sm text-mist">
          Your personal referral link appears in your dashboard after login.{' '}
          <Link href="/dashboard/commissions" className="text-gold underline">View my commissions →</Link>
        </p>
      </div>
      <RiskStrip compact />
    </div>
  );
}
