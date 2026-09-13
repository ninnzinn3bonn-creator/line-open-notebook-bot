import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run store-data:validate -- <path-to-private-json>");
  process.exit(2);
}

const data = JSON.parse(await readFile(path, "utf8"));
const errors = [];
const requiredRoot = ["store_revision", "effective_from", "provided_by", "approved_by", "approved_at", "faqs"];
for (const key of requiredRoot) if (!(key in data)) errors.push(`missing root field: ${key}`);
if (!Array.isArray(data.faqs) || data.faqs.length === 0) errors.push("faqs must be a non-empty array");

const ids = new Set();
for (const [index, faq] of (Array.isArray(data.faqs) ? data.faqs : []).entries()) {
  const prefix = `faqs[${index}]`;
  for (const key of ["faq_id", "category", "question_variants", "approved_answer", "conditions", "exceptions", "public"]) {
    if (!(key in faq)) errors.push(`${prefix}: missing ${key}`);
  }
  if (typeof faq.faq_id === "string") {
    if (ids.has(faq.faq_id)) errors.push(`${prefix}: duplicate faq_id ${faq.faq_id}`);
    ids.add(faq.faq_id);
  }
  if (!Array.isArray(faq.question_variants) || faq.question_variants.length === 0) errors.push(`${prefix}: question_variants must be non-empty`);
  if (!Array.isArray(faq.conditions)) errors.push(`${prefix}: conditions must be an array`);
  if (!Array.isArray(faq.exceptions)) errors.push(`${prefix}: exceptions must be an array`);
  if (typeof faq.public !== "boolean") errors.push(`${prefix}: public must be boolean`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({ valid: true, revision: data.store_revision, faqCount: data.faqs.length }, null, 2));
