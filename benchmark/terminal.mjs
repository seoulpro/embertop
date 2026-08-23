import { performance } from "node:perf_hooks";
import { cpus } from "node:os";

import { renderDashboard } from "../cli/terminal.mjs";
import { createTerminalUpdate } from "../cli/watch.mjs";
import { createTrafficWindow } from "../lib/traffic.mjs";

const quick = process.argv.includes("--quick");
const json = process.argv.includes("--json");
const runs = quick ? 3 : 7;
const frames = quick ? 1_000 : 10_000;
const trafficRecords = quick ? 5_000 : 100_000;

const percentile = (values, ratio) => {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(
    ordered.length - 1,
    Math.floor(ordered.length * ratio),
  )];
};

const measure = (operation) => {
  operation();
  const samplesMs = [];
  let checksum = 0;
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    checksum += operation();
    samplesMs.push(performance.now() - startedAt);
  }
  return {
    medianMs: percentile(samplesMs, 0.5),
    p95Ms: percentile(samplesMs, 0.95),
    checksum,
  };
};

const frame = Object.freeze({
  schema: 1,
  sequence: 1,
  at: "2026-01-01T00:00:00.000Z",
  source: "live",
  site: "benchmark",
  metrics: {
    cpu: 42,
    memory: 61,
    load1: 1.25,
    requestsPerMinute: 180,
    crawlersPerMinute: 12,
  },
  visits: [{
    id: "benchmark-visit",
    at: "2026-01-01T00:00:00.000Z",
    kind: "human",
    method: "GET",
    path: "/docs/performance",
    status: 200,
    durationMs: 18,
    agent: "Browser",
  }],
});

const traffic = Object.freeze({
  total: 180,
  sources: { visitor: 150, crawler: 12, unknown: 18 },
  outcomes: { ok: 169, refused: 9, broken: 2 },
});

const renderFrames = (animated) => {
  let previousLines = null;
  let checksum = 0;
  for (let index = 0; index < frames; index += 1) {
    const nextLines = renderDashboard({
      frame,
      status: "live",
      tick: animated ? index : 0,
      traffic,
      color: false,
      ascii: true,
      columns: 92,
      rows: 36,
    });
    const update = createTerminalUpdate(
      previousLines,
      nextLines,
      92,
    );
    previousLines = update.lines;
    checksum += update.output.length + update.lines.length;
  }
  return checksum;
};

const exerciseTrafficWindow = () => {
  const window = createTrafficWindow();
  const startedAt = Date.parse("2026-01-01T00:00:00.000Z");
  for (let index = 0; index < trafficRecords; index += 1) {
    const now = startedAt + index * 100;
    window.record([{
      at: new Date(now).toISOString(),
      kind: index % 10 === 0 ? "crawler" : "human",
      status: index % 97 === 0 ? 500 : 200,
    }], now);
  }
  const summary = window.summary(startedAt + (trafficRecords - 1) * 100);
  return summary.total + summary.sources.crawler + summary.outcomes.broken;
};

const benchmark = (name, count, operation) => {
  globalThis.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const timing = measure(operation);
  globalThis.gc?.();
  const heapAfter = process.memoryUsage().heapUsed;
  return {
    name,
    operations: count,
    medianMs: Number(timing.medianMs.toFixed(3)),
    p95Ms: Number(timing.p95Ms.toFixed(3)),
    microsecondsPerOperation: Number(
      ((timing.medianMs * 1_000) / count).toFixed(3),
    ),
    retainedHeapDeltaBytes: heapAfter - heapBefore,
    checksum: timing.checksum,
  };
};

const report = {
  schemaVersion: 1,
  suite: "embertop-terminal",
  mode: quick ? "quick" : "full",
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCpuCount: cpus().length,
  },
  configuration: { runs, frames, trafficRecords },
  results: [
    benchmark("animated-render-and-diff", frames, () => renderFrames(true)),
    benchmark("static-render-and-diff", frames, () => renderFrames(false)),
    benchmark(
      "rolling-traffic-window",
      trafficRecords,
      exerciseTrafficWindow,
    ),
  ],
};

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.table(report.results.map((result) => ({
    scenario: result.name,
    operations: result.operations,
    "median ms": result.medianMs,
    "p95 ms": result.p95Ms,
    "µs/op": result.microsecondsPerOperation,
    "retained heap Δ": result.retainedHeapDeltaBytes,
  })));
  console.log(
    "Measurements are local observations, not cross-machine guarantees.",
  );
}
