const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_TOKEN = /^[a-z0-9._~+=-]{20,}$/i;
const NUMERIC_ID = /^\d+$/;
const EMAIL_SEGMENT = /^[^@\s]+@[^@\s]+$/;
const IPV4_SEGMENT = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6_SEGMENT = /^(?=.*:)[0-9a-f:]+$/i;

export const DEFAULT_SITE_NAME = "this-machine";

export function sanitizeText(value, fallback, maximum) {
  const text = String(value ?? fallback)
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .trim();
  return (text || fallback).slice(0, maximum);
}

export function normalizeTimestamp(
  value,
  fallback = new Date().toISOString(),
) {
  let timestamp = value;
  if (
    typeof timestamp === "string" &&
    /^\d+(?:\.\d+)?$/.test(timestamp.trim())
  ) {
    timestamp = Number(timestamp);
  }
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    timestamp *= timestamp < 1_000_000_000_000 ? 1_000 : 1;
  }

  const date = new Date(timestamp ?? fallback);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

export function sanitizePath(rawPath, { includePaths = true } = {}) {
  if (!includePaths) return "/…";
  let candidate = sanitizeText(rawPath, "/", 512);

  try {
    if (/^https?:\/\//i.test(candidate)) {
      candidate = new URL(candidate).pathname;
    }
  } catch {
    candidate = "/";
  }

  candidate = candidate.split(/[?#]/, 1)[0] || "/";
  if (!candidate.startsWith("/")) candidate = `/${candidate}`;

  const segments = candidate.split("/").map((segment) => {
    let inspected = segment;
    try {
      inspected = decodeURIComponent(segment);
    } catch {
      // Keep the encoded segment when it is not valid URI data.
    }

    if (UUID_SEGMENT.test(inspected)) return ":uuid";
    if (NUMERIC_ID.test(inspected)) return ":id";
    if (EMAIL_SEGMENT.test(inspected)) return ":email";
    if (IPV4_SEGMENT.test(inspected) || IPV6_SEGMENT.test(inspected)) {
      return ":ip";
    }
    if (LONG_TOKEN.test(inspected)) return ":token";
    return segment.slice(0, 40);
  });

  return segments.join("/").replace(/\/{2,}/g, "/").slice(0, 120) || "/";
}
