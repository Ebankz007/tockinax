export default function MarketRulesPage() {
  return (
    <div className="card space-y-3 text-sm">
      <h1 className="text-2xl font-bold">Market rules</h1>
      <ul className="list-disc pl-5 space-y-1">
        <li>List only items you can deliver; describe condition, delivery terms, and timelines honestly.</li>
        <li>Prohibited: illegal goods, counterfeits, financial-return promises, recruitment-based offers, and key/seed-phrase requests.</li>
        <li>New listings require admin approval; rule-breaking listings are suspended or removed.</li>
        <li>Buyers: pay sellers directly via approved methods only. Crypto/USDT is disabled until approvals.</li>
        <li>Evidence submissions must be truthful references; falsified evidence leads to suspension.</li>
        <li>Commissions pay only on verified sales, never for recruitment. No self-dealing.</li>
      </ul>
    </div>
  );
}
