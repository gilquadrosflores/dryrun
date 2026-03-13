"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface RunSummary {
  runId: string;
  createdAt: number;
  status: string;
  sessionCount: number;
  goalRate: number;
  abandonRate: number;
  totalFriction: number;
  avgFrictionPerSession: number;
}

interface PersonaComparison {
  personaName: string;
  personaRole: string;
  runA: {
    goalAchieved: string | null;
    frictionCount: number;
    maxSeverity: number;
    durationSeconds: number | null;
    status: string;
  };
  runB: {
    goalAchieved: string | null;
    frictionCount: number;
    maxSeverity: number;
    durationSeconds: number | null;
    status: string;
  } | null;
  frictionDelta: number | null;
}

interface CompareData {
  runA: RunSummary;
  runB: RunSummary;
  deltas: {
    goalRate: number;
    abandonRate: number;
    totalFriction: number;
    avgFrictionPerSession: number;
  };
  personaComparison: PersonaComparison[];
}

interface Run {
  id: string;
  status: string;
  createdAt: number;
}

function DeltaBadge({ value, label, invertColor }: { value: number; label: string; invertColor?: boolean }) {
  const isPositive = value > 0;
  const isGood = invertColor ? !isPositive : isPositive;
  const color = value === 0 ? "text-[#555]" : isGood ? "text-[#E8FF00]" : "text-[#EF4444]";
  const arrow = value > 0 ? "+" : "";
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold font-mono ${color}`}>
        {arrow}{value}{label === "%" ? "%" : ""}
      </div>
      <div className="text-xs text-[#555]">{label === "%" ? "Goal Rate" : label}</div>
    </div>
  );
}

export default function ComparePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const productId = params.id as string;

  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedA, setSelectedA] = useState(searchParams.get("runA") || "");
  const [selectedB, setSelectedB] = useState(searchParams.get("runB") || "");
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/runs?productId=${productId}`)
      .then((r) => r.json())
      .then((data) => {
        const sorted = data.sort((a: Run, b: Run) => b.createdAt - a.createdAt);
        setRuns(sorted);
        if (!selectedA && sorted.length >= 2) {
          setSelectedA(sorted[1].id);
          setSelectedB(sorted[0].id);
        } else if (!selectedA && sorted.length >= 1) {
          setSelectedA(sorted[0].id);
        }
      });
  }, [productId, selectedA]);

  useEffect(() => {
    if (!selectedA || !selectedB) return;
    setLoading(true);
    fetch(`/api/runs/compare?runA=${selectedA}&runB=${selectedB}`)
      .then((r) => r.json())
      .then((data) => {
        setCompareData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedA, selectedB]);

  const completedRuns = runs.filter((r) => r.status === "complete");

  return (
    <div>
      <div className="mb-8">
        <Link
          href={`/products/${productId}`}
          className="text-sm text-[#555] hover:text-[#E8FF00] mb-2 block transition-colors"
        >
          &larr; Back to product
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Compare Runs</h1>
        <p className="text-[#555] mt-1">Side-by-side comparison of test runs</p>
      </div>

      {/* Run Selectors */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-[#555]">Run A (Baseline)</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={selectedA}
              onChange={(e) => setSelectedA(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-dashed border-[#333] rounded px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#E8FF00] outline-none"
            >
              <option value="">Select a run...</option>
              {completedRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  Run {r.id.slice(0, 8)} — {new Date(r.createdAt * 1000).toLocaleDateString()}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-[#555]">Run B (Latest)</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={selectedB}
              onChange={(e) => setSelectedB(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-dashed border-[#333] rounded px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#E8FF00] outline-none"
            >
              <option value="">Select a run...</option>
              {completedRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  Run {r.id.slice(0, 8)} — {new Date(r.createdAt * 1000).toLocaleDateString()}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      </div>

      {loading && <div className="text-[#555]">Loading comparison...</div>}

      {compareData && !loading && (
        <>
          {/* Delta Summary */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-base font-bold">Changes: Run A → Run B</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <DeltaBadge value={compareData.deltas.goalRate} label="%" />
                <DeltaBadge value={compareData.deltas.abandonRate} label="Abandonment %" invertColor />
                <DeltaBadge value={compareData.deltas.totalFriction} label="Total Friction" invertColor />
                <DeltaBadge
                  value={compareData.deltas.avgFrictionPerSession}
                  label="Avg Friction/Session"
                  invertColor
                />
              </div>
            </CardContent>
          </Card>

          {/* Side-by-side Stats */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Run A</CardTitle>
                <CardDescription>
                  {new Date(compareData.runA.createdAt * 1000).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm font-mono">
                  <div>
                    <span className="text-[#555]">Sessions:</span>{" "}
                    <span className="text-[#F5F5F5]">{compareData.runA.sessionCount}</span>
                  </div>
                  <div>
                    <span className="text-[#555]">Goal Rate:</span>{" "}
                    <span className="text-[#4ADE80]">{compareData.runA.goalRate}%</span>
                  </div>
                  <div>
                    <span className="text-[#555]">Friction:</span>{" "}
                    <span className="text-[#EF4444]">{compareData.runA.totalFriction}</span>
                  </div>
                  <div>
                    <span className="text-[#555]">Abandon:</span>{" "}
                    <span className="text-[#FBBF24]">{compareData.runA.abandonRate}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Run B</CardTitle>
                <CardDescription>
                  {new Date(compareData.runB.createdAt * 1000).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm font-mono">
                  <div>
                    <span className="text-[#555]">Sessions:</span>{" "}
                    <span className="text-[#F5F5F5]">{compareData.runB.sessionCount}</span>
                  </div>
                  <div>
                    <span className="text-[#555]">Goal Rate:</span>{" "}
                    <span className="text-[#4ADE80]">{compareData.runB.goalRate}%</span>
                  </div>
                  <div>
                    <span className="text-[#555]">Friction:</span>{" "}
                    <span className="text-[#EF4444]">{compareData.runB.totalFriction}</span>
                  </div>
                  <div>
                    <span className="text-[#555]">Abandon:</span>{" "}
                    <span className="text-[#FBBF24]">{compareData.runB.abandonRate}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Persona-by-Persona Comparison */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-base font-bold">Persona Comparison</CardTitle>
              <CardDescription>How each persona performed across both runs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dashed border-[#333]">
                      <th className="text-left p-2 text-xs text-[#555] font-medium">Persona</th>
                      <th className="text-center p-2 text-xs text-[#555] font-medium">Goal A</th>
                      <th className="text-center p-2 text-xs text-[#555] font-medium">Goal B</th>
                      <th className="text-center p-2 text-xs text-[#555] font-medium">Friction A</th>
                      <th className="text-center p-2 text-xs text-[#555] font-medium">Friction B</th>
                      <th className="text-center p-2 text-xs text-[#555] font-medium">Delta</th>
                      <th className="text-center p-2 text-xs text-[#555] font-medium">Severity A</th>
                      <th className="text-center p-2 text-xs text-[#555] font-medium">Severity B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareData.personaComparison.map((pc, i) => {
                      const deltaColor =
                        pc.frictionDelta === null
                          ? "text-[#555]"
                          : pc.frictionDelta < 0
                            ? "text-[#E8FF00]"
                            : pc.frictionDelta > 0
                              ? "text-[#EF4444]"
                              : "text-[#555]";
                      return (
                        <tr key={i} className="border-b border-dashed border-[#333]/50 hover:bg-white/[0.02]">
                          <td className="p-2">
                            <div className="font-medium text-[#F5F5F5]">{pc.personaName}</div>
                            <div className="text-xs text-[#555]">{pc.personaRole}</div>
                          </td>
                          <td className="p-2 text-center">
                            <GoalBadge goal={pc.runA.goalAchieved} />
                          </td>
                          <td className="p-2 text-center">
                            {pc.runB ? <GoalBadge goal={pc.runB.goalAchieved} /> : <span className="text-[#333]">-</span>}
                          </td>
                          <td className="p-2 text-center text-[#888] font-mono">{pc.runA.frictionCount}</td>
                          <td className="p-2 text-center text-[#888] font-mono">
                            {pc.runB ? pc.runB.frictionCount : "-"}
                          </td>
                          <td className={`p-2 text-center font-bold font-mono ${deltaColor}`}>
                            {pc.frictionDelta !== null
                              ? `${pc.frictionDelta > 0 ? "+" : ""}${pc.frictionDelta}`
                              : "-"}
                          </td>
                          <td className="p-2 text-center">
                            <SeverityDot severity={pc.runA.maxSeverity} />
                          </td>
                          <td className="p-2 text-center">
                            {pc.runB ? <SeverityDot severity={pc.runB.maxSeverity} /> : <span className="text-[#333]">-</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!compareData && !loading && selectedA && selectedB && (
        <div className="text-[#555] text-center py-12">
          Select two completed runs to compare
        </div>
      )}
    </div>
  );
}

function GoalBadge({ goal }: { goal: string | null }) {
  if (!goal) return <span className="text-[#333]">-</span>;
  const styles: Record<string, string> = {
    yes: "bg-[#4ADE80]/10 text-[#4ADE80] border-[#4ADE80]/30",
    partial: "bg-[#FBBF24]/10 text-[#FBBF24] border-[#FBBF24]/30",
    no: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30",
  };
  return (
    <Badge className={`text-xs ${styles[goal] || ""}`}>
      {goal}
    </Badge>
  );
}

function SeverityDot({ severity }: { severity: number }) {
  if (severity === 0) return <span className="text-[#333]">-</span>;
  const colors = ["bg-[#FBBF24]", "bg-[#FBBF24]", "bg-orange-500", "bg-[#EF4444]", "bg-[#EF4444]"];
  return (
    <div className="flex justify-center">
      <div className={`w-3 h-3 rounded-full ${colors[severity - 1] || "bg-[#555]"}`} />
    </div>
  );
}
