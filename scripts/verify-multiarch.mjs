import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env.example", "utf8").split(/\r?\n/u)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
const images = ["OPEN_NOTEBOOK_IMAGE", "SURREALDB_IMAGE", "CLOUDFLARED_IMAGE", "CADDY_IMAGE"];
let failed = false;
for (const name of images) {
  const image = env[name];
  if (!image) { console.error(`FAIL ${name} missing`); failed = true; continue; }
  try {
    const raw = execFileSync("docker", ["buildx", "imagetools", "inspect", "--raw", image], { encoding: "utf8" });
    const manifest = JSON.parse(raw);
    const platforms = (manifest.manifests ?? []).map((item) => `${item.platform?.os}/${item.platform?.architecture}`);
    const arm64 = platforms.includes("linux/arm64");
    console.log(`${arm64 ? "PASS" : "FAIL"} ${name} linux/arm64${platforms.length ? ` platforms=${platforms.join(",")}` : ""}`);
    failed ||= !arm64;
  } catch (error) {
    console.error(`FAIL ${name} ${error.message}`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
