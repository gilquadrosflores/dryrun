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
    return <div className="text-[#555]">Loading...</div>;
  }

  if (!product) {
    return <div className="text-[#EF4444]">Product not found</div>;
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
          className="text-sm text-[#555] hover:text-[#E8FF00] mb-2 block transition-colors"
        >
          &larr; Back to products
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
            <p className="text-[#555] mt-1">{product.url}</p>
          </div>
          <div className="flex gap-2">
            {runs.length > 0 && (
              <Link href={`/products/${productId}/analytics`}>
                <Button variant="outline">Analytics</Button>
              </Link>
            )}
            <Button
              variant="ghost"
              className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
              onClick={handleDeleteProduct}
              disabled={deletingProduct}
            >
              {deletingProduct ? "Deleting..." : "Delete Product"}
            </Button>
          </div>
        </div>
      </div>

      {summary && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-[#888]">
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
        <TabsList className="bg-transparent border-b border-dashed border-[#333] rounded-none p-0 h-auto">
          <TabsTrigger
            value="personas"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#E8FF00] data-[state=active]:bg-transparent data-[state=active]:text-[#E8FF00] text-[#555] px-4 py-2"
          >
            Personas ({personas.length})
          </TabsTrigger>
          <TabsTrigger
            value="plans"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#E8FF00] data-[state=active]:bg-transparent data-[state=active]:text-[#E8FF00] text-[#555] px-4 py-2"
          >
            Plans ({plans.length})
          </TabsTrigger>
          <TabsTrigger
            value="runs"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#E8FF00] data-[state=active]:bg-transparent data-[state=active]:text-[#E8FF00] text-[#555] px-4 py-2"
          >
            Runs ({runs.length})
          </TabsTrigger>
        </TabsList>

        {/* Personas Tab */}
        <TabsContent value="personas" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#555]">
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
            <Card>
              <CardContent className="py-12 text-center text-[#555]">
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
                  <Card key={persona.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-bold">
                          {persona.name}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                        >
                          {fields.archetype?.replace("_", " ")}
                        </Badge>
                      </div>
                      <CardDescription>
                        {persona.role}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-xs text-[#555] mb-4">
                        <div>
                          Tech comfort:{" "}
                          <span className="text-[#F5F5F5] font-mono">
                            {fields.techComfort}
                          </span>
                        </div>
                        <div>
                          Time pressure:{" "}
                          <span className="text-[#F5F5F5] font-mono">
                            {fields.timePressure}
                          </span>
                        </div>
                        <div>
                          Retry willingness:{" "}
                          <span className="text-[#F5F5F5] font-mono">
                            {fields.retryWillingness}
                          </span>
                        </div>
                        <div>
                          AI tolerance:{" "}
                          <span className="text-[#F5F5F5] font-mono">
                            {fields.aiAutonomyTolerance}
                          </span>
                        </div>
                      </div>
                      <div className="border-t border-dashed border-[#333] pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#555] font-mono">
                            {personaPlans.length} plan(s)
                          </span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
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
            <p className="text-sm text-[#555]">
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
            <Card>
              <CardContent className="py-12 text-center text-[#555]">
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
                    className={plan.approved ? "border-[#4ADE80]/30" : ""}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base font-bold">
                            {dims.mission}
                          </CardTitle>
                          <CardDescription>
                            {persona?.name} &middot; {plan.teacherState}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          {plan.approved ? (
                            <Badge className="bg-[#4ADE80]/10 text-[#4ADE80] border-[#4ADE80]/30">
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
                      <div className="text-xs text-[#555] space-y-1 mb-4 font-mono">
                        {steps.slice(0, 5).map((step: string, i: number) => (
                          <div key={i}>
                            {i + 1}. {step}
                          </div>
                        ))}
                        {steps.length > 5 && (
                          <div className="text-[#333]">
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
                          className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
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
          <p className="text-sm text-[#555]">Test run history and results</p>

          {runs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-[#555]">
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
                  <Card key={run.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base font-mono">
                            Run {run.id.slice(0, 8)}
                          </CardTitle>
                          <CardDescription>
                            {new Date(run.createdAt * 1000).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            run.status === "complete"
                              ? "text-[#4ADE80] border-[#4ADE80]/30"
                              : run.status === "running"
                                ? "text-[#E8FF00] border-[#E8FF00]/30"
                                : run.status === "failed"
                                  ? "text-[#EF4444] border-[#EF4444]/30"
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
                                className="flex items-center justify-between text-sm border-b border-dashed border-[#333] pb-2"
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
