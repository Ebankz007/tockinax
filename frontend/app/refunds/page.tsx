export default function RefundsPage() {
  return (
    <div className="card space-y-3 text-sm">
      <h1 className="text-2xl font-bold">Refund policy</h1>
      <ul className="list-disc pl-5 space-y-1">
        <li>Registration fees: refundable only as stated in the fee disclosure shown at signup.</li>
        <li>Marketplace peer payments: the platform holds no funds and cannot reverse transfers between members.</li>
        <li>Disputed orders are reviewed with evidence from both sides; outcomes are completion or continued dispute — not automatic refunds.</li>
        <li>Confirmed commissions voided by disputes or fraud are removed from eligible balances.</li>
      </ul>
      <p>Orders are recorded, not held — no escrow implied.</p>
    </div>
  );
}
