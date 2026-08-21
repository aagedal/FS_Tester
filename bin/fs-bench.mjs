#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, platform, release, totalmem } from "node:os";
import { join, resolve } from "node:path";

const REPOSITORY = "https://github.com/NullVoxPopuli/disk-perf-git-and-pnpm.git";
const args = process.argv.slice(2);
const command = args[0] ?? "help";

function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function has(name) { return args.includes(`--${name}`); }
function runText(executable, params) {
  try { return execFileSync(executable, params, { encoding:"utf8", stdio:["ignore","pipe","ignore"] }).trim(); }
  catch { return "unknown"; }
}
function median(values) {
  const sorted = [...values].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function execute(executable, params, cwd, quiet = false) {
  const start = process.hrtime.bigint();
  const result = spawnSync(executable, params, { cwd, stdio:quiet ? "ignore" : "inherit" });
  if (result.status !== 0) throw new Error(`${executable} exited with status ${result.status ?? "unknown"}`);
  return Number(process.hrtime.bigint() - start) / 1e9;
}

function filesystemInfo(target) {
  if (platform() === "darwin") {
    const dfLine = runText("df", ["-P", target]).split("\n").at(-1) ?? "";
    const mount = dfLine.trim().split(/\s+/).slice(5).join(" ") || target;
    const info = runText("diskutil", ["info", mount]);
    const field = (name) => info.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, "mi"))?.[1]?.trim() ?? "unknown";
    const volume = field("Volume Name");
    const location = field("Device Location");
    return { filesystem:field("File System Personality"), encrypted:/^\s*(Encrypted|FileVault):\s*Yes/im.test(info), disk:location === "unknown" ? volume : `${volume} · ${location}`, mount:field("Mount Point") };
  }
  if (platform() === "linux") {
    const filesystem = runText("findmnt", ["-n", "-o", "FSTYPE", "--target", target]);
    const disk = runText("findmnt", ["-n", "-o", "SOURCE", "--target", target]);
    const mountOptions = runText("findmnt", ["-n", "-o", "OPTIONS", "--target", target]);
    return { filesystem, encrypted:/crypt/i.test(disk + mountOptions), disk, mount:target, mountOptions };
  }
  return { filesystem:"unknown", encrypted:false, disk:"unknown", mount:target };
}

function systemInfo(target) {
  const cpu = platform() === "darwin"
    ? runText("sysctl", ["-n", "machdep.cpu.brand_string"])
    : runText("sh", ["-c", "lscpu | sed -n 's/^Model name:[[:space:]]*//p' | head -1"]);
  const virtualization = platform() === "linux" ? runText("systemd-detect-virt", []) : "None";
  return {
    os:`${platform()} ${release()}`,
    cpu,
    memoryGb:Math.round(totalmem() / 1024 ** 3),
    virtualization:virtualization === "none" || virtualization === "unknown" ? "None" : virtualization,
    node:process.version,
    pnpm:runText("pnpm", ["--version"]),
    git:runText("git", ["--version"]),
    ...filesystemInfo(target),
  };
}

function printHelp() {
  console.log(`FS Bench Lab runner

Usage:
  fs-bench doctor [--target /Volumes/Benchmark]
  fs-bench run --target /Volumes/Benchmark [--iterations 5] [--out result.json]

Options:
  --target       Volume or folder to test (default: current directory)
  --iterations   Number of clean/install pairs (default: 5)
  --out          Result JSON path (default: fsbench-result.json)
  --keep         Keep the isolated benchmark checkout after the run
  --label        Human-readable result label

The runner never cleans an existing project. It creates and later removes its own
temporary clone inside the target path.`);
}

const target = resolve(option("target", process.cwd()).replace(/^~/, homedir()));
if (!existsSync(target) || !statSync(target).isDirectory()) {
  console.error(`Target is not a directory: ${target}`);
  process.exit(1);
}

if (command === "doctor") {
  console.log(JSON.stringify(systemInfo(target), null, 2));
  process.exit(0);
}

if (command !== "run") {
  printHelp();
  process.exit(command === "help" ? 0 : 1);
}

const iterations = Number(option("iterations", "5"));
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 30) {
  console.error("--iterations must be an integer between 1 and 30");
  process.exit(1);
}
if (runText("git", ["--version"]) === "unknown" || runText("pnpm", ["--version"]) === "unknown") {
  console.error("git and pnpm are required. Install pnpm 10+ before running this benchmark.");
  process.exit(1);
}

const outputPath = resolve(option("out", "fsbench-result.json"));
const tempRoot = mkdtempSync(join(target, ".fs-bench-"));
const repoPath = join(tempRoot, "workload");
const result = { schemaVersion:1, status:"running", date:new Date().toISOString().slice(0,10), label:option("label", "Local benchmark"), target, iterations, repository:REPOSITORY, repositoryRevision:"unknown", note:"Created by FS Bench Lab CLI", measurements:{ cleanSeconds:[], installSeconds:[] } };

try {
  console.log(`\nFS Bench Lab · isolated workspace\n${tempRoot}\n`);
  execute("git", ["clone", "--depth", "1", REPOSITORY, repoPath], target);
  result.repositoryRevision = runText("git", ["-C", repoPath, "rev-parse", "HEAD"]);
  console.log("\nWarming pnpm store (not measured)…");
  execute("pnpm", ["install"], repoPath);
  Object.assign(result, systemInfo(repoPath));

  for (let index = 0; index < iterations; index += 1) {
    console.log(`\nIteration ${index + 1}/${iterations}`);
    const cleanStart = process.hrtime.bigint();
    execute("git", ["clean", "-Xfd"], repoPath, true);
    execute("git", ["clean", "-fd"], repoPath, true);
    const cleanSeconds = Number(process.hrtime.bigint() - cleanStart) / 1e9;
    const installSeconds = execute("pnpm", ["install", "--offline"], repoPath, true);
    result.measurements.cleanSeconds.push(Number(cleanSeconds.toFixed(4)));
    result.measurements.installSeconds.push(Number(installSeconds.toFixed(4)));
    console.log(`clean ${cleanSeconds.toFixed(2)}s · install ${installSeconds.toFixed(2)}s`);
  }

  result.clean = Number(median(result.measurements.cleanSeconds).toFixed(4));
  result.install = Number(median(result.measurements.installSeconds).toFixed(4));
  result.status = "complete";
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nMedian: clean ${result.clean.toFixed(2)}s · install ${result.install.toFixed(2)}s`);
  console.log(`Result: ${outputPath}`);
} catch (error) {
  result.status = "failed";
  result.error = error instanceof Error ? error.message : String(error);
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.error(`\nBenchmark failed: ${result.error}`);
  process.exitCode = 1;
} finally {
  if (has("keep")) console.log(`Kept isolated checkout: ${tempRoot}`);
  else if (tempRoot.startsWith(`${target}/.fs-bench-`)) rmSync(tempRoot, { recursive:true, force:true });
}
