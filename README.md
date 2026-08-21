# FS Bench Lab

FS Bench Lab is a small, local-first workspace for testing whether APFS itself—or a confounding variable around it—is responsible for slow developer filesystem workloads.

The dashboard ships with clearly marked sample data from the public [`disk-perf-git-and-pnpm`](https://github.com/NullVoxPopuli/disk-perf-git-and-pnpm) results. Imported results stay in this browser's local storage. No benchmark data is uploaded.

## What it controls for

- native macOS vs. a Linux guest on the same Apple silicon host
- encrypted vs. unencrypted volumes
- internal vs. external storage
- VM/runtime, OS, filesystem, CPU, memory, disk, and test revisions
- repeated measurements and raw samples, rather than only one rounded timing

## Start the dashboard

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by the development server.

## Inspect a test target

```bash
node bin/fs-bench.mjs doctor --target "/Volumes/Benchmark"
```

## Run the benchmark

Install `git`, Node.js 22+, and pnpm 10+ first. The target must already exist.

```bash
node bin/fs-bench.mjs run \
  --target "/Volumes/Benchmark" \
  --iterations 5 \
  --label "External APFS · unencrypted" \
  --out fsbench-result.json
```

The runner creates a uniquely named temporary checkout inside the target, warms the pnpm store, then measures alternating `git clean` and offline `pnpm install` operations. It only runs destructive clean commands inside that temporary checkout and removes the checkout afterward. Pass `--keep` if you want to inspect it.

Import `fsbench-result.json` into the dashboard with **Import results**.

## Suggested comparison matrix

Run the same repository revision and tool versions on each target:

1. internal APFS with encryption enabled
2. external APFS with encryption enabled
3. external APFS without encryption
4. ext4 or btrfs inside a Linux VM stored on the same Mac
5. optionally, native Linux on that Mac if the hardware supports it

Keep Spotlight and endpoint-security status explicit. A VM result isolates more of macOS and APFS, but still includes virtualization and virtual-disk effects; it is useful evidence, not a pure filesystem-only comparison.

## Validate

```bash
npm run build
node bin/fs-bench.mjs doctor --target .
```
