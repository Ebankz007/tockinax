'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import RiskStrip from '@/components/RiskStrip';
import { LiveChip, SimBadge } from '@/components/Badges';
import { fetchModule } from '@/lib/api';

function useModuleStatus(path: string): boolean | null {
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    let on = true;
    fetchModule<unknown>(path).then((r) => {
      if (on) setLive(r.state === 'live');
    });
    return () => {
      on = false;
    };
  }, [path]);
  return live;
}

export default function Home() {
  const tokensLive = useModuleStatus('/tokens/definitions');
  const marketLive = useModuleStatus('/tokenmarket/listings');
  const depositsLive = useModuleStatus('/deposits/mine');

  return (
    <div className="space-y-6">
      <section className="card hero-glow space-y-4">
        <div className="flex items-center gap-3">
          <Logo size={44} showWordmark={false} />
          <p className="badge-sim">
            SIM <span className="font-normal">SIMULATED pilot — no real funds</span>
          </p>
        </div>
        <h1 className="font-display text-4xl font-bold leading-tight text-white">
          Trade. Connect. <span className="text-gold">Grow Globally.</span>
        </h1>
        <p className="max-w-2xl text-mist">
          TOCKINAX pilot tokens: purchase → timed lock → maturity → auto-listing on the
          token market → partial fills → settlement. Every step is simulated — no real funds move.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/tokens" className="btn-primary">
            Buy &amp; lock tokens
          </Link>
          <Link href="/token-market" className="btn-secondary">
            Explore token market
          </Link>
          <Link href="/how-it-works" className="btn-secondary">
            How it works
          </Link>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Live API status">
          <LiveChip live={tokensLive} what="Tokens API" />
          <LiveChip live={marketLive} what="Token market API" />
          <LiveChip live={depositsLive} what="Deposits API" />
        </div>
      </section>

      <RiskStrip />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-label="How TOCKINAX works">
        {[
          ['1. Register & Activate', 'Create your account and activate membership. SIMULATED pilot — no real funds.'],
          ['2. Select Token Lock', 'Lock 7 days (+7%) or 14 days (+14%) — 1%/day, non-compounded. Example: 100 → TARGET 107 / 114. Targets, not guarantees.'],
          ['3. Auto Resale on Market', 'At maturity your position auto-lists at its target price. Multiple buyers can take small portions; you receive USDT per portion bought. Automatic listing is not automatic sale — unsold stays unsold.'],
          ['4. Advance & Earn', 'Build 42 cumulative days (6×7 or 3×14) to advance Stage 1→5 and unlock up to 5 generations. Commissions pay only on verified sales after approval.'],
        ].map(([t, d]) => (
          <div className="card" key={t}>
            <h2 className="font-display font-bold text-white">{t}</h2>
            <p className="mt-1 text-sm text-mist">{d}</p>
          </div>
        ))}
      </section>

      <section className="card space-y-2">
        <h2 className="font-display font-bold text-white">
          Target examples <SimBadge />
        </h2>
        <p className="text-sm text-mist">
          7-day cycle: purchase 100 → <strong className="text-gold">TARGET 107</strong> · 14-day
          cycle: purchase 100 → <strong className="text-gold">TARGET 114</strong>. Simple math on the
          sticker price — not a return, not a promise. Target prices are not guaranteed — sale
          requires a willing buyer; unsold stays unsold.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/tokens" className="text-gold underline">Token cycles →</Link>
          <Link href="/dashboard" className="text-gold underline">Member dashboard →</Link>
          <Link href="/risk" className="text-gold underline">Risk disclosure →</Link>
        </div>
      </section>
    </div>
  );
}
