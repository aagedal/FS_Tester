"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Run = {
  id: string;
  label: string;
  environment: string;
  os: string;
  filesystem: string;
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

const sampleRuns: Run[] = [
  { id:"m5-apfs", label:"Mac internal", environment:"Native macOS", os:"macOS 26.5.1", filesystem:"APFS", encrypted:true, disk:"Apple SSD AP1024Z", cpu:"Apple M5 Pro", memoryGb:48, virtualization:"None", clean:32.0, install:34.9, iterations:3, date:"2026-07-03", note:"Community reference run", source:"sample" },
  { id:"m5-apfs-spot", label:"Mac internal · no Spotlight", environment:"Native macOS", os:"macOS 26.5.1", filesystem:"APFS", encrypted:true, disk:"Apple SSD AP1024Z", cpu:"Apple M5 Pro", memoryGb:48, virtualization:"None", clean:30.4, install:34.4, iterations:3, date:"2026-07-03", note:"~/dev excluded from Spotlight", source:"sample" },
  { id:"m5-vm", label:"Linux VM", environment:"OrbStack VM", os:"Ubuntu 26.04", filesystem:"btrfs", encrypted:false, disk:"Virtual disk on Apple SSD", cpu:"Apple M5 Pro · 6 vCPU", memoryGb:12, virtualization:"OrbStack", clean:2.9, install:14.6, iterations:3, date:"2026-07-03", note:"Native VM filesystem, not a macOS mount", source:"sample" },
  { id:"m2-apfs", label:"Mac internal · M2", environment:"Native macOS", os:"macOS 14.7.3", filesystem:"APFS", encrypted:true, disk:"Apple SSD AP1024Z", cpu:"Apple M2 Max", memoryGb:16, virtualization:"None", clean:31.5, install:44.2, iterations:1, date:"2025-02-08", note:"Community reference run", source:"sample" },
  { id:"m2-vm", label:"Linux VM · M2", environment:"Parallels VM", os:"Ubuntu 24.04", filesystem:"ext4", encrypted:false, disk:"Virtual disk on Apple SSD", cpu:"Apple M2 Max · 6 vCPU", memoryGb:16, virtualization:"Parallels", clean:3.2, install:12.0, iterations:1, date:"2025-02-14", note:"Same host model, separate community run", source:"sample" },
  { id:"m2-vm-enc", label:"Linux VM · encrypted", environment:"Parallels VM", os:"Ubuntu 24.04", filesystem:"ext4 + LVM2", encrypted:true, disk:"Virtual disk on Apple SSD", cpu:"Apple M2 Max · 6 vCPU", memoryGb:16, virtualization:"Parallels", clean:2.8, install:11.9, iterations:1, date:"2025-02-14", note:"Guest volume encryption enabled", source:"sample" },
  { id:"m4-apfs", label:"Mac internal · M4", environment:"Native macOS", os:"macOS 15.2", filesystem:"APFS", encrypted:true, disk:"Apple SSD AP1024Z", cpu:"Apple M4", memoryGb:16, virtualization:"None", clean:29.6, install:31.4, iterations:1, date:"2025-02-08", note:"Community reference run", source:"sample" },
  { id:"m4-vm", label:"Linux VM · M4", environment:"UTM VM", os:"Ubuntu 24.10", filesystem:"ext4", encrypted:false, disk:"Virtual disk on Apple SSD", cpu:"Apple M4 Pro · 6 vCPU", memoryGb:6, virtualization:"UTM", clean:2.5, install:16.9, iterations:1, date:"2025-02-26", note:"Cross-model reference; do not treat as paired", source:"sample" },
];

const fmt = (value: number) => `${value.toFixed(value < 10 ? 2 : 1)}s`;

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [runs, setRuns] = useState<Run[]>(sampleRuns);
  const [metric, setMetric] = useState<"clean" | "install">("clean");
  const [filter, setFilter] = useState("All environments");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState("");
  const [target, setTarget] = useState("/Volumes/Benchmark");
  const [iterations, setIterations] = useState(5);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("fsbench-imports");
    if (saved) {
      try { setRuns([...JSON.parse(saved), ...sampleRuns]); } catch { /* keep samples */ }
    }
  }, []);

  const filtered = useMemo(() => runs.filter((run) => {
    const groupMatch = filter === "All environments" ||
      (filter === "Native macOS" && run.environment === "Native macOS") ||
      (filter === "Linux VM" && run.virtualization !== "None") ||
      (filter === "Encrypted" && run.encrypted);
    const haystack = `${run.label} ${run.os} ${run.filesystem} ${run.cpu}`.toLowerCase();
    return groupMatch && haystack.includes(query.toLowerCase());
  }), [filter, query, runs]);

  const chartRuns = filtered.slice(0, 6);
  const maxValue = Math.max(...chartRuns.map((run) => run[metric]), 1);
  const command = `node bin/fs-bench.mjs run --target "${target}" --iterations ${iterations} --out fsbench-result.json`;

  function persist(imported: Run[]) {
    const custom = [...imported, ...runs.filter((run) => run.source === "imported")];
    window.localStorage.setItem("fsbench-imports", JSON.stringify(custom));
    setRuns([...custom, ...sampleRuns]);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function copyCommand() {
    await navigator.clipboard.writeText(command);
    showToast("Runner command copied");
  }

  function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
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
            filesystem: String(item.filesystem ?? "Unknown"),
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
    const blob = new Blob([JSON.stringify({ schemaVersion:1, exportedAt:new Date().toISOString(), runs }, null, 2)], { type:"application/json" });
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
          <button className="navItem" onClick={() => scrollTo("method")}><Icon>◎</Icon> Methodology</button>
        </nav>
        <div className="sideNote">
          <span className="eyebrow">Current suite</span>
          <strong>Git + pnpm stress test</strong>
          <span>{runs.length} results · local workspace</span>
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
              <p className="lede">Compare the same developer workload across native macOS, external storage, and Linux on Apple silicon—without losing the context that makes a result credible.</p>
              <div className="heroActions"><button className="primary large" onClick={() => setModal(true)}>Run the benchmark <span>→</span></button><button className="textButton" onClick={() => scrollTo("method")}>Review the test plan</button></div>
            </div>
            <div className="fairnessCard">
              <div className="fairnessTop"><span>Fairness matrix</span><strong>3 / 4 covered</strong></div>
              <div className="segments"><i></i><i></i><i></i><i className="empty"></i></div>
              <ul>
                <li><span className="done">✓</span><span>Native APFS, encrypted<small>Original baseline</small></span></li>
                <li><span className="done">✓</span><span>External APFS, unencrypted<small>Controls for encryption</small></span></li>
                <li><span className="done">✓</span><span>Linux VM on same Mac<small>Controls for host hardware</small></span></li>
                <li><span className="todo">○</span><span>Linux native, same Mac<small>Requires Asahi-compatible hardware</small></span></li>
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
                  <option>All environments</option><option>Native macOS</option><option>Linux VM</option><option>Encrypted</option>
                </select>
              </div>
            </div>

            <div className="chartCard">
              <div className="chartTop"><span>Median duration · lower is better</span><span>seconds</span></div>
              <div className="bars">
                {chartRuns.map((run) => <div className="barRow" key={run.id}>
                  <div className="barLabel"><strong>{run.label}</strong><small>{run.filesystem}{run.encrypted ? " · encrypted" : ""}</small></div>
                  <div className="barTrack"><i className={run.environment === "Native macOS" ? "macBar" : "linuxBar"} style={{width:`${Math.max(3, run[metric] / maxValue * 100)}%`}}></i></div>
                  <strong className="barValue">{fmt(run[metric])}</strong>
                </div>)}
              </div>
              <div className="chartFoot"><span><i className="dot macDot"></i>Native macOS</span><span><i className="dot linuxDot"></i>Linux guest</span><small>Sample community results are illustrative, not a controlled conclusion.</small></div>
            </div>
          </section>

          <section className="runList" id="runs">
            <div className="sectionHead">
              <div><p className="kicker">RUN LOG</p><h2>Every result keeps its context</h2></div>
              <label className="search"><span>⌕</span><input aria-label="Search runs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search runs" /></label>
            </div>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Environment</th><th>Storage</th><th>Controls</th><th>Clean</th><th>Install</th><th>Date</th></tr></thead>
                <tbody>{filtered.map((run) => <tr key={run.id}>
                  <td><div className="tablePrimary"><span className={`deviceMark ${run.environment === "Native macOS" ? "mac" : "linux"}`}>{run.environment === "Native macOS" ? "M" : "L"}</span><span><strong>{run.label}</strong><small>{run.cpu}</small></span></div></td>
                  <td><strong>{run.filesystem}</strong><small>{run.disk}</small></td>
                  <td><div className="pills"><span>{run.encrypted ? "Encrypted" : "Unencrypted"}</span>{run.virtualization !== "None" && <span>{run.virtualization}</span>}</div><small>{run.note}</small></td>
                  <td className="number">{fmt(run.clean)}</td><td className="number">{fmt(run.install)}</td><td><strong>{run.date}</strong><small>{run.iterations} iteration{run.iterations === 1 ? "" : "s"}</small></td>
                </tr>)}</tbody>
              </table>
              {!filtered.length && <div className="emptyState">No runs match those filters.</div>}
            </div>
          </section>

          <section className="method" id="method">
            <div><p className="kicker">METHODOLOGY</p><h2>A result is only as fair as its controls.</h2><p>The runner creates an isolated checkout on the target volume, warms the pnpm store, alternates clean and install operations, and records the complete environment alongside every sample.</p></div>
            <div className="methodGrid">
              <article><span>01</span><strong>Same workload</strong><p>Fixed repository revision, Node and pnpm versions.</p></article>
              <article><span>02</span><strong>Repeated samples</strong><p>Median of five runs with raw timings retained.</p></article>
              <article><span>03</span><strong>Visible controls</strong><p>Encryption, Spotlight, VM, CPU, memory and disk.</p></article>
              <article><span>04</span><strong>Safe isolation</strong><p>Destructive clean commands only touch a temporary clone.</p></article>
            </div>
          </section>
        </div>
      </section>

      {modal && <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button className="close" aria-label="Close" onClick={() => setModal(false)}>×</button>
          <p className="kicker">LOCAL CLI RUNNER</p><h2 id="modal-title">Prepare a benchmark</h2>
          <p className="modalIntro">Choose the volume you want to measure. The runner clones into an isolated temporary folder there, so your projects are never cleaned or modified.</p>
          <label className="field"><span>Target volume or folder</span><input value={target} onChange={(event) => setTarget(event.target.value)} /></label>
          <div className="fieldRow">
            <label className="field"><span>Iterations</span><select value={iterations} onChange={(event) => setIterations(Number(event.target.value))}><option value="3">3 · quick</option><option value="5">5 · recommended</option><option value="9">9 · thorough</option></select></label>
            <label className="field"><span>Suite</span><select><option>Git clean + pnpm install</option></select></label>
          </div>
          <div className="command"><code>{command}</code><button onClick={copyCommand}>Copy</button></div>
          <div className="callout"><span>i</span><p><strong>Run this in Terminal.</strong> The browser cannot access local disks. When it finishes, import the generated JSON here.</p></div>
          <div className="modalActions"><button className="secondary" onClick={() => setModal(false)}>Cancel</button><button className="primary" onClick={copyCommand}>Copy command <span>→</span></button></div>
        </section>
      </div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
