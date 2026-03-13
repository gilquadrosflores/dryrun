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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Product {
  id: string;
  name: string;
  url: string;
  crawlSummary: string | null;
  goals: string | null;
  createdAt: number;
}

interface Persona {
  id: string;
  name: string;
  role: string;
  behavioralFields: string;
  validated: number;
}

interface Plan {
  id: string;
  personaId: string;
  missionId: string;
  scenarioDimensions: string;
  teacherState: string;
  steps: string;
  approved: number;
}

interface Run {
  id: string;
  status: string;
  mode: string;
  createdAt: number;
  completedAt: number | null;
}

interface Session {
  id: string;
  runId: string;
  personaId: string;
  status: string;
  goalAchieved: string | null;
  durationSeconds: number | null;
}

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runningSessions, setRunningSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPersonas, setGeneratingPersonas] = useState(false);
  const [generatingPlans, setGeneratingPlans] = useState<string | null>(null);
  const [generatingAllPlans, setGeneratingAllPlans] = useState(false);
  const [startingRun, setStartingRun] = useState(false);
  const [deletingPersona, setDeletingPersona] = useState<string | null>(null);
  const [deletingProduct, setDeletingProduct] = useState(false);

  const fetchData = useCallback(async () => {
    const [productRes, personasRes, plansRes, runsRes] = await Promise.all([
      fetch(`/api/products/${productId}`),
      fetch(`/api/personas?productId=${productId}`),
      fetch(`/api/plans?productId=${productId}`),
      fetch(`/api/runs?productId=${productId}`),
    ]);

    setProduct(await productRes.json());
    setPersonas(await personasRes.json());
    setPlans(await plansRes.json());
    setRuns(await runsRes.json());
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll for running sessions
  useEffect(() => {
    const activeRun = runs.find((r) => r.status === "running");
    if (!activeRun) {
      setRunningSessions([]);
      return;
    }

    const poll = setInterval(async () => {
      const res = await fetch(`/api/runs/${activeRun.id}`);
      const data = await res.json();
      setRunningSessions(data.sessions || []);

      // Refresh all data if run completed
      if (data.run.status !== "running") {
        fetchData();
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [runs, fetchData]);

  const handleGeneratePersonas = async () => {
    setGeneratingPersonas(true);
    try {
      await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, count: 5 }),
      });
      toast.success("Personas generated successfully");
      fetchData();
    } catch (error) {
      toast.error("Failed to generate personas");
    } finally {
      setGeneratingPersonas(false);
    }
  };

  const handleGeneratePlans = async (personaId: string) => {
    setGeneratingPlans(personaId);
    try {
      await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId, count: 2 }),
      });
      toast.success("Plans generated successfully");
      fetchData();
    } catch {
      toast.error("Failed to generate plans");
    } finally {
      setGeneratingPlans(null);
    }
  };

  const handleGenerateAllPlans = async () => {
    setGeneratingAllPlans(true);
    try {
      let successCount = 0;
      for (const persona of personas) {
        const existingPlans = plans.filter((p) => p.personaId === persona.id);
        if (existingPlans.length > 0) continue;
        try {
          await fetch("/api/plans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ personaId: persona.id, count: 2 }),
          });
          successCount++;
        } catch {
          // continue with others
        }
      }
      toast.success(`Generated plans for ${successCount} persona(s)`);
      fetchData();
    } catch {
      toast.error("Failed to generate plans");
    } finally {
      setGeneratingAllPlans(false);
    }
  };

  const handleDeletePersona = async (personaId: string) => {
    setDeletingPersona(personaId);
    try {
      const res = await fetch(`/api/personas/${personaId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Persona deleted");
        fetchData();
      } else {
        toast.error("Failed to delete persona");
      }
    } catch {
      toast.error("Failed to delete persona");
    } finally {
      setDeletingPersona(null);
    }
  };

  const handleApprovePlan = async (planId: string, approved: boolean) => {
    await fetch("/api/plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, approved }),
    });
    fetchData();
  };

  const handleDeletePlan = async (planId: string) => {
    try {
      const res = await fetch(`/api/plans/${planId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Plan deleted");
        fetchData();
      } else {
        toast.error("Failed to delete plan");
      }
    } catch {
      toast.error("Failed to delete plan");
    }
  };

  const handleDeleteProduct = async () => {
    if (!confirm("Delete this product and all associated data?")) return;
    setDeletingProduct(true);
    try {
      const res = await fetch(`/api/products/${productId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Product deleted");
        router.push("/");
      } else {
        toast.error("Failed to delete product");
      }
    } catch {
      toast.error("Failed to delete product");
    } finally {
      setDeletingProduct(false);
    }
  };

  const handleApproveAll = async () => {
    await Promise.all(
      plans.filter((p) => !p.approved).map((p) =>
        fetch("/api/plans", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: p.id, approved: true }),
        })
      )
    );
    toast.success("All plans approved");
    fetchData();
  };

  const handleStartRun = async () => {
    const approvedPlans = plans.filter((p) => p.approved);
    if (approvedPlans.length === 0) return;

    setStartingRun(true);
    try {
      await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          planIds: approvedPlans.map((p) => p.id),
        }),
      });
      toast.success("Run started successfully");
      fetchData();
    } catch (error) {
      toast.error("Failed to start run");
    } finally {
      setStartingRun(false);
    }
  };

  if (loading) {
    return <div className="text-zinc-400">Loading...</div>;
  }

  if (!product) {
    return <div className="text-red-400">Product not found</div>;
  }

  const summary = product.crawlSummary
    ? JSON.parse(product.crawlSummary)
    : null;
  const approvedPlanCount = plans.filter((p) => p.approved).length;

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-300 mb-2 block"
        >
          &larr; Back to products
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
            <p className="text-zinc-400 mt-1">{product.url}</p>
          </div>
          <div className="flex gap-2">
            {runs.length > 0 && (
              <Link href={`/products/${productId}/analytics`}>
                <Button variant="outline">Analytics</Button>
              </Link>
            )}
            <Button
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
              onClick={handleDeleteProduct}
              disabled={deletingProduct}
            >
              {deletingProduct ? "Deleting..." : "Delete Product"}
            </Button>
          </div>
        </div>
      </div>

      {summary && (
        <Card className="bg-zinc-900 border-zinc-800 mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400">
              Product Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-3">{summary.purpose}</p>
            <div className="flex flex-wrap gap-2">
              {summary.targetUsers?.map((u: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {u}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="personas" className="space-y-6">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="personas">
            Personas ({personas.length})
          </TabsTrigger>
          <TabsTrigger value="plans">Plans ({plans.length})</TabsTrigger>
          <TabsTrigger value="runs">Runs ({runs.length})</TabsTrigger>
        </TabsList>

        {/* Personas Tab */}
        <TabsContent value="personas" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              Realistic user personas for synthetic testing
            </p>
            <Button
              onClick={handleGeneratePersonas}
              disabled={generatingPersonas}
            >
              {generatingPersonas ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                "Generate Personas"
              )}
            </Button>
          </div>

          {personas.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center text-zinc-500">
                No personas yet. Click Generate to create them from the product
                analysis.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {personas.map((persona) => {
                const fields = JSON.parse(persona.behavioralFields);
                const personaPlans = plans.filter(
                  (p) => p.personaId === persona.id
                );
                return (
                  <Card
                    key={persona.id}
                    className="bg-zinc-900 border-zinc-800"
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          {persona.name}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                        >
                          {fields.archetype?.replace("_", " ")}
                        </Badge>
                      </div>
                      <CardDescription className="text-zinc-400">
                        {persona.role}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 mb-4">
                        <div>
                          Tech comfort:{" "}
                          <span className="text-zinc-200">
                            {fields.techComfort}
                          </span>
                        </div>
                        <div>
                          Time pressure:{" "}
                          <span className="text-zinc-200">
                            {fields.timePressure}
                          </span>
                        </div>
                        <div>
                          Retry willingness:{" "}
                          <span className="text-zinc-200">
                            {fields.retryWillingness}
                          </span>
                        </div>
                        <div>
                          AI tolerance:{" "}
                          <span className="text-zinc-200">
                            {fields.aiAutonomyTolerance}
                          </span>
                        </div>
                      </div>
                      <Separator className="bg-zinc-800 my-3" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">
                          {personaPlans.length} plan(s)
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                            onClick={() => handleDeletePersona(persona.id)}
                            disabled={deletingPersona === persona.id}
                          >
                            {deletingPersona === persona.id ? "Deleting..." : "Delete"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGeneratePlans(persona.id)}
                            disabled={generatingPlans === persona.id || generatingAllPlans}
                          >
                            {generatingPlans === persona.id ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Generating...
                              </>
                            ) : (
                              "Generate Plans"
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              Review and approve plans before running
            </p>
            <div className="flex gap-2">
              {personas.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleGenerateAllPlans}
                  disabled={generatingAllPlans}
                >
                  {generatingAllPlans ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating All...
                    </>
                  ) : (
                    "Generate All Plans"
                  )}
                </Button>
              )}
              {plans.length > 0 && plans.some((p) => !p.approved) && (
                <Button variant="outline" onClick={handleApproveAll}>
                  Approve All
                </Button>
              )}
              <Button
                onClick={handleStartRun}
                disabled={startingRun || approvedPlanCount === 0}
              >
                {startingRun ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Starting...
                  </>
                ) : (
                  `Start Run (${approvedPlanCount} approved)`
                )}
              </Button>
            </div>
          </div>

          {plans.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center text-zinc-500">
                No plans yet. Generate plans from the Personas tab first.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {plans.map((plan) => {
                const persona = personas.find(
                  (p) => p.id === plan.personaId
                );
                const dims = JSON.parse(plan.scenarioDimensions);
                const steps = JSON.parse(plan.steps);
                return (
                  <Card
                    key={plan.id}
                    className={`bg-zinc-900 border-zinc-800 ${plan.approved ? "border-green-900" : ""}`}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {dims.mission}
                          </CardTitle>
                          <CardDescription className="text-zinc-400">
                            {persona?.name} &middot; {plan.teacherState}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          {plan.approved ? (
                            <Badge className="bg-green-900/50 text-green-400 border-green-800">
                              Approved
                            </Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge variant="outline" className="text-xs">
                          {dims.entryPoint}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {dims.priorSessionState}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          pressure: {dims.timePressure}
                        </Badge>
                      </div>
                      <div className="text-xs text-zinc-400 space-y-1 mb-4">
                        {steps.slice(0, 5).map((step: string, i: number) => (
                          <div key={i}>
                            {i + 1}. {step}
                          </div>
                        ))}
                        {steps.length > 5 && (
                          <div className="text-zinc-600">
                            +{steps.length - 5} more steps
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={plan.approved ? "outline" : "default"}
                          onClick={() =>
                            handleApprovePlan(plan.id, !plan.approved)
                          }
                        >
                          {plan.approved ? "Unapprove" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          onClick={() => handleDeletePlan(plan.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Runs Tab */}
        <TabsContent value="runs" className="space-y-4">
          <p className="text-sm text-zinc-400">Test run history and results</p>

          {runs.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center text-zinc-500">
                No runs yet. Approve some plans and start a run.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {runs.map((run) => {
                const runSessionList = runningSessions.filter(
                  (s) => s.runId === run.id
                );
                return (
                  <Card
                    key={run.id}
                    className="bg-zinc-900 border-zinc-800"
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">
                            Run {run.id.slice(0, 8)}
                          </CardTitle>
                          <CardDescription className="text-zinc-400">
                            {new Date(run.createdAt * 1000).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            run.status === "complete"
                              ? "text-green-400 border-green-800"
                              : run.status === "running"
                                ? "text-yellow-400 border-yellow-800"
                                : run.status === "failed"
                                  ? "text-red-400 border-red-800"
                                  : ""
                          }
                        >
                          {run.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {run.status === "running" && runSessionList.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {runSessionList.map((session) => {
                            const persona = personas.find(
                              (p) => p.id === session.personaId
                            );
                            return (
                              <div
                                key={session.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <span>
                                  {persona?.name || "Unknown"} &middot;{" "}
                                  {session.status}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {session.status}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {(run.status === "complete" || run.status === "failed") && (
                          <Link href={`/products/${productId}/runs/${run.id}`}>
                            <Button size="sm" variant="outline">
                              View Results
                            </Button>
                          </Link>
                        )}
                        {run.status === "running" && (
                          <Link href={`/products/${productId}/runs/${run.id}`}>
                            <Button size="sm" variant="outline">
                              Monitor
                            </Button>
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
