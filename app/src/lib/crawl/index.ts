import { generateJSON } from "../ai/client";

interface CrawlResult {
  productName: string;
  purpose: string;
  targetUsers: string[];
  coreWorkflows: string[];
  keyFeatures: string[];
  uiPatterns: string[];
}

export async function crawlProduct(
  url: string,
  goals?: string
): Promise<CrawlResult> {
  // Fetch the landing page
  const pageContent = await fetchPage(url);

  // Try to fetch sitemap
  const sitemapUrls = await fetchSitemap(url);

  const systemPrompt = `You are a product analyst. Given a web page's content and optional sitemap, produce a structured analysis of the product. Return valid JSON only.`;

  const userPrompt = `Analyze this web product:

URL: ${url}
${goals ? `Goals/Context: ${goals}` : ""}

Page content:
${pageContent.substring(0, 15000)}

${sitemapUrls.length > 0 ? `Sitemap URLs (sample):\n${sitemapUrls.slice(0, 30).join("\n")}` : "No sitemap found."}

Return JSON with this exact structure:
{
  "productName": "Name of the product",
  "purpose": "One paragraph describing what this product does",
  "targetUsers": ["user type 1", "user type 2", ...],
  "coreWorkflows": ["workflow 1", "workflow 2", ...],
  "keyFeatures": ["feature 1", "feature 2", ...],
  "uiPatterns": ["pattern 1", "pattern 2", ...]
}`;

  return generateJSON<CrawlResult>(systemPrompt, userPrompt);
}

async function fetchPage(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    const html = await response.text();
    // Strip HTML tags for a rough text extraction
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (error) {
    return `Failed to fetch page: ${error}`;
  }
}

async function fetchSitemap(url: string): Promise<string[]> {
  try {
    const base = new URL(url);
    const sitemapUrl = `${base.origin}/sitemap.xml`;
    const response = await fetch(sitemapUrl, {
      headers: { "User-Agent": "Dryrun Bot" },
    });
    if (!response.ok) return [];
    const xml = await response.text();
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    return urls;
  } catch {
    return [];
  }
}
