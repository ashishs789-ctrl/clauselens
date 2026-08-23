import "server-only";

import { GoogleGenAI } from "@google/genai";
import { getServerEnv } from "@/lib/env";

let client: GoogleGenAI | undefined;
const EMBEDDING_BATCH_SIZE = 32;
const RATE_LIMIT_RETRY_DELAY_MS = 62_000;

function getClient() {
  if (client) return client;
  client = new GoogleGenAI({ apiKey: getServerEnv().GEMINI_API_KEY });
  return client;
}

export async function generateText(prompt: string, systemInstruction: string) {
  const env = getServerEnv();
  const response = await getClient().models.generateContent({
    model: env.GEMINI_GENERATION_MODEL,
    contents: prompt,
    config: {
      systemInstruction,
      temperature: 0.2,
      maxOutputTokens: 1_200,
    },
  });
  const text = response.text?.trim();
  if (!text) throw new Error("The AI provider returned an empty response.");
  return text;
}

export async function embedDocuments(contents: string[]) {
  if (!contents.length) return [];
  const env = getServerEnv();
  const vectors: number[][] = [];

  for (let offset = 0; offset < contents.length; offset += EMBEDDING_BATCH_SIZE) {
    const batch = contents.slice(offset, offset + EMBEDDING_BATCH_SIZE);
    const response = await withRateLimitRetry(() => getClient().models.embedContent({
      model: env.GEMINI_EMBEDDING_MODEL,
      // A string[] is normalized as multiple parts of one Content by the SDK,
      // which produces only one embedding. Explicit Content objects preserve
      // the one-input-to-one-vector relationship required by retrieval.
      contents: batch.map((content) => ({ parts: [{ text: content }] })),
      config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: 768 },
    }));
    const batchVectors = response.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
    if (batchVectors.length !== batch.length || batchVectors.some((vector) => vector.length !== 768)) {
      throw new Error("The AI provider returned invalid document embeddings.");
    }
    vectors.push(...batchVectors);
  }

  return vectors;
}

export async function embedQuery(content: string) {
  const env = getServerEnv();
  const response = await getClient().models.embedContent({
    model: env.GEMINI_EMBEDDING_MODEL,
    contents: content,
    config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 },
  });
  const vector = response.embeddings?.[0]?.values ?? [];
  if (vector.length !== 768) throw new Error("The AI provider returned an invalid query embedding.");
  return vector;
}

export async function generateTextStream(prompt: string, systemInstruction: string) {
  const env = getServerEnv();
  return getClient().models.generateContentStream({
    model: env.GEMINI_GENERATION_MODEL,
    contents: prompt,
    config: {
      systemInstruction,
      temperature: 0.15,
      maxOutputTokens: 1_500,
    },
  });
}

async function withRateLimitRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS));
    return operation();
  }
}

function isRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; code?: number; message?: string };
  return candidate.status === 429
    || candidate.code === 429
    || candidate.message?.includes("RESOURCE_EXHAUSTED") === true;
}
