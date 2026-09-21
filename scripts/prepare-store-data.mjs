import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function prepareStoreData(data) {
  const errors = validate(data);
  if (errors.length) throw new Error(errors.join("\n"));
  const publicFaqs = data.faqs.filter((faq) => faq.public);
  const knowledge = publicFaqs.map((faq) => [
    `# ${faq.category} — ${faq.faq_id}`,
    `- revision: ${data.store_revision}`,
    `- effective_from: ${data.effective_from}`,
    `- approved_by: ${data.approved_by}`,
    `- approved_at: ${data.approved_at}`,
    `- questions: ${faq.question_variants.join(" / ")}`,
    faq.conditions.length ? `- conditions: ${faq.conditions.join(" / ")}` : "",
    faq.exceptions.length ? `- exceptions: ${faq.exceptions.join(" / ")}` : "",
    "",
    faq.approved_answer.trim()
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");
  const cases = publicFaqs.flatMap((faq) => faq.question_variants.map((question, index) => ({
    id: `${faq.faq_id}-${String(index + 1).padStart(2, "0")}`,
    category: faq.category,
    question,
    expectedFacts: [faq.approved_answer.trim()],
    forbiddenFacts: [],
    shouldAnswer: true,
    severity: /料金|予約|キャンセル|返金|支払/u.test(faq.category) ? "critical" : "important",
    expectedRoutes: ["in_scope"],
    sourceRequired: true,
    maxSentences: 3
  })));
  const golden = { revision: `${data.store_revision}-golden`, timezone: "Asia/Tokyo", cases };
  const canonical = JSON.stringify(data);
  return {
    knowledge,
    golden,
    manifest: {
      schema_version: 1,
      store_revision: data.store_revision,
      effective_from: data.effective_from,
      approved_by: data.approved_by,
      public_faq_count: publicFaqs.length,
      excluded_non_public_count: data.faqs.length - publicFaqs.length,
      golden_case_count: cases.length,
      input_sha256: createHash("sha256").update(canonical).digest("hex")
    }
  };
}

function validate(data) {
  const errors = [];
  for (const key of ["store_revision", "effective_from", "provided_by", "approved_by", "approved_at", "faqs"]) {
    if (!(key in data)) errors.push(`missing root field: ${key}`);
  }
  if (!Array.isArray(data.faqs) || !data.faqs.length) return [...errors, "faqs must be a non-empty array"];
  const ids = new Set();
  data.faqs.forEach((faq, index) => {
    const prefix = `faqs[${index}]`;
    for (const key of ["faq_id", "category", "question_variants", "approved_answer", "conditions", "exceptions", "public"]) {
      if (!(key in faq)) errors.push(`${prefix}: missing ${key}`);
    }
    if (!faq.faq_id || ids.has(faq.faq_id)) errors.push(`${prefix}: faq_id is missing or duplicate`);
    ids.add(faq.faq_id);
    if (!Array.isArray(faq.question_variants) || !faq.question_variants.length) errors.push(`${prefix}: question_variants must be non-empty`);
    if (!Array.isArray(faq.conditions) || !Array.isArray(faq.exceptions)) errors.push(`${prefix}: conditions and exceptions must be arrays`);
    if (typeof faq.public !== "boolean") errors.push(`${prefix}: public must be boolean`);
  });
  return errors;
}

async function main() {
  const [inputPath, outputDirectory] = process.argv.slice(2);
  if (!inputPath || !outputDirectory) throw new Error("Usage: npm run store-data:prepare -- <private-json> <private-output-directory>");
  const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const prepared = prepareStoreData(input);
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(resolve(output, "knowledge.md"), `${prepared.knowledge}\n`),
    writeFile(resolve(output, "golden-dataset.json"), `${JSON.stringify(prepared.golden, null, 2)}\n`),
    writeFile(resolve(output, "manifest.json"), `${JSON.stringify(prepared.manifest, null, 2)}\n`)
  ]);
  console.log(JSON.stringify({ output, ...prepared.manifest }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
