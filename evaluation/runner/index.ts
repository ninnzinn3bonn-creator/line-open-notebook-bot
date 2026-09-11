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

for (const testCase of dataset.cases) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${bridgeUrl}/internal/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: testCase.question, userId: `evaluation:${dataset.revision}:${testCase.id}` })
    });
    if (!response.ok) throw new Error(`Bridge returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const answer = await response.json() as BridgeAnswer;
    const normalized = normalize(answer.text);
    const missingFacts = testCase.expectedFacts.filter((fact) => !normalized.includes(normalize(fact)));
    const missingAnyOf = (testCase.expectedAnyOf ?? []).filter((alternatives) =>
      !alternatives.some((fact) => normalized.includes(normalize(fact))));
    const forbiddenFacts = testCase.forbiddenFacts.filter((fact) => normalized.includes(normalize(fact)));
    const missingSource = testCase.shouldAnswer && !(answer.sources?.some((source) => source.id));
    const passed = missingFacts.length === 0 && missingAnyOf.length === 0 && forbiddenFacts.length === 0 && !missingSource;
    results.push({
      id: testCase.id,
      category: testCase.category,
      passed,
      missingFacts,
      missingAnyOf,
      forbiddenFacts,
      missingSource,
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
const report = {
  generatedAt: new Date().toISOString(),
  datasetRevision: dataset.revision,
  datasetFile: basename(datasetPath),
  bridgeUrl,
  total: results.length,
  passed,
  failed: results.length - passed,
  results
};
await mkdir(resolve("evaluation/results"), { recursive: true });
const outputPath = resolve("evaluation/results", `${dataset.revision}-${Date.now()}.json`);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report, results: results.map(({ id, passed: ok, latencyMs, ...failure }) => ({ id, passed: ok, latencyMs, ...(ok ? {} : failure) })), outputPath }, null, 2));
if (passed !== results.length) process.exitCode = 1;
