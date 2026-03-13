import { generateJSON } from "./client";
import type { BehavioralFields } from "./personas";

export interface ScenarioDimensions {
  mission: string;
  entryPoint: string;
  priorSessionState: string;
  timePressure: string;
  distractionLevel: string;
  errorEncounter: string;
}

export interface GeneratedPlan {
  missionDescription: string;
  entryPoint: string;
  scenarioDimensions: ScenarioDimensions;
  teacherState: string;
  steps: string[];
}

interface PlanGenerationInput {
  productName: string;
  productUrl: string;
  purpose: string;
  coreWorkflows: string[];
  personaName: string;
  personaRole: string;
  behavioralFields: BehavioralFields;
  existingDimensions?: ScenarioDimensions[];
}

export async function generatePlans(
  input: PlanGenerationInput,
  count: number = 2
): Promise<GeneratedPlan[]> {
  const systemPrompt = `You are a UX test planner. You create concrete usage plans for synthetic user testing.

Plans should be concrete missions, not generic product tours. Each plan should:
- Have a specific goal the user is trying to accomplish
- Include a realistic teacher/user state that affects behavior
- Vary across scenario dimensions to avoid repeating the same test
- Be grounded in the persona's behavioral profile

Return valid JSON only.`;

  const userPrompt = `Generate ${count} usage plans for this persona testing this product:

Product: ${input.productName} (${input.productUrl})
Purpose: ${input.purpose}
Core Workflows: ${input.coreWorkflows.join(", ")}

Persona: ${input.personaName}
Role: ${input.personaRole}
Tech Comfort: ${input.behavioralFields.techComfort}
Time Pressure: ${input.behavioralFields.timePressure}
Patience Budget: ${input.behavioralFields.patienceBudget}
Archetype: ${input.behavioralFields.archetype}

${
  input.existingDimensions && input.existingDimensions.length > 0
    ? `Already used scenario combinations (do NOT repeat):\n${JSON.stringify(input.existingDimensions, null, 2)}`
    : ""
}

Return a JSON array of ${count} plans, each with:
{
  "missionDescription": "A concrete task the user is trying to accomplish",
  "entryPoint": "The FULL URL where the user starts. Use '${input.productUrl}' as the base URL. Examples: '${input.productUrl}', '${input.productUrl}/login', '${input.productUrl}/dashboard'",
  "scenarioDimensions": {
    "mission": "brief mission name",
    "entryPoint": "homepage|direct_link|email|referral",
    "priorSessionState": "first_visit|returning_incomplete|returning_with_saved_work",
    "timePressure": "relaxed|moderate|extreme",
    "distractionLevel": "focused|mildly_distracted|frequently_interrupted",
    "errorEncounter": "none|one_recoverable|one_unrecoverable"
  },
  "teacherState": "A situational context sentence, e.g. 'You have 47 essays left and 22 minutes before your prep period ends.'",
  "steps": ["Step 1: Navigate to...", "Step 2: Click on...", "Step 3: ..."]
}

IMPORTANT: The "entryPoint" field at the top level MUST be a full valid URL starting with http:// or https://. Use "${input.productUrl}" as the base.`;

  return generateJSON<GeneratedPlan[]>(systemPrompt, userPrompt);
}
