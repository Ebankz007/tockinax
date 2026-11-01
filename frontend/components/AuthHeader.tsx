'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function AuthHeader() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    api.get<{ id: string; email: string; roles: string[] }>('/auth/me')
      .then((d) => { setAuthed(true); setUserRoles(d.roles || []); })
      .catch(() => setAuthed(false));
  }, []);

  const isAdmin = userRoles.includes('super_admin');

  if (authed === null) {
    return (
      <>
        <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-bright transition-colors hover:bg-white/5">
          Log in
        </Link>
        <Link href="/register" className="rounded-lg bg-gold px-3.5 py-1.5 text-sm font-bold text-black transition-colors hover:bg-goldhover">
          Get started
        </Link>
      </>
    );
  }

  if (authed) {
    return (
      <div className="flex items-center gap-2">
        {isAdmin && (
          <Link href="/admin" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gold transition-colors hover:bg-white/5">
            Admin
          </Link>
        )}
        <Link href="/dashboard" className="rounded-lg bg-gold px-3.5 py-1.5 text-sm font-bold text-black transition-colors hover:bg-goldhover">
          Dashboard
        </Link>
        <Link href="/change-password" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-mist transition-colors hover:bg-white/5">
          Change password
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-bright transition-colors hover:bg-white/5">
        Log in
      </Link>
      <Link href="/register" className="rounded-lg bg-gold px-3.5 py-1.5 text-sm font-bold text-black transition-colors hover:bg-goldhover">
        Get started
      </Link>
    </>
  );
}
