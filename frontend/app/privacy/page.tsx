export default function PrivacyPage() {
  return (
    <div className="card space-y-3 text-sm">
      <h1 className="text-2xl font-bold">Privacy policy</h1>
      <p>We collect the minimum needed to run a gated marketplace: account details, verification records, listings, orders, evidence references, and support messages.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Referral pages show counts and your direct invites only — no other members&apos; personal data.</li>
        <li>Evidence references are stored for review and dispute handling.</li>
        <li>We never ask for private keys or seed phrases.</li>
        <li>Contact support to request export or deletion, subject to record-keeping duties for completed orders and finance.</li>
      </ul>
    </div>
  );
}
