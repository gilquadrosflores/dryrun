import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Add it to .env.local");
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const client = getGeminiClient();
  const result = await client.models.generateContent({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
    },
    contents: userPrompt,
  });

  const text = result.text ?? "";

  // Try direct parse first (responseMimeType should give clean JSON)
  try {
    return JSON.parse(text) as T;
  } catch {
    // Fallback: extract from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]!.trim()) as T;
    }
    // Last resort: find first [ or { and parse from there
    const start = text.search(/[\[{]/);
    const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
    throw new Error(`Failed to parse JSON from AI response: ${text.slice(0, 200)}`);
  }
}

export async function generateText(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const client = getGeminiClient();
  const result = await client.models.generateContent({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: systemPrompt,
    },
    contents: userPrompt,
  });
  return result.text ?? "";
}
