import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
let app;
let appOrigin;
let appOutput = "";
let upstream;
let upstreamAuthorization = "";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return address.port;
}

async function waitUntilReady(origin) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (app?.exitCode != null) {
      throw new Error(`standalone server exited early\n${appOutput}`);
    }
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(100);
  }
  throw new Error(`standalone server did not become ready\n${appOutput}`);
}

before(async () => {
  upstream = createServer((request, response) => {
    upstreamAuthorization = request.headers.authorization ?? "";
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
    });
    response.end(
      `data: ${JSON.stringify({
        schema: 1,
        sequence: 1,
        at: "2026-07-26T03:04:05.000Z",
        source: "live",
        site: "\u001b[2Jproduction",
        metrics: {
          cpu: 27,
          memory: 53,
          load1: 0.4,
          requestsPerMinute: 8,
          crawlersPerMinute: 2,
        },
        visits: [
          {
            id: "visit-1",
            at: "2026-07-26T03:04:04.000Z",
            kind: "human",
            method: "GET",
            path: "/members/42?email=private@example.com",
            status: 200,
            durationMs: 14,
            agent: "Chrome",
            ip: "203.0.113.42",
          },
        ],
        internalToken: "must-not-reach-the-browser",
      })}\r\n\r\n`,
    );
  });
  const upstreamPort = await listen(upstream);

  const probe = createServer();
  const appPort = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  appOrigin = `http://127.0.0.1:${appPort}`;
  app = spawn(process.execPath, ["server.js"], {
    cwd: join(root, ".next", "standalone"),
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(appPort),
      EMBERTOP_UPSTREAM_URL:
        `http://127.0.0.1:${upstreamPort}/stream`,
      EMBERTOP_UPSTREAM_TOKEN: "upstream-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => {
    appOutput += chunk;
  });
  app.stderr.on("data", (chunk) => {
    appOutput += chunk;
  });
  await waitUntilReady(appOrigin);
});

after(async () => {
  if (app?.exitCode == null) {
    app.kill("SIGTERM");
    await once(app, "exit");
  }
  if (upstream?.listening) {
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test("server-renders the complete Embertop experience", async () => {
  const response = await fetch(appOrigin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("referrer-policy"), "same-origin");

  const html = await response.text();
  assert.match(html, /<html[^>]+lang="en"/i);
  assert.match(
    html,
    /<title>Embertop · Every request leaves a spark<\/title>/i,
  );
  assert.match(html, /embertop/);
  assert.match(html, /CPU/);
  assert.match(html, /flame/);
  assert.match(html, /Memory/);
  assert.match(html, /embers/);
  assert.match(html, /Last 60 seconds/);
  assert.match(html, /load/);
  assert.match(html, /Requests/);
  assert.match(html, /addresses and query strings dropped/);
  assert.match(html, /Just the fire/);
  assert.match(html, /<kbd[^>]*>M<\/kbd>/i);
  assert.match(html, /<kbd[^>]*>Space<\/kbd>/i);
  assert.match(html, /<kbd[^>]*>F<\/kbd>/i);
  assert.doesNotMatch(html, /개발자용|불멍 제어|방금 지나간/);
  assert.doesNotMatch(html, /버스트/);
});

test("serves the standalone client assets", async () => {
  const html = await (await fetch(appOrigin)).text();
  const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
  assert.ok(scriptPath, "expected a client script in the rendered HTML");

  const response = await fetch(new URL(scriptPath, appOrigin));
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /javascript/i,
  );
});

test("keeps telemetry credentials server-only", async () => {
  const [page, client, telemetryClient, streamRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/Embertop.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/useTelemetry.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stream/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<Embertop \/>/);
  assert.match(
    telemetryClient,
    /new EventSource\(`\$\{pagePath\}\/api\/stream`\)/,
  );
  assert.doesNotMatch(
    `${client}\n${telemetryClient}`,
    /EMBERTOP_UPSTREAM_TOKEN|NEXT_PUBLIC_/,
  );
  assert.match(streamRoute, /process\.env\.EMBERTOP_UPSTREAM_TOKEN/);
  assert.match(streamRoute, /Authorization/);
});

test("normalizes live SSE before it reaches the browser", async () => {
  const response = await fetch(`${appOrigin}/api/stream`);
  assert.equal(response.status, 200);
  const body = await response.text();

  assert.equal(upstreamAuthorization, "Bearer upstream-secret");
  assert.match(body, /"path":"\/members\/:id"/);
  assert.match(body, /"site":"production"/);
  assert.doesNotMatch(
    body,
    /203\.0\.113\.42|private@example\.com|must-not-reach-the-browser|\u001b/,
  );
});
