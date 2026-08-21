#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
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
function executeAsync(executable, params, cwd) {
  const start = process.hrtime.bigint();
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, params, { cwd, stdio:"ignore" });
    child.once("error", rejectPromise);
    child.once("close", (status) => status === 0
      ? resolvePromise(Number(process.hrtime.bigint() - start) / 1e9)
      : rejectPromise(new Error(`${executable} exited with status ${status ?? "unknown"}`)));
  });
}
function directoryKib(path) {
  const value = runText("du", ["-sk", path]).split(/\s+/)[0];
  if (!/^\d+$/.test(value)) throw new Error(`Could not measure allocated storage for ${path}`);
  return Number(value);
}
function vdoUsedKib(device) {
  const output = runText("vdostats", [device]);
  const line = output.split("\n").filter((value) => value.trim() && !/1K-blocks|Device/i.test(value)).at(-1) ?? "";
  const fields = line.trim().split(/\s+/);
  if (fields.length < 3 || !/^\d+$/.test(fields[2])) throw new Error(`Could not read physical usage from vdostats for ${device}`);
  return Number(fields[2]);
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

function operatingSystemInfo() {
  if (platform() === "darwin") {
    const osVersion = runText("sw_vers", ["-productVersion"]);
    const osBuild = runText("sw_vers", ["-buildVersion"]);
    return {
      os:`macOS ${osVersion}`,
      osVersion,
      osBuild,
      osReleaseChannel:osBuild !== "unknown" && /[a-z]$/i.test(osBuild) ? "pre-release" : osBuild === "unknown" ? "unknown" : "stable",
      kernel:`Darwin ${release()}`,
    };
  }
  if (platform() === "linux") {
    const distribution = runText("sh", ["-c", ". /etc/os-release 2>/dev/null && printf '%s' \"$PRETTY_NAME\""]);
    return {
      os:distribution === "unknown" ? `Linux ${release()}` : distribution,
      osVersion:distribution === "unknown" ? release() : distribution,
      osBuild:release(),
      osReleaseChannel:"unknown",
      kernel:`Linux ${release()}`,
    };
  }
  return { os:`${platform()} ${release()}`, osVersion:release(), osBuild:release(), osReleaseChannel:"unknown", kernel:release() };
}

function systemInfo(target) {
  const cpu = platform() === "darwin"
    ? runText("sysctl", ["-n", "machdep.cpu.brand_string"])
    : runText("sh", ["-c", "lscpu | sed -n 's/^Model name:[[:space:]]*//p' | head -1"]);
  const virtualization = platform() === "linux" ? runText("systemd-detect-virt", []) : "None";
  const normalizedVirtualization = virtualization === "none" || virtualization === "unknown" ? "None" : virtualization;
  return {
    ...operatingSystemInfo(),
    environment:platform() === "darwin" ? "Native macOS" : platform() === "linux" ? (normalizedVirtualization === "None" ? "Native Linux" : "Linux VM") : "Local",
    cpu,
    memoryGb:Math.round(totalmem() / 1024 ** 3),
    virtualization:normalizedVirtualization,
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
  fs-bench worktrees --target /mnt/xfs [--worktrees 8] [--vdo-device vg-vpool0-vpool]

Options:
  --target       Volume or folder to test (default: current directory)
  --iterations   Number of clean/install pairs (default: 5)
  --out          Result JSON path (default: fsbench-result.json)
  --keep         Keep the isolated benchmark checkout after the run
  --label        Human-readable result label
  --worktrees    Parallel worktree count (default: 8)
  --vdo-device   VDO stats device; enables physical-used delta measurement
  --pnpm-import-method  auto, hardlink, copy, clone, or clone-or-copy

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

if (command !== "run" && command !== "worktrees") {
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

const importMethod = option("pnpm-import-method", "auto");
const allowedImportMethods = new Set(["auto", "hardlink", "copy", "clone", "clone-or-copy"]);
if (!allowedImportMethods.has(importMethod)) {
  console.error("--pnpm-import-method must be auto, hardlink, copy, clone, or clone-or-copy");
  process.exit(1);
}

async function runWorktreeBenchmark() {
  const worktreeCount = Number(option("worktrees", "8"));
  if (!Number.isInteger(worktreeCount) || worktreeCount < 2 || worktreeCount > 64) {
    console.error("--worktrees must be an integer between 2 and 64");
    process.exitCode = 1;
    return;
  }
  const vdoDevice = option("vdo-device", "");
  const outputPath = resolve(option("out", "fsbench-worktrees.json"));
  const tempRoot = mkdtempSync(join(target, ".fs-bench-"));
  const repoPath = join(tempRoot, "workload");
  const singlePath = join(tempRoot, "single-worktree");
  const worktreesRoot = join(tempRoot, "parallel-worktrees");
  mkdirSync(worktreesRoot);
  const result = {
    schemaVersion:2,
    suite:"worktrees",
    status:"running",
    date:new Date().toISOString().slice(0,10),
    label:option("label", vdoDevice ? "XFS + VDO worktrees" : "Worktree benchmark"),
    target,
    repository:REPOSITORY,
    repositoryRevision:"unknown",
    pnpmImportMethod:importMethod,
    worktree:{ worktreeCount, storageBasis:vdoDevice ? "physical-delta" : "filesystem-allocated", vdoDevice:vdoDevice || null },
  };

  try {
    console.log(`\nFS Bench Lab · worktree suite\n${tempRoot}\n`);
    execute("git", ["clone", "--depth", "1", REPOSITORY, repoPath], target);
    result.repositoryRevision = runText("git", ["-C", repoPath, "rev-parse", "HEAD"]);
    console.log("\nWarming pnpm store (not measured)…");
    execute("pnpm", ["install", `--package-import-method=${importMethod}`], repoPath);
    Object.assign(result, systemInfo(repoPath));

    const createOneSeconds = execute("git", ["-C", repoPath, "worktree", "add", "--detach", singlePath, "HEAD"], repoPath, true);
    execute("sync", [], repoPath, true);
    const physicalBaselineKib = vdoDevice ? vdoUsedKib(vdoDevice) : null;

    const parallelStart = process.hrtime.bigint();
    await Promise.all(Array.from({ length:worktreeCount }, (_, index) =>
      executeAsync("git", ["-C", repoPath, "worktree", "add", "--detach", join(worktreesRoot, `worktree-${index + 1}`), "HEAD"], repoPath)));
    const createParallelSeconds = Number(process.hrtime.bigint() - parallelStart) / 1e9;
    execute("sync", [], repoPath, true);

    const logicalCleanKib = directoryKib(worktreesRoot);
    const physicalCleanKib = vdoDevice ? Math.max(0, vdoUsedKib(vdoDevice) - physicalBaselineKib) : logicalCleanKib;

    await Promise.all(Array.from({ length:worktreeCount }, (_, index) =>
      executeAsync("pnpm", ["install", "--offline", `--package-import-method=${importMethod}`], join(worktreesRoot, `worktree-${index + 1}`))));
    execute("sync", [], repoPath, true);

    const logicalInstalledKib = directoryKib(worktreesRoot);
    const physicalInstalledKib = vdoDevice ? Math.max(0, vdoUsedKib(vdoDevice) - physicalBaselineKib) : logicalInstalledKib;
    result.worktree = {
      ...result.worktree,
      createOneSeconds:Number(createOneSeconds.toFixed(4)),
      createParallelSeconds:Number(createParallelSeconds.toFixed(4)),
      cleanGiBPerWorktree:Number((physicalCleanKib / worktreeCount / 1024 ** 2).toFixed(6)),
      installedGiBPerWorktree:Number((physicalInstalledKib / worktreeCount / 1024 ** 2).toFixed(6)),
      logicalCleanGiBPerWorktree:Number((logicalCleanKib / worktreeCount / 1024 ** 2).toFixed(6)),
      logicalInstalledGiBPerWorktree:Number((logicalInstalledKib / worktreeCount / 1024 ** 2).toFixed(6)),
      note:vdoDevice ? "Physical VDO allocation is the incremental used-space delta after one baseline worktree." : "Storage is the filesystem-allocated size reported by du.",
    };
    result.status = "complete";
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\ncreate one ${createOneSeconds.toFixed(3)}s · create ${worktreeCount} parallel ${createParallelSeconds.toFixed(3)}s`);
    console.log(`clean ${result.worktree.cleanGiBPerWorktree.toFixed(3)} GiB/worktree · installed ${result.worktree.installedGiBPerWorktree.toFixed(3)} GiB/worktree`);
    console.log(`Result: ${outputPath}`);
  } catch (error) {
    result.status = "failed";
    result.error = error instanceof Error ? error.message : String(error);
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    console.error(`\nWorktree benchmark failed: ${result.error}`);
    process.exitCode = 1;
  } finally {
    if (has("keep")) console.log(`Kept isolated checkout: ${tempRoot}`);
    else if (tempRoot.startsWith(`${target}/.fs-bench-`)) rmSync(tempRoot, { recursive:true, force:true });
  }
}

if (command === "worktrees") {
  await runWorktreeBenchmark();
  process.exit(process.exitCode ?? 0);
}

const outputPath = resolve(option("out", "fsbench-result.json"));
const tempRoot = mkdtempSync(join(target, ".fs-bench-"));
const repoPath = join(tempRoot, "workload");
const result = { schemaVersion:2, suite:"pnpm", status:"running", date:new Date().toISOString().slice(0,10), label:option("label", "Local benchmark"), target, iterations, repository:REPOSITORY, repositoryRevision:"unknown", pnpmImportMethod:importMethod, note:"Created by FS Bench Lab CLI", measurements:{ cleanSeconds:[], installSeconds:[] } };

try {
  console.log(`\nFS Bench Lab · isolated workspace\n${tempRoot}\n`);
  execute("git", ["clone", "--depth", "1", REPOSITORY, repoPath], target);
  result.repositoryRevision = runText("git", ["-C", repoPath, "rev-parse", "HEAD"]);
  console.log("\nWarming pnpm store (not measured)…");
  execute("pnpm", ["install", `--package-import-method=${importMethod}`], repoPath);
  Object.assign(result, systemInfo(repoPath));

  for (let index = 0; index < iterations; index += 1) {
    console.log(`\nIteration ${index + 1}/${iterations}`);
    const cleanStart = process.hrtime.bigint();
    execute("git", ["clean", "-Xfd"], repoPath, true);
    execute("git", ["clean", "-fd"], repoPath, true);
    const cleanSeconds = Number(process.hrtime.bigint() - cleanStart) / 1e9;
    const installSeconds = execute("pnpm", ["install", "--offline", `--package-import-method=${importMethod}`], repoPath, true);
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
