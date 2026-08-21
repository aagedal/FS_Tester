import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers:{ accept:"text/html" } }),
    { ASSETS:{ fetch:async () => new Response("Not found", { status:404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the FS Bench Lab dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>FS Bench Lab<\/title>/i);
  assert.match(html, /Is APFS really/);
  assert.match(html, /Fairness matrix/);
  assert.match(html, /Linux VM on same Mac/);
  assert.match(html, /Space is a result, too/);
  assert.match(html, /XFS \+ VDO/);
  assert.match(html, /Guest-native filesystem/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps the runner isolated and the starter removed", async () => {
  const [runner, page, packageJson] = await Promise.all([
    readFile(new URL("../bin/fs-bench.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(runner, /mkdtempSync\(join\(target, "\.fs-bench-"\)\)/);
  assert.match(runner, /git", \["clean", "-Xfd"\]/);
  assert.match(runner, /suite:"worktrees"/);
  assert.match(runner, /vdoUsedKib/);
  assert.match(runner, /logicalInstalledGiBPerWorktree/);
  assert.match(runner, /tempRoot\.startsWith/);
  assert.match(page, /window\.localStorage/);
  assert.match(page, /Import results/);
  assert.match(page, /Install the required tools/);
  assert.match(page, /This page displays results; it cannot access your disks/);
  assert.match(page, /brew install node git/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
