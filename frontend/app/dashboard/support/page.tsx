'use client';
import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import Empty from '@/components/Empty';
import { api, errMsg, type Ticket } from '@/lib/api';

function SupportInner() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [open, setOpen] = useState<Ticket | null>(null);

  async function load() {
    setLoading(true);
    try {
      const d = await api.get<Ticket[] | { items?: Ticket[] }>('/support/tickets');
      setTickets(Array.isArray(d) ? d : d.items || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api.post('/support/tickets', { subject, body });
      setMsg('Ticket created.');
      setSubject('');
      setBody('');
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function view(id: string) {
    try {
      const t = await api.get<Ticket>(`/support/tickets/${id}`);
      setOpen(t);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  if (loading) return <p role="status">Loading support tickets…</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Support</h1>
        {error && <p className="alert-error" role="alert">{error}</p>}
        {msg && <p className="alert-ok" role="status">{msg}</p>}
        <form className="card space-y-2" onSubmit={create}>
          <h2 className="font-semibold">New ticket</h2>
          <div><label className="label" htmlFor="s-sub">Subject</label><input id="s-sub" className="input" required value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} /></div>
          <div><label className="label" htmlFor="s-body">Message</label><textarea id="s-body" className="input" required rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} /></div>
          <button className="btn-primary" type="submit">Open ticket</button>
        </form>
        <div className="card">
          <h2 className="font-semibold">My tickets</h2>
          {tickets.length === 0 ? <div className="mt-2"><Empty title="No tickets yet." /></div> : (
            <ul className="mt-2 space-y-1 text-sm">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button className="underline" onClick={() => void view(t.id)}>{t.subject}</button>
                  <span className="ml-2 text-xs text-slate-500">{t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="card">
        <h2 className="font-semibold">Thread</h2>
        {!open ? <div className="mt-2"><Empty title="Select a ticket to view the thread." /></div> : (
          <div className="mt-2 space-y-2 text-sm">
            <p className="font-semibold">{open.subject} <span className="badge-disabled">{open.status}</span></p>
            {(open.messages || []).map((m, i) => (
              <div key={i} className="rounded border border-slate-200 p-2">
                <p className="text-xs text-slate-500">{m.author || 'staff'} · {m.created_at || ''}</p>
                <p>{m.body}</p>
              </div>
            ))}
            {(open.messages || []).length === 0 && <p className="text-slate-500">No messages yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardSupportPage() {
  return (
    <RequireAuth>
      <SupportInner />
    </RequireAuth>
  );
}
