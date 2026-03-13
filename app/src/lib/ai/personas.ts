import { generateJSON } from "./client";

export interface BehavioralFields {
  yearsOfExperience: string;
  workVolume: string;
  techComfort: "low" | "medium" | "high";
  timePressure: "low" | "medium" | "high" | "extreme";
  aiAutonomyTolerance: "low" | "medium" | "high";
  trustThreshold: string;
  willingnessToEdit: string;
  retryWillingness: "low" | "medium" | "high";
  abandonmentTriggers: string[];
  patienceBudget: string;
  archetype: string;
}

export interface GeneratedPersona {
  name: string;
  role: string;
  behavioralFields: BehavioralFields;
  backstory: string;
  successCriteria: string;
}

interface CrawlSummary {
  productName: string;
  purpose: string;
  targetUsers: string[];
  coreWorkflows: string[];
  keyFeatures: string[];
}

export async function generatePersonas(
  crawlSummary: CrawlSummary,
  count: number = 5,
  goals?: string
): Promise<GeneratedPersona[]> {
  const systemPrompt = `You are an expert UX researcher who creates realistic user personas for synthetic testing.

Your personas must be grounded in structured behavioral fields, not narrative bios. Each persona should represent a distinct behavioral archetype that would interact with the product differently.

Key principles:
- Personas should cover a range of tech comfort, patience, and trust levels
- Each persona needs concrete abandonment triggers and a defined patience budget
- Archetypes should include: skeptic, early adopter, overloaded user, reluctant adopter, evaluator, and new/compliant user
- Fields must be specific enough to drive realistic agent behavior

Return valid JSON only.`;

  const userPrompt = `Generate ${count} realistic user personas for testing this product:

Product: ${crawlSummary.productName}
Purpose: ${crawlSummary.purpose}
Target Users: ${crawlSummary.targetUsers.join(", ")}
Core Workflows: ${crawlSummary.coreWorkflows.join(", ")}
Key Features: ${crawlSummary.keyFeatures.join(", ")}
${goals ? `Testing Goals: ${goals}` : ""}

Return a JSON array of ${count} personas, each with this structure:
{
  "name": "First name",
  "role": "Their role/context",
  "behavioralFields": {
    "yearsOfExperience": "e.g. 10 years in the field",
    "workVolume": "e.g. manages 150 items per week",
    "techComfort": "low|medium|high",
    "timePressure": "low|medium|high|extreme",
    "aiAutonomyTolerance": "low|medium|high",
    "trustThreshold": "description of what makes them trust/distrust",
    "willingnessToEdit": "description of editing behavior",
    "retryWillingness": "low|medium|high",
    "abandonmentTriggers": ["trigger 1", "trigger 2"],
    "patienceBudget": "e.g. will try 3 times before giving up",
    "archetype": "skeptic|early_adopter|overloaded|reluctant|evaluator|new_user"
  },
  "backstory": "2-3 sentences of context that explains WHY they behave this way",
  "successCriteria": "What success looks like for this persona in a session"
}`;

  return generateJSON<GeneratedPersona[]>(systemPrompt, userPrompt);
}
