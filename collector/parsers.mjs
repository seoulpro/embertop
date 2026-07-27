import { randomUUID } from "node:crypto";
import {
  normalizeTimestamp,
  sanitizePath,
  sanitizeText,
} from "../lib/privacy.mjs";

export { sanitizePath } from "../lib/privacy.mjs";

const CRAWLER_PATTERN =
  /bot|crawler|spider|slurp|facebookexternalhit|preview|monitor|uptime|headless/i;
const NGINX_MONTHS = new Map(
  [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].map((month, index) => [month, index]),
);

function toStatus(value) {
  const status = Number.parseInt(String(value), 10);
  return Number.isFinite(status) && status >= 100 && status <= 599
    ? status
    : 0;
}

function toDurationMs(value, unit = "milliseconds") {
  if (value == null || value === "" || value === "-") return null;
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0) return null;
  return Number((unit === "seconds" ? duration * 1_000 : duration).toFixed(2));
}

function nginxTimestamp(value) {
  const match = String(value).match(
    /^(\d{2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/,
  );
  if (!match || !NGINX_MONTHS.has(match[2])) return undefined;

  const offsetMinutes =
    (Number(match[8]) * 60 + Number(match[9])) *
    (match[7] === "+" ? 1 : -1);
  const timestamp =
    Date.UTC(
      Number(match[3]),
      NGINX_MONTHS.get(match[2]),
      Number(match[1]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ) -
    offsetMinutes * 60_000;
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

export function classifyAgent(rawAgent) {
  const userAgent = sanitizeText(rawAgent, "Unknown", 512);
  const crawler = CRAWLER_PATTERN.test(userAgent);

  if (/googlebot/i.test(userAgent)) {
    return { kind: "crawler", agent: "Googlebot" };
  }
  if (/bingbot/i.test(userAgent)) {
    return { kind: "crawler", agent: "Bingbot" };
  }
  if (/applebot/i.test(userAgent)) {
    return { kind: "crawler", agent: "Applebot" };
  }
  if (/ahrefsbot/i.test(userAgent)) {
    return { kind: "crawler", agent: "AhrefsBot" };
  }
  if (/semrushbot/i.test(userAgent)) {
    return { kind: "crawler", agent: "SemrushBot" };
  }
  if (crawler) return { kind: "crawler", agent: "Crawler" };
  if (/curl/i.test(userAgent)) return { kind: "unknown", agent: "curl" };
  if (/firefox/i.test(userAgent)) return { kind: "human", agent: "Firefox" };
  if (/edg\//i.test(userAgent)) return { kind: "human", agent: "Edge" };
  if (/chrome|crios/i.test(userAgent)) {
    return { kind: "human", agent: "Chrome" };
  }
  if (/safari/i.test(userAgent)) return { kind: "human", agent: "Safari" };
  return { kind: "unknown", agent: "Unknown" };
}

function visit({
  at,
  method,
  path,
  status,
  durationMs,
  userAgent,
  includePaths,
}) {
  const agent = classifyAgent(userAgent);
  return {
    id: randomUUID(),
    at: normalizeTimestamp(at),
    kind: agent.kind,
    method: sanitizeText(method, "GET", 12).toUpperCase(),
    path: sanitizePath(path, { includePaths }),
    status: toStatus(status),
    durationMs,
    agent: agent.agent,
  };
}

export function parseNginxLine(line, options = {}) {
  const match = String(line).match(
    /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([A-Z]+)\s+(\S+)(?:\s+[^"]*)?"\s+(\d{3})\s+(\S+)(?:\s+"[^"]*"\s+"([^"]*)")?(?:\s+([\d.]+))?\s*$/,
  );
  if (!match) return null;

  return visit({
    at: nginxTimestamp(match[2]),
    method: match[3],
    path: match[4],
    status: match[5],
    durationMs: toDurationMs(match[8], "seconds"),
    userAgent: match[7],
    includePaths: options.includePaths,
  });
}

function get(object, path) {
  return path.reduce(
    (current, key) =>
      current && typeof current === "object" ? current[key] : undefined,
    object,
  );
}

function first(object, paths) {
  for (const path of paths) {
    const value = get(object, path);
    if (value != null) return value;
  }
  return undefined;
}

export function parseJsonLine(line, options = {}) {
  let record;
  try {
    record = JSON.parse(String(line));
  } catch {
    return null;
  }
  if (!record || typeof record !== "object") return null;

  const durationValue = first(record, [
    ["durationMs"],
    ["duration_ms"],
    ["latencyMs"],
    ["response", "duration_ms"],
    ["http", "request", "duration_ms"],
    ["request_time"],
  ]);
  const durationUnit =
    Object.hasOwn(record, "request_time") &&
    !Object.hasOwn(record, "durationMs") &&
    !Object.hasOwn(record, "duration_ms")
      ? "seconds"
      : "milliseconds";

  return visit({
    at: first(record, [
      ["at"],
      ["timestamp"],
      ["time"],
      ["@timestamp"],
    ]),
    method: first(record, [
      ["method"],
      ["request", "method"],
      ["http", "request", "method"],
    ]),
    path: first(record, [
      ["path"],
      ["request_uri"],
      ["url", "path"],
      ["url"],
      ["request", "path"],
      ["http", "request", "path"],
    ]),
    status: first(record, [
      ["status"],
      ["statusCode"],
      ["response", "status"],
      ["http", "response", "status_code"],
    ]),
    durationMs: toDurationMs(durationValue, durationUnit),
    userAgent: first(record, [
      ["userAgent"],
      ["user_agent"],
      ["request", "user_agent"],
      ["http", "request", "user_agent"],
    ]),
    includePaths: options.includePaths,
  });
}

export function parseLogLine(line, format = "auto", options = {}) {
  if (!line || !String(line).trim()) return null;
  if (format === "json") return parseJsonLine(line, options);
  if (format === "nginx") return parseNginxLine(line, options);
  return String(line).trimStart().startsWith("{")
    ? parseJsonLine(line, options)
    : parseNginxLine(line, options);
}
