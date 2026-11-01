export function LiveChip({ live, what }: { live: boolean | null; what: string }) {
  if (live === null)
    return (
      <span className="badge-disabled" role="status">
        {what}: checking…
      </span>
    );
  return live ? (
    <span className="badge-ok" role="status">
      {what}: Live API
    </span>
  ) : (
    <span className="badge-warn" role="status" title="Backend module not reachable.">
      {what}: module deploying
    </span>
  );
}
