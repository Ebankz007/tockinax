import type { Metadata } from 'next';
import Link from 'next/link';
import { Sora, Inter } from 'next/font/google';
import Logo from '@/components/Logo';
import './globals.css';

const display = Sora({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'TOCKINAX — Trade. Connect. Grow Globally.',
  description:
    'TOCKINAX pilot: token purchase → lock → maturity → auto-list → partial fills → settlement. SIMULATED pilot — no real funds.',
};

const NAV: [string, string][] = [
  ['Home', '/'],
  ['How it works', '/how-it-works'],
  ['Tokens', '/tokens'],
  ['Token market', '/token-market'],
  ['Stages', '/stages'],
  ['Marketplace', '/marketplace'],
  ['Fees', '/fees'],
  ['Referrals', '/referrals'],
  ['Rewards', '/rewards'],
  ['Risk', '/risk'],
  ['FAQ', '/faq'],
  ['Contact', '/contact'],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-gold focus:text-black"
        >
          Skip to content
        </a>
        <header className="border-b border-line/10 bg-ink/95 sticky top-0 z-40 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
            <Link href="/" className="mr-4" aria-label="TOCKINAX home">
              <Logo />
            </Link>
            <nav aria-label="Primary" className="flex flex-wrap gap-1 text-sm">
              {NAV.map(([label, href]) => (
                <Link key={href} href={href} className="navlink">
                  {label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex gap-2 text-sm">
              <Link href="/login" className="btn-secondary px-3 py-1.5">
                Login
              </Link>
              <Link href="/register" className="btn-primary px-3 py-1.5">
                Register
              </Link>
              <Link href="/dashboard" className="btn-secondary px-3 py-1.5">
                Dashboard
              </Link>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto min-h-[70vh] max-w-6xl px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-line/10 bg-coal">
          <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 text-sm text-mist">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Logo size={26} />
              <p className="font-display text-white">Digital Value. Global Connection.</p>
            </div>
            <div>
              <p className="font-semibold text-white">Risk disclosure</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>SIMULATED pilot — no real funds</li>
                <li>Target prices are not guaranteed — sale requires a willing buyer; unsold stays unsold</li>
                <li>Approved commission categories pay only on verified sales after approval and funding</li>
                <li>USDT TRC20 only via Pay2Crypto sandbox until approvals. Never share private keys.</li>
                <li>Orders are recorded, not held — no escrow implied. Members pay each other directly via approved methods.</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/risk" className="text-gold underline">Risk disclosure</Link>
              <Link href="/terms" className="underline">Terms</Link>
              <Link href="/privacy" className="underline">Privacy</Link>
              <Link href="/refunds" className="underline">Refunds</Link>
              <Link href="/market-rules" className="underline">Market rules</Link>
              <Link href="/fees" className="underline">Fees</Link>
              <Link href="/faq" className="underline">FAQ</Link>
              <Link href="/admin" className="underline">Admin</Link>
            </div>
            <p className="text-xs">© {new Date().getFullYear()} TOCKINAX pilot. Trade. Connect. Grow Globally.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
