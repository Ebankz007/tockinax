export function SimBadge({ label = 'SIM' }: { label?: string }) {
  return (
    <span className="badge-sim" title="SIMULATED pilot — no real funds">
      {label}
    </span>
  );
}

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
    <span className="badge-warn" role="status" title="Backend module not reachable — showing pilot placeholders.">
      {what}: module deploying <span className="badge-sim ml-1">SIM</span>
    </span>
  );
}
