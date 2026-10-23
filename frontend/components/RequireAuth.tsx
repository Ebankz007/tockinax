'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .get('/auth/me')
      .then(() => setOk(true))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/login');
        else setOk(true); // backend down: let page show its own error state
      });
  }, [router]);

  if (ok === null)
    return (
      <main className="mx-auto max-w-3xl p-6" aria-busy="true">
        <p>Checking session…</p>
      </main>
    );
  return <>{children}</>;
}
