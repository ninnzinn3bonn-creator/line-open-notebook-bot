import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
if (status.trim()) throw new Error("Working tree must be clean before building a delivery package");
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const short = revision.slice(0, 12);
const outputDir = resolve(process.argv[2] ?? "release");
mkdirSync(outputDir, { recursive: true });
const archive = resolve(outputDir, `line-open-notebook-bot-${short}.zip`);
execFileSync("git", ["archive", "--format=zip", `--output=${archive}`, "HEAD"]);
const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
const manifest = {
  schema_version: 1,
  created_at: new Date().toISOString(),
  git_revision: revision,
  archive: archive.split(/[\\/]/u).pop(),
  sha256,
  excludes: [".env", "secrets", "databases", "logs", "private evaluation data", "generated evaluation results"],
  deployment_modes: ["tunnel", "direct"],
  install_sequence: ["bootstrap-server.sh", "doctor.sh", "deploy.sh", "install-systemd.sh", "acceptance-test.sh"]
};
writeFileSync(`${archive}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(`${archive}.sha256`, `${sha256}  ${manifest.archive}\n`);
console.log(JSON.stringify({ archive, manifest: `${archive}.manifest.json`, sha256 }, null, 2));
