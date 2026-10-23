'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, errMsg } from '@/lib/api';

export default function ContactPage() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setError('');
    try {
      await api.post('/support/tickets', { subject, body, email: email || undefined });
      setMsg('Ticket submitted. We reply by email during business hours.');
      setSubject('');
      setBody('');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-2">
        <h1 className="font-display text-2xl font-bold text-white">Contact support</h1>
        <p className="text-sm text-mist">Email: support@tockinax.example · Hours: Mon–Fri, 9:00–17:00 UTC.</p>
        <p className="text-sm text-mist">For order issues include your order number and payment reference (never private keys).</p>
        <p className="alert-info">USDT TRC20 only via Pay2Crypto sandbox until approvals. Never share private keys.</p>
        <p className="text-sm">
          <Link href="/risk" className="text-gold underline">Risk disclosure</Link> ·{' '}
          <Link href="/faq" className="text-gold underline">FAQ</Link>
        </p>
      </div>
      <form className="card space-y-3" onSubmit={submit}>
        <h2 className="font-semibold text-white">Open a support ticket</h2>
        {msg && <p className="alert-ok" role="status">{msg}</p>}
        {error && <p className="alert-error" role="alert">{error}</p>}
        <div>
          <label className="label" htmlFor="c-email">Email (if logged out)</label>
          <input id="c-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <label className="label" htmlFor="c-subject">Subject</label>
          <input id="c-subject" className="input" required value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} />
        </div>
        <div>
          <label className="label" htmlFor="c-body">Message</label>
          <textarea id="c-body" className="input" required rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit ticket'}</button>
      </form>
    </div>
  );
}
