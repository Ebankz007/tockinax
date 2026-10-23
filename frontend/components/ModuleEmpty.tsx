import Link from 'next/link';
import { SimBadge } from './Badges';

/** Empty state shown when a backend module is not reachable yet. Never crashes. */
export default function ModuleEmpty({
  title,
  hint = 'The backend module for this section is still deploying. What you see is a simulated pilot preview — no real funds.',
  showRiskLink = true,
}: {
  title: string;
  hint?: string;
  showRiskLink?: boolean;
}) {
  return (
    <div
      className="rounded-lg border border-dashed border-gold/40 bg-brand-500/5 p-6 text-center"
      role="status"
    >
      <p className="flex items-center justify-center gap-2 font-medium text-white">
        {title} <SimBadge />
      </p>
      <p className="mx-auto mt-1 max-w-xl text-sm text-mist">{hint}</p>
      <p className="mt-1 text-xs text-mist">SIMULATED pilot — no real funds</p>
      {showRiskLink && (
        <p className="mt-2 text-sm">
          <Link href="/risk" className="text-gold underline">
            Read the risk disclosure
          </Link>
        </p>
      )}
    </div>
  );
}
