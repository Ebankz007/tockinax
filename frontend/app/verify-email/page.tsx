'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, errMsg } from '@/lib/api';

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setError('');
    try {
      await api.post('/auth/verify-email', { email, token });
      setMsg('Email verified. Complete verification, then login.');
      setTimeout(() => router.push('/login'), 1200);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {msg && <p className="alert-ok" role="status">{msg}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      <div>
        <label className="label" htmlFor="v-email">Email</label>
        <input id="v-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="v-token">Verification token</label>
        <input id="v-token" className="input" required minLength={16} value={token} onChange={(e) => setToken(e.target.value)} placeholder="From your verification email (dev: server log)" />
      </div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Verifying…' : 'Verify email'}</button>
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="mx-auto max-w-md card space-y-3">
      <h1 className="text-2xl font-bold">Verify email</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <VerifyForm />
      </Suspense>
    </div>
  );
}
