import assert from "node:assert/strict";
import {
  appendFile,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyAgent,
  parseJsonLine,
  parseLogLine,
  parseNginxLine,
  sanitizePath,
} from "../collector/parsers.mjs";
import {
  fetchMetricOverrides,
  parseLinuxMemoryUsage,
  parseMacMemoryUsage,
} from "../collector/system.mjs";
import { TelemetrySource } from "../collector/source.mjs";
import { AccessLogTailer } from "../collector/tailer.mjs";
import { normalizeTelemetryFrame } from "../lib/normalize.mjs";
import { drainSseEvents } from "../lib/sse.mjs";

test("sanitizes identifiers, secrets, and query strings from paths", () => {
  assert.equal(
    sanitizePath(
      "/users/123456/orders/550e8400-e29b-41d4-a716-446655440000?email=private@example.com",
    ),
    "/users/:id/orders/:uuid",
  );
  assert.equal(
    sanitizePath("/reset/abcdefghijklmnopqrstuvwxyz123456"),
    "/reset/:token",
  );
  assert.equal(
    sanitizePath(
      "/session/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature",
    ),
    "/session/:token",
  );
  assert.equal(sanitizePath("/users/42"), "/users/:id");
  assert.equal(
    sanitizePath("/members/sumin%40example.com"),
    "/members/:email",
  );
  assert.equal(sanitizePath("/address/203.0.113.10"), "/address/:ip");
  assert.equal(sanitizePath("/anything", { includePaths: false }), "/…");
});

test("classifies common human and crawler agents", () => {
  assert.deepEqual(classifyAgent("Mozilla/5.0 Chrome/126 Safari/537.36"), {
    kind: "human",
    agent: "Chrome",
  });
  assert.deepEqual(classifyAgent("Mozilla/5.0 (compatible; Googlebot/2.1)"), {
    kind: "crawler",
    agent: "Googlebot",
  });
  assert.deepEqual(classifyAgent("curl/8.8.0"), {
    kind: "unknown",
    agent: "curl",
  });
});

test("parses an Nginx combined log without retaining the visitor IP", () => {
  const parsed = parseNginxLine(
    '203.0.113.42 - - [26/Jul/2026:12:04:03 +0900] "GET /notes/123456?token=secret HTTP/1.1" 200 482 "-" "Mozilla/5.0 Chrome/126 Safari/537.36" 0.042',
  );

  assert.ok(parsed);
  assert.equal(parsed.method, "GET");
  assert.equal(parsed.path, "/notes/:id");
  assert.equal(parsed.status, 200);
  assert.equal(parsed.durationMs, 42);
  assert.equal(parsed.kind, "human");
  assert.equal(parsed.at, "2026-07-26T03:04:03.000Z");
  assert.equal("ip" in parsed, false);
  assert.equal(JSON.stringify(parsed).includes("203.0.113.42"), false);
});

test("parses structured JSON access logs with nested HTTP fields", () => {
  const parsed = parseJsonLine(
    JSON.stringify({
      "@timestamp": "2026-07-26T03:04:05.000Z",
      url: { path: "/projects/550e8400-e29b-41d4-a716-446655440000" },
      http: {
        request: {
          method: "head",
          user_agent: "Bingbot/2.0",
          duration_ms: 17,
        },
        response: { status_code: 304 },
      },
    }),
  );

  assert.ok(parsed);
  assert.equal(parsed.method, "HEAD");
  assert.equal(parsed.path, "/projects/:uuid");
  assert.equal(parsed.status, 304);
  assert.equal(parsed.durationMs, 17);
  assert.equal(parsed.agent, "Bingbot");
});

test("auto parser rejects malformed lines", () => {
  assert.equal(parseLogLine("not an access log"), null);
  assert.equal(parseLogLine("{broken json"), null);
});

test("normalizes remote frames at the display privacy boundary", () => {
  const normalized = normalizeTelemetryFrame({
    schema: 1,
    sequence: 3,
    at: "not-a-date",
    source: "live",
    site: "\u001b[31mproduction\u001b[0m",
    metrics: {
      cpu: 140,
      memory: -2,
      load1: "0.4",
      requestsPerMinute: 8,
      crawlersPerMinute: 2,
    },
    visits: [
      {
        id: "\u001b[2Jvisit-1",
        at: 1_785_000_000,
        kind: "human",
        method: "get",
        path: "/users/42?token=secret",
        status: 200,
        durationMs: 12,
        agent: "\u001b[31mChrome",
      },
    ],
  });

  assert.equal(normalized.metrics.cpu, 100);
  assert.equal(normalized.metrics.memory, 0);
  assert.equal(normalized.visits[0].path, "/users/:id");
  assert.equal(normalized.visits[0].method, "GET");
  assert.doesNotMatch(normalized.site, /\u001b/);
  assert.doesNotMatch(normalized.visits[0].agent, /\u001b/);
  assert.equal(normalizeTelemetryFrame({ schema: 2, metrics: {} }), null);
});

test("deduplicates visits with the same event ID", () => {
  const visit = {
    id: "same-id",
    at: "2026-07-26T03:04:04.000Z",
    kind: "human",
    method: "GET",
    path: "/first",
    status: 200,
    durationMs: 12,
    agent: "Chrome",
  };
  const normalized = normalizeTelemetryFrame({
    schema: 1,
    sequence: 1,
    source: "live",
    metrics: {},
    visits: [visit, { ...visit, path: "/latest" }],
  });

  assert.equal(normalized.visits.length, 1);
  assert.equal(normalized.visits[0].path, "/latest");
});

test("bounds untrusted telemetry numbers and strips bidi controls", () => {
  const normalized = normalizeTelemetryFrame({
    schema: 1,
    sequence: 1e30,
    source: "live",
    site: "prod\u202enoitcudorp",
    metrics: {
      cpu: 10,
      memory: 20,
      load1: 1e30,
      requestsPerMinute: 1e30,
      crawlersPerMinute: 1e30,
    },
    visits: [
      {
        id: "visit",
        kind: "human",
        method: "GET",
        path: "/",
        status: 200,
        durationMs: 1e30,
        agent: "Chrome",
      },
    ],
  });

  assert.equal(normalized.sequence, Number.MAX_SAFE_INTEGER);
  assert.equal(normalized.site, "prodnoitcudorp");
  assert.equal(normalized.metrics.load1, 1_000_000);
  assert.equal(normalized.metrics.requestsPerMinute, 1_000_000);
  assert.equal(normalized.visits[0].durationMs, 86_400_000);
});

test("drains multiline SSE events across CRLF boundaries", () => {
  const first = drainSseEvents("event: ready\r\ndata: one\r");
  assert.deepEqual(first.events, []);

  const second = drainSseEvents(`${first.remainder}\n\r`);
  assert.deepEqual(second.events, []);

  const third = drainSseEvents(`${second.remainder}\ndata: two\ndata: lines\n\n`);
  assert.deepEqual(third.events, ["one", "two\nlines"]);
  assert.equal(third.remainder, "");
  assert.throws(
    () =>
      drainSseEvents("x".repeat(17), {
        maximumEventBytes: 16,
      }),
    /exceeds/,
  );
});

test("sanitizes the local site label before emitting a frame", async () => {
  const source = new TelemetrySource({
    site: "\u001b[2Jprod\u202e",
  });
  await source.initialize();
  const frame = await source.nextFrame();

  assert.equal(frame.site, "prod");
  assert.doesNotMatch(frame.site, /[\u001b\u202e]/);
});

test("keeps missing metric override fields undefined", async (context) => {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(
      request.url === "/partial"
        ? JSON.stringify({ memory: 34 })
        : JSON.stringify({}),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.equal(typeof address, "object");

  const baseUrl = `http://127.0.0.1:${address.port}`;
  assert.deepEqual(
    await fetchMetricOverrides({ url: `${baseUrl}/partial` }),
    {
      cpu: undefined,
      memory: 34,
      load1: undefined,
    },
  );
  assert.equal(
    await fetchMetricOverrides({ url: `${baseUrl}/empty` }),
    null,
  );
});

test("uses Linux available memory rather than cache-sensitive free memory", () => {
  const usage = parseLinuxMemoryUsage(`
MemTotal:       1000000 kB
MemFree:          50000 kB
MemAvailable:    400000 kB
Buffers:          20000 kB
`);

  assert.equal(usage, 60);
  assert.equal(parseLinuxMemoryUsage("MemTotal: 0 kB"), null);
});

test("uses the macOS memory-pressure percentage when available", () => {
  const usage = parseMacMemoryUsage(
    "System-wide memory free percentage: 41%",
  );

  assert.equal(usage, 59);
  assert.equal(parseMacMemoryUsage("unrecognized output"), null);
});

test("drops a partial line when a log jump exceeds the read window", async () => {
  const directory = await mkdtemp(join(tmpdir(), "embertop-window-test-"));
  const logPath = join(directory, "access.log");
  const validLine =
    '203.0.113.15 - - [26/Jul/2026:12:04:06 +0900] "GET /kept HTTP/1.1" 200 12 "-" "Googlebot/2.1" 0.010\n';

  try {
    await writeFile(logPath, "");
    const tailer = new AccessLogTailer({
      paths: [logPath],
      maximumReadBytes: Buffer.byteLength(validLine) + 10,
    });
    await tailer.initialize();
    await appendFile(logPath, `${"x".repeat(200)}\n${validLine}`);

    const visits = await tailer.poll();
    assert.equal(visits.length, 1);
    assert.equal(visits[0].path, "/kept");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("tails only new log lines and follows rotation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "embertop-test-"));
  const logPath = join(directory, "access.log");
  const firstLine =
    '203.0.113.10 - - [26/Jul/2026:12:04:03 +0900] "GET /before HTTP/1.1" 200 12 "-" "Googlebot/2.1" 0.010\n';
  const secondLine =
    '203.0.113.11 - - [26/Jul/2026:12:04:04 +0900] "GET /after/123456?secret=yes HTTP/1.1" 200 42 "-" "Mozilla/5.0 Chrome/126 Safari/537.36" 0.021\n';
  const rotatedLine =
    '203.0.113.12 - - [26/Jul/2026:12:04:05 +0900] "GET /rotated HTTP/1.1" 503 0 "-" "Bingbot/2.0" 0.030\n';

  try {
    await writeFile(logPath, firstLine);
    const tailer = new AccessLogTailer({ paths: [logPath] });
    await tailer.initialize();
    assert.deepEqual(await tailer.poll(), []);

    await appendFile(logPath, secondLine);
    const appended = await tailer.poll();
    assert.equal(appended.length, 1);
    assert.equal(appended[0].path, "/after/:id");
    assert.equal(appended[0].kind, "human");

    await rename(logPath, `${logPath}.1`);
    await writeFile(logPath, rotatedLine);
    const rotated = await tailer.poll();
    assert.equal(rotated.length, 1);
    assert.equal(rotated[0].path, "/rotated");
    assert.equal(rotated[0].status, 503);
    assert.equal(rotated[0].agent, "Bingbot");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("counts every observed request while limiting displayed visits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "embertop-rate-test-"));
  const logPath = join(directory, "access.log");
  const line =
    '203.0.113.10 - - [26/Jul/2026:12:04:03 +0900] "GET /busy HTTP/1.1" 200 12 "-" "Googlebot/2.1" 0.010\n';

  try {
    await writeFile(logPath, "");
    const source = new TelemetrySource({
      site: "rate-test",
      logPaths: [logPath],
    });
    await source.initialize();
    await appendFile(logPath, line.repeat(150));

    const frame = await source.nextFrame();
    assert.equal(frame.metrics.requestsPerMinute, 150);
    assert.equal(frame.metrics.crawlersPerMinute, 150);
    assert.equal(frame.visits.length, 24);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
