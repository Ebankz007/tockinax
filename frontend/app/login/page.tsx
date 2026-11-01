'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, errMsg } from '@/lib/api';

type LoginStep = 'credentials' | 'twofa';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfaUser, setMfaUser] = useState<{ userId: string; email: string; challenge: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (step === 'credentials') {
        const res = await api.post<{ mfa_required?: boolean; userId?: string | null; email?: string | null; challenge?: string | null }>('/auth/login', { email, password });
        if (res.mfa_required && res.userId && res.email && res.challenge) {
          setMfaUser({ userId: res.userId, email: res.email, challenge: res.challenge });
          setStep('twofa');
        } else {
          router.push('/dashboard');
        }
      } else {
        if (!mfaUser) throw new Error('No 2FA session');
        await api.post('/auth/2fa/validate', { userId: mfaUser.userId, token, challenge: mfaUser.challenge });
        router.push('/dashboard');
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md card space-y-3">
      <h1 className="text-2xl font-bold">{step === 'credentials' ? 'Login' : 'Two-factor verification'}</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <form onSubmit={submit} className="space-y-3">
        {step === 'credentials' && (
          <>
            <div>
              <label className="label" htmlFor="login-email">Email</label>
              <input id="login-email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="login-pass">Password</label>
              <input id="login-pass" className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </>
        )}
        {step === 'twofa' && (
          <>
            <p className="text-sm text-mist">
              Enter the 6-digit code from your authenticator app for <strong>{mfaUser?.email}</strong>.
            </p>
            <div>
              <label className="label" htmlFor="login-2fa">Authentication code</label>
              <input id="login-2fa" className="input" type="text" required maxLength={6} pattern="[0-9]*" inputMode="numeric" value={token} onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))} />
            </div>
          </>
        )}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Verifying…' : step === 'credentials' ? 'Login' : 'Verify code'}</button>
      </form>
      {step === 'credentials' && (
        <p className="text-sm text-slate-600">
          No account? <Link href="/register" className="underline">Register</Link>. Session is set via a secure backend cookie.
        </p>
      )}
      {step === 'twofa' && (
        <p className="text-sm text-slate-600">
          Don't have a code? <Link href="/2fa/setup" className="underline">Set up 2FA</Link> (requires login first).
        </p>
      )}
    </div>
  );
}
