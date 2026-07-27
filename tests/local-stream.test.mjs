import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import os from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
let app;
let origin;
let output = "";

async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

before(async () => {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["server.js"], {
    cwd: join(root, ".next", "standalone"),
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      // Deliberately no upstream: this is the out-of-the-box path.
      EMBERTOP_UPSTREAM_URL: "",
      EMBERTOP_SITE_NAME: "",
      EMBERTOP_LOG_PATHS: "",
      EMBERTOP_SAMPLE_INTERVAL_MS: "750",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => {
    output += chunk;
  });
  app.stderr.on("data", (chunk) => {
    output += chunk;
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (app.exitCode != null) {
      throw new Error(`standalone server exited early\n${output}`);
    }
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return;
    } catch {
      // Still starting.
    }
    await delay(100);
  }
  throw new Error(`standalone server did not become ready\n${output}`);
});

after(async () => {
  if (app?.exitCode == null) {
    app.kill("SIGTERM");
    await once(app, "exit");
  }
});

test("reports that it is reading the local machine", async () => {
  const health = await (await fetch(`${origin}/api/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.mode, "local");
});

/**
 * The product has no synthetic mode. With nothing configured, the web server
 * must report the machine it runs on rather than inventing a fireplace.
 */
test("streams real local telemetry when no collector is configured", async () => {
  const response = await fetch(`${origin}/api/stream`);
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /text\/event-stream/,
  );

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const frames = [];
  let buffer = "";
  const deadline = Date.now() + 15_000;

  while (frames.length < 3 && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = event.replace(/^data: /, "");
      if (data.trim()) frames.push(JSON.parse(data));
      boundary = buffer.indexOf("\n\n");
    }
  }
  await reader.cancel();

  assert.ok(frames.length >= 3, `expected frames, got ${frames.length}`);

  const loadAverage = os.loadavg()[0];
  for (const frame of frames) {
    assert.equal(frame.schema, 1);
    assert.equal(frame.source, "live");
    // Real metrics do not require exposing the machine's network hostname.
    assert.equal(frame.site, "this-machine");
    assert.equal(typeof frame.metrics.cpu, "number");
    assert.ok(frame.metrics.cpu >= 0 && frame.metrics.cpu <= 100);
    assert.ok(frame.metrics.memory > 0, "memory should be a real reading");
    // A fabricated value would not track the real load average.
    assert.ok(
      Math.abs(frame.metrics.load1 - loadAverage) < loadAverage * 0.5 + 5,
      `load1 ${frame.metrics.load1} is unrelated to ${loadAverage}`,
    );
  }

  // Sequence numbers advance once per sample and are never repeated.
  const sequences = frames.map((frame) => frame.sequence);
  assert.deepEqual(
    sequences,
    [...sequences].sort((a, b) => a - b),
    "sequences should increase",
  );
  assert.equal(new Set(sequences).size, sequences.length, "no repeated frames");
});

test("keeps every connected client on the same sampler", async () => {
  // Two readers must see the same frames, not a private stream each: a
  // per-connection sampler would let two tabs split the new log lines.
  const read = async () => {
    const response = await fetch(`${origin}/api/stream`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const seen = [];
    const deadline = Date.now() + 10_000;
    while (seen.length < 3 && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const data = buffer.slice(0, boundary).replace(/^data: /, "");
        buffer = buffer.slice(boundary + 2);
        if (data.trim()) seen.push(JSON.parse(data).sequence);
        boundary = buffer.indexOf("\n\n");
      }
    }
    await reader.cancel();
    return seen;
  };

  const [first, second] = await Promise.all([read(), read()]);
  const shared = first.filter((sequence) => second.includes(sequence));
  assert.ok(
    shared.length > 0,
    `clients saw disjoint frames: ${first} vs ${second}`,
  );
});
