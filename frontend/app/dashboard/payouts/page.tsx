'use client';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, type Payout } from '@/lib/api';

function PayoutsInner() {
  const [items, setItems] = useState<Payout[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('commission');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [destination, setDestination] = useState('');

  async function load() {
    setLoading(true);
    try {
      const d = await api.get<Payout[] | { items?: Payout[] }>('/payouts/mine');
      setItems(Array.isArray(d) ? d : d.items || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    let dest: Record<string, string>;
    try {
      dest = destination ? JSON.parse(destination) : {};
    } catch {
      setError('Destination must be valid JSON (e.g. {"bankAccount":"..."}). Never include private keys.');
      return;
    }
    if (dest.privateKey || dest.seed || dest.mnemonic) {
      setError('Never submit private keys or seed phrases.');
      return;
    }
    try {
      await api.post('/payouts/request', { kind, amount, currency, destination: dest });
      setMsg('Payout request submitted for review.');
      setAmount('');
      setDestination('');
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  if (loading) return <p role="status">Loading payouts…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Payouts</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      <div className="card">
        <h2 className="font-semibold">Request payout</h2>
        <p className="text-xs text-slate-500">Only eligible, confirmed balances (payable commissions/rewards) can be requested. Requests are reviewed before release. Crypto/USDT disabled until approvals.</p>
        <form onSubmit={submit} className="mt-2 grid gap-2 md:grid-cols-2">
          <div><label className="label" htmlFor="p-kind">Kind</label><select id="p-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="commission">commission</option><option value="reward">reward</option></select></div>
          <div><label className="label" htmlFor="p-amount">Amount</label><input id="p-amount" className="input" required pattern="^\d+(\.\d{1,4})?$" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><label className="label" htmlFor="p-cur">Currency</label><select id="p-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>NGN</option></select></div>
          <div><label className="label" htmlFor="p-dest">Destination (JSON)</label><input id="p-dest" className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder='{"bankAccount":"..."}' /></div>
          <div className="md:col-span-2"><button className="btn-primary" type="submit">Submit request</button></div>
        </form>
      </div>
      <div className="card">
        <h2 className="font-semibold">History</h2>
        {items.length === 0 ? <div className="mt-2"><Empty title="No payout requests yet." /></div> : (
          <table className="table mt-2"><thead><tr><th scope="col">Kind</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
          <tbody>{items.map((p) => (<tr key={p.id}><td>{p.kind}</td><td>{p.amount} {p.currency}</td><td>{p.status}</td></tr>))}</tbody></table>
        )}
      </div>
    </div>
  );
}

export default function DashboardPayoutsPage() {
  return (
    <RequireAuth>
      <PayoutsInner />
    </RequireAuth>
  );
}
