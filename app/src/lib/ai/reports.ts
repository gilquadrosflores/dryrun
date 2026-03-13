import { generateText } from "./client";
import type { AIScoreResult } from "./scoring";

interface RuleMetrics {
  deadEndCount: number;
  recoveryCount: number;
  helpSeekingEvents: number;
  confidenceDrops: number;
  timeToFirstActionSeconds: number | null;
  durationSeconds: number | null;
}

export async function generateSessionReport(
  personaName: string,
  personaRole: string,
  missionDescription: string,
  teacherState: string,
  ruleMetrics: RuleMetrics,
  aiScore: AIScoreResult
): Promise<string> {
  const systemPrompt = `You are a UX report writer producing friction reports for product managers and designers. Write in clear, direct prose. Use markdown formatting. Be specific and actionable.`;

  const userPrompt = `Write a friction report for this synthetic user session:

## Session Info
- Persona: ${personaName} (${personaRole})
- Mission: ${missionDescription}
- User State: ${teacherState}
- Task Completion: ${aiScore.taskCompletion}

## Quantitative Metrics
- Dead ends: ${ruleMetrics.deadEndCount}
- Recoveries: ${ruleMetrics.recoveryCount}
- Help-seeking events: ${ruleMetrics.helpSeekingEvents}
- Confidence drops: ${ruleMetrics.confidenceDrops}
- Time to first action: ${ruleMetrics.timeToFirstActionSeconds ? `${ruleMetrics.timeToFirstActionSeconds}s` : "N/A"}
- Session duration: ${ruleMetrics.durationSeconds ? `${ruleMetrics.durationSeconds}s` : "N/A"}

## AI Analysis
${aiScore.qualitativeReview}

## Friction Events
${aiScore.frictionEvents.map((e) => `- [Severity ${e.severity}] Step ${e.step}: ${e.description} (${e.category})`).join("\n")}

## Mental Model Mismatches
${aiScore.mentalModelMismatches.map((m) => `- ${m}`).join("\n")}

## Missing Features
${aiScore.missingFeatures.map((f) => `- ${f}`).join("\n")}

Write a friction report with these sections:
1. **Executive Summary** — 2-3 sentences
2. **Scored Metrics** — formatted table
3. **Critical Friction Points** — ranked by severity with recommendations
4. **Mental Model Mismatches** — what the user expected vs what happened
5. **Missing or Unfindable Features** — features needed but not found
6. **Most Likely Churn Reason** — ${aiScore.mostLikelyChurnReason}
7. **Highest Impact Single Change** — ${aiScore.highestImpactChange}`;

  return generateText(systemPrompt, userPrompt);
}

interface SessionSummary {
  personaName: string;
  personaRole: string;
  missionDescription: string;
  goalAchieved: string;
  abandonmentPoint: string | null;
  durationSeconds: number | null;
  frictionEventCount: number;
  highestSeverity: number;
  churnReason: string;
}

export async function generateRunReport(
  productName: string,
  sessionSummaries: SessionSummary[]
): Promise<string> {
  const systemPrompt = `You are a UX report writer producing aggregate friction reports. Synthesize multiple session results into actionable product insights. Write in clear, direct prose with markdown formatting.`;

  const sessionDetails = sessionSummaries.map((s, i) => `
### Session ${i + 1}: ${s.personaName} (${s.personaRole})
- Mission: ${s.missionDescription}
- Goal Achieved: ${s.goalAchieved}
- Duration: ${s.durationSeconds ? `${s.durationSeconds}s` : "N/A"}
- Abandonment: ${s.abandonmentPoint || "None"}
- Friction Events: ${s.frictionEventCount} (highest severity: ${s.highestSeverity})
- Churn Reason: ${s.churnReason}
`).join("\n");

  const userPrompt = `Write an aggregate friction report for ${productName} based on ${sessionSummaries.length} synthetic user sessions:

${sessionDetails}

Write a report with these sections:
1. **Executive Summary** — Overall product health assessment in 3-4 sentences
2. **Session Results Matrix** — Table showing each persona, goal achievement, duration, and top friction
3. **Common Friction Patterns** — Issues that appeared across multiple sessions
4. **Persona-Specific Insights** — What each user archetype struggled with
5. **Priority Recommendations** — Top 3-5 changes ranked by impact, with effort estimates (low/med/high)
6. **Risk Assessment** — User segments most at risk of churning`;

  return generateText(systemPrompt, userPrompt);
}
