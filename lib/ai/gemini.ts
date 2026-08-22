import "server-only";

import { GoogleGenAI } from "@google/genai";
import { getServerEnv } from "@/lib/env";

let client: GoogleGenAI | undefined;

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

  for (let offset = 0; offset < contents.length; offset += 16) {
    const batch = contents.slice(offset, offset + 16);
    const response = await getClient().models.embedContent({
      model: env.GEMINI_EMBEDDING_MODEL,
      contents: batch,
      config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: 768 },
    });
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
