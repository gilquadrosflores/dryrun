"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface Analytics {
  totalRuns: number;
  totalSessions: number;
  totalFrictionEvents: number;
  avgSessionDuration: number | null;
  overallGoalRate: number;
  overallAbandonmentRate: number;
  severityDistribution: number[];
  categoryBreakdown: { category: string; count: number; avgSeverity: number }[];
  personaPerformance: {
    personaId: string;
    name: string;
    role: string;
    archetype: string;
    sessionCount: number;
    goalCounts: { yes: number; partial: number; no: number };
    avgDuration: number | null;
    totalFrictionEvents: number;
    abandonmentRate: number;
  }[];
  runTrend: {
    runIndex: number;
    runId: string;
    createdAt: number;
    sessionCount: number;
    goalsAchieved: number;
    goalRate: number;
    totalFrictionEvents: number;
    avgFrictionPerSession: number;
    maxSeverity: number;
  }[];
  topFriction: {
    severity: number;
    description: string;
    category: string;
    personaName: string;
    sessionId: string;
  }[];
}

interface Product {
  id: string;
  name: string;
  url: string;
}

const SEVERITY_COLORS = [
  "bg-[#FBBF24]",
  "bg-[#FBBF24]",
  "bg-orange-500",
  "bg-[#EF4444]",
  "bg-[#EF4444]",
];

const SEVERITY_TEXT_COLORS = [
  "text-[#FBBF24]",
  "text-[#FBBF24]",
  "text-orange-500",
  "text-[#EF4444]",
  "text-[#EF4444]",
];

export default function AnalyticsPage() {
  const params = useParams();
  const productId = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/products/${productId}`).then((r) => r.json()),
      fetch(`/api/products/${productId}/analytics`).then((r) => r.json()),
    ]).then(([prod, anal]) => {
      setProduct(prod);
      setAnalytics(anal);
      setLoading(false);
    });
  }, [productId]);

  if (loading) return <div className="text-[#555]">Loading analytics...</div>;
  if (!product || !analytics) return <div className="text-[#EF4444]">Not found</div>;

  const maxFrictionCount = Math.max(
    ...analytics.categoryBreakdown.map((c) => c.count),
    1
  );

  return (
    <div>
      <div className="mb-8">
        <Link
          href={`/products/${productId}`}
          className="text-sm text-[#555] hover:text-[#E8FF00] mb-2 block transition-colors"
        >
          &larr; Back to {product.name}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-[#555] mt-1">
          Aggregated friction data across {analytics.totalRuns} run(s) and{" "}
          {analytics.totalSessions} session(s)
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold font-mono">{analytics.totalRuns}</div>
            <div className="text-xs text-[#555]">Runs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold font-mono">{analytics.totalSessions}</div>
            <div className="text-xs text-[#555]">Sessions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold font-mono text-[#4ADE80]">
              {analytics.overallGoalRate}%
            </div>
            <div className="text-xs text-[#555]">Goal Rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold font-mono text-[#FBBF24]">
              {analytics.overallAbandonmentRate}%
            </div>
            <div className="text-xs text-[#555]">Abandonment</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold font-mono text-[#EF4444]">
              {analytics.totalFrictionEvents}
            </div>
            <div className="text-xs text-[#555]">Friction Events</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold font-mono">
              {analytics.avgSessionDuration ? `${analytics.avgSessionDuration}s` : "-"}
            </div>
            <div className="text-xs text-[#555]">Avg Duration</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Severity Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold">Severity Distribution</CardTitle>
            <CardDescription>Friction events by severity level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.severityDistribution.map((count, i) => {
                const maxCount = Math.max(...analytics.severityDistribution, 1);
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`text-sm font-mono w-20 ${SEVERITY_TEXT_COLORS[i]}`}>
                      Sev {i + 1}
                    </span>
                    <div className="flex-1 bg-[#1a1a1a] rounded-full h-5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${SEVERITY_COLORS[i]} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-[#555] w-8 text-right font-mono">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold">Friction Categories</CardTitle>
            <CardDescription>Issues grouped by type</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.categoryBreakdown.length === 0 ? (
              <p className="text-sm text-[#555]">No friction data yet</p>
            ) : (
              <div className="space-y-3">
                {analytics.categoryBreakdown
                  .sort((a, b) => b.count - a.count)
                  .map((cat) => {
                    const pct = Math.round((cat.count / maxFrictionCount) * 100);
                    const severityColor =
                      cat.avgSeverity >= 4
                        ? "bg-[#EF4444]"
                        : cat.avgSeverity >= 3
                          ? "bg-orange-500"
                          : "bg-[#FBBF24]";
                    return (
                      <div key={cat.category} className="flex items-center gap-3">
                        <span className="text-sm w-28 truncate capitalize text-[#888]">
                          {cat.category}
                        </span>
                        <div className="flex-1 bg-[#1a1a1a] rounded-full h-5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${severityColor} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#555] w-16 text-right font-mono">
                          {cat.count} (avg {cat.avgSeverity})
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Persona Performance */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base font-bold">Persona Performance</CardTitle>
          <CardDescription>How each persona archetype performed</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.personaPerformance.length === 0 ? (
            <p className="text-sm text-[#555]">No session data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dashed border-[#333]">
                    <th className="text-left p-2 text-xs text-[#555] font-medium">Persona</th>
                    <th className="text-left p-2 text-xs text-[#555] font-medium">Archetype</th>
                    <th className="text-center p-2 text-xs text-[#555] font-medium">Sessions</th>
                    <th className="text-center p-2 text-xs text-[#555] font-medium">Goals</th>
                    <th className="text-center p-2 text-xs text-[#555] font-medium">Friction</th>
                    <th className="text-center p-2 text-xs text-[#555] font-medium">Abandon %</th>
                    <th className="text-center p-2 text-xs text-[#555] font-medium">Avg Time</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.personaPerformance.map((p) => (
                    <tr key={p.personaId} className="border-b border-dashed border-[#333]/50 hover:bg-white/[0.02]">
                      <td className="p-2">
                        <div className="font-medium text-[#F5F5F5]">{p.name}</div>
                        <div className="text-xs text-[#555]">{p.role}</div>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {p.archetype?.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-2 text-center text-[#888] font-mono">{p.sessionCount}</td>
                      <td className="p-2 text-center">
                        <div className="flex justify-center gap-1 font-mono">
                          {p.goalCounts.yes > 0 && (
                            <span className="text-[#4ADE80] text-xs">{p.goalCounts.yes}&#x2713;</span>
                          )}
                          {p.goalCounts.partial > 0 && (
                            <span className="text-[#FBBF24] text-xs">{p.goalCounts.partial}~</span>
                          )}
                          {p.goalCounts.no > 0 && (
                            <span className="text-[#EF4444] text-xs">{p.goalCounts.no}&#x2717;</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-center font-mono">
                        <span
                          className={
                            p.totalFrictionEvents > 10
                              ? "text-[#EF4444]"
                              : p.totalFrictionEvents > 5
                                ? "text-[#FBBF24]"
                                : "text-[#888]"
                          }
                        >
                          {p.totalFrictionEvents}
                        </span>
                      </td>
                      <td className="p-2 text-center font-mono">
                        <span
                          className={
                            p.abandonmentRate > 50
                              ? "text-[#EF4444]"
                              : p.abandonmentRate > 25
                                ? "text-[#FBBF24]"
                                : "text-[#4ADE80]"
                          }
                        >
                          {p.abandonmentRate}%
                        </span>
                      </td>
                      <td className="p-2 text-center text-[#888] font-mono">
                        {p.avgDuration ? `${p.avgDuration}s` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run Trend */}
      {analytics.runTrend.length > 1 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base font-bold">Run Trend</CardTitle>
            <CardDescription>Friction and goal rates across runs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dashed border-[#333]">
                    <th className="text-left p-2 text-xs text-[#555] font-medium">Run</th>
                    <th className="text-center p-2 text-xs text-[#555] font-medium">Date</th>
                    <th className="text-center p-2 text-xs text-[#555] font-medium">Sessions</th>
                    <th className="text-center p-2 text-xs text-[#555] font-medium">Goal Rate</th>
                    <th className="text-center p-2 text-xs text-[#555] font-medium">Friction/Session</th>
                    <th className="text-center p-2 text-xs text-[#555] font-medium">Max Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.runTrend.map((r) => (
                    <tr key={r.runId} className="border-b border-dashed border-[#333]/50 hover:bg-white/[0.02]">
                      <td className="p-2">
                        <Link
                          href={`/products/${productId}/runs/${r.runId}`}
                          className="text-[#E8FF00] hover:underline font-mono"
                        >
                          Run #{r.runIndex}
                        </Link>
                      </td>
                      <td className="p-2 text-center text-[#555] text-xs font-mono">
                        {new Date(r.createdAt * 1000).toLocaleDateString()}
                      </td>
                      <td className="p-2 text-center text-[#888] font-mono">{r.sessionCount}</td>
                      <td className="p-2 text-center font-mono">
                        <span
                          className={
                            r.goalRate > 50
                              ? "text-[#4ADE80]"
                              : r.goalRate > 25
                                ? "text-[#FBBF24]"
                                : "text-[#EF4444]"
                          }
                        >
                          {r.goalRate}%
                        </span>
                      </td>
                      <td className="p-2 text-center text-[#888] font-mono">
                        {r.avgFrictionPerSession}
                      </td>
                      <td className="p-2 text-center">
                        <span className={SEVERITY_TEXT_COLORS[r.maxSeverity - 1] || "text-[#555]"}>
                          {r.maxSeverity > 0 ? r.maxSeverity : "-"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Friction Events */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base font-bold">Top Friction Events</CardTitle>
          <CardDescription>Most severe issues across all sessions</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.topFriction.length === 0 ? (
            <p className="text-sm text-[#555]">No friction events recorded yet</p>
          ) : (
            <div className="space-y-3">
              {analytics.topFriction.map((event, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-[#0a0a0a] border border-dashed border-[#333]"
                >
                  <div
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold font-mono ${
                      event.severity >= 4
                        ? "bg-[#EF4444]/10 text-[#EF4444]"
                        : event.severity >= 3
                          ? "bg-orange-500/10 text-orange-400"
                          : "bg-[#FBBF24]/10 text-[#FBBF24]"
                    }`}
                  >
                    {event.severity}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#F5F5F5]">{event.description}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs capitalize">
                        {event.category}
                      </Badge>
                      <span className="text-xs text-[#555]">{event.personaName}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
