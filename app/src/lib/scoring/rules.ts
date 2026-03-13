interface TraceEntry {
  timestamp: number;
  action: string;
  target?: string;
  result?: string;
  note?: string;
}

export interface RuleBasedMetrics {
  timeToFirstActionSeconds: number | null;
  deadEndCount: number;
  recoveryCount: number;
  helpSeekingEvents: number;
  confidenceDrops: number;
  totalSteps: number;
  durationSeconds: number | null;
}

export function computeRuleBasedMetrics(
  trace: TraceEntry[]
): RuleBasedMetrics {
  if (trace.length === 0) {
    return {
      timeToFirstActionSeconds: null,
      deadEndCount: 0,
      recoveryCount: 0,
      helpSeekingEvents: 0,
      confidenceDrops: 0,
      totalSteps: 0,
      durationSeconds: null,
    };
  }

  const startTime = trace[0].timestamp;
  const endTime = trace[trace.length - 1].timestamp;

  // Time to first meaningful action (skip initial navigation)
  const firstAction = trace.find(
    (t) =>
      t.action !== "navigate" &&
      t.action !== "wait" &&
      t.action !== "observe"
  );
  const timeToFirstAction = firstAction
    ? Math.round((firstAction.timestamp - startTime) / 1000)
    : null;

  // Dead ends: steps where result indicates failure/stuck
  const deadEnds = trace.filter(
    (t) =>
      t.result?.includes("not found") ||
      t.result?.includes("error") ||
      t.result?.includes("failed") ||
      t.result?.includes("stuck") ||
      t.result?.includes("dead end")
  ).length;

  // Recovery: step after a dead end that succeeds
  let recoveries = 0;
  for (let i = 1; i < trace.length; i++) {
    const prev = trace[i - 1];
    const curr = trace[i];
    if (
      (prev.result?.includes("error") || prev.result?.includes("failed")) &&
      curr.result &&
      !curr.result.includes("error") &&
      !curr.result.includes("failed")
    ) {
      recoveries++;
    }
  }

  // Help-seeking: looking for docs, tooltips, help
  const helpSeeking = trace.filter(
    (t) =>
      t.action?.includes("help") ||
      t.action?.includes("tooltip") ||
      t.action?.includes("docs") ||
      t.note?.includes("looking for help") ||
      t.note?.includes("confused")
  ).length;

  // Confidence drops: notes expressing uncertainty or frustration
  const confidenceDrops = trace.filter(
    (t) =>
      t.note?.includes("frustrated") ||
      t.note?.includes("uncertain") ||
      t.note?.includes("confused") ||
      t.note?.includes("unsure") ||
      t.note?.includes("giving up")
  ).length;

  return {
    timeToFirstActionSeconds: timeToFirstAction,
    deadEndCount: deadEnds,
    recoveryCount: recoveries,
    helpSeekingEvents: helpSeeking,
    confidenceDrops,
    totalSteps: trace.length,
    durationSeconds: Math.round((endTime - startTime) / 1000),
  };
}
