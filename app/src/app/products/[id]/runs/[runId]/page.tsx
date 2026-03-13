"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import Link from "next/link";

interface Run {
  id: string;
  status: string;
  mode: string;
  createdAt: number;
  completedAt: number | null;
}

interface Session {
  id: string;
  personaId: string;
  planId: string;
  status: string;
  goalAchieved: string | null;
  durationSeconds: number | null;
  screenshots: string | null;
}

interface Persona {
  id: string;
  name: string;
  role: string;
}

interface FrictionEvent {
  step: number;
  severity: 1 | 2 | 3 | 4 | 5;
  description: string;
  category: string;
}

interface SessionDetail {
  session: Session;
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
  report: { content: string } | null;
  persona: { name: string; role: string } | null;
  mission: { description: string; entryPoint: string } | null;
  plan: { teacherState: string } | null;
}

const SEVERITY_COLORS: Record<number, string> = {
  1: "bg-yellow-500",
  2: "bg-orange-400",
  3: "bg-orange-500",
  4: "bg-red-500",
  5: "bg-red-700",
};

const SEVERITY_LABELS: Record<number, string> = {
  1: "Minor",
  2: "Noticeable",
  3: "Significant",
  4: "Major",
  5: "Critical",
};

const GOAL_BADGE_STYLES: Record<string, string> = {
  yes: "text-green-400 border-green-800 bg-green-950/30",
  partial: "text-yellow-400 border-yellow-800 bg-yellow-950/30",
  no: "text-red-400 border-red-800 bg-red-950/30",
};

function parseFrictionEvents(raw: string | null | undefined): FrictionEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function RunDetailPage() {
  const params = useParams();
  const productId = params.id as string;
  const runId = params.runId as string;

  const [run, setRun] = useState<Run | null>(null);
  const [sessionList, setSessionList] = useState<Session[]>([]);
  const [personaMap, setPersonaMap] = useState<Record<string, Persona>>({});
  const [sessionDetails, setSessionDetails] = useState<
    Record<string, SessionDetail>
  >({});
  const [runReport, setRunReport] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSessionDetails = useCallback(
    async (sessions: Session[]) => {
      const completeSessions = sessions.filter(
        (s) => s.status === "complete" || s.status === "abandoned"
      );
      const results = await Promise.all(
        completeSessions.map(async (s) => {
          try {
            const res = await fetch(`/api/sessions/${s.id}`);
            if (!res.ok) return null;
            const data: SessionDetail = await res.json();
            return { id: s.id, data };
          } catch {
            return null;
          }
        })
      );
      const map: Record<string, SessionDetail> = {};
      for (const r of results) {
        if (r) map[r.id] = r.data;
      }
      setSessionDetails(map);
    },
    []
  );

  const fetchData = useCallback(async () => {
    const [runRes, personasRes] = await Promise.all([
      fetch(`/api/runs/${runId}`),
      fetch(`/api/personas?productId=${productId}`),
    ]);
    const data = await runRes.json();
    const personaList: Persona[] = await personasRes.json();
    setRun(data.run);
    const sessions: Session[] = data.sessions || [];
    setSessionList(sessions);
    const map: Record<string, Persona> = {};
    personaList.forEach((p) => {
      map[p.id] = p;
    });
    setPersonaMap(map);

    // Fetch session details for friction data
    await fetchSessionDetails(sessions);

    // Check for existing run report
    const reportsRes = await fetch(`/api/reports?runId=${runId}`);
    const reportsList = await reportsRes.json();
    const runRep = Array.isArray(reportsList)
      ? reportsList.find((r: { type: string }) => r.type === "run")
      : null;
    if (runRep) setRunReport(runRep.content);

    setLoading(false);
  }, [runId, productId, fetchSessionDetails]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Derived data
  const allFrictionEvents: Array<FrictionEvent & { sessionId: string }> = [];
  const sessionFrictionMap: Record<string, FrictionEvent[]> = {};

  for (const session of sessionList) {
    const detail = sessionDetails[session.id];
    const events = parseFrictionEvents(detail?.score?.frictionEvents);
    sessionFrictionMap[session.id] = events;
    for (const ev of events) {
      allFrictionEvents.push({ ...ev, sessionId: session.id });
    }
  }

  const severityCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const ev of allFrictionEvents) {
    severityCounts[ev.severity] = (severityCounts[ev.severity] || 0) + 1;
  }
  const totalFriction = allFrictionEvents.length;

  if (loading) return <div className="text-zinc-400">Loading...</div>;
  if (!run) return <div className="text-red-400">Run not found</div>;

  return (
    <div>
      <div className="mb-8">
        <Link
          href={`/products/${productId}`}
          className="text-sm text-zinc-500 hover:text-zinc-300 mb-2 block"
        >
          &larr; Back to product
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Run {run.id.slice(0, 8)}
          </h1>
          <Badge
            variant="outline"
            className={
              run.status === "complete"
                ? "text-green-400 border-green-800"
                : run.status === "running"
                  ? "text-yellow-400 border-yellow-800"
                  : ""
            }
          >
            {run.status}
          </Badge>
        </div>
        <p className="text-zinc-400 mt-1">
          Started {new Date(run.createdAt * 1000).toLocaleString()}
          {run.completedAt &&
            ` · Completed ${new Date(run.completedAt * 1000).toLocaleString()}`}
        </p>
      </div>

      {/* Summary Cards */}
      {sessionList.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold">{sessionList.length}</div>
              <div className="text-xs text-zinc-400">Sessions</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-green-400">
                {sessionList.filter((s) => s.goalAchieved === "yes").length}
              </div>
              <div className="text-xs text-zinc-400">Goals Achieved</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-orange-400">
                {sessionList.filter((s) => s.status === "abandoned").length}
              </div>
              <div className="text-xs text-zinc-400">Abandoned</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold">
                {sessionList.filter((s) => s.durationSeconds).length > 0
                  ? `${Math.round(
                      sessionList
                        .filter((s) => s.durationSeconds)
                        .reduce((a, s) => a + (s.durationSeconds || 0), 0) /
                        sessionList.filter((s) => s.durationSeconds).length
                    )}s`
                  : "-"}
              </div>
              <div className="text-xs text-zinc-400">Avg Duration</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Friction Overview */}
      {totalFriction > 0 && (
        <Card className="bg-zinc-900 border-zinc-800 mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Friction Overview</CardTitle>
            <CardDescription>
              {totalFriction} friction event{totalFriction !== 1 ? "s" : ""}{" "}
              across {sessionList.length} session
              {sessionList.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Overall severity breakdown bar */}
            <div className="mb-5">
              <div className="text-xs text-zinc-400 mb-2 font-medium">
                Overall Severity Distribution
              </div>
              <div className="flex h-5 rounded overflow-hidden w-full">
                {([1, 2, 3, 4, 5] as const).map((sev) => {
                  const pct =
                    totalFriction > 0
                      ? (severityCounts[sev] / totalFriction) * 100
                      : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={sev}
                      className={`${SEVERITY_COLORS[sev]} relative group`}
                      style={{ width: `${pct}%` }}
                      title={`Severity ${sev} (${SEVERITY_LABELS[sev]}): ${severityCounts[sev]}`}
                    >
                      {pct > 10 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                          {severityCounts[sev]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2">
                {([1, 2, 3, 4, 5] as const).map((sev) => (
                  <div key={sev} className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <div
                      className={`w-2.5 h-2.5 rounded-sm ${SEVERITY_COLORS[sev]}`}
                    />
                    <span>
                      {SEVERITY_LABELS[sev]} ({severityCounts[sev]})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-zinc-800 my-4" />

            {/* Per-session friction bars */}
            <div className="text-xs text-zinc-400 mb-3 font-medium">
              Friction by Session
            </div>
            <div className="space-y-3">
              {sessionList.map((session) => {
                const events = sessionFrictionMap[session.id] || [];
                if (events.length === 0) return null;
                const persona = personaMap[session.personaId];
                const sessionSeverityCounts: Record<number, number> = {
                  1: 0,
                  2: 0,
                  3: 0,
                  4: 0,
                  5: 0,
                };
                for (const ev of events) {
                  sessionSeverityCounts[ev.severity] =
                    (sessionSeverityCounts[ev.severity] || 0) + 1;
                }
                return (
                  <div key={session.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-300 truncate max-w-[200px]">
                        {persona?.name || session.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {events.length} event{events.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex h-3 rounded overflow-hidden w-full bg-zinc-800">
                      {([1, 2, 3, 4, 5] as const).map((sev) => {
                        const pct =
                          events.length > 0
                            ? (sessionSeverityCounts[sev] / events.length) * 100
                            : 0;
                        if (pct === 0) return null;
                        return (
                          <div
                            key={sev}
                            className={SEVERITY_COLORS[sev]}
                            style={{ width: `${pct}%` }}
                            title={`Severity ${sev}: ${sessionSeverityCounts[sev]}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Run Report */}
      {run.status === "complete" && (
        <div className="mb-6">
          {runReport ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle>Aggregate Friction Report</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownRenderer content={runReport} />
              </CardContent>
            </Card>
          ) : (
            <Button
              onClick={async () => {
                setGeneratingReport(true);
                try {
                  const res = await fetch("/api/reports", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ runId }),
                  });
                  const data = await res.json();
                  setRunReport(data.content);
                  toast.success("Report generated");
                } catch {
                  toast.error("Failed to generate report");
                } finally {
                  setGeneratingReport(false);
                }
              }}
              disabled={generatingReport}
            >
              {generatingReport ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Generating Report...
                </>
              ) : (
                "Generate Aggregate Report"
              )}
            </Button>
          )}
        </div>
      )}

      <Separator className="bg-zinc-800 my-4" />

      {/* Results Matrix */}
      {sessionList.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Results Matrix</h2>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left p-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Persona
                    </th>
                    <th className="text-left p-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Mission
                    </th>
                    <th className="text-left p-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Goal
                    </th>
                    <th className="text-left p-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="text-left p-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Friction
                    </th>
                    <th className="text-left p-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Top Issue
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {sessionList.map((session) => {
                    const persona = personaMap[session.personaId];
                    const detail = sessionDetails[session.id];
                    const events = sessionFrictionMap[session.id] || [];
                    const topIssue = events.length > 0
                      ? [...events].sort((a, b) => b.severity - a.severity)[0]
                      : null;
                    const mission = detail?.mission;

                    return (
                      <tr key={session.id} className="hover:bg-zinc-800/30">
                        <td className="p-2 text-zinc-200">
                          <div className="font-medium">
                            {persona?.name || session.id.slice(0, 8)}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {persona?.role || "-"}
                          </div>
                        </td>
                        <td className="p-2 text-zinc-300 max-w-[200px]">
                          <span className="line-clamp-2 text-xs">
                            {mission?.description || "-"}
                          </span>
                        </td>
                        <td className="p-2">
                          {session.goalAchieved ? (
                            <Badge
                              variant="outline"
                              className={
                                GOAL_BADGE_STYLES[session.goalAchieved] || ""
                              }
                            >
                              {session.goalAchieved}
                            </Badge>
                          ) : (
                            <span className="text-zinc-500 text-xs">-</span>
                          )}
                        </td>
                        <td className="p-2 text-zinc-300 text-xs tabular-nums">
                          {session.durationSeconds
                            ? `${session.durationSeconds}s`
                            : "-"}
                        </td>
                        <td className="p-2 text-zinc-300 text-xs tabular-nums">
                          {events.length > 0 ? (
                            <span className={events.some((e) => e.severity >= 4) ? "text-red-400 font-medium" : ""}>
                              {events.length}
                            </span>
                          ) : (
                            <span className="text-zinc-500">0</span>
                          )}
                        </td>
                        <td className="p-2 max-w-[250px]">
                          {topIssue ? (
                            <div className="flex items-start gap-1.5">
                              <Badge
                                variant="outline"
                                className={`text-[10px] shrink-0 ${
                                  topIssue.severity >= 4
                                    ? "text-red-400 border-red-800"
                                    : topIssue.severity >= 3
                                      ? "text-orange-400 border-orange-800"
                                      : "text-yellow-400 border-yellow-800"
                                }`}
                              >
                                S{topIssue.severity}
                              </Badge>
                              <span className="text-xs text-zinc-400 line-clamp-2">
                                {topIssue.description}
                              </span>
                            </div>
                          ) : (
                            <span className="text-zinc-500 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      <Separator className="bg-zinc-800 my-4" />

      {/* Session Cards */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Sessions</h2>

        {sessionList.map((session) => {
          const screenshots = session.screenshots
            ? JSON.parse(session.screenshots)
            : [];
          const persona = personaMap[session.personaId];
          const detail = sessionDetails[session.id];
          const events = sessionFrictionMap[session.id] || [];
          const topIssue =
            events.length > 0
              ? [...events].sort((a, b) => b.severity - a.severity)[0]
              : null;
          const mission = detail?.mission;

          return (
            <Card key={session.id} className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {persona ? persona.name : `Session ${session.id.slice(0, 8)}`}
                      {persona?.role && (
                        <span className="text-xs font-normal text-zinc-500">
                          {persona.role}
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="text-zinc-400 mt-1">
                      {mission?.description ? (
                        <span className="line-clamp-1">
                          {mission.description}
                        </span>
                      ) : (
                        <>
                          {session.durationSeconds
                            ? `${session.durationSeconds}s`
                            : "In progress"}
                        </>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={
                        session.status === "complete"
                          ? "text-green-400 border-green-800"
                          : session.status === "running"
                            ? "text-yellow-400 border-yellow-800"
                            : session.status === "abandoned"
                              ? "text-orange-400 border-orange-800"
                              : session.status === "failed"
                                ? "text-red-400 border-red-800"
                                : ""
                      }
                    >
                      {session.status}
                    </Badge>
                    {session.goalAchieved && (
                      <Badge
                        variant="outline"
                        className={
                          GOAL_BADGE_STYLES[session.goalAchieved] || ""
                        }
                      >
                        Goal: {session.goalAchieved}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Session metadata row */}
                {(session.durationSeconds || events.length > 0) && (
                  <div className="flex items-center gap-4 mb-3 text-xs text-zinc-500">
                    {session.durationSeconds && (
                      <span>Duration: {session.durationSeconds}s</span>
                    )}
                    {events.length > 0 && (
                      <span>
                        Friction events: {events.length}
                      </span>
                    )}
                  </div>
                )}

                {/* Top friction event */}
                {topIssue && (
                  <div className="mb-3 p-2.5 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                        Top friction
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          topIssue.severity >= 4
                            ? "text-red-400 border-red-800"
                            : topIssue.severity >= 3
                              ? "text-orange-400 border-orange-800"
                              : "text-yellow-400 border-yellow-800"
                        }`}
                      >
                        Severity {topIssue.severity} - {SEVERITY_LABELS[topIssue.severity]}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-zinc-400 border-zinc-700">
                        {topIssue.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {topIssue.description}
                    </p>
                  </div>
                )}

                {screenshots.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto mb-4">
                    {screenshots.slice(0, 4).map((src: string, i: number) => (
                      <img
                        key={i}
                        src={src}
                        alt={`Screenshot ${i + 1}`}
                        className="h-32 rounded border border-zinc-700"
                      />
                    ))}
                    {screenshots.length > 4 && (
                      <div className="flex items-center text-xs text-zinc-500">
                        +{screenshots.length - 4} more
                      </div>
                    )}
                  </div>
                )}
                <Link
                  href={`/products/${productId}/sessions/${session.id}`}
                >
                  <Button size="sm" variant="outline">
                    View Details
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
