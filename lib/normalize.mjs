import {
  DEFAULT_SITE_NAME,
  normalizeTimestamp,
  sanitizePath,
  sanitizeText,
} from "./privacy.mjs";

const SCHEMA_VERSION = 1;
const MAX_DURATION_MS = 86_400_000;
const MAX_LOAD = 1_000_000;
const MAX_RATE = 1_000_000;

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function bounded(value, maximum, fallback = 0) {
  return Math.min(maximum, nonNegative(value, fallback));
}

function percent(value) {
  return bounded(value, 100);
}

function statusCode(value) {
  const status = Math.round(finiteNumber(value));
  return status >= 100 && status <= 599 ? status : 0;
}

function normalizeVisit(value, fallbackTimestamp) {
  if (!value || typeof value !== "object" || !("id" in value)) return null;
  const kind =
    value.kind === "human" || value.kind === "crawler"
      ? value.kind
      : "unknown";

  return {
    id: sanitizeText(value.id, "unknown", 96),
    at: normalizeTimestamp(value.at, fallbackTimestamp),
    kind,
    method: sanitizeText(value.method, "GET", 12).toUpperCase(),
    path: sanitizePath(value.path),
    status: statusCode(value.status),
    durationMs:
      value.durationMs == null
        ? null
        : bounded(value.durationMs, MAX_DURATION_MS),
    agent: sanitizeText(value.agent, "Unknown", 48),
  };
}

export function normalizeTelemetryFrame(input) {
  if (!input || typeof input !== "object" || input.schema !== SCHEMA_VERSION) {
    return null;
  }
  if (!input.metrics || typeof input.metrics !== "object") return null;

  const now = new Date().toISOString();
  const normalizedVisits = Array.isArray(input.visits)
    ? input.visits
        .map((visit) => normalizeVisit(visit, now))
        .filter(Boolean)
    : [];
  const visits = Array.from(
    new Map(normalizedVisits.map((visit) => [visit.id, visit])).values(),
  ).slice(-24);

  return {
    schema: SCHEMA_VERSION,
    sequence: Math.round(
      bounded(input.sequence, Number.MAX_SAFE_INTEGER),
    ),
    at: normalizeTimestamp(input.at, now),
    source: "live",
    site: sanitizeText(input.site, DEFAULT_SITE_NAME, 80),
    metrics: {
      cpu: percent(input.metrics.cpu),
      memory: percent(input.metrics.memory),
      load1: bounded(input.metrics.load1, MAX_LOAD),
      requestsPerMinute: Math.round(
        bounded(input.metrics.requestsPerMinute, MAX_RATE),
      ),
      crawlersPerMinute: Math.round(
        bounded(input.metrics.crawlersPerMinute, MAX_RATE),
      ),
    },
    visits,
  };
}
