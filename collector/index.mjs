import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import {
  DEFAULT_SITE_NAME,
  sanitizeText,
} from "../lib/privacy.mjs";
import { TelemetrySource } from "./source.mjs";
import { splitLogPaths } from "./tailer.mjs";

const clients = new Set();
const MAX_CLIENTS = 128;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

const configuration = {
  host: process.env.EMBERTOP_HOST || "127.0.0.1",
  port: boundedInteger(process.env.EMBERTOP_PORT, 4318, 1, 65_535),
  site: sanitizeText(
    process.env.EMBERTOP_SITE_NAME,
    DEFAULT_SITE_NAME,
    80,
  ),
  token: process.env.EMBERTOP_COLLECTOR_TOKEN || "",
  logPaths: splitLogPaths(process.env.EMBERTOP_LOG_PATHS),
  logFormat: ["auto", "nginx", "json"].includes(
    process.env.EMBERTOP_LOG_FORMAT,
  )
    ? process.env.EMBERTOP_LOG_FORMAT
    : "auto",
  includePaths: process.env.EMBERTOP_INCLUDE_PATHS !== "false",
  sampleInterval: boundedInteger(
    process.env.EMBERTOP_SAMPLE_INTERVAL_MS,
    1_500,
    750,
    30_000,
  ),
  metricsUrl: process.env.EMBERTOP_METRICS_URL || "",
  metricsToken: process.env.EMBERTOP_METRICS_TOKEN || "",
};

if (
  !["127.0.0.1", "::1", "localhost"].includes(configuration.host) &&
  !configuration.token
) {
  throw new Error(
    "EMBERTOP_COLLECTOR_TOKEN is required when the collector listens beyond localhost.",
  );
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isAuthorized(request) {
  if (!configuration.token) return true;
  const authorization = request.headers.authorization || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  return safeEqual(String(supplied), configuration.token);
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function writeEvent(response, data, event) {
  const prefix = event ? `event: ${event}\n` : "";
  return response.write(
    `${prefix}data: ${JSON.stringify(data)}\n\n`,
  );
}

const source = new TelemetrySource({
  site: configuration.site,
  logPaths: configuration.logPaths,
  logFormat: configuration.logFormat,
  includePaths: configuration.includePaths,
  metricsUrl: configuration.metricsUrl,
  metricsToken: configuration.metricsToken,
  requestTimeoutMs: Math.max(500, configuration.sampleInterval - 150),
});

let latestFrame = null;
let shuttingDown = false;

async function broadcast() {
  latestFrame = await source.nextFrame();
  for (const response of clients) {
    try {
      if (!writeEvent(response, latestFrame)) {
        clients.delete(response);
        response.end();
      }
    } catch {
      clients.delete(response);
    }
  }
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET") {
    return writeJson(response, 405, { error: "method_not_allowed" });
  }

  let url;
  try {
    url = new URL(request.url || "/", "http://localhost");
  } catch {
    return writeJson(response, 400, { error: "bad_request" });
  }

  if (url.pathname === "/health") {
    return writeJson(response, 200, {
      ok: true,
      service: "embertop-collector",
      now: new Date().toISOString(),
    });
  }

  if (url.pathname !== "/stream") {
    return writeJson(response, 404, { error: "not_found" });
  }
  if (!isAuthorized(request)) {
    return writeJson(response, 401, { error: "unauthorized" });
  }
  if (clients.size >= MAX_CLIENTS) {
    return writeJson(response, 503, { error: "too_many_clients" });
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  });
  response.flushHeaders();
  const readyWritten = writeEvent(
    response,
    {
      mode: "live",
      site: configuration.site,
      privacy: "ip-and-query-redacted",
    },
    "ready",
  );
  if (!readyWritten) return response.end();
  if (latestFrame && !writeEvent(response, latestFrame)) {
    return response.end();
  }
  clients.add(response);

  request.on("close", () => {
    clients.delete(response);
  });
});

await source.initialize();
await broadcast();
let broadcastTimer = null;
const scheduleBroadcast = async () => {
  try {
    await broadcast();
  } catch (error) {
    console.error(
      `[embertop] sample failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  } finally {
    if (shuttingDown) return;
    broadcastTimer = setTimeout(
      () => void scheduleBroadcast(),
      configuration.sampleInterval,
    );
  }
};
broadcastTimer = setTimeout(
  () => void scheduleBroadcast(),
  configuration.sampleInterval,
);

server.once("error", (error) => {
  shuttingDown = true;
  if (broadcastTimer) clearTimeout(broadcastTimer);
  console.error(`[embertop] collector failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(configuration.port, configuration.host, () => {
  console.log(
    `[embertop] collector listening on http://${configuration.host}:${configuration.port}`,
  );
  console.log(
    `[embertop] ${configuration.logPaths.length} access log file(s), paths ${configuration.includePaths ? "sanitized" : "hidden"}`,
  );
});

function shutdown() {
  shuttingDown = true;
  if (broadcastTimer) clearTimeout(broadcastTimer);
  for (const response of clients) response.end();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
