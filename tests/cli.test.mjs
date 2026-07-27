import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseArguments } from "../cli/options.mjs";
import {
  cellWidth,
  renderDashboard,
  resolveCapabilities,
  resolveInterfaceLanguage,
} from "../cli/terminal.mjs";
import { fireModel } from "../lib/fire.mjs";
import { DEFAULT_SITE_NAME } from "../lib/privacy.mjs";
import {
  classifyVisit,
  createTrafficWindow,
  distribute,
  SOURCE_KINDS,
} from "../lib/traffic.mjs";
import {
  createTerminalUpdate,
  shouldAdvanceAnimation,
} from "../cli/watch.mjs";

const cli = fileURLToPath(new URL("../bin/embertop.mjs", import.meta.url));
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const terminalFrame = {
  schema: 1,
  sequence: 7,
  at: new Date().toISOString(),
  source: "live",
  site: "cli-test",
  metrics: {
    cpu: 23,
    memory: 51,
    load1: 0.42,
    requestsPerMinute: 24,
    crawlersPerMinute: 3,
  },
  visits: [
    {
      id: "visit-1",
      at: new Date().toISOString(),
      kind: "human",
      method: "GET",
      path: "/docs/intro",
      status: 200,
      durationMs: 14,
      agent: "Chrome",
    },
    {
      id: "visit-2",
      at: new Date().toISOString(),
      kind: "crawler",
      method: "GET",
      path: "/sitemap.xml",
      status: 200,
      durationMs: 8,
      agent: "Googlebot",
    },
  ],
};

function run(arguments_, options = {}) {
  return spawnSync(process.execPath, [cli, ...arguments_], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      NO_COLOR: "1",
      EMBERTOP_ENDPOINT: "",
      EMBERTOP_UPSTREAM_URL: "",
      EMBERTOP_TOKEN: "",
      EMBERTOP_COLLECTOR_TOKEN: "",
      EMBERTOP_LOG_PATHS: "",
      EMBERTOP_METRICS_URL: "",
      EMBERTOP_METRICS_TOKEN: "",
      EMBERTOP_SITE_NAME: "",
      EMBERTOP_SAMPLE_INTERVAL_MS: "",
      EMBERTOP_LANG: "",
    },
    ...options,
  });
}

test("CLI exposes help and version information", () => {
  const version = run(["--version"]);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), packageJson.version);

  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /embertop \[watch\]/i);
  assert.match(help.stdout, /embertop serve/i);
  assert.match(help.stdout, /embertop doctor/i);
  assert.match(help.stdout, /--ascii/);
  assert.doesNotMatch(help.stdout, /burst|버스트/i);
});

test("CLI emits one machine-readable local telemetry frame", () => {
  const result = run([
    "--once",
    "--json",
    "--no-color",
    "--site",
    "cli-test",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const frame = JSON.parse(result.stdout.trim());
  assert.equal(frame.schema, 1);
  assert.equal(frame.source, "live");
  assert.equal(frame.site, "cli-test");
  assert.equal(typeof frame.metrics.cpu, "number");
  assert.equal(typeof frame.metrics.memory, "number");
  assert.equal(Array.isArray(frame.visits), true);
  assert.equal("burst" in frame.metrics, false);
});

test("CLI rejects unknown options with a useful exit status", () => {
  const result = run(["--definitely-not-an-option"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown option/);
  assert.match(result.stderr, /--help/);
  assert.doesNotMatch(result.stderr, /\u001b/);
});

test("CLI selects credentials for the requested operating mode", () => {
  const environment = {
    EMBERTOP_TOKEN: "remote-token",
    EMBERTOP_COLLECTOR_TOKEN: "collector-token",
  };

  assert.equal(
    parseArguments(["--endpoint", "https://example.com/stream"], environment)
      .token,
    "remote-token",
  );
  assert.equal(parseArguments(["serve"], environment).token, "collector-token");
  assert.equal(
    parseArguments(["doctor"], environment).token,
    "collector-token",
  );
  assert.equal(
    parseArguments(
      ["doctor", "--endpoint", "https://example.com/stream"],
      environment,
    ).token,
    "remote-token",
  );
  assert.equal(
    parseArguments(["serve", "--token", "explicit"], environment).token,
    "explicit",
  );
});

test("CLI does not expose the local hostname by default", () => {
  assert.equal(parseArguments([], {}).site, DEFAULT_SITE_NAME);
});

test("CLI rejects endpoints containing URL credentials", () => {
  const result = run([
    "--once",
    "--endpoint",
    "https://user:password@example.com/stream",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not contain credentials/);
  assert.doesNotMatch(result.stderr, /user:password/);
});

test("CLI selects ASCII and terminal color fallbacks", () => {
  assert.equal(parseArguments(["--ascii"], {}).ascii, true);
  assert.equal(parseArguments([], { NO_COLOR: "" }).color, false);
  assert.deepEqual(
    resolveCapabilities({
      TERM: "xterm-256color",
      LANG: "en_US.UTF-8",
    }),
    { colorLevel: "256", unicode: true },
  );
  assert.deepEqual(
    resolveCapabilities({ TERM: "xterm", LANG: "C" }),
    { colorLevel: "basic", unicode: false },
  );

  const output = renderDashboard({
    frame: terminalFrame,
    status: "live",
    color: true,
    colorLevel: "basic",
    ascii: true,
    columns: 80,
    rows: 24,
  }).join("\n");
  assert.match(output, /\u001b\[(?:33|93)m/);
  assert.doesNotMatch(output, /\u001b\[38;5;/);
  assert.doesNotMatch(output, /[░▒▓█✦─●•╲╱▁▂▃▄…]/);
});

test("CLI is English-first with an explicit Korean option", () => {
  assert.equal(resolveInterfaceLanguage({ LANG: "ko_KR.UTF-8" }), "en");
  assert.equal(
    resolveInterfaceLanguage({
      LANG: "en_US.UTF-8",
      EMBERTOP_LANG: "ko",
    }),
    "ko",
  );

  const output = renderDashboard({
    frame: terminalFrame,
    status: "live",
    color: false,
    ascii: true,
    columns: 80,
    rows: 24,
  }).join("\n");
  assert.match(output, /embertop/);
  assert.match(output, /cpu/);
  assert.match(output, /memory/);
  assert.match(output, /load/);
  assert.match(output, /req\/min/);
  assert.match(output, /requests/);
  assert.match(output, /ip and query hidden/);
  assert.doesNotMatch(output, /[가-힣]/);
});

test("web and terminal fire inputs share one bounded model", () => {
  const quiet = fireModel({
    cpu: 0,
    memory: 0,
    requestsPerMinute: 0,
  });
  const busyCpu = fireModel({
    cpu: 90,
    memory: 0,
    requestsPerMinute: 0,
  });
  const busyMemory = fireModel({
    cpu: 0,
    memory: 90,
    requestsPerMinute: 0,
  });
  const busyTraffic = fireModel({
    cpu: 0,
    memory: 0,
    requestsPerMinute: 120,
  });
  const extreme = fireModel({
    cpu: 1_000,
    memory: 1_000,
    requestsPerMinute: 1_000,
  });

  assert.ok(busyCpu.flame > quiet.flame);
  assert.equal(busyCpu.embers, quiet.embers);
  assert.ok(busyMemory.embers > quiet.embers);
  assert.equal(busyMemory.flame, quiet.flame);
  assert.ok(busyTraffic.flame > quiet.flame);
  assert.equal(busyTraffic.embers, quiet.embers);
  for (const value of Object.values(extreme)) {
    assert.ok(value >= 0 && value <= 1);
  }
});

test("terminal layouts stay bounded at supported sizes", () => {
  const cases = [
    { columns: 80, rows: 24, status: "live", frame: terminalFrame },
    { columns: 44, rows: 18, status: "live", frame: terminalFrame },
    {
      columns: 44,
      rows: 18,
      status: "reconnecting",
      frame: {
        ...terminalFrame,
        site: "a-deliberately-long-site-label.example",
      },
    },
    {
      columns: 44,
      rows: 18,
      status: "live",
      frame: {
        ...terminalFrame,
        visits: [
          {
            ...terminalFrame.visits[0],
            method: "VERYLONGVERB",
            durationMs: 86_400_000,
            agent: "긴 사용자 에이전트 이름",
          },
        ],
      },
    },
    {
      columns: 80,
      rows: 24,
      status: "live",
      frame: { ...terminalFrame, visits: [] },
    },
  ];

  for (const { columns, rows, status, frame } of cases) {
    const lines = renderDashboard({
      frame,
      status,
      color: false,
      ascii: true,
      columns,
      rows,
    });
    assert.equal(lines.length, rows);
    for (const line of lines) {
      assert.ok(
        cellWidth(line) <= columns,
        `${columns}x${rows} line overflow: ${line}`,
      );
    }
  }
});

test("pause and connection states stop terminal fire motion", () => {
  assert.equal(
    shouldAdvanceAnimation({
      status: "live",
      paused: false,
      help: false,
    }),
    true,
  );
  assert.equal(
    shouldAdvanceAnimation({
      status: "live",
      paused: true,
      help: false,
    }),
    false,
  );
  assert.equal(
    shouldAdvanceAnimation({
      status: "reconnecting",
      paused: false,
      help: false,
    }),
    false,
  );
  assert.equal(
    shouldAdvanceAnimation({
      status: "local",
      paused: false,
      help: true,
    }),
    false,
  );

  for (const status of ["reconnecting", "error"]) {
    const output = renderDashboard({
      frame: terminalFrame,
      status,
      color: false,
      ascii: true,
      columns: 80,
      rows: 24,
      endpoint: "https://user:private@example.com/stream?token=secret",
      token: "secret",
    }).join("\n");
    assert.match(
      output,
      status === "error" ? /error|문제가/i : /reconnecting|다시 연결/i,
    );
    assert.match(output, /last frame|마지막 프레임/);
    assert.doesNotMatch(output, /private|token=secret|https?:\/\//);
  }
});

test("terminal updates rewrite only changed rows", () => {
  const first = createTerminalUpdate(null, ["first", "second"], 12, true);
  assert.match(first.output, /^\u001b\[H/);
  assert.match(first.output, /\u001b\[0J$/);

  const unchanged = createTerminalUpdate(
    first.lines,
    ["first", "second"],
    12,
  );
  assert.equal(unchanged.output, "");

  const changed = createTerminalUpdate(
    first.lines,
    ["first", "changed"],
    12,
  );
  assert.match(changed.output, /^\u001b\[2;1H/);
  assert.doesNotMatch(changed.output, /\u001b\[0J/);
});

test("traffic mix separates who is knocking from what the server said", () => {
  const now = Date.parse("2026-07-27T09:00:00.000Z");
  const at = (secondsAgo) => new Date(now - secondsAgo * 1_000).toISOString();
  const window = createTrafficWindow();

  window.record(
    [
      { id: "1", at: at(1), kind: "human", status: 200 },
      { id: "2", at: at(2), kind: "human", status: 503 },
      { id: "3", at: at(3), kind: "crawler", status: 200 },
      { id: "4", at: at(4), kind: "unknown", status: 404 },
      { id: "5", at: at(5), kind: "unknown", status: 403 },
    ],
    now,
  );

  const mix = window.summary(now);
  assert.equal(mix.total, 5);
  // A crawler collecting 404s and a visitor collecting 404s stay distinct.
  assert.deepEqual(mix.sources, { visitor: 2, crawler: 1, unknown: 2 });
  assert.deepEqual(mix.outcomes, { ok: 2, refused: 2, broken: 1 });

  // Anything older than the window stops counting without being re-recorded.
  assert.equal(window.summary(now + 61_000).total, 0);
});

test("traffic mix treats an unidentified agent as its own source", () => {
  assert.equal(classifyVisit({ kind: "human", status: 200 }).source, "visitor");
  assert.equal(classifyVisit({ kind: "crawler", status: 200 }).source, "crawler");
  assert.equal(classifyVisit({ kind: "unknown", status: 200 }).source, "unknown");
  assert.equal(classifyVisit({ status: 200 }).source, "unknown");

  // 4xx is its own outcome rather than being folded in with 5xx or with 200.
  assert.equal(classifyVisit({ kind: "human", status: 200 }).outcome, "ok");
  assert.equal(classifyVisit({ kind: "human", status: 301 }).outcome, "ok");
  assert.equal(classifyVisit({ kind: "human", status: 404 }).outcome, "refused");
  assert.equal(classifyVisit({ kind: "human", status: 429 }).outcome, "refused");
  assert.equal(classifyVisit({ kind: "human", status: 503 }).outcome, "broken");
});

test("stacked band cells always fill the track exactly", () => {
  for (const width of [8, 13, 24, 48]) {
    for (const counts of [
      { visitor: 1, crawler: 0, unknown: 0 },
      { visitor: 97, crawler: 1, unknown: 1 },
      { visitor: 1, crawler: 1, unknown: 1 },
      { visitor: 500, crawler: 331, unknown: 7 },
    ]) {
      const cells = distribute(counts, SOURCE_KINDS, width);
      assert.equal(
        cells.reduce((sum, value) => sum + value, 0),
        width,
        `${width} / ${JSON.stringify(counts)}`,
      );
      // A single request in a busy minute still earns a visible cell.
      for (let index = 0; index < SOURCE_KINDS.length; index += 1) {
        if (counts[SOURCE_KINDS[index]] > 0) assert.ok(cells[index] >= 1);
      }
    }
  }

  assert.deepEqual(distribute({ visitor: 0, crawler: 0, unknown: 0 }, SOURCE_KINDS, 10), [0, 0, 0]);
});
