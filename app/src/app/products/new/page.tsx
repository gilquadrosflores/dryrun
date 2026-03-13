"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewProduct() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [goals, setGoals] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, goals: goals || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create product");
      }

      const product = await res.json();
      toast.success("Product created successfully");
      router.push(`/products/${product.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight mb-8">Add Product</h1>

      <Card>
        <CardHeader>
          <CardTitle>Product Details</CardTitle>
          <CardDescription>
            Enter your product URL and we&apos;ll analyze it to generate
            personas and test plans.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Product Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Product"
                required
                className="bg-[#0a0a0a] border-dashed border-[#333] focus:border-[#E8FF00]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Product URL
              </label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://myproduct.com"
                type="url"
                required
                className="bg-[#0a0a0a] border-dashed border-[#333] focus:border-[#E8FF00]"
              />
              <p className="text-xs text-[#555] mt-1">
                We&apos;ll crawl this page and sitemap to understand your
                product.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Testing Goals (optional)
              </label>
              <Textarea
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="What do you want to test? E.g., 'Test the onboarding flow for new teachers' or 'See if users can find the export feature'"
                rows={4}
                className="bg-[#0a0a0a] border-dashed border-[#333] focus:border-[#E8FF00]"
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? "Analyzing..." : "Add Product"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
