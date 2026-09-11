import { readFile } from "node:fs/promises";

const baseUrl = (process.env.OPEN_NOTEBOOK_BASE_URL ?? "http://127.0.0.1:15055").replace(/\/$/u, "");
const title = "[PoC synthetic data] Midori Bookstore FAQ v001";
const content = await readFile("evaluation/fixtures/synthetic-store-faq-v001.md", "utf8");
const listResponse = await fetch(`${baseUrl}/api/sources?limit=100`);
if (!listResponse.ok) throw new Error(`Cannot list sources: ${listResponse.status}`);
const existing = (await listResponse.json()).find((source) => source.title === title);

if (existing) {
  console.log(JSON.stringify({ status: "existing", id: existing.id, embedded: existing.embedded, embeddedChunks: existing.embedded_chunks }));
  process.exit(0);
}

const response = await fetch(`${baseUrl}/api/sources/json`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "text", title, content, embed: true, async_processing: true })
});
if (!response.ok) throw new Error(`Cannot create source (${response.status}): ${(await response.text()).slice(0, 500)}`);
const source = await response.json();
console.log(JSON.stringify({ status: "created", id: source.id, title: source.title, embedded: source.embedded, embeddedChunks: source.embedded_chunks }));

