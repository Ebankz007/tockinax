import Link from 'next/link';
import RiskStrip from '@/components/RiskStrip';
import { REFERRAL_REWARDS, REGISTRATION_SPLIT } from '@/lib/plan';

// Approved plan: three referral generations, paid per eligible $20 registration.
const GENERATIONS: [string, string, string][] = REFERRAL_REWARDS.map((r) => [
  `Generation ${r.generation}`,
  r.name,
  `$${r.amountUsdt}`,
]);

export default function ReferralsPage() {
  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h1 className="font-display text-2xl font-bold text-white">
          Referrals
        </h1>
        <p className="alert-info" role="note">
          The approved plan has three referral generations. Rewards are recorded but not active
          until separately approved and funded. Registration fees, deposits and member transfers
          never qualify beyond the published registration split.
        </p>
        <h2 className="font-display font-semibold text-white">Three referral generations</h2>
        <p className="text-sm text-mist">
          Each eligible $20 registration allocates $5 to the direct referrer, $2 to the second
          generation and $1 to the third generation. Deeper levels do not qualify.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Generation</th>
              <th scope="col">Who qualifies</th>
              <th scope="col">Reward</th>
            </tr>
          </thead>
          <tbody>
            {GENERATIONS.map(([g, who, reward]) => (
              <tr key={g}>
                <td className="text-white">{g}</td>
                <td>{who}</td>
                <td className="text-gold">{reward}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="font-display font-semibold text-white">
          $20 registration allocation
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Allocation</th>
              <th scope="col">Purpose</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {REGISTRATION_SPLIT.map((r) => (
              <tr key={r.key}>
                <td className="text-white">{r.label}</td>
                <td>{r.purpose}</td>
                <td className="text-gold">${r.amountUsdt}</td>
              </tr>
            ))}
            <tr>
              <td className="font-bold text-white">Total</td>
              <td>Registration fee</td>
              <td className="font-bold text-gold">$20</td>
            </tr>
          </tbody>
        </table>
        <p className="text-sm text-mist">
          The $2 leadership allocation is distributed under the published leadership rules. All
          referral rewards ship disabled; they enable only after approval and funding.
        </p>

        <h2 className="font-display font-semibold text-white">Anti-fraud rules</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-mist">
          <li>No self-referral: you cannot earn on your own registration or purchases.</li>
          <li>No duplicate or fake accounts to inflate a network.</li>
          <li>Rewards require an eligible, confirmed registration plus approval.</li>
          <li>Disputed, reversed or refunded registrations void the related reward.</li>
          <li>Abuse leads to suspension and forfeiture of pending rewards.</li>
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
