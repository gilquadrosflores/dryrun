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
  productUrl: string;
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

// Fallback actions to try when observe() returns nothing
const FALLBACK_ACTIONS = [
  "Look for and click a 'Sign In', 'Log In', or 'Get Started' button",
  "Look for and click any prominent button or call-to-action on the page",
  "Scroll down to find more content or interactive elements",
  "Look for a navigation menu, hamburger icon, or header links and click one",
  "Look for any link or button that relates to the main functionality of this product",
];

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
        modelName: "google/gemini-2.0-flash",
        apiKey: process.env.GEMINI_API_KEY!,
      },
      systemPrompt: `You are ${persona.name}. You are not a software tester. You are a real person trying to get a task done during a busy week.

Role: ${persona.role}
Current state: ${plan.teacherState}
Mission: ${plan.missionDescription}

Behavioral rules:
- Look for buttons, links, and interactive elements on the page
- If you see a login/signup page, note it as a blocker but try to explore what's visible
- Click on the most visually prominent action first (large buttons, CTAs)
- If something takes more than 2 clicks to find, try a different path
- If you see an error, try once to recover, then consider stopping
- Your patience budget is: ${persona.patienceBudget}
- Your tech comfort level is: ${persona.techComfort}
- Your time pressure is: ${persona.timePressure}

${archetypeOverride ? `Persona-specific behavior:\n${archetypeOverride}` : ""}`,
    });

    await stagehand.init();

    // Navigate to the entry point (ensure it's a valid URL)
    let startUrl = plan.entryPoint;
    if (!startUrl.startsWith("http://") && !startUrl.startsWith("https://")) {
      startUrl = plan.productUrl;
    }
    trace.log({
      action: "navigate",
      target: startUrl,
      result: "starting session",
    });

    // Use page.goto() for actual URL navigation (act() only handles DOM interactions)
    const page = stagehand.context.pages()[0];
    await page.goto(startUrl, { waitUntil: "load" });

    // Give the page time to render (SPAs often need this)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    trace.log({
      action: "page_loaded",
      result: "initial page loaded",
      note: "Assessing the page",
    });

    // First, try to understand what's on the page
    let pageContext = "";
    try {
      const pageState = await stagehand.extract(
        "Describe what you see on this page. What is the main content? Are there buttons, links, forms, or navigation? Is there a login/signup form? What can a user do here?",
        z.object({
          description: z.string(),
          hasLogin: z.boolean(),
          hasButtons: z.boolean(),
          mainActions: z.array(z.string()),
        })
      );
      pageContext = pageState.description;
      trace.log({
        action: "page_analysis",
        result: pageState.hasLogin ? "login page detected" : "content page",
        note: pageState.description,
      });
      if (pageState.mainActions.length > 0) {
        agentNotes.push(`Available actions: ${pageState.mainActions.join(", ")}`);
      }
      if (pageState.hasLogin) {
        agentNotes.push("Login/signup form detected — authentication required");
      }
    } catch {
      // Page analysis failed, continue
    }

    // Agent loop: observe -> decide -> act, with fallback strategies
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 5; // more patient
    let fallbackIndex = 0;
    let hasActedSuccessfully = false;

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
          `I am trying to: "${plan.missionDescription}". What interactive elements (buttons, links, form fields, navigation items) can I see and click on this page? List ALL clickable elements, not just ones related to the mission.`
        );

        if (observations && observations.length > 0) {
          // We found something — pick the best action
          const selectedAction = observations[0];
          const actionDescription = selectedAction.description;

          trace.log({
            action: "observe",
            result: `found ${observations.length} element(s)`,
            note: observations.map((o) => o.description).join(" | "),
          });

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
            hasActedSuccessfully = true;
            fallbackIndex = 0; // reset fallbacks
            // Wait for page transition
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } else {
            consecutiveFailures++;
            agentNotes.push(
              `Step ${step + 1}: Action failed - ${actResult.message}`
            );
          }
        } else {
          // Observe returned nothing — try fallback direct actions
          trace.log({
            action: "observe",
            result: "no elements found by observe",
            note: "Trying fallback action strategy",
          });

          if (fallbackIndex < FALLBACK_ACTIONS.length) {
            const fallbackAction = FALLBACK_ACTIONS[fallbackIndex];
            trace.log({
              action: "fallback",
              target: fallbackAction,
              note: `Attempting fallback ${fallbackIndex + 1}/${FALLBACK_ACTIONS.length}`,
            });

            try {
              const actResult = await stagehand.act(fallbackAction);
              trace.log({
                action: "act",
                target: fallbackAction,
                result: actResult.success ? "success" : "failed",
                note: actResult.message || undefined,
              });

              if (actResult.success) {
                consecutiveFailures = 0;
                hasActedSuccessfully = true;
                await new Promise((resolve) => setTimeout(resolve, 1500));
              } else {
                consecutiveFailures++;
              }
            } catch {
              consecutiveFailures++;
            }
            fallbackIndex++;
          } else {
            // All fallbacks exhausted
            consecutiveFailures++;
            agentNotes.push(
              `Step ${step + 1}: Dead end - no elements found, all fallbacks tried`
            );
          }

          // Check if we should give up
          const patienceLimit =
            persona.retryWillingness === "low" ? 3 :
            persona.retryWillingness === "high" ? maxConsecutiveFailures : 4;

          if (consecutiveFailures >= patienceLimit) {
            abandonmentPoint = `Step ${step + 1}: No actionable elements after ${consecutiveFailures} attempts`;
            trace.log({
              action: "abandon",
              result: "giving up",
              note: hasActedSuccessfully
                ? "Was making progress but hit a wall"
                : "Could not find anything to interact with from the start",
            });
            break;
          }
          continue;
        }

        // After a successful action, check if we should give up on the overall goal
        if (consecutiveFailures >= maxConsecutiveFailures) {
          abandonmentPoint = `Step ${step + 1}: ${maxConsecutiveFailures} consecutive failures`;
          trace.log({
            action: "abandon",
            result: "too many failures",
            note: "Giving up after repeated failures",
          });
          break;
        }

        // Periodically check progress toward goal (every 3 steps instead of 5)
        if (step > 0 && step % 3 === 0) {
          try {
            const progressCheck = await stagehand.extract(
              `Has the mission been accomplished? Mission: "${plan.missionDescription}".
               Rate progress: GOAL_ACHIEVED (fully done), PARTIAL (some progress made), NOT_YET (barely started).
               Note any blockers like login walls, errors, or missing features.`,
              z.object({
                status: z.string(),
                reason: z.string(),
                frustration: z.string().optional(),
                blockers: z.array(z.string()).optional(),
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
            if (progressCheck.blockers && progressCheck.blockers.length > 0) {
              agentNotes.push(
                `Step ${step + 1}: Blockers: ${progressCheck.blockers.join(", ")}`
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
          const lastTraceEntry = trace.getEntries().slice(-1)[0];
          const lastNote = lastTraceEntry?.note || "";
          const lastResult = lastTraceEntry?.result || "";
          if (
            lastNote.toLowerCase().includes(trigger.toLowerCase()) ||
            lastResult.toLowerCase().includes(trigger.toLowerCase())
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
        `Describe the current page state and what has been accomplished. Mission was: "${plan.missionDescription}". What page are we on? What content is visible?`,
        z.object({
          pageDescription: z.string(),
          currentUrl: z.string().optional(),
          accomplishments: z.string(),
          remainingTasks: z.string(),
        })
      );
      agentNotes.push(`Final state: ${finalState.pageDescription}`);
      agentNotes.push(`Accomplished: ${finalState.accomplishments}`);
      if (finalState.currentUrl) {
        agentNotes.push(`Final URL: ${finalState.currentUrl}`);
      }

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
