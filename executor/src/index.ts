import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";

// ── Types ──────────────────────────────────────────────────────

interface Env {
  DB: D1Database;
  SCREENSHOTS: R2Bucket;
  BROWSER_SESSION_WORKFLOW: Workflow;
  BROWSERBASE_API_KEY: string;
  BROWSERBASE_PROJECT_ID: string;
  GEMINI_API_KEY: string;
  EXECUTOR_SECRET: string;
}

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

interface TraceEntry {
  timestamp: number;
  action: string;
  target?: string;
  result?: string;
  note?: string;
}

interface SessionParams {
  sessionId: string;
  runId: string;
  persona: PersonaConfig;
  plan: PlanConfig;
  maxSteps: number;
  hardTimeoutSeconds: number;
}

interface AgentResult {
  trace: TraceEntry[];
  goalAchieved: "yes" | "partial" | "no";
  abandonmentPoint: string | null;
  agentNotes: string[];
  durationSeconds: number;
  screenshots: string[];
}

interface AIScoreResult {
  taskCompletion: "yes" | "partial" | "no";
  frictionEvents: { step: number; severity: number; description: string; category: string }[];
  mentalModelMismatches: string[];
  missingFeatures: string[];
  mostLikelyChurnReason: string;
  highestImpactChange: string;
  qualitativeReview: string;
}

// ── Stagehand HTTP helpers ─────────────────────────────────────

const STAGEHAND_API_BASE = "https://api.stagehand.browserbase.com/v1";

const ARCHETYPE_OVERRIDES: Record<string, string> = {
  new_user: "Read onboarding tooltips. Follow instructions before improvising. Ask for help after two failed attempts.",
  skeptic: "Skip all onboarding text. Go straight to the most obvious action. Abandon after one failure unless the task is almost done.",
  early_adopter: "Try non-obvious paths. Click on settings and secondary nav. Explore features adjacent to the current goal.",
  overloaded: "Skip everything skippable. Accept defaults. Never read more than one sentence of any message. Abandon if a flow takes more than 5 clicks.",
  reluctant: "Read explanatory text carefully. Hover on tooltips. Refuse to proceed if the AI rationale is not visible.",
  evaluator: "Test edge cases. Look for team/admin features. Check export and reporting flows even if not part of the mission.",
};

async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  timeoutMs?: number
): Promise<{ result: unknown; logs: string[] }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const logs: string[] = [];
  // Per-read timeout: if no data arrives within 2 minutes, the stream is dead
  const readTimeoutMs = Math.min(timeoutMs ?? 120_000, 120_000);

  function readWithTimeout(): Promise<ReadableStreamReadResult<Uint8Array>> {
    return Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reader.cancel();
          reject(new Error(`SSE stream timed out (no data for ${readTimeoutMs / 1000}s)`));
        }, readTimeoutMs)
      ),
    ]);
  }

  const deadline = timeoutMs ? Date.now() + timeoutMs : null;

  while (true) {
    if (deadline && Date.now() > deadline) {
      reader.cancel();
      throw new Error(`SSE stream exceeded total timeout of ${Math.round(timeoutMs! / 1000)}s`);
    }
    const { value, done } = await readWithTimeout();
    if (done && !buffer) break;
    buffer += decoder.decode(value, { stream: !done });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      try {
        const eventData = JSON.parse(part.slice(6));
        if (eventData.type === "log" && eventData.data?.message) {
          const msg = eventData.data.message;
          const text = typeof msg === "string" ? msg : (msg?.message ?? "");
          if (text) logs.push(String(text).slice(0, 300));
        }
        if (eventData.type === "system") {
          if (eventData.data?.status === "error") {
            throw new Error(eventData.data.error || "Stagehand API error");
          }
          if (eventData.data?.status === "finished") {
            return { result: eventData.data.result, logs };
          }
        }
      } catch (e) {
        if (e instanceof Error && !e.message.includes("JSON") && !e.message.includes("parse")) {
          throw e;
        }
      }
    }
    if (done) break;
  }
  return { result: null, logs };
}

// ── Rule-based metrics ─────────────────────────────────────────

function computeRuleBasedMetrics(trace: TraceEntry[]) {
  if (trace.length === 0) {
    return { timeToFirstActionSeconds: null, deadEndCount: 0, recoveryCount: 0, helpSeekingEvents: 0, confidenceDrops: 0, totalSteps: 0, durationSeconds: null };
  }
  const startTime = trace[0].timestamp;
  const endTime = trace[trace.length - 1].timestamp;
  const firstAction = trace.find(t => t.action !== "navigate" && t.action !== "wait" && t.action !== "observe");
  const timeToFirstAction = firstAction ? Math.round((firstAction.timestamp - startTime) / 1000) : null;
  const deadEnds = trace.filter(t => t.result?.includes("not found") || t.result?.includes("error") || t.result?.includes("failed") || t.result?.includes("stuck") || t.result?.includes("dead end")).length;
  let recoveries = 0;
  for (let i = 1; i < trace.length; i++) {
    const prev = trace[i - 1];
    const curr = trace[i];
    if ((prev.result?.includes("error") || prev.result?.includes("failed")) && curr.result && !curr.result.includes("error") && !curr.result.includes("failed")) recoveries++;
  }
  const helpSeeking = trace.filter(t => t.action?.includes("help") || t.action?.includes("tooltip") || t.action?.includes("docs") || t.note?.includes("looking for help") || t.note?.includes("confused")).length;
  const confidenceDrops = trace.filter(t => t.note?.includes("frustrated") || t.note?.includes("uncertain") || t.note?.includes("confused") || t.note?.includes("unsure") || t.note?.includes("giving up")).length;
  return { timeToFirstActionSeconds: timeToFirstAction, deadEndCount: deadEnds, recoveryCount: recoveries, helpSeekingEvents: helpSeeking, confidenceDrops, totalSteps: trace.length, durationSeconds: Math.round((endTime - startTime) / 1000) };
}

// ── Gemini AI helpers ──────────────────────────────────────────

async function geminiJSON<T>(apiKey: string, systemPrompt: string, userPrompt: string): Promise<T> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!resp.ok) throw new Error(`Gemini API error: ${resp.status}`);
  const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]!.trim()) as T;
    const start = text.search(/[{[]/);
    const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
    throw new Error(`Failed to parse Gemini JSON: ${text.slice(0, 200)}`);
  }
}

async function geminiText(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
      }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!resp.ok) throw new Error(`Gemini API error: ${resp.status}`);
  const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ── Workflow ───────────────────────────────────────────────────

export class BrowserSessionWorkflow extends WorkflowEntrypoint<Env, SessionParams> {
  async run(event: WorkflowEvent<SessionParams>, step: WorkflowStep) {
    const { sessionId, runId, persona, plan, maxSteps, hardTimeoutSeconds } = event.payload;
    const bbApiKey = this.env.BROWSERBASE_API_KEY;
    const bbProjectId = this.env.BROWSERBASE_PROJECT_ID;
    const geminiApiKey = this.env.GEMINI_API_KEY;

    // Mark session as running
    await step.do("mark-running", async () => {
      await this.env.DB.prepare("UPDATE sessions SET status = 'running' WHERE id = ?").bind(sessionId).run();
    });

    // Step 1: Start Stagehand session
    const stagehandSession = await step.do("start-stagehand-session", {
      retries: { limit: 10, delay: "30 seconds", backoff: "exponential" },
    }, async () => {
      const archetypeOverride = ARCHETYPE_OVERRIDES[persona.archetype] || "";
      const systemPrompt = `You are ${persona.name}. You are not a software tester — you are a real person trying to complete a task.

Role: ${persona.role}
Current state: ${plan.teacherState}
Mission: ${plan.missionDescription}

Behavioral rules:
- Act as this persona would naturally behave
- Click the most visually prominent actions first
- If you hit a login wall, note it and explore what's visible
- Your patience budget: ${persona.patienceBudget}
- Tech comfort: ${persona.techComfort}
- Time pressure: ${persona.timePressure}
${archetypeOverride ? `\nPersona behavior: ${archetypeOverride}` : ""}`;

      const headers: Record<string, string> = {
        "x-bb-api-key": bbApiKey,
        "x-bb-project-id": bbProjectId,
        "x-stream-response": "true",
        "x-model-api-key": geminiApiKey,
        "x-language": "typescript",
        "x-sdk-version": "3.1.0",
        "Content-Type": "application/json",
      };

      const resp = await fetch(`${STAGEHAND_API_BASE}/sessions/start`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId: bbProjectId,
          modelName: "google/gemini-3-flash-preview",
          systemPrompt,
          browserbaseSessionCreateParams: { projectId: bbProjectId },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Session start failed ${resp.status}: ${errText.slice(0, 200)}`);
      }

      const initData = await resp.json() as { success: boolean; data: { sessionId: string; available: boolean }; message?: string };
      if (!initData.success || !initData.data?.sessionId) {
        throw new Error(`Session start rejected: ${initData.message || "no sessionId"}`);
      }

      console.log(`[workflow] Stagehand session: ${initData.data.sessionId}`);
      return { bbSessionId: initData.data.sessionId };
    });

    const bbSessionId = stagehandSession.bbSessionId;

    const makeHeaders = (): Record<string, string> => ({
      "x-bb-api-key": bbApiKey,
      "x-bb-project-id": bbProjectId,
      "x-bb-session-id": bbSessionId,
      "x-stream-response": "true",
      "x-model-api-key": geminiApiKey,
      "x-language": "typescript",
      "x-sdk-version": "3.1.0",
      "Content-Type": "application/json",
    });

    // Step 2: Navigate to entry point
    await step.do("navigate", {
      retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
    }, async () => {
      let startUrl = plan.entryPoint;
      if (!startUrl.startsWith("http://") && !startUrl.startsWith("https://")) {
        startUrl = plan.productUrl;
      }
      console.log(`[workflow] Navigating to: ${startUrl}`);

      const resp = await fetch(`${STAGEHAND_API_BASE}/sessions/${bbSessionId}/navigate`, {
        method: "POST",
        headers: makeHeaders(),
        body: JSON.stringify({ url: startUrl }),
        signal: AbortSignal.timeout(30000),
      });

      if (!resp.ok) throw new Error(`Navigate failed: ${resp.status}`);
      await parseSSEStream(resp.body!, 30000);
    });

    // Helper: capture screenshot via Stagehand API and upload to R2
    // Wraps the entire operation in a hard timeout to prevent hanging
    const captureScreenshot = async (label: string, index: number): Promise<string | null> => {
      const SCREENSHOT_TIMEOUT = 20_000;
      try {
        return await Promise.race([
          (async (): Promise<string | null> => {
            const controller = new AbortController();
            const resp = await fetch(`${STAGEHAND_API_BASE}/sessions/${bbSessionId}/screenshot`, {
              method: "POST",
              headers: makeHeaders(),
              signal: controller.signal,
            });
            console.log(`[workflow] Screenshot ${label}: status=${resp.status} ct=${resp.headers.get("content-type")}`);
            if (!resp.ok) return null;

            // Read entire response body as text (don't use SSE parsing — avoid hangs)
            const bodyText = await resp.text();
            console.log(`[workflow] Screenshot ${label}: body length=${bodyText.length}, preview=${bodyText.slice(0, 200)}`);

            // Try to extract base64 from any format
            let base64: string | null = null;

            // If body IS the base64 (raw data)
            if (bodyText.startsWith("data:image/") || bodyText.match(/^[A-Za-z0-9+/=]{100,}/)) {
              base64 = bodyText;
            } else {
              // Try parsing SSE events for the result
              const events = bodyText.split("\n\n").filter(p => p.startsWith("data: "));
              for (const evt of events) {
                try {
                  const parsed = JSON.parse(evt.slice(6));
                  if (parsed.type === "system" && parsed.data?.status === "finished") {
                    const result = parsed.data.result;
                    if (typeof result === "string") base64 = result;
                    else if (result?.screenshot) base64 = result.screenshot;
                    else if (result?.data) base64 = result.data;
                    else console.log(`[workflow] Screenshot ${label}: result keys=${Object.keys(result || {}).join(",")}`);
                    break;
                  }
                } catch { /* skip non-JSON lines */ }
              }
              // Try as plain JSON
              if (!base64) {
                try {
                  const json = JSON.parse(bodyText) as Record<string, unknown>;
                  base64 = (json.screenshot || json.data || json.image) as string | null;
                } catch { /* not JSON */ }
              }
            }

            if (!base64) {
              console.log(`[workflow] Screenshot ${label}: could not extract image data`);
              return null;
            }

            const raw = String(base64).replace(/^data:image\/\w+;base64,/, "");
            const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
            const key = `runs/${runId}/sessions/${sessionId}/${String(index).padStart(2, "0")}-${label}.png`;
            await this.env.SCREENSHOTS.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
            console.log(`[workflow] Screenshot uploaded: ${key} (${bytes.length} bytes)`);
            return key;
          })(),
          new Promise<null>((resolve) => {
            setTimeout(() => {
              console.log(`[workflow] Screenshot ${label}: hard timeout after ${SCREENSHOT_TIMEOUT / 1000}s`);
              resolve(null);
            }, SCREENSHOT_TIMEOUT);
          }),
        ]);
      } catch (error) {
        console.log(`[workflow] Screenshot ${label} error:`, error instanceof Error ? error.message : error);
        return null;
      }
    };

    // Step 3: Execute the agent — this is the long-running step (mostly I/O wait)
    // Timeout after hardTimeoutSeconds to prevent hanging indefinitely
    const agentResult = await step.do("execute-agent", async () => {
      const startTime = Date.now();
      const trace: TraceEntry[] = [];
      const agentNotes: string[] = [];
      const screenshots: string[] = [];
      let goalAchieved: "yes" | "partial" | "no" = "no";
      let abandonmentPoint: string | null = null;

      trace.push({ timestamp: Date.now(), action: "session_started", result: bbSessionId, note: "Stagehand API session" });
      trace.push({ timestamp: Date.now(), action: "navigate", target: plan.entryPoint, result: "navigated" });

      // Screenshot 1: initial page after navigation
      const startScreenshot = await captureScreenshot("start", 1);
      if (startScreenshot) screenshots.push(startScreenshot);

      trace.push({ timestamp: Date.now(), action: "agent_start", result: "running", note: plan.missionDescription });

      try {
        const instruction = `Complete this mission as ${persona.name}: ${plan.missionDescription}

Steps to attempt:
${plan.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}

Stop when the goal is achieved or you determine it cannot be completed. Describe what you accomplished.`;

        const timeoutMs = hardTimeoutSeconds * 1000;
        const resp = await fetch(`${STAGEHAND_API_BASE}/sessions/${bbSessionId}/agentExecute`, {
          method: "POST",
          headers: makeHeaders(),
          body: JSON.stringify({
            agentConfig: {
              provider: "google",
              modelName: "gemini-3-flash-preview",
              apiKey: geminiApiKey,
            },
            executeOptions: {
              instruction,
              maxSteps: maxSteps,
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`agentExecute failed ${resp.status}: ${errText.slice(0, 300)}`);
        }

        const { result, logs } = await parseSSEStream(resp.body!, hardTimeoutSeconds * 1000);

        for (const log of logs.slice(0, 30)) {
          trace.push({ timestamp: Date.now(), action: "agent_log", result: log.slice(0, 200) });
        }
        agentNotes.push(...logs.filter((l: string) => l.length > 10).slice(-5));

        const resultObj = result as { success?: boolean; completed?: boolean; output?: string; message?: string } | null;
        if (resultObj?.success || resultObj?.completed) {
          goalAchieved = "yes";
        } else if (logs.length > 3) {
          goalAchieved = "partial";
        }

        const summary = resultObj?.output || resultObj?.message || logs.slice(-2).join("; ");
        if (summary) agentNotes.push(`Agent result: ${String(summary).slice(0, 500)}`);
        trace.push({ timestamp: Date.now(), action: "agent_complete", result: goalAchieved, note: String(summary || "").slice(0, 200) });

        // Screenshot 2: final state after agent execution
        const endScreenshot = await captureScreenshot("end", 2);
        if (endScreenshot) screenshots.push(endScreenshot);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        trace.push({ timestamp: Date.now(), action: "fatal_error", result: errorMsg, note: "Session crashed" });
        agentNotes.push(`Fatal error: ${errorMsg}`);
        abandonmentPoint = errorMsg.slice(0, 200);

        // Screenshot on error: capture the error state
        const errorScreenshot = await captureScreenshot("error", 2);
        if (errorScreenshot) screenshots.push(errorScreenshot);
      }

      return {
        trace,
        goalAchieved,
        abandonmentPoint,
        agentNotes,
        screenshots,
        durationSeconds: Math.round((Date.now() - startTime) / 1000),
      } satisfies AgentResult;
    });

    // Step 4: End Stagehand session
    await step.do("end-stagehand-session", async () => {
      try {
        await fetch(`${STAGEHAND_API_BASE}/sessions/${bbSessionId}/end`, {
          method: "POST",
          headers: makeHeaders(),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        // ignore close errors
      }
    });

    // Step 5: Update D1 session with results
    await step.do("update-session", async () => {
      const now = Math.floor(Date.now() / 1000);
      const status = agentResult.goalAchieved === "no" && agentResult.abandonmentPoint ? "abandoned" : "complete";
      await this.env.DB.prepare(
        "UPDATE sessions SET status = ?, goal_achieved = ?, abandonment_point = ?, duration_seconds = ?, trace = ?, screenshots = ?, agent_notes = ?, completed_at = ? WHERE id = ?"
      ).bind(
        status,
        agentResult.goalAchieved,
        agentResult.abandonmentPoint,
        agentResult.durationSeconds,
        JSON.stringify(agentResult.trace),
        JSON.stringify(agentResult.screenshots),
        JSON.stringify(agentResult.agentNotes),
        now,
        sessionId,
      ).run();
    });

    // Step 6: AI scoring
    const aiScore = await step.do("ai-scoring", {
      retries: { limit: 2, delay: "5 seconds", backoff: "linear" },
    }, async () => {
      try {
        const systemPrompt = `You are a UX analysis expert. Given a synthetic user session trace, produce a structured friction analysis.

Score friction events on severity 1-5:
1 = Minor inconvenience
2 = Noticeable friction, user works around it
3 = Significant friction, user hesitates or struggles
4 = Major friction, user nearly abandons
5 = Critical, user abandons or cannot proceed

Categories: navigation, comprehension, trust, performance, error_handling, missing_feature, visual_design, workflow_gap

Return valid JSON only.`;

        const userPrompt = `Analyze this synthetic user session:

Persona: ${persona.name} (${persona.role})
Mission: ${plan.missionDescription}
User State: ${plan.teacherState}
Goal Achieved: ${agentResult.goalAchieved}

Action Trace (${agentResult.trace.length} steps):
${agentResult.trace.map((t: TraceEntry, i: number) => `[${i + 1}] ${t.action}${t.target ? ` → ${t.target}` : ""}${t.result ? ` (${t.result})` : ""}${t.note ? ` // ${t.note}` : ""}`).join("\n")}

Return JSON:
{
  "taskCompletion": "yes|partial|no",
  "frictionEvents": [{"step": 1, "severity": 3, "description": "...", "category": "navigation"}],
  "mentalModelMismatches": ["description"],
  "missingFeatures": ["feature"],
  "mostLikelyChurnReason": "...",
  "highestImpactChange": "...",
  "qualitativeReview": "2-3 paragraph analysis"
}`;

        return await geminiJSON<AIScoreResult>(geminiApiKey, systemPrompt, userPrompt);
      } catch (error) {
        console.error("[workflow] AI scoring failed:", error);
        return null;
      }
    });

    // Step 7: Insert score + generate report
    await step.do("insert-score-and-report", {
      retries: { limit: 2, delay: "3 seconds", backoff: "linear" },
    }, async () => {
      const now = Math.floor(Date.now() / 1000);
      const metrics = computeRuleBasedMetrics(agentResult.trace);
      const scoreId = crypto.randomUUID();

      await this.env.DB.prepare(
        "INSERT INTO scores (id, session_id, task_completion, time_to_first_action_seconds, dead_end_count, recovery_count, help_seeking_events, confidence_drops, friction_events, ai_review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        scoreId,
        sessionId,
        aiScore?.taskCompletion ?? agentResult.goalAchieved,
        metrics.timeToFirstActionSeconds ?? null,
        metrics.deadEndCount ?? 0,
        metrics.recoveryCount ?? 0,
        metrics.helpSeekingEvents ?? 0,
        metrics.confidenceDrops ?? 0,
        aiScore?.frictionEvents ? JSON.stringify(aiScore.frictionEvents) : null,
        aiScore?.qualitativeReview ?? null,
        now,
      ).run();

      // Generate report if scoring succeeded
      if (aiScore) {
        try {
          const systemPrompt = `You are a UX report writer producing friction reports for product managers and designers. Write in clear, direct prose. Use markdown formatting. Be specific and actionable.`;
          const userPrompt = `Write a friction report for this synthetic user session:

## Session Info
- Persona: ${persona.name} (${persona.role})
- Mission: ${plan.missionDescription}
- User State: ${plan.teacherState}
- Task Completion: ${aiScore.taskCompletion}

## Quantitative Metrics
- Dead ends: ${metrics.deadEndCount}
- Recoveries: ${metrics.recoveryCount}
- Help-seeking events: ${metrics.helpSeekingEvents}
- Confidence drops: ${metrics.confidenceDrops}
- Time to first action: ${metrics.timeToFirstActionSeconds ? `${metrics.timeToFirstActionSeconds}s` : "N/A"}
- Session duration: ${metrics.durationSeconds ? `${metrics.durationSeconds}s` : "N/A"}

## AI Analysis
${aiScore.qualitativeReview}

## Friction Events
${aiScore.frictionEvents.map(e => `- [Severity ${e.severity}] Step ${e.step}: ${e.description} (${e.category})`).join("\n")}

## Mental Model Mismatches
${aiScore.mentalModelMismatches.map(m => `- ${m}`).join("\n")}

## Missing Features
${aiScore.missingFeatures.map(f => `- ${f}`).join("\n")}

Write a friction report with these sections:
1. **Executive Summary** — 2-3 sentences
2. **Scored Metrics** — formatted table
3. **Critical Friction Points** — ranked by severity with recommendations
4. **Mental Model Mismatches** — expected vs actual
5. **Missing or Unfindable Features**
6. **Most Likely Churn Reason** — ${aiScore.mostLikelyChurnReason}
7. **Highest Impact Single Change** — ${aiScore.highestImpactChange}`;

          const reportContent = await geminiText(geminiApiKey, systemPrompt, userPrompt);
          const reportId = crypto.randomUUID();
          await this.env.DB.prepare(
            "INSERT INTO reports (id, session_id, type, content, created_at) VALUES (?, ?, ?, ?, ?)"
          ).bind(reportId, sessionId, "session", reportContent, now).run();
        } catch (error) {
          console.error("[workflow] Report generation failed:", error);
        }
      }
    });

    // Step 8: Check if all sessions in the run are done
    await step.do("check-run-complete", async () => {
      const result = await this.env.DB.prepare(
        "SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('complete', 'abandoned', 'failed') THEN 1 ELSE 0 END) as done FROM sessions WHERE run_id = ?"
      ).bind(runId).first<{ total: number; done: number }>();

      if (result && result.total > 0 && result.done >= result.total) {
        const now = Math.floor(Date.now() / 1000);
        await this.env.DB.prepare(
          "UPDATE runs SET status = 'complete', completed_at = ? WHERE id = ?"
        ).bind(now, runId).run();
        console.log(`[workflow] Run ${runId} complete`);
      }
    });

    return { sessionId, goalAchieved: agentResult.goalAchieved };
  }
}

// ── Fetch handler (trigger endpoint) ───────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response("ok");
    }

    // Trigger a session workflow
    if (url.pathname === "/execute" && request.method === "POST") {
      const secret = request.headers.get("x-executor-secret");
      if (secret !== env.EXECUTOR_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const body = await request.json() as SessionParams;
      if (!body.sessionId || !body.runId || !body.persona || !body.plan) {
        return Response.json({ error: "Missing required fields" }, { status: 400 });
      }

      const instance = await env.BROWSER_SESSION_WORKFLOW.create({
        id: `session-${body.sessionId}`,
        params: body,
      });

      return Response.json({ accepted: true, instanceId: instance.id, sessionId: body.sessionId });
    }

    // Get workflow instance status
    if (url.pathname.startsWith("/status/") && request.method === "GET") {
      const instanceId = url.pathname.slice("/status/".length);
      try {
        const instance = await env.BROWSER_SESSION_WORKFLOW.get(instanceId);
        const status = await instance.status();
        return Response.json(status);
      } catch {
        return Response.json({ error: "Instance not found" }, { status: 404 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
