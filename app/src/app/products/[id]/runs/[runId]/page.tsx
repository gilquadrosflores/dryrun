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

export default function RunDetailPage() {
  const params = useParams();
  const productId = params.id as string;
  const runId = params.runId as string;

  const [run, setRun] = useState<Run | null>(null);
  const [sessionList, setSessionList] = useState<Session[]>([]);
  const [personaMap, setPersonaMap] = useState<Record<string, Persona>>({});
  const [runReport, setRunReport] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [runRes, personasRes] = await Promise.all([
      fetch(`/api/runs/${runId}`),
      fetch(`/api/personas?productId=${productId}`),
    ]);
    const data = await runRes.json();
    const personaList: Persona[] = await personasRes.json();
    setRun(data.run);
    setSessionList(data.sessions || []);
    const map: Record<string, Persona> = {};
    personaList.forEach((p) => { map[p.id] = p; });
    setPersonaMap(map);

    // Check for existing run report
    const reportsRes = await fetch(`/api/reports?runId=${runId}`);
    const reportsList = await reportsRes.json();
    const runRep = Array.isArray(reportsList)
      ? reportsList.find((r: { type: string }) => r.type === "run")
      : null;
    if (runRep) setRunReport(runRep.content);

    setLoading(false);
  }, [runId, productId]);

  useEffect(() => {
    fetchData();
    // Poll if running
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
                  ? `${Math.round(sessionList.filter((s) => s.durationSeconds).reduce((a, s) => a + (s.durationSeconds || 0), 0) / sessionList.filter((s) => s.durationSeconds).length)}s`
                  : "-"}
              </div>
              <div className="text-xs text-zinc-400">Avg Duration</div>
            </CardContent>
          </Card>
        </div>
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
                <div
                  className="prose prose-invert prose-sm max-w-none [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_th]:border-zinc-700 [&_td]:p-2 [&_td]:border-b [&_td]:border-zinc-800 [&_h2]:text-lg [&_h3]:text-base"
                  dangerouslySetInnerHTML={{
                    __html: runReport
                      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/^- (.*$)/gm, '<li>$1</li>')
                      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
                      .replace(/\n\n/g, '<br/><br/>')
                      .replace(/\|(.+)\|/g, (match) => {
                        const cells = match.split('|').filter(Boolean);
                        return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
                      }),
                  }}
                />
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
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Sessions</h2>

        {sessionList.map((session) => {
          const screenshots = session.screenshots
            ? JSON.parse(session.screenshots)
            : [];
          const persona = personaMap[session.personaId];
          return (
            <Card key={session.id} className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {persona ? persona.name : `Session ${session.id.slice(0, 8)}`}
                    </CardTitle>
                    <CardDescription className="text-zinc-400">
                      {persona?.role}
                      {session.durationSeconds
                        ? ` · ${session.durationSeconds}s`
                        : " · In progress"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
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
                          session.goalAchieved === "yes"
                            ? "text-green-400 border-green-800"
                            : session.goalAchieved === "partial"
                              ? "text-yellow-400 border-yellow-800"
                              : "text-red-400 border-red-800"
                        }
                      >
                        Goal: {session.goalAchieved}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
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
