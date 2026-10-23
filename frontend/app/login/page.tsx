'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, errMsg } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/login', { email, password });
      router.push('/dashboard');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md card space-y-3">
      <h1 className="text-2xl font-bold">Login</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="login-email">Email</label>
          <input id="login-email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="login-pass">Password</label>
          <input id="login-pass" className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
      </form>
      <p className="text-sm text-slate-600">No account? <Link href="/register" className="underline">Register</Link>. Session is set via a secure backend cookie.</p>
    </div>
  );
}
