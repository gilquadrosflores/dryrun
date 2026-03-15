import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";

// ── Types ──────────────────────────────────────────────────────

interface Env {
  DB: D1Database;
  SCREENSHOTS: R2Bucket;
  BROWSER_SESSION_WORKFLOW: Workflow;
  BROWSERBASE_API_KEY: string;
  BROWSERBASE_PROJECT_ID: string;
  ANTHROPIC_API_KEY: string;
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
  pageUrl?: string;
  durationMs?: number;
}

interface StagehandAction {
  type: string;
  reasoning?: string;
  taskCompleted?: boolean;
  action?: string;
  timeMs?: number;
  pageText?: string;
  pageUrl?: string;
  instruction?: string;
  variant?: string;
  result?: string;
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
  replayUrl: string;
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

// ── Constants ──────────────────────────────────────────────────

const STAGEHAND_API_BASE = "https://api.stagehand.browserbase.com/v1";

const ARCHETYPE_OVERRIDES: Record<string, string> = {
  new_user: "Read onboarding tooltips. Follow instructions before improvising. Ask for help after two failed attempts.",
  skeptic: "Skip all onboarding text. Go straight to the most obvious action. Abandon after one failure unless the task is almost done.",
  early_adopter: "Try non-obvious paths. Click on settings and secondary nav. Explore features adjacent to the current goal.",
  overloaded: "Skip everything skippable. Accept defaults. Never read more than one sentence of any message. Abandon if a flow takes more than 5 clicks.",
  reluctant: "Read explanatory text carefully. Hover on tooltips. Refuse to proceed if the AI rationale is not visible.",
  evaluator: "Test edge cases. Look for team/admin features. Check export and reporting flows even if not part of the mission.",
};

// Map Stagehand tool names → human-readable action names
const ACTION_TYPE_MAP: Record<string, string> = {
  goto: "navigate",
  act: "click",
  fillForm: "fill_form",
  fillFormVision: "fill_form",
  scroll: "scroll",
  extract: "read_page",
  keys: "keyboard",
  navback: "go_back",
  screenshot: "screenshot",
  wait: "wait",
  search: "search",
  click: "click",
  type: "type",
  dragAndDrop: "drag",
  clickAndHold: "long_press",
};

// Stagehand internal tools that produce noise — skip in trace
const SKIP_ACTIONS = new Set(["ariaTree", "think", "screenshot"]);

// ── SSE Stream Parser (for agentExecute only) ─────────────────

/**
 * Parse SSE stream from Stagehand agentExecute.
 * Uses a very long per-read timeout (10 min) since agent steps can take
 * a while between SSE events. The streaming connection is essential to
 * prevent Cloudflare 524 gateway timeouts on long-running requests.
 */
async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  totalTimeoutMs: number,
): Promise<{ result: unknown; logs: string[] }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const logs: string[] = [];
  // 10 min per-read timeout — agent steps can take 30-60s each
  const readTimeoutMs = 600_000;

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

  const deadline = Date.now() + totalTimeoutMs;

  while (true) {
    if (Date.now() > deadline) {
      reader.cancel();
      throw new Error(`SSE stream exceeded total timeout of ${Math.round(totalTimeoutMs / 1000)}s`);
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

// ── Stagehand API helpers ──────────────────────────────────────

/**
 * Call a Stagehand endpoint with non-streaming JSON response.
 * Used for quick operations: navigate, act, session start/end.
 */
async function stagehandFetch(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number = 60_000,
): Promise<unknown> {
  const nonStreamHeaders = {
    ...headers,
    "x-stream-response": "false",
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: nonStreamHeaders,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Stagehand API error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json() as { success?: boolean; data?: unknown; message?: string };
  if (data.success === false) {
    throw new Error(`Stagehand rejected: ${data.message || JSON.stringify(data).slice(0, 200)}`);
  }

  return data.data ?? data;
}

// ── Trace Transformation ───────────────────────────────────────

function transformActionsToTrace(actions: StagehandAction[], baseTimestamp: number): TraceEntry[] {
  const trace: TraceEntry[] = [];
  let cumulativeMs = 0;

  for (const action of actions) {
    if (SKIP_ACTIONS.has(action.type)) continue;

    const humanAction = ACTION_TYPE_MAP[action.type] || action.type;
    const timeMs = action.timeMs || 0;
    cumulativeMs += timeMs;
    const timestamp = baseTimestamp + cumulativeMs;

    // Build a human-readable target description
    let target: string | undefined;
    if (action.action) {
      target = action.action;
    } else if (action.instruction) {
      target = action.instruction;
    }

    const entry: TraceEntry = {
      timestamp,
      action: humanAction,
      target,
      result: action.taskCompleted ? "task_completed" : (action.result || undefined),
      note: action.reasoning || undefined,
      pageUrl: action.pageUrl || undefined,
      durationMs: timeMs || undefined,
    };

    trace.push(entry);
  }

  return trace;
}

// ── Rule-based metrics ─────────────────────────────────────────

function computeRuleBasedMetrics(trace: TraceEntry[]) {
  if (trace.length === 0) {
    return { timeToFirstActionSeconds: null, deadEndCount: 0, recoveryCount: 0, helpSeekingEvents: 0, confidenceDrops: 0, totalSteps: 0, durationSeconds: null };
  }

  const startTime = trace[0].timestamp;
  const endTime = trace[trace.length - 1].timestamp;

  const passiveActions = new Set(["navigate", "wait", "read_page", "observe", "session_started", "agent_start", "screenshot"]);
  const firstAction = trace.find(t => !passiveActions.has(t.action));
  const timeToFirstAction = firstAction ? Math.round((firstAction.timestamp - startTime) / 1000) : null;

  const failureTerms = ["not found", "error", "failed", "stuck", "dead end", "unable", "cannot", "doesn't exist"];
  const deadEnds = trace.filter(t => {
    const text = `${t.result || ""} ${t.note || ""}`.toLowerCase();
    return failureTerms.some(term => text.includes(term));
  }).length;

  let recoveries = 0;
  for (let i = 1; i < trace.length; i++) {
    const prevText = `${trace[i - 1].result || ""} ${trace[i - 1].note || ""}`.toLowerCase();
    const currText = `${trace[i].result || ""} ${trace[i].note || ""}`.toLowerCase();
    const prevFailed = failureTerms.some(term => prevText.includes(term));
    const currOk = !failureTerms.some(term => currText.includes(term));
    if (prevFailed && currOk && trace[i].action !== "screenshot") recoveries++;
  }

  const helpTerms = ["help", "tooltip", "docs", "documentation", "faq", "support", "confused", "looking for help"];
  const helpSeeking = trace.filter(t => {
    const text = `${t.action} ${t.target || ""} ${t.note || ""}`.toLowerCase();
    return helpTerms.some(term => text.includes(term));
  }).length;

  const uncertainTerms = ["frustrated", "uncertain", "confused", "unsure", "giving up", "abandon", "stuck", "doesn't make sense"];
  const confidenceDrops = trace.filter(t => {
    const text = `${t.note || ""} ${t.result || ""}`.toLowerCase();
    return uncertainTerms.some(term => text.includes(term));
  }).length;

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

// ── Gemini AI helpers ──────────────────────────────────────────

async function geminiJSON<T>(apiKey: string, systemPrompt: string, userPrompt: string): Promise<T> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
    const anthropicApiKey = this.env.ANTHROPIC_API_KEY;
    const geminiApiKey = this.env.GEMINI_API_KEY;

    // Mark session as running
    await step.do("mark-running", async () => {
      await this.env.DB.prepare("UPDATE sessions SET status = 'running' WHERE id = ?").bind(sessionId).run();
    });

    // Step 1: Start Stagehand session
    const stagehandSession = await step.do("start-stagehand-session", {
      retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
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
        "x-stream-response": "false",
        "x-model-api-key": anthropicApiKey,
        "Content-Type": "application/json",
      };

      const resp = await fetch(`${STAGEHAND_API_BASE}/sessions/start`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId: bbProjectId,
          modelName: "anthropic/claude-haiku-4-5",
          systemPrompt,
          browserbaseSessionCreateParams: { projectId: bbProjectId },
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Session start failed ${resp.status}: ${errText.slice(0, 200)}`);
      }

      const initData = await resp.json() as {
        success: boolean;
        data: { sessionId: string; cdpUrl?: string | null; available: boolean };
        message?: string;
      };
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
      "x-stream-response": "false",
      "x-model-api-key": anthropicApiKey,
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

      await stagehandFetch(
        `${STAGEHAND_API_BASE}/sessions/${bbSessionId}/navigate`,
        makeHeaders(),
        { url: startUrl },
        30_000,
      );
    });

    // Step 3: Execute the agent
    const agentResult = await step.do("execute-agent", async () => {
      const startTime = Date.now();
      const trace: TraceEntry[] = [];
      const agentNotes: string[] = [];
      let goalAchieved: "yes" | "partial" | "no" = "no";
      let abandonmentPoint: string | null = null;

      // Store Browserbase session reference and replay URL
      const replayUrl = `https://www.browserbase.com/sessions/${bbSessionId}`;
      agentNotes.push(`Browserbase session: ${bbSessionId}`);
      agentNotes.push(`Recording: ${replayUrl}`);

      trace.push({ timestamp: Date.now(), action: "session_started", result: bbSessionId });
      trace.push({ timestamp: Date.now(), action: "navigate", target: plan.entryPoint, result: "navigated", pageUrl: plan.entryPoint });

      trace.push({ timestamp: Date.now(), action: "agent_start", note: plan.missionDescription });

      try {
        const instruction = `Complete this mission as ${persona.name}: ${plan.missionDescription}

Steps to attempt:
${plan.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}

Stop when the goal is achieved or you determine it cannot be completed. Describe what you accomplished.`;

        const timeoutMs = hardTimeoutSeconds * 1000;

        // Use SSE streaming for agentExecute — essential to keep connection alive
        // and prevent Cloudflare 524 gateway timeouts on long-running agent sessions.
        console.log(`[workflow] Starting agentExecute (streaming, timeout: ${hardTimeoutSeconds}s, maxSteps: ${maxSteps})`);

        const streamHeaders = {
          ...makeHeaders(),
          "x-stream-response": "true",
        };

        const resp = await fetch(`${STAGEHAND_API_BASE}/sessions/${bbSessionId}/agentExecute`, {
          method: "POST",
          headers: streamHeaders,
          body: JSON.stringify({
            agentConfig: {
              model: "anthropic/claude-haiku-4-5",
              mode: "dom",
            },
            executeOptions: {
              instruction,
              maxSteps,
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`agentExecute failed ${resp.status}: ${errText.slice(0, 300)}`);
        }

        const { result: sseResult, logs } = await parseSSEStream(resp.body!, timeoutMs);

        console.log(`[workflow] agentExecute completed — ${logs.length} log events received`);

        // The SSE finished event contains the result
        const result = sseResult as Record<string, unknown> | null;

        // The result structure can be nested: result.{actions,message,...}
        const actions = result?.actions as StagehandAction[] | undefined;
        const success = result?.success ?? result?.completed;
        const message = (result?.message || result?.output) as string | undefined;

        // Transform structured actions into human-readable trace
        if (actions && Array.isArray(actions) && actions.length > 0) {
          const actionTrace = transformActionsToTrace(actions, startTime);
          trace.push(...actionTrace);
          console.log(`[workflow] Parsed ${actionTrace.length} actions from agent result`);
        } else {
          console.log("[workflow] No structured actions in result");
          // Log the raw result shape for debugging
          agentNotes.push(`Raw result keys: ${result ? Object.keys(result).join(", ") : "null"}`);
        }

        // Store raw SSE logs as debug notes
        const debugLogs = logs.filter((l: string) => l.length > 10).slice(-10);
        agentNotes.push(...debugLogs);

        // Determine goal achievement
        if (success) {
          goalAchieved = "yes";
        } else if (actions && actions.some((a: StagehandAction) => a.taskCompleted)) {
          goalAchieved = "yes";
        } else if (trace.length > 5) {
          goalAchieved = "partial";
        }

        if (message) agentNotes.push(`Agent result: ${String(message).slice(0, 500)}`);
        trace.push({
          timestamp: Date.now(),
          action: "agent_complete",
          result: goalAchieved,
          note: String(message || "").slice(0, 200),
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        trace.push({ timestamp: Date.now(), action: "fatal_error", result: errorMsg, note: "Session crashed" });
        agentNotes.push(`Fatal error: ${errorMsg}`);
        abandonmentPoint = errorMsg.slice(0, 200);
      }

      return {
        trace,
        goalAchieved,
        abandonmentPoint,
        agentNotes,
        replayUrl,
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

    // Step 5: Download session recording from Browserbase and store in R2
    const recordingKey = await step.do("download-recording", {
      retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
    }, async () => {
      try {
        // Browserbase recording API returns rrweb event data
        const resp = await fetch(`https://api.browserbase.com/v1/sessions/${bbSessionId}/recording`, {
          headers: {
            "x-bb-api-key": bbApiKey,
          },
          signal: AbortSignal.timeout(30_000),
        });

        if (!resp.ok) {
          console.log(`[workflow] Recording download failed: ${resp.status}`);
          return null;
        }

        const recordingData = await resp.text();
        if (!recordingData || recordingData.length < 100) {
          console.log("[workflow] Recording data empty or too small");
          return null;
        }

        // Store in R2 — key format: recordings/{sessionId}.json
        const key = `recordings/${sessionId}.json`;
        await this.env.SCREENSHOTS.put(key, recordingData, {
          httpMetadata: { contentType: "application/json" },
        });

        console.log(`[workflow] Recording stored in R2: ${key} (${Math.round(recordingData.length / 1024)}KB)`);
        return key;
      } catch (error) {
        console.error("[workflow] Recording download error:", error);
        return null;
      }
    });

    // Step 6: Update D1 session with results
    await step.do("update-session", async () => {
      const now = Math.floor(Date.now() / 1000);
      const status = agentResult.goalAchieved === "no" && agentResult.abandonmentPoint ? "abandoned" : "complete";

      // Store recording reference: R2 key if we have it, fallback to replay URL
      const screenshotsData: string[] = [];
      if (recordingKey) screenshotsData.push(`r2://${recordingKey}`);
      screenshotsData.push(agentResult.replayUrl);

      await this.env.DB.prepare(
        "UPDATE sessions SET status = ?, goal_achieved = ?, abandonment_point = ?, duration_seconds = ?, trace = ?, screenshots = ?, agent_notes = ?, completed_at = ? WHERE id = ?"
      ).bind(
        status,
        agentResult.goalAchieved,
        agentResult.abandonmentPoint,
        agentResult.durationSeconds,
        JSON.stringify(agentResult.trace),
        JSON.stringify(screenshotsData),
        JSON.stringify(agentResult.agentNotes),
        now,
        sessionId,
      ).run();
    });

    // Step 7: AI scoring
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
${agentResult.trace.map((t: TraceEntry, i: number) => {
  const parts = [`[${i + 1}] ${t.action}`];
  if (t.target) parts.push(`"${t.target.slice(0, 120)}"`);
  if (t.pageUrl) parts.push(`@ ${t.pageUrl.slice(0, 80)}`);
  if (t.result && t.result.length < 100) parts.push(`(${t.result})`);
  if (t.note) parts.push(`// ${t.note.slice(0, 150)}`);
  if (t.durationMs) parts.push(`[${t.durationMs}ms]`);
  return parts.join(" ");
}).join("\n")}

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
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[workflow] AI scoring failed:", msg);
        // Store error in D1 so it's visible in the UI
        try {
          await this.env.DB.prepare(
            "UPDATE sessions SET agent_notes = json_insert(agent_notes, '$[#]', ?) WHERE id = ?"
          ).bind(`AI scoring error: ${msg.slice(0, 300)}`, sessionId).run();
        } catch { /* ignore */ }
        return null;
      }
    });

    // Step 8: Insert score + generate report
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

    // Step 9: Check if all sessions in the run are done
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

// ── Fetch handler ──────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

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
