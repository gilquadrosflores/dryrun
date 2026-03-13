import { generateJSON } from "./client";

export interface AIScoreResult {
  taskCompletion: "yes" | "partial" | "no";
  frictionEvents: FrictionEvent[];
  mentalModelMismatches: string[];
  missingFeatures: string[];
  mostLikelyChurnReason: string;
  highestImpactChange: string;
  qualitativeReview: string;
}

export interface FrictionEvent {
  step: number;
  severity: 1 | 2 | 3 | 4 | 5;
  description: string;
  category: string;
}

interface TraceEntry {
  timestamp: number;
  action: string;
  target?: string;
  result?: string;
  note?: string;
}

export async function scoreSessionWithAI(
  personaName: string,
  personaRole: string,
  missionDescription: string,
  teacherState: string,
  trace: TraceEntry[],
  goalAchieved: string
): Promise<AIScoreResult> {
  const systemPrompt = `You are a UX analysis expert. Given a synthetic user session trace, you produce a structured friction analysis.

Score friction events on severity 1-5:
1 = Minor inconvenience
2 = Noticeable friction, user works around it
3 = Significant friction, user hesitates or struggles
4 = Major friction, user nearly abandons
5 = Critical, user abandons or cannot proceed

Categories for friction events: navigation, comprehension, trust, performance, error_handling, missing_feature, visual_design, workflow_gap

Return valid JSON only.`;

  const userPrompt = `Analyze this synthetic user session:

Persona: ${personaName} (${personaRole})
Mission: ${missionDescription}
User State: ${teacherState}
Goal Achieved: ${goalAchieved}

Action Trace (${trace.length} steps):
${trace
  .map(
    (t, i) =>
      `[${i + 1}] ${t.action}${t.target ? ` → ${t.target}` : ""}${t.result ? ` (${t.result})` : ""}${t.note ? ` // ${t.note}` : ""}`
  )
  .join("\n")}

Return JSON:
{
  "taskCompletion": "yes|partial|no",
  "frictionEvents": [
    {"step": 1, "severity": 3, "description": "...", "category": "navigation"}
  ],
  "mentalModelMismatches": ["description of mismatch"],
  "missingFeatures": ["feature that was needed but not found"],
  "mostLikelyChurnReason": "Why this user would stop using the product",
  "highestImpactChange": "The single change that would help this user most",
  "qualitativeReview": "2-3 paragraph analysis of the session"
}`;

  return generateJSON<AIScoreResult>(systemPrompt, userPrompt);
}
