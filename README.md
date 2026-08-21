# FS Bench Lab

FS Bench Lab is a small, local-first workspace for testing whether APFS itself—or a confounding variable around it—is responsible for slow developer filesystem workloads.

The dashboard ships with clearly marked sample data from the public [`disk-perf-git-and-pnpm`](https://github.com/NullVoxPopuli/disk-perf-git-and-pnpm) results. Imported results stay in this browser's local storage. No benchmark data is uploaded.

## What it controls for

- native macOS vs. a Linux guest on the same Apple silicon host
- encrypted vs. unencrypted volumes
- internal vs. external storage
- VM/runtime, OS, filesystem, CPU, memory, disk, and test revisions
- repeated measurements and raw samples, rather than only one rounded timing
- one and parallel worktree creation time
- clean and installed storage per worktree
- plain XFS versus XFS on VDO, with physical allocation kept separate from `du`

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

## Run the worktree density suite

The worktree suite measures one creation, eight parallel creations, clean allocation per worktree, and installed allocation per worktree:

```bash
node bin/fs-bench.mjs worktrees \
  --target "/Volumes/Benchmark" \
  --worktrees 8 \
  --pnpm-import-method auto \
  --label "APFS internal" \
  --out fsbench-worktrees.json
```

On a VDO-backed XFS mount, add the VDO stats device. This switches the primary storage result from `du` to the incremental physical-used value reported by `vdostats`, while retaining the logical directory allocation in the JSON:

```bash
node bin/fs-bench.mjs worktrees \
  --target /mnt/xfs-vdo \
  --worktrees 8 \
  --vdo-device vg_name-vpool0-vpool \
  --pnpm-import-method hardlink \
  --label "XFS + VDO" \
  --out xfs-vdo-worktrees.json
```

Run plain XFS and XFS + VDO in the same Linux guest with the same virtual-disk class, XFS options, repository revision, worktree count, and pnpm import method. VDO deduplicates and compresses below XFS, so a `du` result is not an honest substitute for physical VDO allocation. Red Hat’s current LVM-VDO documentation uses `vdostats` to monitor physical used/free space and recommends `mkfs.xfs -K` when formatting a VDO logical volume: [Creating and mounting an LVM-VDO volume](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/deduplicating_and_compressing_logical_volumes_on_rhel/creating-a-deduplicated-and-compressed-logical-volume_deduplicating-and-compressing-logical-volumes-on-rhel).

The runner does not create, format, resize, or remove volumes.

## Linux filesystems on the internal Mac SSD

There are three materially different setups:

1. **Linux tools and repository on a guest-native virtual disk.** This is the strongest performance candidate. The internal APFS volume stores a sparse disk image, but ext4/XFS/btrfs owns the project’s file and directory metadata inside the guest. Use SSH or an editor’s remote-development mode.
2. **Linux filesystem exported to macOS with [AnyLinuxFS](https://github.com/nohajc/anylinuxfs).** AnyLinuxFS attaches a partition or raw/qcow2 image to a microVM and exposes it to macOS over localhost NFS. It is lightweight and supports internal-drive images, but macOS tools see a network filesystem; benchmark file watching, locks, permissions, and metadata-heavy operations before adopting it for daily development.
3. **A macOS directory shared into Linux.** VirtioFS and similar host-folder shares remain APFS-backed. This is a useful control for OS/tooling overhead, but it is not a native Linux-filesystem result.

The VM path can win despite virtualization because its extra block-device hop is often cheaper than millions of native metadata operations. Guest caching and write coalescing can turn many small operations into fewer image-file block writes, and project files inside the guest avoid host per-file Spotlight, FSEvents, and endpoint-security processing. This is a hypothesis to test: cache warmth, durability settings, VM disk format, pnpm import method, and security tooling can all change the result.

## Suggested comparison matrix

Run the same repository revision and tool versions on each target:

1. internal APFS with encryption enabled
2. external APFS with encryption enabled
3. external APFS without encryption
4. ext4 or btrfs inside a Linux VM stored on the same Mac
5. plain XFS inside that Linux environment
6. XFS on an LVM-VDO volume with the same guest and virtual-disk class
7. optionally, native Linux on that Mac if the hardware supports it

Keep Spotlight and endpoint-security status explicit. A VM result isolates more of macOS and APFS, but still includes virtualization and virtual-disk effects; it is useful evidence, not a pure filesystem-only comparison.

## Validate

```bash
npm run build
node bin/fs-bench.mjs doctor --target .
```
