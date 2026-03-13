import { Stagehand } from "@browserbasehq/stagehand";
import { TraceLogger, type TraceEntry } from "./trace";
import { z } from "zod";
import fs from "fs";
import path from "path";

interface PersonaConfig {
  name: string;
  role: string;
  techComfort: string;
  timePressure: string;
  patienceBudget: string;
  abandonmentTriggers: string[];
  archetype: string;
  aiAutonomyTolerance: string;
  willingnessToEdit: string;
  retryWillingness: string;
}

interface PlanConfig {
  missionDescription: string;
  entryPoint: string;
  teacherState: string;
  steps: string[];
}

interface AgentResult {
  trace: TraceEntry[];
  screenshots: string[];
  goalAchieved: "yes" | "partial" | "no";
  abandonmentPoint: string | null;
  agentNotes: string[];
  durationSeconds: number;
}

const ARCHETYPE_OVERRIDES: Record<string, string> = {
  new_user:
    "Read onboarding tooltips. Follow instructions before improvising. Ask for help after two failed attempts.",
  skeptic:
    "Skip all onboarding text. Go straight to the most obvious action. Abandon after one failure unless the task is almost done.",
  early_adopter:
    "Try non-obvious paths. Click on settings and secondary nav. Explore features adjacent to the current goal.",
  overloaded:
    "Skip everything skippable. Accept defaults. Never read more than one sentence of any message. Abandon if a flow takes more than 5 clicks.",
  reluctant:
    "Read explanatory text carefully. Hover on tooltips. Refuse to proceed if the AI rationale is not visible.",
  evaluator:
    "Test edge cases. Look for team/admin features. Check export and reporting flows even if not part of the mission.",
};

export async function runBrowserAgent(
  persona: PersonaConfig,
  plan: PlanConfig,
  sessionId: string,
  maxSteps: number = 50,
  hardTimeoutSeconds: number = 900
): Promise<AgentResult> {
  const trace = new TraceLogger();
  const screenshots: string[] = [];
  const agentNotes: string[] = [];
  const startTime = Date.now();
  let goalAchieved: "yes" | "partial" | "no" = "no";
  let abandonmentPoint: string | null = null;

  const screenshotDir = path.join(
    process.cwd(),
    "public",
    "screenshots",
    sessionId
  );
  fs.mkdirSync(screenshotDir, { recursive: true });

  let stagehand: Stagehand | null = null;

  const archetypeOverride =
    ARCHETYPE_OVERRIDES[persona.archetype] || "";

  try {
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY!,
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      model: {
        modelName: "gemini-2.0-flash",
        apiKey: process.env.GEMINI_API_KEY!,
      },
      systemPrompt: `You are ${persona.name}. You are not a software tester. You are a real person trying to get a task done during a busy week.

Role: ${persona.role}
Current state: ${plan.teacherState}
Mission: ${plan.missionDescription}

Behavioral rules:
- Do not read onboarding instructions or tooltips unless you are stuck
- Attempt the most visually obvious action first
- If something takes more than 2 clicks to find, try a different path
- If you see an error, try once to recover, then consider stopping
- Do not explore features unrelated to your current goal
- Your patience budget is: ${persona.patienceBudget}
- Your tech comfort level is: ${persona.techComfort}
- Your time pressure is: ${persona.timePressure}

${archetypeOverride ? `Persona-specific behavior:\n${archetypeOverride}` : ""}`,
    });

    await stagehand.init();

    // Navigate to the entry point (ensure it's a valid URL)
    let startUrl = plan.entryPoint;
    if (!startUrl.startsWith("http://") && !startUrl.startsWith("https://")) {
      // Fallback: treat as relative or keyword, use a sensible default
      startUrl = `https://${startUrl}`;
    }
    trace.log({
      action: "navigate",
      target: startUrl,
      result: "starting session",
    });

    await stagehand.act(`Navigate to ${startUrl}`);

    trace.log({
      action: "page_loaded",
      result: "initial page loaded",
      note: "Assessing the page",
    });

    // Agent loop: observe -> decide -> act
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;

    for (let step = 0; step < maxSteps; step++) {
      // Check timeout
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > hardTimeoutSeconds) {
        trace.log({
          action: "timeout",
          result: "hard timeout reached",
          note: `Session time limit exceeded after ${Math.round(elapsed)}s`,
        });
        abandonmentPoint = `Step ${step + 1}: Hard timeout after ${Math.round(elapsed)}s`;
        break;
      }

      try {
        // Observe available actions
        const observations = await stagehand.observe(
          `What actions can I take on this page to accomplish my mission: "${plan.missionDescription}"? I am on step ${step + 1}.`
        );

        if (!observations || observations.length === 0) {
          trace.log({
            action: "observe",
            result: "no actionable elements found",
            note: "Dead end - cannot find anything to interact with",
          });
          agentNotes.push(
            `Step ${step + 1}: Dead end - no actionable elements`
          );
          consecutiveFailures++;

          if (
            consecutiveFailures >= maxConsecutiveFailures ||
            persona.retryWillingness === "low"
          ) {
            abandonmentPoint = `Step ${step + 1}: No actionable elements after ${consecutiveFailures} attempts`;
            trace.log({
              action: "abandon",
              result: "giving up",
              note: "Frustrated - nothing to do here",
            });
            break;
          }
          continue;
        }

        // Select the action based on persona behavior
        const selectedAction = observations[0];
        const actionDescription = selectedAction.description;

        trace.log({
          action: "plan",
          target: actionDescription,
          note: `Deciding to: ${actionDescription}`,
        });

        // Execute the action
        const actResult = await stagehand.act(actionDescription);

        trace.log({
          action: "act",
          target: actionDescription,
          result: actResult.success ? "success" : "failed",
          note: actResult.message || undefined,
        });

        if (actResult.success) {
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          agentNotes.push(
            `Step ${step + 1}: Action failed - ${actResult.message}`
          );

          if (consecutiveFailures >= maxConsecutiveFailures) {
            abandonmentPoint = `Step ${step + 1}: ${maxConsecutiveFailures} consecutive failures`;
            trace.log({
              action: "abandon",
              result: "too many failures",
              note: "Giving up after repeated failures",
            });
            break;
          }
        }

        // Periodically check progress toward goal
        if (step > 0 && step % 5 === 0) {
          try {
            const progressCheck = await stagehand.extract(
              `Has the mission been accomplished? Mission: "${plan.missionDescription}". Rate progress as: GOAL_ACHIEVED (fully done), PARTIAL (some progress), or NOT_YET (not started/minimal progress). Also note any frustrations or confusion.`,
              z.object({
                status: z.string(),
                reason: z.string(),
                frustration: z.string().optional(),
              })
            );

            trace.log({
              action: "progress_check",
              result: progressCheck.status,
              note: progressCheck.reason,
            });

            if (progressCheck.frustration) {
              agentNotes.push(
                `Step ${step + 1}: ${progressCheck.frustration}`
              );
            }

            if (
              progressCheck.status === "GOAL_ACHIEVED" ||
              progressCheck.status?.includes("GOAL")
            ) {
              goalAchieved = "yes";
              trace.log({
                action: "complete",
                result: "goal achieved",
                note: progressCheck.reason,
              });
              break;
            } else if (
              progressCheck.status === "PARTIAL" ||
              progressCheck.status?.includes("PARTIAL")
            ) {
              goalAchieved = "partial";
            }
          } catch {
            // Progress check failed, continue
          }
        }

        // Check abandonment triggers
        for (const trigger of persona.abandonmentTriggers) {
          if (
            actResult.message?.toLowerCase().includes(trigger.toLowerCase())
          ) {
            abandonmentPoint = `Step ${step + 1}: Triggered abandonment - ${trigger}`;
            trace.log({
              action: "abandon",
              result: `triggered: ${trigger}`,
              note: "Hit an abandonment trigger",
            });
            break;
          }
        }
        if (abandonmentPoint) break;
      } catch (stepError) {
        const errorMsg =
          stepError instanceof Error ? stepError.message : String(stepError);
        trace.log({
          action: "error",
          result: errorMsg,
          note: "Something went wrong during this step",
        });
        agentNotes.push(`Step ${step + 1}: Error - ${errorMsg}`);
        consecutiveFailures++;

        if (consecutiveFailures >= maxConsecutiveFailures) {
          abandonmentPoint = `Step ${step + 1}: Too many errors`;
          break;
        }
      }
    }

    // Final extraction to understand end state
    try {
      const finalState = await stagehand.extract(
        `Describe the current page state and what has been accomplished. Mission was: "${plan.missionDescription}"`,
        z.object({
          pageDescription: z.string(),
          accomplishments: z.string(),
          remainingTasks: z.string(),
        })
      );
      agentNotes.push(`Final state: ${finalState.pageDescription}`);
      agentNotes.push(`Accomplished: ${finalState.accomplishments}`);

      if (goalAchieved === "no" && finalState.accomplishments.length > 20) {
        goalAchieved = "partial";
      }
    } catch {
      // Final extraction failed, that's OK
    }
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    trace.log({
      action: "fatal_error",
      result: errorMsg,
      note: "Session crashed",
    });
    agentNotes.push(`Fatal error: ${errorMsg}`);
  } finally {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch {
        // ignore close errors
      }
    }
  }

  const endTime = Date.now();
  const durationSeconds = Math.round((endTime - startTime) / 1000);

  return {
    trace: trace.getEntries(),
    screenshots,
    goalAchieved,
    abandonmentPoint,
    agentNotes,
    durationSeconds,
  };
}
