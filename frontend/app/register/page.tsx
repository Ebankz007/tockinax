'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, errMsg } from '@/lib/api';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const prefill = params.get('ref') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [referralCode, setReferralCode] = useState(prefill);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/register', {
        email,
        password,
        displayName: displayName || undefined,
        referralCode: referralCode ? referralCode.toUpperCase() : undefined,
        acceptTerms: true,
      });
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <p className="alert-error" role="alert">{error}</p>}
      <div className="alert-info">
        Community membership — no investment. Registration fee (if any) is disclosed here and confirmed
        server-side. Commissions pay only on verified sales, never for recruitment.
      </div>
      <div>
        <label className="label" htmlFor="reg-email">Email</label>
        <input id="reg-email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="reg-name">Display name (optional)</label>
        <input id="reg-name" className="input" autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} />
      </div>
      <div>
        <label className="label" htmlFor="reg-pass">Password (min 10 characters)</label>
        <input id="reg-pass" className="input" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="reg-ref">Referral code (optional)</label>
        <input id="reg-ref" className="input" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} maxLength={16} placeholder="ABC12345" />
      </div>
      <div className="flex items-start gap-2 text-sm">
        <input id="reg-terms" type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} required className="mt-1" />
        <label htmlFor="reg-terms">I accept the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy policy</Link>.</label>
      </div>
      <button className="btn-primary w-full" disabled={busy || !acceptTerms}>{busy ? 'Registering…' : 'Register'}</button>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md card space-y-3">
      <h1 className="text-2xl font-bold">Register</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <RegisterForm />
      </Suspense>
      <p className="text-sm text-slate-600">Already registered? <Link href="/verify-email" className="underline">Verify email</Link> or <Link href="/login" className="underline">Login</Link>.</p>
    </div>
  );
}
