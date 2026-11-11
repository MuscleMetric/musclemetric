#!/usr/bin/env node
/**
 * Local-only import of Vital Animations Free50 clips into the Expo preview.
 * Uses the macOS /usr/bin/unzip command and Node built-ins: no Supabase writes.
 * Generated assets must never be committed to the public repository.
 *
 * Usage:
 *   node scripts/install-vital-preview.cjs "/path/to/VitalAnimations.zip" [--all]
 */
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const DEST = path.join(ROOT, "assets", "vital-preview");
const DEFAULT_IDS = ["0051", "0054", "0057", "0060", "0064", "0068", "0074", "0085", "0088", "0099"];
const source = process.argv[2];
const all = process.argv.includes("--all");
if (!source || !fs.existsSync(source)) {
  console.error('Usage: node scripts/install-vital-preview.cjs "/path/to/VitalAnimations.zip" [--all]');
  process.exit(1);
}
function zipListing(file) {
  return cp.execFileSync("unzip", ["-Z", "-1", file], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
}
function readZipText(file, entry) {
  return cp.execFileSync("unzip", ["-p", file, entry], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}
function extract(file, entry, destination) {
  const fd = fs.openSync(destination, "w");
  try {
    cp.execFileSync("unzip", ["-p", file, entry], { stdio: ["ignore", fd, "pipe"], maxBuffer: 1024 * 1024 });
  } finally {
    fs.closeSync(fd);
  }
}
const zip = path.resolve(source);
const names = zipListing(zip);
const metadataEntry = names.find((name) => name.endsWith("/Free50/50gymworkouts.json"));
if (!metadataEntry) throw new Error("Missing Free50/50gymworkouts.json in the supplied archive.");
const records = JSON.parse(readZipText(zip, metadataEntry));
if (!Array.isArray(records)) throw new Error("Free50 metadata must be a JSON array.");
const byId = new Map(records.map((row) => [String(row.id), row]));
const ids = all ? records.map((row) => String(row.id)) : DEFAULT_IDS;
fs.mkdirSync(DEST, { recursive: true });
const lines = [
  'import type { VitalPreviewAnimation } from "@/features/vitalPreview/types";',
  "",
  "// LOCALLY GENERATED FROM LICENSED SAMPLE MEDIA. DO NOT COMMIT THIS FILE OR THE MP4S.",
  "export const PREVIEW_ANIMATIONS: VitalPreviewAnimation[] = [",
];
for (const id of ids) {
  if (!/^\d{4}$/.test(id)) throw new Error("Unsafe animation ID: " + id);
  const record = byId.get(id);
  const mediaEntry = names.find((name) => name.endsWith("/Free50/Free50/" + id + ".mp4"));
  if (!record || !mediaEntry) throw new Error("Missing metadata or MP4 for " + id);
  const dest = path.join(DEST, id + ".mp4");
  extract(zip, mediaEntry, dest);
  if (fs.statSync(dest).size < 5000) throw new Error("MP4 appears incomplete: " + dest);
  const data = {
    exerciseId: id,
    name: String(record.name ?? ""),
    bodyPart: String(record.bodyPart ?? ""),
    equipment: String(record.equipment ?? ""),
    target: String(record.target ?? ""),
    secondaryMuscles: Array.isArray(record.secondaryMuscles) ? record.secondaryMuscles : [],
    difficulty: String(record.difficulty ?? "unspecified"),
    category: String(record.category ?? "strength"),
    description: Array.isArray(record.description) ? record.description : [String(record.description ?? "")],
    instructions: Array.isArray(record.instructions) ? record.instructions : [],
  };
  lines.push("  {");
  for (const [key, value] of Object.entries(data)) lines.push("    " + key + ": " + JSON.stringify(value) + ",");
  lines.push('    source: require("./' + id + '.mp4"),');
  lines.push("  },");
}
lines.push("];", "");
fs.writeFileSync(path.join(DEST, "manifest.ts"), lines.join("\n"));
console.log("Installed " + ids.length + " Vital Animations MP4s for local preview.");
console.log("No Supabase records were changed. DO NOT commit assets/vital-preview/manifest.ts or MP4s.");
