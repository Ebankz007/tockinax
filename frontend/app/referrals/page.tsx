import Link from 'next/link';
import RiskStrip from '@/components/RiskStrip';

// Approved plan: three referral generations, paid per eligible registration.
const GENERATIONS: [string, string, string][] = [
  ['Generation 1', 'Direct referrer', 'Paid when approved and funded'],
  ['Generation 2', 'Second generation', 'Paid when approved and funded'],
  ['Generation 3', 'Third generation', 'Paid when approved and funded'],
];

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
          never qualify.
        </p>
        <h2 className="font-display font-semibold text-white">Three referral generations</h2>
        <p className="text-sm text-mist">
          Each eligible registration allocates referral rewards across three generations. Deeper
          levels do not qualify.
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
          Registration fee
        </h2>
        <p className="text-sm text-mist">
          The registration fee is $20 USDT. Its internal allocation is configured by
          administrators and is not published to members.
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
