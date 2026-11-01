import Link from 'next/link';

/** Empty state shown when a backend module is not reachable yet. Never crashes. */
export default function ModuleEmpty({
  title,
  hint = 'The backend module for this section is still deploying.',
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
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-xl text-sm text-mist">{hint}</p>
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
