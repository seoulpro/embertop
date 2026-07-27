#!/usr/bin/env node
/**
 * Synthetic telemetry for a hosted demonstration of the Embertop interface.
 *
 * This file is deliberately outside the application: it is excluded from the
 * npm package, and nothing in Embertop imports it. The
 * product never fabricates data. See showcase/README.md.
 *
 * It speaks the same SSE schema documented in docs/INTEGRATION.md, so it is
 * interchangeable with a real collector from the web app's point of view.
 */
import { createServer } from "node:http";

const port = Number.parseInt(
  process.argv[process.argv.indexOf("--port") + 1] || "4318",
  10,
);
const host = process.argv.includes("--host")
  ? process.argv[process.argv.indexOf("--host") + 1]
  : "127.0.0.1";
const site = process.argv.includes("--site")
  ? process.argv[process.argv.indexOf("--site") + 1]
  : "example.com";

const CRAWLERS = ["Googlebot", "Bingbot", "Applebot", "AhrefsBot"];
const HUMANS = ["Safari", "Chrome", "Firefox", "Arc"];
const UNIDENTIFIED = ["curl", "Unknown", "Unknown", "curl"];
const PATHS = ["/", "/projects", "/notes", "/about", "/api/health"];
const CRAWLER_PATHS = ["/", "/feed.xml", "/robots.txt", "/notes"];
const PROBE_PATHS = [
  "/wp-login.php",
  "/.env",
  "/.git/config",
  "/admin",
  "/phpmyadmin",
];

const pick = (values) => values[Math.floor(Math.random() * values.length)];

function randomVisit(sequence) {
  const roll = Math.random();
  const id = `showcase-${sequence}-${Math.random().toString(36).slice(2, 8)}`;
  const at = new Date().toISOString();
  const method = Math.random() < 0.93 ? "GET" : "HEAD";

  if (roll < 0.13) {
    return {
      id,
      at,
      kind: "unknown",
      method,
      path: pick(PROBE_PATHS),
      status: Math.random() < 0.82 ? 404 : 403,
      durationMs: Math.round(3 + Math.random() * 22),
      agent: pick(UNIDENTIFIED),
    };
  }
  if (roll < 0.37) {
    return {
      id,
      at,
      kind: "crawler",
      method,
      path: pick(CRAWLER_PATHS),
      status: 200,
      durationMs: Math.round(18 + Math.random() * 210),
      agent: pick(CRAWLERS),
    };
  }
  const broken = Math.random() < 0.035;
  return {
    id,
    at,
    kind: "human",
    method,
    path: pick(PATHS),
    status: broken ? 503 : 200,
    durationMs: Math.round(18 + Math.random() * (broken ? 900 : 540)),
    agent: pick(HUMANS),
  };
}

let sequence = 0;
let cpu = 24;
let requestsPerMinute = 14;

function nextFrame() {
  sequence += 1;
  cpu = Math.min(94, Math.max(6, cpu * 0.72 + 8 + Math.random() * 20));
  requestsPerMinute = Math.max(
    1,
    Math.round(requestsPerMinute * 0.82 + Math.random() * 8),
  );
  const visitCount = Math.random() < 0.28 ? 0 : Math.random() < 0.84 ? 1 : 2;
  const visits = Array.from({ length: visitCount }, () =>
    randomVisit(sequence),
  );

  return {
    schema: 1,
    sequence,
    at: new Date().toISOString(),
    source: "live",
    site,
    metrics: {
      cpu: Number(cpu.toFixed(1)),
      memory: Number((54 + Math.sin(sequence / 10) * 4.5).toFixed(1)),
      load1: Number((0.2 + cpu / 75).toFixed(2)),
      requestsPerMinute,
      crawlersPerMinute: Math.round(requestsPerMinute * 0.24),
    },
    visits,
  };
}

const server = createServer((request, response) => {
  if (!request.url?.startsWith("/stream")) {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });

  let timer = null;
  const emit = () => {
    response.write(`data: ${JSON.stringify(nextFrame())}\n\n`);
    timer = setTimeout(emit, 1150 + Math.random() * 950);
  };
  emit();

  request.on("close", () => {
    if (timer) clearTimeout(timer);
  });
});

server.listen(port, host, () => {
  process.stdout.write(
    `showcase collector (synthetic data) on http://${host}:${port}/stream\n`,
  );
});
