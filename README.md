# FS Bench Lab

FS Bench Lab is a small, local-first workspace for testing whether APFS itself—or a confounding variable around it—is responsible for slow developer filesystem workloads.

The dashboard ships with clearly marked sample data from the public [`disk-perf-git-and-pnpm`](https://github.com/NullVoxPopuli/disk-perf-git-and-pnpm) results. Imported results stay in this browser's local storage. No benchmark data is uploaded.

## What it controls for

- native macOS vs. a Linux guest on the same Apple silicon host
- a native Linux machine as an explicitly unmatched reference point
- encrypted vs. unencrypted volumes
- internal vs. external storage
- VM/runtime, exact OS version and build, filesystem, CPU, memory, disk, and test revisions
- repeated measurements and raw samples, rather than only one rounded timing
- one and parallel worktree creation time
- clean and installed storage per worktree
- plain XFS versus XFS on VDO, with physical allocation kept separate from `du`

## Start the dashboard locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by the development server.

You do not need to start the dashboard to run a benchmark. The CLI uses only Node.js built-ins; the dashboard is for viewing and comparing the JSON results.

## Run your first benchmark

The website cannot access your disks. Run these commands in Terminal on the Mac or Linux VM you want to measure.

### 1. Install the prerequisites

You need Node.js 22.13 or newer, Git, and pnpm 10. If you have never used this project—or Node.js—start here.

On **macOS**, open **Terminal** from Applications → Utilities. If the `brew` command is not available, install [Homebrew](https://brew.sh/) first. Then run:

```bash
brew install node git
npm install --global pnpm@10
```

On **Ubuntu or Debian**, install a current LTS version of Node.js from the official [Node.js download page](https://nodejs.org/en/download) first. Do not assume the distro’s default Node package is new enough. Then run:

```bash
sudo apt update
sudo apt install git
npm install --global pnpm@10
```

For another Linux distribution, install Git with its package manager, install Node.js 22.13 or newer from [nodejs.org](https://nodejs.org/en/download), then run `npm install --global pnpm@10`.

Verify all three tools before continuing:

```bash
node --version
git --version
pnpm --version
```

### 2. Download the runner

Do this once, then keep using the same checkout for every target:

```bash
git clone https://github.com/aagedal/FS_Tester.git
cd FS_Tester
```

No project dependency installation is needed to use the CLI. If you also want to run the dashboard on your own computer, run `npm install` followed by `npm run dev` from inside `FS_Tester`.

### 3. Choose a target folder

`--target` means “create the temporary benchmark checkout here.” The filesystem containing that folder is the filesystem being tested.

| What you want to test | Example target |
| --- | --- |
| The disk containing the `FS_Tester` checkout | `.` |
| An external macOS volume | `"/Volumes/My SSD"` |
| A filesystem inside a Linux VM | `/home/me` or `/mnt/xfs` |

On macOS, run `ls /Volumes` to see the exact names of connected volumes. If the name contains spaces, keep the quotation marks around the path.

The target must already exist and should have several GiB free. Connecting or mounting a drive is not enough if you still pass `.`—use the external volume’s path explicitly.

### 4. Inspect the target before writing

```bash
node bin/fs-bench.mjs doctor --target "/Volumes/My SSD"
```

Confirm that the reported filesystem, disk, mount point, encryption state, OS product version, and OS build match the setup you intended to test. On macOS the runner reads `sw_vers`, so a macOS 27 beta run is stored separately from macOS 26. A trailing lowercase letter in an Apple build number is marked as pre-release.

### 5. Pick a suite and run it

For Git clean and pnpm install timing:

```bash
node bin/fs-bench.mjs run \
  --target "/Volumes/Benchmark" \
  --iterations 5 \
  --label "External APFS · unencrypted" \
  --out fsbench-result.json
```

For worktree creation speed **and storage per worktree**:

```bash
node bin/fs-bench.mjs worktrees \
  --target "/Volumes/Benchmark" \
  --worktrees 8 \
  --pnpm-import-method auto \
  --label "External APFS · unencrypted" \
  --out fsbench-worktrees.json
```

The runner creates a uniquely named temporary checkout inside the target, warms the pnpm store, and performs the selected measurements. It only runs destructive clean commands inside that temporary checkout and removes the checkout afterward. Pass `--keep` if you want to inspect it.

### 6. Import the result

Open the dashboard, choose **Import results**, and select `fsbench-result.json` or `fsbench-worktrees.json`. Imported results remain in that browser’s local storage.

## Worktree density and VDO details

The worktree suite measures one creation, eight parallel creations, clean allocation per worktree, and installed allocation per worktree. Use exactly the same `--worktrees` and `--pnpm-import-method` values when comparing filesystems.

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

## Benchmark AnyLinuxFS against APFS

AnyLinuxFS exposes the Linux filesystem to macOS over NFS, so record both the
host-visible transport and the filesystem mounted inside its microVM. Start with
pnpm's `auto` import method on both targets. This measures the practical developer
experience, including the storage primitives available through each path.

First capture the APFS baseline:

```bash
node bin/fs-bench.mjs run \
  --target . \
  --iterations 5 \
  --pnpm-import-method auto \
  --label "Internal APFS · encrypted · auto import" \
  --out fsbench-apfs.json
```

Install and mount AnyLinuxFS by following its upstream instructions. Once
`anylinuxfs status` reports the volume mounted, replace the example path and
backing filesystem below with the actual values:

```bash
node bin/fs-bench.mjs doctor \
  --target "/Volumes/Linux" \
  --provider AnyLinuxFS \
  --backing-filesystem ext4

node bin/fs-bench.mjs run \
  --target "/Volumes/Linux" \
  --iterations 5 \
  --revision "REVISION_FROM_THE_APFS_RESULT" \
  --pnpm-import-method auto \
  --provider AnyLinuxFS \
  --backing-filesystem ext4 \
  --label "AnyLinuxFS · ext4 · auto import" \
  --out fsbench-anylinuxfs-ext4.json
```

Copy `repositoryRevision` from the APFS result into `--revision` for the
AnyLinuxFS run. Run each command at least twice and treat the first complete run
as warm-up if the package store was cold. Compare medians from the same macOS
build, workload revision, AnyLinuxFS configuration, and power/thermal state. The result is a
comparison of APFS with the full AnyLinuxFS microVM-plus-NFS path, not a direct
APFS-versus-ext4 filesystem-only measurement.

For a second, stricter control, repeat both runs with
`--pnpm-import-method copy`. That forces the same import strategy but can be
dramatically slower on large dependency trees; treat it as a separate experiment
and do not mix its samples with the `auto` results.

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
7. a native Linux machine on its own hardware as a contextual reference

Keep Spotlight and endpoint-security status explicit. A VM result isolates more of macOS and APFS, but still includes virtualization and virtual-disk effects; it is useful evidence, not a pure filesystem-only comparison. A separate native Linux machine shows what a strong real-world Linux setup can achieve, but CPU, RAM, SSD, controller, kernel, and security differences mean it must not be presented as a controlled APFS-versus-Linux result.

Do not merge results across OS updates. macOS performance changes can affect filesystem-heavy workloads independently of APFS itself, so treat macOS 26, macOS 27 beta, and the final macOS 27 release as separate environments. The build number matters because different beta seeds can behave differently even when the displayed product version is the same.

## Validate

```bash
npm run build
node bin/fs-bench.mjs doctor --target .
```
