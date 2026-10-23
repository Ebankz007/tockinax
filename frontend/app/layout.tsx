import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import Logo from '@/components/Logo';
import './globals.css';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'TOCKINAX — Trade. Connect. Grow Globally.',
  description:
    'TOCKINAX pilot: token purchase → timed lock → maturity → auto-list → partial fills → settlement. SIMULATED pilot — no real funds.',
};

const PRIMARY_NAV: [string, string][] = [
  ['How it works', '/how-it-works'],
  ['Tokens', '/tokens'],
  ['Token market', '/token-market'],
  ['Stages', '/stages'],
  ['Marketplace', '/marketplace'],
  ['Fees', '/fees'],
];

const FOOTER_NAV: [string, string][] = [
  ['How it works', '/how-it-works'],
  ['Tokens', '/tokens'],
  ['Token market', '/token-market'],
  ['Stages', '/stages'],
  ['Marketplace', '/marketplace'],
  ['Referrals', '/referrals'],
  ['Rewards', '/rewards'],
  ['Fees', '/fees'],
  ['Risk', '/risk'],
  ['Market rules', '/market-rules'],
  ['FAQ', '/faq'],
  ['Contact', '/contact'],
  ['Terms', '/terms'],
  ['Privacy', '/privacy'],
  ['Refunds', '/refunds'],
  ['Admin', '/admin'],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="bg-ink text-bright antialiased font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-gold focus:text-black"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-edge/70 bg-ink/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="shrink-0" aria-label="TOCKINAX home">
              <Logo size={30} />
            </Link>

            <span className="hidden rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gold sm:inline">
              SIMULATED PILOT
            </span>

            <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 md:flex">
              {PRIMARY_NAV.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-mist transition-colors hover:bg-white/5 hover:text-bright"
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-bright transition-colors hover:bg-white/5"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-gold px-3.5 py-1.5 text-sm font-bold text-black transition-colors hover:bg-goldhover"
              >
                Get started
              </Link>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto min-h-[70vh] w-full max-w-6xl px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-edge/70 bg-coal">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-sm space-y-2">
                <Logo size={28} />
                <p className="text-xs font-medium tracking-wide text-mist">
                  Digital Value. Global Connection.
                </p>
              </div>
              <nav aria-label="Footer" className="grid max-w-lg grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
                {FOOTER_NAV.map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    className="text-mist transition-colors hover:text-bright"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="mt-8 rounded-xl border border-gold/25 bg-gold/[0.04] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gold">
                Risk disclosure
              </p>
              <ul className="mt-2 grid gap-1 text-xs leading-relaxed text-mist sm:grid-cols-2">
                <li>SIMULATED pilot — no real funds move.</li>
                <li>Target prices are not guaranteed — a sale requires a willing buyer; unsold stays unsold.</li>
                <li>Commission categories pay only on verified sales, after approval and funding.</li>
                <li>USDT TRC-20 only, via the Pay2Crypto sandbox until approvals. Never share private keys.</li>
                <li>Orders are recorded, not held — no escrow is implied.</li>
                <li>
                  Read the{' '}
                  <Link href="/risk" className="text-gold underline">
                    full risk disclosure
                  </Link>
                  .
                </li>
              </ul>
            </div>

            <p className="mt-6 text-xs text-mist">
              © {new Date().getFullYear()} TOCKINAX · MMITPS INC. All rights reserved.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
