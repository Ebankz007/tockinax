'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import RiskStrip from '@/components/RiskStrip';
import { LiveChip, SimBadge } from '@/components/Badges';
import ModuleEmpty from '@/components/ModuleEmpty';
import { fetchModule, listOf, num, type ModuleState, type TokenListing } from '@/lib/api';

function RemainingBar({ total, left }: { total: number; left: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${left} of ${total} remaining`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

const PREVIEW: TokenListing[] = [
  { id: 'sim-1', token_code: 'TKX-7', price: 107, qty_total: 100, qty_remaining: 64, status: 'open' },
  { id: 'sim-2', token_code: 'TKX-14', price: 114, qty_total: 50, qty_remaining: 12, status: 'open' },
];

export default function TokenMarketPage() {
  const [mod, setMod] = useState<ModuleState<unknown>>({ state: 'loading' });
  useEffect(() => {
    fetchModule<unknown>('/tokenmarket/listings').then(setMod);
  }, []);

  const live = mod.state === 'live' ? listOf<TokenListing>(mod.data) : [];
  const rows = live.length > 0 || mod.state === 'live' ? live : PREVIEW;
  const simulated = !(mod.state === 'live' && live.length > 0);

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h1 className="font-display text-2xl font-bold text-white">
          Token market {simulated && <SimBadge />} 
        </h1>
        <p className="text-sm text-mist">
          Matured positions auto-list here at their target price. You don&apos;t have to wait for
          a single buyer to take all your tokens. Multiple buyers can purchase small portions. You
          receive USDT as each portion is bought — but automatic listing is not automatic sale;
          unsold stays unsold. Remaining quantities stay listed with a visible remaining bar.
        </p>
        <LiveChip live={mod.state === 'live' ? true : mod.state === 'loading' ? null : false} what="Token market API" />
        {mod.state === 'loading' && <p role="status">Loading listings…</p>}
        {mod.state === 'deploying' && (
          <ModuleEmpty title="Token market module deploying." hint="Showing a simulated preview of how listings will look. SIMULATED pilot — no real funds." />
        )}
        {mod.state === 'error' && <p className="alert-error" role="alert">{mod.message}</p>}
        {rows.length === 0 && mod.state === 'live' ? (
          <p className="alert-info" role="status">No open listings right now. Matured positions will appear here.</p>
        ) : (
          mod.state !== 'loading' && (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Token</th>
                    <th scope="col">Price</th>
                    <th scope="col">Remaining</th>
                    <th scope="col">Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const total = num(l.qty_total ?? l.quantity);
                    const left = num(l.qty_remaining ?? l.remaining);
                    return (
                      <tr key={l.id}>
                        <td className="text-white">{l.token_code || 'Pilot token'}</td>
                        <td className="text-gold">{String(l.price)}</td>
                        <td className="min-w-[140px]">
                          <RemainingBar total={total || 100} left={left || 0} />
                          <span className="text-xs text-mist">{left || 0} of {total || 100}</span>
                        </td>
                        <td>{l.status || 'open'}</td>
                        <td>
                          <Link href="/dashboard/token-market" className="text-gold underline">
                            {simulated ? 'Preview buy →' : 'Buy →'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
        <p className="text-xs text-mist">
          {simulated
            ? 'Preview rows are simulated placeholders, not real listings.'
            : 'Live listings from the token market API.'}{' '}
          <Link href="/risk" className="text-gold underline">Risk disclosure</Link>
        </p>
      </div>
      <RiskStrip compact />
    </div>
  );
}
