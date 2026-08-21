"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Run = {
  id: string;
  label: string;
  environment: string;
  os: string;
  osVersion?: string;
  osBuild?: string;
  osReleaseChannel?: "stable" | "pre-release" | "unknown";
  filesystem: string;
  filesystemProvider?: string;
  filesystemTransport?: string;
  backingFilesystem?: string;
  encrypted: boolean;
  disk: string;
  cpu: string;
  memoryGb: number;
  virtualization: string;
  clean: number;
  install: number;
  iterations: number;
  date: string;
  note: string;
  source: "sample" | "imported";
};

type WorktreeResult = {
  id: string;
  label: string;
  filesystem: string;
  os?: string;
  osBuild?: string;
  osReleaseChannel?: "stable" | "pre-release" | "unknown";
  stack: "plain" | "vdo" | "cow" | "other";
  createOne: number | null;
  createParallel: number | null;
  cleanGiB: number | null;
  installedGiB: number | null;
  worktreeCount: number;
  storageBasis: "filesystem-allocated" | "physical-delta";
  note: string;
  source: "screenshot" | "imported";
};

const sampleRuns: Run[] = [
  { id:"m5-apfs", label:"Mac internal", environment:"Native macOS", os:"macOS 26.5.1", filesystem:"APFS", encrypted:true, disk:"Apple SSD AP1024Z", cpu:"Apple M5 Pro", memoryGb:48, virtualization:"None", clean:32.0, install:34.9, iterations:3, date:"2026-07-03", note:"Community reference run", source:"sample" },
  { id:"m5-apfs-spot", label:"Mac internal · no Spotlight", environment:"Native macOS", os:"macOS 26.5.1", filesystem:"APFS", encrypted:true, disk:"Apple SSD AP1024Z", cpu:"Apple M5 Pro", memoryGb:48, virtualization:"None", clean:30.4, install:34.4, iterations:3, date:"2026-07-03", note:"~/dev excluded from Spotlight", source:"sample" },
  { id:"m5-vm", label:"Linux VM", environment:"OrbStack VM", os:"Ubuntu 26.04", filesystem:"btrfs", encrypted:false, disk:"Virtual disk on Apple SSD", cpu:"Apple M5 Pro · 6 vCPU", memoryGb:12, virtualization:"OrbStack", clean:2.9, install:14.6, iterations:3, date:"2026-07-03", note:"Native VM filesystem, not a macOS mount", source:"sample" },
  { id:"m2-apfs", label:"Mac internal · M2", environment:"Native macOS", os:"macOS 14.7.3", filesystem:"APFS", encrypted:true, disk:"Apple SSD AP1024Z", cpu:"Apple M2 Max", memoryGb:16, virtualization:"None", clean:31.5, install:44.2, iterations:1, date:"2025-02-08", note:"Community reference run", source:"sample" },
  { id:"m2-vm", label:"Linux VM · M2", environment:"Parallels VM", os:"Ubuntu 24.04", filesystem:"ext4", encrypted:false, disk:"Virtual disk on Apple SSD", cpu:"Apple M2 Max · 6 vCPU", memoryGb:16, virtualization:"Parallels", clean:3.2, install:12.0, iterations:1, date:"2025-02-14", note:"Same host model, separate community run", source:"sample" },
  { id:"m2-vm-enc", label:"Linux VM · encrypted", environment:"Parallels VM", os:"Ubuntu 24.04", filesystem:"ext4 + LVM2", encrypted:true, disk:"Virtual disk on Apple SSD", cpu:"Apple M2 Max · 6 vCPU", memoryGb:16, virtualization:"Parallels", clean:2.8, install:11.9, iterations:1, date:"2025-02-14", note:"Guest volume encryption enabled", source:"sample" },
  { id:"m4-apfs", label:"Mac internal · M4", environment:"Native macOS", os:"macOS 15.2", filesystem:"APFS", encrypted:true, disk:"Apple SSD AP1024Z", cpu:"Apple M4", memoryGb:16, virtualization:"None", clean:29.6, install:31.4, iterations:1, date:"2025-02-08", note:"Community reference run", source:"sample" },
  { id:"m4-vm", label:"Linux VM · M4", environment:"UTM VM", os:"Ubuntu 24.10", filesystem:"ext4", encrypted:false, disk:"Virtual disk on Apple SSD", cpu:"Apple M4 Pro · 6 vCPU", memoryGb:6, virtualization:"UTM", clean:2.5, install:16.9, iterations:1, date:"2025-02-26", note:"Cross-model reference; do not treat as paired", source:"sample" },
  { id:"linux-7900x-ext4", label:"Native Linux reference", environment:"Native Linux", os:"Ubuntu 24.04.1", filesystem:"ext4", encrypted:false, disk:"Samsung SSD 980 Pro 2TB", cpu:"AMD Ryzen 9 7900X · 12C/24T", memoryGb:64, virtualization:"None", clean:6.0, install:4.3, iterations:1, date:"2025-02-07", note:"Screenshot reference · different hardware; context only, not a matched APFS comparison", source:"sample" },
];

const worktreeSamples: WorktreeResult[] = [
  { id:"wt-apfs", label:"APFS", filesystem:"APFS", os:"macOS (version not shown)", stack:"cow", createOne:1.263, createParallel:null, cleanGiB:.239, installedGiB:.349, worktreeCount:8, storageBasis:"filesystem-allocated", note:"Native Apple M5 Max · parallel value was obscured", source:"screenshot" },
  { id:"wt-btrfs", label:"Btrfs", filesystem:"btrfs", os:"Linux (version not shown)", stack:"cow", createOne:.652, createParallel:2.109, cleanGiB:.139, installedGiB:.538, worktreeCount:8, storageBasis:"filesystem-allocated", note:"Native AMD Ryzen AI Max+ 395 · screenshot reference", source:"screenshot" },
  { id:"wt-ext4", label:"ext4", filesystem:"ext4", os:"Linux (version not shown)", stack:"plain", createOne:.639, createParallel:.671, cleanGiB:.236, installedGiB:.604, worktreeCount:8, storageBasis:"filesystem-allocated", note:"Native AMD Ryzen AI Max+ 395 · screenshot reference", source:"screenshot" },
  { id:"wt-xfs", label:"XFS", filesystem:"XFS", os:"Linux (version not shown)", stack:"plain", createOne:.646, createParallel:.680, cleanGiB:.239, installedGiB:.386, worktreeCount:8, storageBasis:"filesystem-allocated", note:"Native AMD Ryzen AI Max+ 395 · plain XFS", source:"screenshot" },
  { id:"wt-vdo", label:"XFS + VDO", filesystem:"XFS", os:"Linux (version not shown)", stack:"vdo", createOne:.647, createParallel:.702, cleanGiB:.128, installedGiB:.195, worktreeCount:8, storageBasis:"physical-delta", note:"Native AMD Ryzen AI Max+ 395 · VDO physical allocation", source:"screenshot" },
  { id:"wt-zfs", label:"ZFS", filesystem:"ZFS", os:"Linux (version not shown)", stack:"cow", createOne:.775, createParallel:1.081, cleanGiB:.019, installedGiB:.319, worktreeCount:10, storageBasis:"physical-delta", note:"Native AMD Ryzen AI Max+ 395 · 10-worktree quick pass", source:"screenshot" },
];

const fmt = (value: number) => `${value.toFixed(value < 10 ? 2 : 1)}s`;
const fmtGiB = (value: number) => `${value.toFixed(3)} GiB`;
const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
const filesystemLabel = (run: Pick<Run, "filesystem" | "filesystemProvider" | "filesystemTransport" | "backingFilesystem">) => {
  if (!run.backingFilesystem && !run.filesystemProvider) return run.filesystem;
  const bridge = run.filesystemProvider ?? run.filesystemTransport ?? run.filesystem;
  return `${run.backingFilesystem ?? run.filesystem} via ${bridge}${run.filesystemTransport && run.filesystemTransport !== bridge ? ` (${run.filesystemTransport})` : ""}`;
};

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [runs, setRuns] = useState<Run[]>(sampleRuns);
  const [worktrees, setWorktrees] = useState<WorktreeResult[]>(worktreeSamples);
  const [metric, setMetric] = useState<"clean" | "install">("clean");
  const [spaceMetric, setSpaceMetric] = useState<"cleanGiB" | "installedGiB">("installedGiB");
  const [filter, setFilter] = useState("All environments");
  const [osFilter, setOsFilter] = useState("All OS versions");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState("");
  const [target, setTarget] = useState(".");
  const [label, setLabel] = useState("Internal APFS");
  const [iterations, setIterations] = useState(5);
  const [suite, setSuite] = useState<"pnpm" | "worktrees">("pnpm");
  const [vdoDevice, setVdoDevice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("fsbench-imports");
    if (saved) {
      try { setRuns([...JSON.parse(saved), ...sampleRuns]); } catch { /* keep samples */ }
    }
    const savedWorktrees = window.localStorage.getItem("fsbench-worktree-imports");
    if (savedWorktrees) {
      try { setWorktrees([...JSON.parse(savedWorktrees), ...worktreeSamples]); } catch { /* keep samples */ }
    }
  }, []);

  const filtered = useMemo(() => runs.filter((run) => {
    const groupMatch = filter === "All environments" ||
      (filter === "Native macOS" && run.environment === "Native macOS") ||
      (filter === "Linux VM" && run.virtualization !== "None") ||
      (filter === "Native Linux" && run.environment === "Native Linux") ||
      (filter === "Encrypted" && run.encrypted);
    const haystack = `${run.label} ${run.os} ${filesystemLabel(run)} ${run.cpu}`.toLowerCase();
    const osMatch = osFilter === "All OS versions" || run.os === osFilter;
    return groupMatch && osMatch && haystack.includes(query.toLowerCase());
  }), [filter, osFilter, query, runs]);

  const osVersions = useMemo(() => [...new Set(runs.map((run) => run.os))].sort(), [runs]);

  const chartRuns = filtered.slice(0, 6);
  const maxValue = Math.max(...chartRuns.map((run) => run[metric]), 1);
  const spaceMax = Math.max(...worktrees.map((run) => run[spaceMetric] ?? 0), 1);
  const macDependencyCommand = "brew install node git\nnpm install --global pnpm@10";
  const linuxDependencyCommand = "sudo apt update\nsudo apt install git\nnpm install --global pnpm@10";
  const setupCommand = "git clone https://github.com/aagedal/FS_Tester.git\ncd FS_Tester";
  const doctorCommand = `node bin/fs-bench.mjs doctor --target ${shellQuote(target)}`;
  const command = suite === "pnpm"
    ? `node bin/fs-bench.mjs run --target ${shellQuote(target)} --iterations ${iterations} --label ${shellQuote(label)} --out fsbench-result.json`
    : `node bin/fs-bench.mjs worktrees --target ${shellQuote(target)} --worktrees 8${vdoDevice ? ` --vdo-device ${shellQuote(vdoDevice)}` : ""} --label ${shellQuote(label)} --out fsbench-worktrees.json`;

  function persist(imported: Run[]) {
    const custom = [...imported, ...runs.filter((run) => run.source === "imported")];
    window.localStorage.setItem("fsbench-imports", JSON.stringify(custom));
    setRuns([...custom, ...sampleRuns]);
  }

  function persistWorktrees(imported: WorktreeResult[]) {
    const custom = [...imported, ...worktrees.filter((run) => run.source === "imported")];
    window.localStorage.setItem("fsbench-worktree-imports", JSON.stringify(custom));
    setWorktrees([...custom, ...worktreeSamples]);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function copyText(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    showToast(message);
  }

  function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        if (Array.isArray(raw.worktrees)) {
          const importedWorktrees: WorktreeResult[] = raw.worktrees.map((item: Record<string, unknown>, index: number) => ({
            id:String(item.id ?? `worktree-${Date.now()}-${index}`),
            label:String(item.label ?? `${item.filesystem ?? "Filesystem"} worktrees`),
            filesystem:String(item.filesystem ?? "Unknown"),
            os:item.os == null ? undefined : String(item.os),
            osBuild:item.osBuild == null ? undefined : String(item.osBuild),
            osReleaseChannel:item.osReleaseChannel === "stable" || item.osReleaseChannel === "pre-release" ? item.osReleaseChannel : "unknown",
            stack:item.stack === "vdo" || item.storageBasis === "physical-delta" ? "vdo" : item.stack === "cow" ? "cow" : "plain",
            createOne:item.createOne == null ? null : Number(item.createOne),
            createParallel:item.createParallel == null ? null : Number(item.createParallel),
            cleanGiB:item.cleanGiB == null ? null : Number(item.cleanGiB),
            installedGiB:item.installedGiB == null ? null : Number(item.installedGiB),
            worktreeCount:Number(item.worktreeCount ?? 8),
            storageBasis:item.storageBasis === "physical-delta" ? "physical-delta" : "filesystem-allocated",
            note:String(item.note ?? "Imported worktree result"),
            source:"imported",
          }));
          persistWorktrees(importedWorktrees);
          if (!Array.isArray(raw.runs)) {
            showToast(`${importedWorktrees.length} worktree result${importedWorktrees.length === 1 ? "" : "s"} imported`);
            event.target.value = "";
            return;
          }
        }
        if (raw.suite === "worktrees" || raw.worktree) {
          const item = raw.worktree ?? raw;
          const imported: WorktreeResult = {
            id:String(item.id ?? `worktree-${Date.now()}`),
            label:String(item.label ?? `${item.filesystem ?? "Filesystem"} worktrees`),
            filesystem:String(item.filesystem ?? raw.filesystem ?? "Unknown"),
            os:String(item.os ?? raw.os ?? "Unknown OS"),
            osBuild:item.osBuild == null && raw.osBuild == null ? undefined : String(item.osBuild ?? raw.osBuild),
            osReleaseChannel:item.osReleaseChannel === "stable" || item.osReleaseChannel === "pre-release" ? item.osReleaseChannel : raw.osReleaseChannel === "stable" || raw.osReleaseChannel === "pre-release" ? raw.osReleaseChannel : "unknown",
            stack:item.storageBasis === "physical-delta" || item.vdoDevice ? "vdo" : "plain",
            createOne:item.createOneSeconds == null ? (item.createOne == null ? null : Number(item.createOne)) : Number(item.createOneSeconds),
            createParallel:item.createParallelSeconds == null ? (item.createParallel == null ? null : Number(item.createParallel)) : Number(item.createParallelSeconds),
            cleanGiB:item.cleanGiBPerWorktree == null ? (item.cleanGiB == null ? null : Number(item.cleanGiB)) : Number(item.cleanGiBPerWorktree),
            installedGiB:item.installedGiBPerWorktree == null ? (item.installedGiB == null ? null : Number(item.installedGiB)) : Number(item.installedGiBPerWorktree),
            worktreeCount:Number(item.worktreeCount ?? 8),
            storageBasis:item.storageBasis === "physical-delta" ? "physical-delta" : "filesystem-allocated",
            note:String(item.note ?? "Imported from worktree suite"),
            source:"imported",
          };
          persistWorktrees([imported]);
          showToast("Worktree result imported");
          event.target.value = "";
          return;
        }
        const payload = Array.isArray(raw) ? raw : raw.runs ?? [raw];
        const normalized: Run[] = payload.map((item: Record<string, unknown>, index: number) => {
          const measurements = item.measurements as { cleanSeconds?: number[]; installSeconds?: number[] } | undefined;
          const cleanValues = measurements?.cleanSeconds ?? [];
          const installValues = measurements?.installSeconds ?? [];
          const median = (values: number[]) => [...values].sort((a,b)=>a-b)[Math.floor(values.length / 2)] ?? 0;
          return {
            id: String(item.id ?? `import-${Date.now()}-${index}`),
            label: String(item.label ?? "Imported run"),
            environment: String(item.environment ?? item.virtualization ?? "Local"),
            os: String(item.os ?? "Unknown OS"),
            osVersion:item.osVersion == null ? undefined : String(item.osVersion),
            osBuild:item.osBuild == null ? undefined : String(item.osBuild),
            osReleaseChannel:item.osReleaseChannel === "stable" || item.osReleaseChannel === "pre-release" ? item.osReleaseChannel : "unknown",
            filesystem: String(item.filesystem ?? "Unknown"),
            filesystemProvider:item.filesystemProvider == null ? undefined : String(item.filesystemProvider),
            filesystemTransport:item.filesystemTransport == null ? undefined : String(item.filesystemTransport),
            backingFilesystem:item.backingFilesystem == null ? undefined : String(item.backingFilesystem),
            encrypted: Boolean(item.encrypted),
            disk: String(item.disk ?? "Unknown disk"),
            cpu: String(item.cpu ?? "Unknown CPU"),
            memoryGb: Number(item.memoryGb ?? 0),
            virtualization: String(item.virtualization ?? "None"),
            clean: Number(item.clean ?? median(cleanValues)),
            install: Number(item.install ?? median(installValues)),
            iterations: Number(item.iterations ?? cleanValues.length ?? 1),
            date: String(item.date ?? new Date().toISOString().slice(0,10)),
            note: String(item.note ?? "Imported from CLI"),
            source: "imported" as const,
          };
        });
        persist(normalized);
        showToast(`${normalized.length} result${normalized.length === 1 ? "" : "s"} imported`);
      } catch { showToast("That file is not a valid FS Bench result"); }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  function exportRuns() {
    const blob = new Blob([JSON.stringify({ schemaVersion:2, exportedAt:new Date().toISOString(), runs, worktrees }, null, 2)], { type:"application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "fs-bench-lab-results.json";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    showToast("Results exported");
  }

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior:"smooth" });

  return (
    <main className="shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => scrollTo("overview")}><span className="brandMark">FS</span><span>Bench Lab</span></button>
        <nav aria-label="Main navigation">
          <button className="navItem active" onClick={() => scrollTo("overview")}><Icon>⌁</Icon> Overview</button>
          <button className="navItem" onClick={() => scrollTo("runs")}><Icon>◫</Icon> Test runs</button>
          <button className="navItem" onClick={() => scrollTo("compare")}><Icon>⇆</Icon> Compare</button>
          <button className="navItem" onClick={() => scrollTo("worktrees")}><Icon>▤</Icon> Worktree space</button>
          <button className="navItem" onClick={() => scrollTo("access-paths")}><Icon>◇</Icon> Linux on Mac</button>
          <button className="navItem" onClick={() => scrollTo("method")}><Icon>◎</Icon> Methodology</button>
        </nav>
        <div className="sideNote">
          <span className="eyebrow">Current suite</span>
          <strong>macOS, VM + native Linux</strong>
          <span>{runs.length + worktrees.length} results · local workspace</span>
          <button onClick={exportRuns}>Export dataset <span>↗</span></button>
        </div>
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar">
          <div><span className="crumb">Experiments /</span> APFS fairness test <span className="sampleTag">SAMPLE DATA</span></div>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={importFile} hidden />
          <button className="secondary" onClick={() => fileRef.current?.click()}>Import results</button>
          <button className="primary" onClick={() => setModal(true)}>＋ New test run</button>
        </header>

        <div className="content">
          <section className="hero">
            <div>
              <p className="kicker">CONTROLLED FILESYSTEM EXPERIMENTS</p>
              <h1>Is APFS really<br />the bottleneck?</h1>
              <p className="lede">Compare speed and physical footprint across native macOS, external storage, Linux guests, and deduplicated XFS—without losing the context that makes a result credible.</p>
              <div className="heroActions"><button className="primary large" onClick={() => setModal(true)}>Run the benchmark <span>→</span></button><button className="textButton" onClick={() => scrollTo("method")}>Review the test plan</button></div>
            </div>
            <div className="fairnessCard">
              <div className="fairnessTop"><span>Comparison matrix</span><strong>5 / 6 represented</strong></div>
              <div className="segments six"><i></i><i></i><i></i><i></i><i></i><i className="empty"></i></div>
              <ul>
                <li><span className="done">✓</span><span>Native APFS, encrypted<small>Original baseline</small></span></li>
                <li><span className="todo">○</span><span>External APFS, unencrypted<small>Pending a real external-drive run</small></span></li>
                <li><span className="done">✓</span><span>Linux VM on same Mac<small>Controls for host hardware</small></span></li>
                <li><span className="done">✓</span><span>Plain XFS<small>Filesystem baseline</small></span></li>
                <li><span className="done">✓</span><span>XFS on VDO<small>Deduplication + compression</small></span></li>
                <li><span className="done">✓</span><span>Native Linux machine<small>Context point; hardware is not matched</small></span></li>
              </ul>
            </div>
          </section>

          <section className="results" id="compare">
            <div className="sectionHead">
              <div><p className="kicker">RESULT EXPLORER</p><h2>Compare without hiding the variables</h2></div>
              <div className="controlRow">
                <div className="segControl" aria-label="Metric">
                  <button className={metric === "clean" ? "selected" : ""} onClick={() => setMetric("clean")}>Clean</button>
                  <button className={metric === "install" ? "selected" : ""} onClick={() => setMetric("install")}>Install</button>
                </div>
                <select aria-label="Environment filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option>All environments</option><option>Native macOS</option><option>Linux VM</option><option>Native Linux</option><option>Encrypted</option>
                </select>
                <select aria-label="Operating system version filter" value={osFilter} onChange={(event) => setOsFilter(event.target.value)}>
                  <option>All OS versions</option>{osVersions.map((os) => <option key={os}>{os}</option>)}
                </select>
              </div>
            </div>

            <div className="chartCard">
              <div className="chartTop"><span>Median duration · lower is better</span><span>seconds</span></div>
              <div className="bars">
                {chartRuns.map((run) => <div className="barRow" key={run.id}>
                  <div className="barLabel"><strong>{run.label}</strong><small>{filesystemLabel(run)} · {run.os}{run.osReleaseChannel === "pre-release" ? " · pre-release" : ""}</small></div>
                  <div className="barTrack"><i className={run.environment === "Native macOS" ? "macBar" : "linuxBar"} style={{width:`${Math.max(3, run[metric] / maxValue * 100)}%`}}></i></div>
                  <strong className="barValue">{fmt(run[metric])}</strong>
                </div>)}
              </div>
              <div className="chartFoot"><span><i className="dot macDot"></i>Native macOS</span><span><i className="dot linuxDot"></i>Linux VM or native</span><small>Cross-machine Linux results provide context, not a controlled filesystem conclusion.</small></div>
            </div>
          </section>

          <section className="worktreeSection" id="worktrees">
            <div className="sectionHead worktreeHead">
              <div><p className="kicker">WORKTREE DENSITY</p><h2>Space is a result, too</h2><p className="sectionIntro">Track creation time and incremental storage per worktree. For VDO, the runner uses the block layer’s physical delta—not a logical directory size that ignores deduplication.</p></div>
              <div className="segControl" aria-label="Worktree storage state">
                <button className={spaceMetric === "cleanGiB" ? "selected" : ""} onClick={() => setSpaceMetric("cleanGiB")}>Clean</button>
                <button className={spaceMetric === "installedGiB" ? "selected" : ""} onClick={() => setSpaceMetric("installedGiB")}>Installed</button>
              </div>
            </div>

            <div className="storageLayout">
              <div className="chartCard storageChart">
                <div className="chartTop"><span>Incremental storage · lower is better</span><span>GiB / worktree</span></div>
                <div className="bars">
                  {worktrees.map((run) => {
                    const value = run[spaceMetric];
                    return <div className="barRow" key={run.id}>
                      <div className="barLabel"><strong>{run.label}</strong><small>{run.storageBasis === "physical-delta" ? "physical allocation" : "filesystem allocated"}</small></div>
                      <div className="barTrack"><i className={run.stack === "vdo" ? "vdoBar" : run.label === "APFS" ? "macBar" : "linuxBar"} style={{width:`${value == null ? 0 : Math.max(3, value / spaceMax * 100)}%`}}></i></div>
                      <strong className="barValue">{value == null ? "—" : fmtGiB(value)}</strong>
                    </div>;
                  })}
                </div>
                <div className="chartFoot"><span><i className="dot linuxDot"></i>filesystem allocation</span><span><i className="dot vdoDot"></i>physical delta</span><small>Reference values transcribed from the supplied benchmark screenshot.</small></div>
              </div>

              <aside className="vdoCard">
                <p className="kicker">MATCHED PAIR</p>
                <div className="vdoTitle"><div><span>XFS</span><b>vs</b><span className="vdoPill">XFS + VDO</span></div><strong>−49.5%</strong></div>
                <p>Installed worktree storage in the supplied result: <b>0.386 GiB</b> on plain XFS versus <b>0.195 GiB</b> of physical allocation on VDO.</p>
                <dl>
                  <div><dt>Create one</dt><dd>0.646s <span>→</span> 0.647s</dd></div>
                  <div><dt>Create eight</dt><dd>0.680s <span>→</span> 0.702s</dd></div>
                  <div><dt>Storage basis</dt><dd>allocated <span>→</span> physical</dd></div>
                </dl>
                <div className="basisNote"><span>!</span><p><strong>Do not compare unlike counters silently.</strong> Keep plain XFS and VDO on the same virtual disk class, and record both logical bytes and device-level physical allocation.</p></div>
              </aside>
            </div>

            <div className="worktreeTableWrap">
              <table className="worktreeTable">
                <thead><tr><th>Stack</th><th>OS version</th><th>Create one</th><th>Create {worktrees[0]?.worktreeCount ?? 8} parallel</th><th>Clean / worktree</th><th>Installed / worktree</th><th>Measurement</th></tr></thead>
                <tbody>{worktrees.map((run) => <tr key={`${run.id}-matrix`}>
                  <td><strong>{run.label}</strong><small>{run.note}</small></td>
                  <td><strong>{run.os ?? "Not recorded"}</strong><small>{run.osBuild ? `Build ${run.osBuild}` : "Screenshot did not show it"}{run.osReleaseChannel === "pre-release" ? " · pre-release" : ""}</small></td>
                  <td className="number">{run.createOne == null ? "—" : fmt(run.createOne)}</td>
                  <td className="number">{run.createParallel == null ? "Obscured" : fmt(run.createParallel)}</td>
                  <td className="number">{run.cleanGiB == null ? "—" : fmtGiB(run.cleanGiB)}</td>
                  <td className="number">{run.installedGiB == null ? "—" : fmtGiB(run.installedGiB)}</td>
                  <td><span className={`basisBadge ${run.storageBasis === "physical-delta" ? "physical" : "allocated"}`}>{run.storageBasis === "physical-delta" ? "Physical delta" : "FS allocated"}</span></td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="pathSection" id="access-paths">
            <div className="pathIntro">
              <p className="kicker">LINUX ON THE INTERNAL SSD</p>
              <h2>Where the tools run matters more than where Finder can browse.</h2>
              <p>For maximum developer-workload throughput, keep both the repository and toolchain inside a Linux guest’s native virtual disk. A filesystem exported back to macOS is a different experiment because every macOS file operation crosses NFS.</p>
            </div>
            <div className="pathCards">
              <article className="pathCard recommended">
                <span className="pathRank">01 · BEST PERFORMANCE CANDIDATE</span>
                <strong>Guest-native filesystem</strong>
                <p>Internal APFS stores one sparse VM disk image; Linux tools operate directly on ext4, XFS, or btrfs inside it.</p>
                <div className="pathFlow"><span>macOS SSD image</span><i>→</i><span>Virtio block</span><i>→</i><span>Linux FS + tools</span></div>
                <small>Develop through SSH or your editor’s remote environment. Avoid a host-shared project folder.</small>
              </article>
              <article className="pathCard">
                <span className="pathRank">02 · MACOS TOOL COMPATIBILITY</span>
                <strong>AnyLinuxFS over NFS</strong>
                <p>A lightweight Linux VM mounts a real partition or disk image, then exposes it to macOS as a localhost network drive.</p>
                <div className="pathFlow"><span>macOS tools</span><i>→</i><span>NFS</span><i>→</i><span>Linux FS</span></div>
                <small>Convenient and worth benchmarking, but NFS semantics, file watching, locks and metadata round trips can dominate.</small>
                <a href="https://github.com/nohajc/anylinuxfs" target="_blank" rel="noreferrer">Review AnyLinuxFS <span>↗</span></a>
              </article>
              <article className="pathCard mutedPath">
                <span className="pathRank">03 · CONTROL CASE</span>
                <strong>Host folder shared into Linux</strong>
                <p>VirtioFS or another shared-folder layer exposes an APFS directory to the guest. Linux runs the tools, but the files still live as APFS files.</p>
                <div className="pathFlow"><span>Linux tools</span><i>→</i><span>VirtioFS</span><i>→</i><span>APFS files</span></div>
                <small>Useful for isolating OS/tooling effects, not for measuring a native Linux filesystem.</small>
              </article>
            </div>
            <div className="whyFaster">
              <div><span className="whyMark">?</span><div><strong>Why can the VM still win?</strong><p>The extra Virtio hop is cheap compared with millions of metadata operations. The guest kernel can coalesce writes and cache directory metadata, while APFS sees mostly block changes inside a small number of image files. The VM may also avoid per-file Spotlight, FSEvents, and endpoint-security work.</p></div></div>
              <p><strong>Important:</strong> this is a mechanism to test, not proof. Guest and host caches, durability settings, pnpm’s import method, VM disk format, and security tooling must be held constant or recorded.</p>
            </div>
          </section>

          <section className="runList" id="runs">
            <div className="sectionHead">
              <div><p className="kicker">RUN LOG</p><h2>Every result keeps its context</h2></div>
              <label className="search"><span>⌕</span><input aria-label="Search runs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search runs" /></label>
            </div>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Environment</th><th>OS version</th><th>Storage</th><th>Controls</th><th>Clean</th><th>Install</th><th>Date</th></tr></thead>
                <tbody>{filtered.map((run) => <tr key={run.id}>
                  <td><div className="tablePrimary"><span className={`deviceMark ${run.environment === "Native macOS" ? "mac" : "linux"}`}>{run.environment === "Native macOS" ? "M" : "L"}</span><span><strong>{run.label}</strong><small>{run.cpu}</small></span></div></td>
                  <td><strong>{run.os}</strong><small>{run.osBuild ? `Build ${run.osBuild}` : "Build not recorded"}{run.osReleaseChannel === "pre-release" ? " · pre-release" : ""}</small></td>
                  <td><strong>{filesystemLabel(run)}</strong><small>{run.disk}</small></td>
                  <td><div className="pills"><span>{run.encrypted ? "Encrypted" : "Unencrypted"}</span>{run.virtualization !== "None" && <span>{run.virtualization}</span>}</div><small>{run.note}</small></td>
                  <td className="number">{fmt(run.clean)}</td><td className="number">{fmt(run.install)}</td><td><strong>{run.date}</strong><small>{run.iterations} iteration{run.iterations === 1 ? "" : "s"}</small></td>
                </tr>)}</tbody>
              </table>
              {!filtered.length && <div className="emptyState">No runs match those filters.</div>}
            </div>
          </section>

          <section className="method" id="method">
            <div><p className="kicker">METHODOLOGY</p><h2>A result is only as fair as its controls.</h2><p>The runner creates an isolated checkout on the target volume, records the exact OS version and build alongside operation latency and worktree density, and keeps physical VDO allocation distinct from filesystem-reported bytes.</p></div>
            <div className="methodGrid">
              <article><span>01</span><strong>Same workload</strong><p>Fixed repository revision, Node and pnpm versions.</p></article>
              <article><span>02</span><strong>Repeated samples</strong><p>Median of five runs with raw timings retained.</p></article>
              <article><span>03</span><strong>Matched storage stacks</strong><p>Plain XFS and XFS + VDO keep the same guest, disk class, repo revision and pnpm mode.</p></article>
              <article><span>04</span><strong>Honest allocation</strong><p>Logical, allocated and VDO physical bytes remain separate measurements.</p></article>
              <article><span>05</span><strong>Exact OS build</strong><p>macOS product version, build number and pre-release status are recorded for every new run.</p></article>
            </div>
          </section>
        </div>
      </section>

      {modal && <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(false); }}>
        <section className="modal runGuide" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button className="close" aria-label="Close" onClick={() => setModal(false)}>×</button>
          <p className="kicker">RUN LOCALLY IN TERMINAL</p><h2 id="modal-title">Run a benchmark</h2>
          <p className="modalIntro">This page displays results; it cannot access your disks. Run the small CLI on the machine being tested, then import the JSON it creates.</p>

          <div className="beginnerNote"><strong>New to this?</strong><span>On macOS, open <b>Terminal</b> from Applications → Utilities. On Linux, open your terminal app. Paste one command block at a time and press Return.</span></div>

          <ol className="runSteps">
            <li>
              <div className="stepTitle"><span>1</span><div><strong>Install the required tools</strong><small>You need Node.js 22.13 or newer, Git, and pnpm 10. Use the block for the system where the test will run.</small></div></div>
              <div className="dependencyGrid">
                <div><strong>macOS</strong><small>If <b>brew</b> is missing, install it first from <a href="https://brew.sh" target="_blank" rel="noreferrer">brew.sh ↗</a>.</small><div className="command compact"><code>{macDependencyCommand}</code><button onClick={() => copyText(macDependencyCommand, "macOS install commands copied")}>Copy</button></div></div>
                <div><strong>Ubuntu / Debian</strong><small>Install current Node.js LTS from <a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">nodejs.org ↗</a> first.</small><div className="command compact"><code>{linuxDependencyCommand}</code><button onClick={() => copyText(linuxDependencyCommand, "Linux install commands copied")}>Copy</button></div></div>
              </div>
            </li>
            <li>
              <div className="stepTitle"><span>2</span><div><strong>Download the runner once</strong><small>This creates an <b>FS_Tester</b> folder and moves Terminal into it. The test commands below must be run from this folder.</small></div></div>
              <div className="command compact"><code>{setupCommand}</code><button onClick={() => copyText(setupCommand, "Setup commands copied")}>Copy</button></div>
            </li>
            <li>
              <div className="stepTitle"><span>3</span><div><strong>Choose what to test</strong><small>The temporary checkout is created inside this folder, so its underlying filesystem is the one measured.</small></div></div>
              <div className="fieldRow targetFields">
                <label className="field"><span>Target folder</span><input value={target} onChange={(event) => setTarget(event.target.value)} /><small><b>.</b> tests the disk containing FS_Tester. External example: <b>/Volumes/My SSD</b>. Linux example: <b>/home/me</b>.</small></label>
                <label className="field"><span>Result label</span><input value={label} onChange={(event) => setLabel(event.target.value)} /><small>Describe the setup, e.g. “External APFS · unencrypted”.</small></label>
              </div>
            </li>
            <li>
              <div className="stepTitle"><span>4</span><div><strong>Inspect before writing</strong><small>Paste this in the same Terminal window. It only reports the OS, disk, filesystem, encryption, and tool versions.</small></div></div>
              <div className="command compact"><code>{doctorCommand}</code><button onClick={() => copyText(doctorCommand, "Inspection command copied")}>Copy</button></div>
            </li>
            <li>
              <div className="stepTitle"><span>5</span><div><strong>Select and run a suite</strong><small>The pnpm suite measures clean/install speed. The worktree suite measures creation speed and storage usage.</small></div></div>
              <div className="fieldRow suiteFields">
                <label className="field"><span>Suite</span><select value={suite} onChange={(event) => setSuite(event.target.value as "pnpm" | "worktrees")}><option value="pnpm">Git clean + pnpm install</option><option value="worktrees">Worktree speed + storage</option></select></label>
                {suite === "pnpm" && <label className="field"><span>Timing pairs</span><select value={iterations} onChange={(event) => setIterations(Number(event.target.value))}><option value="3">3 · quick</option><option value="5">5 · recommended</option><option value="9">9 · thorough</option></select></label>}
                {suite === "worktrees" && <label className="field"><span>VDO device (only for XFS + VDO)</span><input value={vdoDevice} onChange={(event) => setVdoDevice(event.target.value)} placeholder="Leave blank for normal filesystems" /><small>Inside Linux, enter the device shown by <b>vdostats</b> to record physical allocation.</small></label>}
              </div>
              <div className="command"><code>{command}</code><button onClick={() => copyText(command, "Benchmark command copied")}>Copy</button></div>
            </li>
            <li>
              <div className="stepTitle"><span>6</span><div><strong>Import the result</strong><small>When the command finishes, find <b>{suite === "pnpm" ? "fsbench-result.json" : "fsbench-worktrees.json"}</b> inside the <b>FS_Tester</b> folder. Choose “Import results” on this page and select that file.</small></div></div>
            </li>
          </ol>

          <div className="callout"><span>✓</span><p><strong>What gets written?</strong> A uniquely named <b>.fs-bench-…</b> folder is created only inside the target and removed after the run. The runner never formats, partitions, or alters a volume. Keep several GiB free.</p></div>
          <div className="modalActions"><a href="https://github.com/aagedal/FS_Tester#run-your-first-benchmark" target="_blank" rel="noreferrer">Full instructions ↗</a><button className="primary" onClick={() => copyText(command, "Benchmark command copied")}>Copy benchmark command <span>→</span></button></div>
        </section>
      </div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
