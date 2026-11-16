/** Stable priority order: work needing attention, then active work, then history. */
export function prioritizeTasks<T extends Record<string, unknown>>(rows: T[]): T[] {
  const rank = (row: T) => {
    if (["waiting_for_approval", "waiting_for_input", "failed", "timed_out"].includes(String(row.status))) return 0;
    if (["running", "queued", "pending"].includes(String(row.status))) return 1;
    if (row.status === "paused") return 2;
    return 3;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b));
}
