import { readFile } from "node:fs/promises";

type EvaluationDataset = {
  revision: string;
  cases: Array<{ id: string; question: string }>;
};

const datasetPath = process.argv[2] ?? "evaluation/datasets/regression.sample.json";
const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as EvaluationDataset;

console.log(JSON.stringify({
  status: "scaffold-ready",
  datasetRevision: dataset.revision,
  totalQuestions: dataset.cases.length,
  note: "OpenNotebookProvider and result persistence are implemented after live OpenAPI inspection."
}, null, 2));

