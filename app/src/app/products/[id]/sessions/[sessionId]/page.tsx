"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import Link from "next/link";

interface SessionData {
  session: {
    id: string;
    status: string;
    goalAchieved: string | null;
    abandonmentPoint: string | null;
    durationSeconds: number | null;
    trace: string | null;
    screenshots: string | null;
    agentNotes: string | null;
  };
  score: {
    taskCompletion: string;
    timeToFirstActionSeconds: number | null;
    deadEndCount: number;
    recoveryCount: number;
    helpSeekingEvents: number;
    confidenceDrops: number;
    frictionEvents: string | null;
    aiReview: string | null;
  } | null;
  report: {
    content: string;
  } | null;
  persona: {
    name: string;
    role: string;
    behavioralFields: string;
  } | null;
  mission: {
    description: string;
    entryPoint: string;
  } | null;
  plan: {
    teacherState: string;
  } | null;
}

interface TraceEntry {
  timestamp: number;
  action: string;
  target?: string;
  result?: string;
  note?: string;
}

interface FrictionEvent {
  step: number;
  severity: number;
  category: string;
  description: string;
}

const ACTION_COLORS: Record<string, string> = {
  navigate: "text-blue-400 border-blue-800 bg-blue-950/30",
  page_loaded: "text-blue-400 border-blue-800 bg-blue-950/30",
  observe: "text-purple-400 border-purple-800 bg-purple-950/30",
  plan: "text-cyan-400 border-cyan-800 bg-cyan-950/30",
  act: "text-green-400 border-green-800 bg-green-950/30",
  error: "text-red-400 border-red-800 bg-red-950/30",
  fatal_error: "text-red-400 border-red-800 bg-red-950/30",
  abandon: "text-orange-400 border-orange-800 bg-orange-950/30",
  complete: "text-emerald-400 border-emerald-800 bg-emerald-950/30",
  timeout: "text-yellow-400 border-yellow-800 bg-yellow-950/30",
  progress_check: "text-indigo-400 border-indigo-800 bg-indigo-950/30",
  screenshot: "text-zinc-400 border-zinc-700 bg-zinc-900/30",
};

const ACTION_ICONS: Record<string, string> = {
  navigate: "\u2192",
  page_loaded: "\u25CB",
  observe: "\u25C9",
  plan: "\u2318",
  act: "\u25B6",
  error: "\u2717",
  fatal_error: "\u2717",
  abandon: "\u23F9",
  complete: "\u2713",
  timeout: "\u23F1",
  progress_check: "\u2026",
  screenshot: "\u25A3",
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "N/A";
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  return `${seconds}s`;
}

function getSeverityColor(severity: number): {
  bar: string;
  bg: string;
  text: string;
  label: string;
} {
  if (severity >= 4) {
    return {
      bar: "bg-red-500",
      bg: "bg-red-950/30",
      text: "text-red-400",
      label: "Critical",
    };
  }
  if (severity >= 3) {
    return {
      bar: "bg-orange-500",
      bg: "bg-orange-950/30",
      text: "text-orange-400",
      label: "Moderate",
    };
  }
  return {
    bar: "bg-yellow-500",
    bg: "bg-yellow-950/30",
    text: "text-yellow-400",
    label: "Minor",
  };
}

export default function SessionDetailPage() {
  const params = useParams();
  const productId = params.id as string;
  const sessionId = params.sessionId as string;

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [replayIndex, setReplayIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-400">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading session...
      </div>
    );
  }
  if (!data) return <div className="text-red-400">Session not found</div>;

  const { session, score, report, persona, mission, plan } = data;
  const trace: TraceEntry[] = session.trace ? JSON.parse(session.trace) : [];
  const screenshots: string[] = session.screenshots
    ? JSON.parse(session.screenshots)
    : [];
  const agentNotes: string[] = session.agentNotes
    ? JSON.parse(session.agentNotes)
    : [];
  const frictionEvents: FrictionEvent[] = score?.frictionEvents
    ? JSON.parse(score.frictionEvents)
    : [];

  const toggleRow = (i: number) => {
    const next = new Set(expandedRows);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setExpandedRows(next);
  };

  const getTimeDelta = (i: number): string => {
    if (i === 0 || !trace[i - 1]) return "-";
    const delta = trace[i].timestamp - trace[i - 1].timestamp;
    if (delta < 1000) return `${delta}ms`;
    return `${(delta / 1000).toFixed(1)}s`;
  };

  const goalStatusColor =
    session.goalAchieved === "yes"
      ? "text-green-400"
      : session.goalAchieved === "partial"
        ? "text-yellow-400"
        : "text-red-400";

  const statusBadgeColor =
    session.status === "complete"
      ? "text-green-400 border-green-800 bg-green-950/20"
      : session.status === "abandoned"
        ? "text-orange-400 border-orange-800 bg-orange-950/20"
        : session.status === "failed"
          ? "text-red-400 border-red-800 bg-red-950/20"
          : "text-yellow-400 border-yellow-800 bg-yellow-950/20";

  return (
    <div>
      {/* Navigation */}
      <div className="mb-6">
        <Link
          href={`/products/${productId}`}
          className="text-sm text-zinc-500 hover:text-zinc-300 mb-2 block"
        >
          &larr; Back to product
        </Link>
      </div>

      {/* Summary Header Card */}
      <Card className="bg-zinc-900 border-zinc-800 mb-6">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                Session {session.id.slice(0, 8)}
              </h1>
              <Badge variant="outline" className={statusBadgeColor}>
                {session.status}
              </Badge>
            </div>
            {plan && (
              <p className="text-zinc-500 text-sm italic max-w-md truncate">
                &ldquo;{plan.teacherState}&rdquo;
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Goal Status */}
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                session.goalAchieved === "yes"
                  ? "bg-green-950/40 text-green-400"
                  : session.goalAchieved === "partial"
                    ? "bg-yellow-950/40 text-yellow-400"
                    : "bg-red-950/40 text-red-400"
              }`}>
                {session.goalAchieved === "yes" ? "\u2713" : session.goalAchieved === "partial" ? "\u00BD" : "\u2717"}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Goal</p>
                <p className={`text-sm font-semibold capitalize ${goalStatusColor}`}>
                  {session.goalAchieved || "N/A"}
                </p>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-lg text-zinc-400">
                &#x23F1;
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Duration</p>
                <p className="text-sm font-semibold text-zinc-100">
                  {formatDuration(session.durationSeconds)}
                </p>
              </div>
            </div>

            {/* Persona */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-lg text-zinc-400">
                &#x1F464;
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Persona</p>
                <p className="text-sm font-semibold text-zinc-100 truncate max-w-[160px]">
                  {persona ? `${persona.name}` : "N/A"}
                </p>
                {persona && (
                  <p className="text-[10px] text-zinc-500">{persona.role}</p>
                )}
              </div>
            </div>

            {/* Mission */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-lg text-zinc-400">
                &#x1F3AF;
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Mission</p>
                <p className="text-sm font-semibold text-zinc-100 truncate max-w-[200px]">
                  {mission ? mission.description : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Steps</p>
          <p className="text-xl font-bold text-zinc-100">{trace.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Dead Ends</p>
          <p className="text-xl font-bold text-orange-400">{score?.deadEndCount ?? "N/A"}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Recoveries</p>
          <p className="text-xl font-bold text-blue-400">{score?.recoveryCount ?? "N/A"}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Friction Events</p>
          <p className="text-xl font-bold text-yellow-400">{frictionEvents.length}</p>
        </div>
      </div>

      {/* Abandonment point callout */}
      {session.abandonmentPoint && (
        <Card className="bg-orange-950/20 border-orange-900 mb-6">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <span className="text-orange-400 text-lg">&#x26A0;</span>
            <div>
              <p className="text-sm font-medium text-orange-300">Abandonment Point</p>
              <p className="text-sm text-orange-400/80">{session.abandonmentPoint}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={report ? "report" : "trace"} className="space-y-4">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="trace">Trace ({trace.length})</TabsTrigger>
          <TabsTrigger value="friction">Friction ({frictionEvents.length})</TabsTrigger>
          <TabsTrigger value="screenshots">
            Screenshots ({screenshots.length})
          </TabsTrigger>
          <TabsTrigger value="scores">Scores</TabsTrigger>
          {agentNotes.length > 0 && (
            <TabsTrigger value="notes">Notes ({agentNotes.length})</TabsTrigger>
          )}
        </TabsList>

        {/* Report Tab */}
        <TabsContent value="report">
          {report ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-6">
                <MarkdownRenderer
                  content={report.content}
                  className="prose prose-invert prose-sm max-w-none"
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center text-zinc-500">
                {session.status === "running" || session.status === "pending"
                  ? "Report will be generated when the session completes."
                  : "No report generated for this session."}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Trace Tab -- compact timeline with better visual hierarchy */}
        <TabsContent value="trace">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Action Trace</CardTitle>
                <div className="flex gap-2">
                  {replayIndex !== null ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReplayIndex(Math.max(0, replayIndex - 1))}
                        disabled={replayIndex === 0}
                      >
                        Prev
                      </Button>
                      <span className="text-xs text-zinc-400 flex items-center px-2">
                        {replayIndex + 1} / {trace.length}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setReplayIndex(
                            Math.min(trace.length - 1, replayIndex + 1)
                          )
                        }
                        disabled={replayIndex === trace.length - 1}
                      >
                        Next
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReplayIndex(null)}
                      >
                        Exit
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReplayIndex(0)}
                      disabled={trace.length === 0}
                    >
                      Step Through
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4">
              <div className="relative">
                {/* Continuous timeline line */}
                <div className="absolute left-[72px] top-0 bottom-0 w-px bg-zinc-800" />

                {trace.map((entry, i) => {
                  const isHighlighted = replayIndex === i;
                  const isVisible = replayIndex === null || i <= replayIndex;
                  if (!isVisible) return null;

                  const colorClass = ACTION_COLORS[entry.action] || "text-zinc-400 border-zinc-700";
                  const isExpanded = expandedRows.has(i);
                  const hasDetails = !!(entry.target || entry.note);
                  const icon = ACTION_ICONS[entry.action] || "\u2022";

                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 py-1 relative cursor-pointer transition-colors rounded ${
                        isHighlighted
                          ? "bg-zinc-800 ring-1 ring-zinc-600"
                          : "hover:bg-zinc-800/30"
                      }`}
                      onClick={() => hasDetails && toggleRow(i)}
                    >
                      {/* Step number + time delta */}
                      <div className="flex items-center gap-1 w-[60px] flex-shrink-0 justify-end">
                        <span className="text-zinc-600 text-[10px] font-mono">{getTimeDelta(i)}</span>
                        <span className="text-zinc-500 text-[10px] font-mono w-[24px] text-right">{i + 1}</span>
                      </div>

                      {/* Timeline dot */}
                      <div className="relative z-10 flex-shrink-0 w-[24px] flex items-center justify-center">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${colorClass}`}>
                          {icon}
                        </div>
                      </div>

                      {/* Content - single line compact */}
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${colorClass.split(" ")[0]}`}>
                            {entry.action}
                          </span>
                          {entry.result && (
                            <span className={`text-[10px] ${
                              entry.result === "success"
                                ? "text-green-500"
                                : entry.result === "failed"
                                  ? "text-red-500"
                                  : "text-zinc-500"
                            }`}>
                              {entry.result}
                            </span>
                          )}
                          {entry.target && !isExpanded && (
                            <span className="text-zinc-500 text-xs truncate">
                              {entry.target}
                            </span>
                          )}
                        </div>
                        {isExpanded && (
                          <div className="mt-1 ml-0">
                            {entry.target && (
                              <p className="text-zinc-300 text-xs">{entry.target}</p>
                            )}
                            {entry.note && (
                              <p className="text-zinc-500 text-xs italic mt-0.5">{entry.note}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Friction Heatmap Tab */}
        <TabsContent value="friction">
          {frictionEvents.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center text-zinc-500">
                No friction events detected in this session.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Heatmap visualization */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Friction Heatmap</CardTitle>
                  <p className="text-xs text-zinc-500">
                    Severity distribution across the session timeline. Each bar represents a friction event at the corresponding step.
                  </p>
                </CardHeader>
                <CardContent>
                  {/* Severity legend */}
                  <div className="flex items-center gap-4 mb-4 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm bg-yellow-500" /> Minor (1-2)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm bg-orange-500" /> Moderate (3)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm bg-red-500" /> Critical (4-5)
                    </span>
                  </div>

                  {/* Heatmap bars */}
                  <div className="flex items-end gap-1 h-24 border-b border-zinc-800 pb-1">
                    {frictionEvents
                      .sort((a, b) => a.step - b.step)
                      .map((event, i) => {
                        const colors = getSeverityColor(event.severity);
                        const heightPercent = (event.severity / 5) * 100;
                        return (
                          <div
                            key={i}
                            className="flex-1 flex flex-col items-center justify-end group relative"
                          >
                            <div
                              className={`w-full min-w-[8px] max-w-[32px] rounded-t ${colors.bar} transition-all group-hover:opacity-80`}
                              style={{ height: `${heightPercent}%` }}
                            />
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-2 hidden group-hover:block z-20">
                              <div className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] whitespace-nowrap shadow-lg">
                                <span className={colors.text}>Severity {event.severity}</span>
                                <span className="text-zinc-500"> at step {event.step}</span>
                                <br />
                                <span className="text-zinc-400">{event.category}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {frictionEvents
                      .sort((a, b) => a.step - b.step)
                      .map((event, i) => (
                        <div key={i} className="flex-1 text-center text-[9px] text-zinc-600 font-mono">
                          {event.step}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              {/* Detailed friction events list */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Friction Events Detail</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {frictionEvents
                      .sort((a, b) => b.severity - a.severity)
                      .map((event, i) => {
                        const colors = getSeverityColor(event.severity);
                        return (
                          <div key={i} className={`flex items-start gap-3 p-3 rounded border ${colors.bg} border-zinc-800`}>
                            {/* Severity bar indicator */}
                            <div className="flex flex-col items-center gap-1 flex-shrink-0">
                              <div className={`w-1.5 rounded-full ${colors.bar}`} style={{ height: `${event.severity * 6}px` }} />
                              <span className={`text-[10px] font-mono font-bold ${colors.text}`}>
                                {event.severity}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] text-zinc-500 font-mono">Step {event.step}</span>
                                <Badge variant="outline" className="text-[10px] text-zinc-400 border-zinc-700 px-1.5 py-0">
                                  {event.category}
                                </Badge>
                                <span className={`text-[10px] ${colors.text}`}>{colors.label}</span>
                              </div>
                              <p className="text-sm text-zinc-300">{event.description}</p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Screenshots Tab */}
        <TabsContent value="screenshots">
          {screenshots.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center text-zinc-500">
                No screenshots captured. Screenshots are available when using Browserbase sessions.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {screenshots.map((src, i) => (
                <Card key={i} className="bg-zinc-900 border-zinc-800">
                  <CardContent className="pt-4">
                    <img
                      src={src}
                      alt={`Screenshot ${i + 1}`}
                      className="w-full rounded border border-zinc-700"
                    />
                    <p className="text-xs text-zinc-500 mt-2">
                      {src.split("/").pop()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Scores Tab */}
        <TabsContent value="scores">
          {score ? (
            <div className="space-y-4">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-base">Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <MetricBox label="Task Completion" value={score.taskCompletion} capitalize />
                    <MetricBox
                      label="Time to First Action"
                      value={score.timeToFirstActionSeconds != null ? `${score.timeToFirstActionSeconds}s` : "N/A"}
                    />
                    <MetricBox label="Dead Ends" value={score.deadEndCount} color="orange" />
                    <MetricBox label="Recoveries" value={score.recoveryCount} color="blue" />
                    <MetricBox label="Help Seeking" value={score.helpSeekingEvents} />
                    <MetricBox label="Confidence Drops" value={score.confidenceDrops} color="red" />
                  </div>
                </CardContent>
              </Card>

              {score.aiReview && (
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-base">AI Review</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MarkdownRenderer
                      content={score.aiReview}
                      className="prose prose-invert prose-sm max-w-none"
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center text-zinc-500">
                No scores yet
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Agent Notes Tab */}
        {agentNotes.length > 0 && (
          <TabsContent value="notes">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  {agentNotes.map((note, i) => (
                    <div key={i} className="text-sm text-zinc-400 p-2 rounded bg-zinc-800/50">
                      {note}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function MetricBox({
  label,
  value,
  capitalize: cap,
  color,
}: {
  label: string;
  value: string | number;
  capitalize?: boolean;
  color?: "red" | "orange" | "blue" | "green";
}) {
  const colorClass = color
    ? {
        red: "text-red-400",
        orange: "text-orange-400",
        blue: "text-blue-400",
        green: "text-green-400",
      }[color]
    : "text-zinc-100";

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${colorClass} ${cap ? "capitalize" : ""}`}>
        {value}
      </p>
    </div>
  );
}
