"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface Product {
  id: string;
  name: string;
  url: string;
  crawlSummary: string | null;
  createdAt: number;
}

interface ProductStats {
  personaCount: number;
  planCount: number;
  runCount: number;
  lastRunStatus: string | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "secondary",
  pending: "outline",
  failed: "destructive",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const variant = STATUS_VARIANT[status] ?? "outline";
  return (
    <Badge variant={variant} className="text-xs capitalize">
      {status}
    </Badge>
  );
}

const WORKFLOW_STEPS = [
  { number: "1", title: "Add product", description: "Enter your product URL so Dryrun can crawl and understand it." },
  { number: "2", title: "Generate personas", description: "AI creates realistic user profiles based on your product." },
  { number: "3", title: "Create plans", description: "Define test missions and let AI build step-by-step plans." },
  { number: "4", title: "Run tests", description: "Synthetic users execute the plans in a real browser." },
  { number: "5", title: "View friction reports", description: "See where users struggled, abandoned, or got confused." },
];

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<Record<string, ProductStats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data: Product[]) => {
        setProducts(data);
        // Fetch stats for each product in parallel
        data.forEach((product) => {
          fetch(`/api/products/${product.id}/stats`)
            .then((res) => res.json())
            .then((s: ProductStats) =>
              setStats((prev) => ({ ...prev, [product.id]: s }))
            );
        });
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero section */}
      <div className="mb-12 text-center py-10 border-b border-zinc-800">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Dryrun
        </h1>
        <p className="mt-3 text-lg text-zinc-400 max-w-2xl mx-auto">
          AI agents that test your product like real users
        </p>
        <p className="mt-2 text-sm text-zinc-500 max-w-xl mx-auto">
          Generate synthetic personas, plan realistic test missions, and uncover UX friction before your users do.
        </p>
      </div>

      {/* Products header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Products</h2>
          <p className="text-zinc-400 mt-1">
            Add a product to start synthetic user testing
          </p>
        </div>
        <Link href="/products/new">
          <Button>Add Product</Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-zinc-900 border-zinc-800 animate-pulse">
              <CardHeader>
                <div className="h-5 bg-zinc-800 rounded w-1/2" />
                <div className="h-4 bg-zinc-800 rounded w-3/4 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : products.length === 0 ? (
        /* Quick Start empty state */
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Quick Start</CardTitle>
            <CardDescription className="text-zinc-400">
              Get from zero to friction reports in five steps
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ol className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              {WORKFLOW_STEPS.map((step) => (
                <li key={step.number} className="flex flex-col items-center text-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-300">
                    {step.number}
                  </span>
                  <span className="text-sm font-medium">{step.title}</span>
                  <span className="text-xs text-zinc-500">{step.description}</span>
                </li>
              ))}
            </ol>
            <div className="flex justify-center mt-8 mb-2">
              <Link href="/products/new">
                <Button size="lg">Add Your First Product</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => {
            const summary = product.crawlSummary
              ? JSON.parse(product.crawlSummary)
              : null;
            const s = stats[product.id];
            return (
              <Link key={product.id} href={`/products/${product.id}`}>
                <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{product.name}</CardTitle>
                      {s && <StatusBadge status={s.lastRunStatus} />}
                    </div>
                    <CardDescription className="text-zinc-400">
                      {product.url}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary && (
                      <p className="text-sm text-zinc-500 line-clamp-2">
                        {summary.purpose}
                      </p>
                    )}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {summary ? "Analyzed" : "Pending"}
                      </Badge>
                      {s && (
                        <>
                          <Badge variant="secondary" className="text-xs">
                            {s.personaCount} {s.personaCount === 1 ? "persona" : "personas"}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {s.planCount} {s.planCount === 1 ? "plan" : "plans"}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {s.runCount} {s.runCount === 1 ? "run" : "runs"}
                          </Badge>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
