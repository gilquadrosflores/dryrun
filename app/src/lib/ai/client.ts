import { GoogleGenerativeAI } from "@google/generative-ai";

let _client: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Add it to .env.local");
    }
    _client = new GoogleGenerativeAI(apiKey);
  }
  return _client;
}

export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userPrompt);
  const text = result.response.text();

  // Extract JSON from response (handles markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = jsonMatch[1]!.trim();

  return JSON.parse(jsonStr) as T;
}

export async function generateText(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userPrompt);
  return result.response.text();
}
