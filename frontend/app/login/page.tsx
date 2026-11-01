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
  const [showLoginPass, setShowLoginPass] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (step === 'credentials') {
        const res = await api.post<{ mfa_required?: boolean; userId?: string | null; email?: string | null; challenge?: string | null; refresh?: string }>('/auth/login', { email, password });
        if (res.refresh && typeof localStorage !== 'undefined') {
          localStorage.setItem('tockinax_refresh_token', res.refresh);
        }
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
              <div className="relative">
                <input id="login-pass" className="input" type={showLoginPass ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-bright focus:outline-none focus:ring-2 focus:ring-bright focus:ring-offset-2"
                  onClick={() => setShowLoginPass(!showLoginPass)}
                  aria-label={showLoginPass ? 'Hide password' : 'Show password'}
                >
                  <svg
                    className="width-5 height-5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M1 12s4-8 12-8 12 8 12 8-4 8-12 8-12-8-12-8Z"
                    />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
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
          No account? <Link href="/register" className="underline">Register</Link>. <Link href="/forgot-password" className="underline text-gold">Forgot password</Link>. Session is set via a secure backend cookie.
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
