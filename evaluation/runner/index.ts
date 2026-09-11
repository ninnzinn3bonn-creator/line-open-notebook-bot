import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

type EvaluationCase = {
  id: string;
  category: string;
  question: string;
  expectedFacts: string[];
  expectedAnyOf?: string[][];
  forbiddenFacts: string[];
  shouldAnswer: boolean;
  severity: "normal" | "important" | "critical";
  setupMessages?: string[];
  expectedRoutes?: string[];
  sourceRequired?: boolean;
  maxSentences?: number;
};
type EvaluationDataset = { revision: string; timezone: string; cases: EvaluationCase[] };
type BridgeAnswer = {
  text: string;
  sources?: Array<{ id?: string }>;
  latencyMs?: number;
  promptRevision?: string;
  model?: { provider?: string; model?: string };
  usage?: { inputTokens?: number; outputTokens?: number };
  route?: string;
  grounding?: { topScore?: number; revision?: string };
};

const datasetPath = process.argv[2] ?? "evaluation/datasets/synthetic-store-v001.json";
const bridgeUrl = (process.env.BRIDGE_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/u, "");
const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as EvaluationDataset;
const normalize = (text: string) => text.normalize("NFKC")
  .replace(/[‐‑‒–—―−ー]/gu, "-")
  .replace(/[\s。、・（）()「」『』]/gu, "")
  .toLowerCase();
const results: Array<Record<string, unknown> & { id: string; passed: boolean; latencyMs: number }> = [];

function countSentences(text: string): number {
  return text.split(/[。！？!?]+/u).map((part) => part.trim()).filter(Boolean).length;
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

for (const testCase of dataset.cases) {
  const startedAt = performance.now();
  try {
    const userId = `evaluation:${dataset.revision}:${testCase.id}`;
    for (const message of testCase.setupMessages ?? []) {
      const setupResponse = await fetch(`${bridgeUrl}/internal/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, userId })
      });
      if (!setupResponse.ok) throw new Error(`Bridge setup returned ${setupResponse.status}: ${(await setupResponse.text()).slice(0, 300)}`);
    }
    const response = await fetch(`${bridgeUrl}/internal/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: testCase.question, userId })
    });
    if (!response.ok) throw new Error(`Bridge returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const answer = await response.json() as BridgeAnswer;
    const normalized = normalize(answer.text);
    const missingFacts = testCase.expectedFacts.filter((fact) => !normalized.includes(normalize(fact)));
    const missingAnyOf = (testCase.expectedAnyOf ?? []).filter((alternatives) =>
      !alternatives.some((fact) => normalized.includes(normalize(fact))));
    const forbiddenFacts = testCase.forbiddenFacts.filter((fact) => normalized.includes(normalize(fact)));
    const sourceRequired = testCase.sourceRequired ?? testCase.shouldAnswer;
    const missingSource = sourceRequired && !(answer.sources?.some((source) => source.id));
    const unexpectedSource = !sourceRequired && Boolean(answer.sources?.some((source) => source.id));
    const unexpectedRoute = Boolean(testCase.expectedRoutes?.length && !testCase.expectedRoutes.includes(answer.route ?? ""));
    const sentenceCount = countSentences(answer.text);
    const tooManySentences = testCase.maxSentences !== undefined && sentenceCount > testCase.maxSentences;
    const passed = missingFacts.length === 0 && missingAnyOf.length === 0 && forbiddenFacts.length === 0
      && !missingSource && !unexpectedSource && !unexpectedRoute && !tooManySentences;
    results.push({
      id: testCase.id,
      category: testCase.category,
      passed,
      missingFacts,
      missingAnyOf,
      forbiddenFacts,
      missingSource,
      unexpectedSource,
      unexpectedRoute,
      expectedRoutes: testCase.expectedRoutes,
      sentenceCount,
      tooManySentences,
      answer: answer.text,
      sources: answer.sources ?? [],
      latencyMs: answer.latencyMs ?? Math.round(performance.now() - startedAt),
      promptRevision: answer.promptRevision,
      model: answer.model,
      usage: answer.usage,
      route: answer.route,
      grounding: answer.grounding
    });
    console.error(`[${results.length}/${dataset.cases.length}] ${testCase.id} ${passed ? "PASS" : "FAIL"}`);
  } catch (error) {
    results.push({
      id: testCase.id,
      category: testCase.category,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Math.round(performance.now() - startedAt)
    });
    console.error(`[${results.length}/${dataset.cases.length}] ${testCase.id} ERROR`);
  }
}

const passed = results.filter((result) => result.passed).length;
const latencies = results.map((result) => result.latencyMs);
const routeCounts = results.reduce<Record<string, number>>((counts, result) => {
  const route = typeof result.route === "string" ? result.route : "error";
  counts[route] = (counts[route] ?? 0) + 1;
  return counts;
}, {});
const report = {
  generatedAt: new Date().toISOString(),
  datasetRevision: dataset.revision,
  datasetFile: basename(datasetPath),
  bridgeUrl,
  total: results.length,
  passed,
  failed: results.length - passed,
  passRate: results.length ? passed / results.length : 0,
  criticalFailures: results.filter((result) => !result.passed && dataset.cases.find((item) => item.id === result.id)?.severity === "critical").length,
  latency: {
    averageMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0,
    medianMs: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    maxMs: latencies.length ? Math.max(...latencies) : 0
  },
  routeCounts,
  rateLimitErrors: results.filter((result) => String(result.error ?? "").includes("429")).length,
  results
};
await mkdir(resolve("evaluation/results"), { recursive: true });
const outputPath = resolve("evaluation/results", `${dataset.revision}-${Date.now()}.json`);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report, results: results.map(({ id, passed: ok, latencyMs, ...failure }) => ({ id, passed: ok, latencyMs, ...(ok ? {} : failure) })), outputPath }, null, 2));
if (passed !== results.length) process.exitCode = 1;
