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
  act: "text-[#4ADE80] border-[#4ADE80]/30 bg-[#4ADE80]/10",
  error: "text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10",
  fatal_error: "text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10",
  abandon: "text-[#FBBF24] border-[#FBBF24]/30 bg-[#FBBF24]/10",
  complete: "text-[#4ADE80] border-[#4ADE80]/30 bg-[#4ADE80]/10",
  timeout: "text-[#FBBF24] border-[#FBBF24]/30 bg-[#FBBF24]/10",
  progress_check: "text-indigo-400 border-indigo-800 bg-indigo-950/30",
  screenshot: "text-[#555] border-[#333] bg-[#111]/30",
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
      bar: "bg-[#EF4444]",
      bg: "bg-[#EF4444]/10",
      text: "text-[#EF4444]",
      label: "Critical",
    };
  }
  if (severity >= 3) {
    return {
      bar: "bg-orange-500",
      bg: "bg-orange-500/10",
      text: "text-orange-400",
      label: "Moderate",
    };
  }
  return {
    bar: "bg-[#FBBF24]",
    bg: "bg-[#FBBF24]/10",
    text: "text-[#FBBF24]",
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
      <div className="flex items-center gap-2 text-[#555]">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading session...
      </div>
    );
  }
  if (!data) return <div className="text-[#EF4444]">Session not found</div>;

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
      ? "text-[#4ADE80]"
      : session.goalAchieved === "partial"
        ? "text-[#FBBF24]"
        : "text-[#EF4444]";

  const statusBadgeColor =
    session.status === "complete"
      ? "text-[#4ADE80] border-[#4ADE80]/30 bg-[#4ADE80]/10"
      : session.status === "abandoned"
        ? "text-[#FBBF24] border-[#FBBF24]/30 bg-[#FBBF24]/10"
        : session.status === "failed"
          ? "text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10"
          : "text-[#E8FF00] border-[#E8FF00]/30 bg-[#E8FF00]/10";

  return (
    <div>
      {/* Navigation */}
      <div className="mb-6">
        <Link
          href={`/products/${productId}`}
          className="text-sm text-[#555] hover:text-[#E8FF00] mb-2 block transition-colors"
        >
          &larr; Back to product
        </Link>
      </div>

      {/* Summary Header Card */}
      <Card className="mb-6">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                Session <span className="font-mono">{session.id.slice(0, 8)}</span>
              </h1>
              <Badge variant="outline" className={statusBadgeColor}>
                {session.status}
              </Badge>
            </div>
            {plan && (
              <p className="text-[#555] text-sm italic max-w-md truncate">
                &ldquo;{plan.teacherState}&rdquo;
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Goal Status */}
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                session.goalAchieved === "yes"
                  ? "bg-[#4ADE80]/10 text-[#4ADE80]"
                  : session.goalAchieved === "partial"
                    ? "bg-[#FBBF24]/10 text-[#FBBF24]"
                    : "bg-[#EF4444]/10 text-[#EF4444]"
              }`}>
                {session.goalAchieved === "yes" ? "\u2713" : session.goalAchieved === "partial" ? "\u00BD" : "\u2717"}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#555]">Goal</p>
                <p className={`text-sm font-semibold capitalize ${goalStatusColor}`}>
                  {session.goalAchieved || "N/A"}
                </p>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-lg text-[#555]">
                &#x23F1;
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#555]">Duration</p>
                <p className="text-sm font-semibold text-[#F5F5F5] font-mono">
                  {formatDuration(session.durationSeconds)}
                </p>
              </div>
            </div>

            {/* Persona */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-lg text-[#555]">
                &#x1F464;
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#555]">Persona</p>
                <p className="text-sm font-semibold text-[#F5F5F5] truncate max-w-[160px]">
                  {persona ? `${persona.name}` : "N/A"}
                </p>
                {persona && (
                  <p className="text-[10px] text-[#555]">{persona.role}</p>
                )}
              </div>
            </div>

            {/* Mission */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-lg text-[#555]">
                &#x1F3AF;
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#555]">Mission</p>
                <p className="text-sm font-semibold text-[#F5F5F5] truncate max-w-[200px]">
                  {mission ? mission.description : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-[#111] border border-dashed border-[#333] rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-[#555] mb-0.5">Steps</p>
          <p className="text-xl font-bold text-[#F5F5F5] font-mono">{trace.length}</p>
        </div>
        <div className="bg-[#111] border border-dashed border-[#333] rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-[#555] mb-0.5">Dead Ends</p>
          <p className="text-xl font-bold text-[#FBBF24] font-mono">{score?.deadEndCount ?? "N/A"}</p>
        </div>
        <div className="bg-[#111] border border-dashed border-[#333] rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-[#555] mb-0.5">Recoveries</p>
          <p className="text-xl font-bold text-blue-400 font-mono">{score?.recoveryCount ?? "N/A"}</p>
        </div>
        <div className="bg-[#111] border border-dashed border-[#333] rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-[#555] mb-0.5">Friction Events</p>
          <p className="text-xl font-bold text-[#E8FF00] font-mono">{frictionEvents.length}</p>
        </div>
      </div>

      {/* Abandonment point callout */}
      {session.abandonmentPoint && (
        <Card className="bg-[#FBBF24]/5 border-[#FBBF24]/30 mb-6">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <span className="text-[#FBBF24] text-lg">&#x26A0;</span>
            <div>
              <p className="text-sm font-medium text-[#FBBF24]">Abandonment Point</p>
              <p className="text-sm text-[#FBBF24]/80">{session.abandonmentPoint}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={report ? "report" : "trace"} className="space-y-4">
        <TabsList className="bg-transparent border-b border-dashed border-[#333] rounded-none p-0 h-auto">
          <TabsTrigger
            value="report"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#E8FF00] data-[state=active]:bg-transparent data-[state=active]:text-[#E8FF00] text-[#555] px-4 py-2"
          >
            Report
          </TabsTrigger>
          <TabsTrigger
            value="trace"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#E8FF00] data-[state=active]:bg-transparent data-[state=active]:text-[#E8FF00] text-[#555] px-4 py-2"
          >
            Trace ({trace.length})
          </TabsTrigger>
          <TabsTrigger
            value="friction"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#E8FF00] data-[state=active]:bg-transparent data-[state=active]:text-[#E8FF00] text-[#555] px-4 py-2"
          >
            Friction ({frictionEvents.length})
          </TabsTrigger>
          <TabsTrigger
            value="screenshots"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#E8FF00] data-[state=active]:bg-transparent data-[state=active]:text-[#E8FF00] text-[#555] px-4 py-2"
          >
            Screenshots ({screenshots.length})
          </TabsTrigger>
          <TabsTrigger
            value="scores"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#E8FF00] data-[state=active]:bg-transparent data-[state=active]:text-[#E8FF00] text-[#555] px-4 py-2"
          >
            Scores
          </TabsTrigger>
          {agentNotes.length > 0 && (
            <TabsTrigger
              value="notes"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#E8FF00] data-[state=active]:bg-transparent data-[state=active]:text-[#E8FF00] text-[#555] px-4 py-2"
            >
              Notes ({agentNotes.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* Report Tab */}
        <TabsContent value="report">
          {report ? (
            <Card>
              <CardContent className="pt-6">
                <MarkdownRenderer
                  content={report.content}
                  className="prose prose-invert prose-sm max-w-none"
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-[#555]">
                {session.status === "running" || session.status === "pending"
                  ? "Report will be generated when the session completes."
                  : "No report generated for this session."}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Trace Tab */}
        <TabsContent value="trace">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold">Action Trace</CardTitle>
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
                      <span className="text-xs text-[#555] flex items-center px-2 font-mono">
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
                {/* Continuous timeline line - dashed */}
                <div className="absolute left-[72px] top-0 bottom-0 w-px border-l border-dashed border-[#333]" />

                {trace.map((entry, i) => {
                  const isHighlighted = replayIndex === i;
                  const isVisible = replayIndex === null || i <= replayIndex;
                  if (!isVisible) return null;

                  const colorClass = ACTION_COLORS[entry.action] || "text-[#555] border-[#333]";
                  const isExpanded = expandedRows.has(i);
                  const hasDetails = !!(entry.target || entry.note);
                  const icon = ACTION_ICONS[entry.action] || "\u2022";

                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 py-1 relative cursor-pointer transition-colors rounded ${
                        isHighlighted
                          ? "bg-[#E8FF00]/5 ring-1 ring-[#E8FF00]/30"
                          : "hover:bg-white/[0.02]"
                      }`}
                      onClick={() => hasDetails && toggleRow(i)}
                    >
                      <div className="flex items-center gap-1 w-[60px] flex-shrink-0 justify-end">
                        <span className="text-[#333] text-[10px] font-mono">{getTimeDelta(i)}</span>
                        <span className="text-[#555] text-[10px] font-mono w-[24px] text-right">{i + 1}</span>
                      </div>

                      <div className="relative z-10 flex-shrink-0 w-[24px] flex items-center justify-center">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${colorClass}`}>
                          {icon}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${colorClass.split(" ")[0]}`}>
                            {entry.action}
                          </span>
                          {entry.result && (
                            <span className={`text-[10px] font-mono ${
                              entry.result === "success"
                                ? "text-[#4ADE80]"
                                : entry.result === "failed"
                                  ? "text-[#EF4444]"
                                  : "text-[#555]"
                            }`}>
                              {entry.result}
                            </span>
                          )}
                          {entry.target && !isExpanded && (
                            <span className="text-[#555] text-xs truncate">
                              {entry.target}
                            </span>
                          )}
                        </div>
                        {isExpanded && (
                          <div className="mt-1 ml-0">
                            {entry.target && (
                              <p className="text-[#888] text-xs">{entry.target}</p>
                            )}
                            {entry.note && (
                              <p className="text-[#555] text-xs italic mt-0.5">{entry.note}</p>
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
            <Card>
              <CardContent className="py-12 text-center text-[#555]">
                No friction events detected in this session.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">Friction Heatmap</CardTitle>
                  <p className="text-xs text-[#555]">
                    Severity distribution across the session timeline. Each bar represents a friction event at the corresponding step.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 mb-4 text-[10px] text-[#555]">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm bg-[#FBBF24]" /> Minor (1-2)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm bg-orange-500" /> Moderate (3)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm bg-[#EF4444]" /> Critical (4-5)
                    </span>
                  </div>

                  <div className="flex items-end gap-1 h-24 border-b border-dashed border-[#333] pb-1">
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
                            <div className="absolute bottom-full mb-2 hidden group-hover:block z-20">
                              <div className="bg-[#111] border border-dashed border-[#333] rounded px-2 py-1 text-[10px] whitespace-nowrap shadow-lg">
                                <span className={colors.text}>Severity {event.severity}</span>
                                <span className="text-[#555]"> at step {event.step}</span>
                                <br />
                                <span className="text-[#888]">{event.category}</span>
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
                        <div key={i} className="flex-1 text-center text-[9px] text-[#333] font-mono">
                          {event.step}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">Friction Events Detail</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {frictionEvents
                      .sort((a, b) => b.severity - a.severity)
                      .map((event, i) => {
                        const colors = getSeverityColor(event.severity);
                        return (
                          <div key={i} className={`flex items-start gap-3 p-3 rounded border border-dashed border-[#333] ${colors.bg}`}>
                            <div className="flex flex-col items-center gap-1 flex-shrink-0">
                              <div className={`w-1.5 rounded-full ${colors.bar}`} style={{ height: `${event.severity * 6}px` }} />
                              <span className={`text-[10px] font-mono font-bold ${colors.text}`}>
                                {event.severity}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] text-[#555] font-mono">Step {event.step}</span>
                                <Badge variant="outline" className="text-[10px] text-[#555] border-[#333] px-1.5 py-0">
                                  {event.category}
                                </Badge>
                                <span className={`text-[10px] ${colors.text}`}>{colors.label}</span>
                              </div>
                              <p className="text-sm text-[#888]">{event.description}</p>
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
            <Card>
              <CardContent className="py-12 text-center text-[#555]">
                No screenshots captured. Screenshots are available when using Browserbase sessions.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {screenshots.map((src, i) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    <img
                      src={src}
                      alt={`Screenshot ${i + 1}`}
                      className="w-full rounded border border-dashed border-[#333]"
                    />
                    <p className="text-xs text-[#555] mt-2 font-mono">
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
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-bold">Metrics</CardTitle>
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
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-bold">AI Review</CardTitle>
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
            <Card>
              <CardContent className="py-12 text-center text-[#555]">
                No scores yet
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Agent Notes Tab */}
        {agentNotes.length > 0 && (
          <TabsContent value="notes">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  {agentNotes.map((note, i) => (
                    <div key={i} className="text-sm text-[#888] p-2 rounded bg-[#0a0a0a] border border-dashed border-[#333]">
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
        red: "text-[#EF4444]",
        orange: "text-[#FBBF24]",
        blue: "text-blue-400",
        green: "text-[#4ADE80]",
      }[color]
    : "text-[#F5F5F5]";

  return (
    <div>
      <p className="text-xs text-[#555] mb-1">{label}</p>
      <p className={`text-lg font-semibold font-mono ${colorClass} ${cap ? "capitalize" : ""}`}>
        {value}
      </p>
    </div>
  );
}
