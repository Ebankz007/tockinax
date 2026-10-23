export default function AboutPage() {
  return (
    <div className="card space-y-4">
      <h1 className="text-2xl font-bold">About TOCKINAX</h1>
      <p className="text-sm text-slate-600">
        TOCKINAX is a membership-gated peer-to-peer community marketplace. Only verified members can
        list or order, and every order is recorded transparently. We do not hold funds, operate wallets,
        or promise income.
      </p>
      <h2 className="font-semibold">What we do</h2>
      <ul className="list-disc pl-5 text-sm space-y-1">
        <li>Verify members before they can trade or sell.</li>
        <li>Record listings, orders, evidence submissions, and review decisions.</li>
        <li>Pay referral commissions only on verified, completed sales after a confirmation period.</li>
      </ul>
      <h2 className="font-semibold">What we do not do</h2>
      <ul className="list-disc pl-5 text-sm space-y-1">
        <li>Hold buyer funds — orders are recorded, not held, no escrow implied.</li>
        <li>Pay for recruitment or sign-ups — commissions require eligible sales.</li>
        <li>Guarantee earnings, returns, or buyer demand.</li>
        <li>Process crypto/USDT transfers — disabled until provider, network, legal and ops approvals are complete.</li>
      </ul>
      <p className="alert-info">Activity rewards are disabled until budget + funding source + formal approval. They are not returns on deposits.</p>
    </div>
  );
}
