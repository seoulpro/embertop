import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";

let macMemoryCache = { measuredAt: 0, usage: null };

export function clampPercent(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, numeric));
}

function optionalPercent(value) {
  if (value == null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(100, Math.max(0, numeric))
    : undefined;
}

function aggregateCpuTimes() {
  return os.cpus().reduce(
    (summary, cpu) => {
      const total = Object.values(cpu.times).reduce(
        (sum, time) => sum + time,
        0,
      );
      summary.idle += cpu.times.idle;
      summary.total += total;
      return summary;
    },
    { idle: 0, total: 0 },
  );
}

export function parseLinuxMemoryUsage(contents) {
  const values = new Map(
    String(contents)
      .split("\n")
      .map((line) => line.match(/^(\w+):\s+(\d+)\s+kB$/))
      .filter(Boolean)
      .map((match) => [match[1], Number(match[2])]),
  );
  const total = values.get("MemTotal");
  const available = values.get("MemAvailable");
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(available) ||
    total <= 0
  ) {
    return null;
  }
  return clampPercent(((total - available) / total) * 100);
}

export function parseMacMemoryUsage(contents) {
  const match = String(contents).match(
    /System-wide memory free percentage:\s*(\d+(?:\.\d+)?)%/i,
  );
  if (!match) return null;
  const free = Number(match[1]);
  return Number.isFinite(free) ? clampPercent(100 - free) : null;
}

function macMemoryUsage() {
  const now = Date.now();
  if (
    macMemoryCache.usage != null &&
    now - macMemoryCache.measuredAt < 10_000
  ) {
    return macMemoryCache.usage;
  }

  try {
    const usage = parseMacMemoryUsage(
      execFileSync("/usr/bin/memory_pressure", ["-Q"], {
        encoding: "utf8",
        timeout: 1_000,
      }),
    );
    if (usage != null) {
      macMemoryCache = { measuredAt: now, usage };
      return usage;
    }
  } catch {
    // Fall back to the portable operating-system values.
  }
  return null;
}

function memoryUsage() {
  if (process.platform === "linux") {
    try {
      const usage = parseLinuxMemoryUsage(
        readFileSync("/proc/meminfo", "utf8"),
      );
      if (usage != null) return usage;
    } catch {
      // Fall back to the portable operating-system values.
    }
  }
  if (process.platform === "darwin") {
    const usage = macMemoryUsage();
    if (usage != null) return usage;
  }

  const total = os.totalmem();
  return total > 0
    ? clampPercent(((total - os.freemem()) / total) * 100)
    : 0;
}

export function createSystemSampler() {
  let previousCpuTimes = aggregateCpuTimes();
  let hasBaselineInterval = false;

  return {
    sample() {
      const current = aggregateCpuTimes();
      const idleDelta = current.idle - previousCpuTimes.idle;
      const totalDelta = current.total - previousCpuTimes.total;
      previousCpuTimes = current;
      const measuredCpu =
        totalDelta > 0
          ? clampPercent(100 - (idleDelta / totalDelta) * 100)
          : 0;
      const cpu = hasBaselineInterval ? measuredCpu : 0;
      hasBaselineInterval = true;
      return {
        cpu: Number(cpu.toFixed(1)),
        memory: Number(memoryUsage().toFixed(1)),
        load1: Number(os.loadavg()[0].toFixed(2)),
      };
    },
  };
}

const MAX_METRICS_BYTES = 64 * 1024;

/** Read at most `limit` bytes of a response, giving up rather than buffering. */
async function readBounded(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  }
  return text + decoder.decode();
}

export async function fetchMetricOverrides({
  url,
  token = "",
  timeoutMs = 1_000,
}) {
  if (!url) return null;
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(Math.max(250, timeoutMs)),
    });
    if (!response.ok) return null;
    // The timeout bounds how long this can take, not how much it can send.
    // A misconfigured or hostile endpoint should not be able to grow the
    // collector's heap with one reply.
    const raw = await readBounded(response, MAX_METRICS_BYTES);
    if (raw == null) return null;
    const body = JSON.parse(raw);
    const metrics =
      body && typeof body.metrics === "object" ? body.metrics : body;
    if (!metrics || typeof metrics !== "object") return null;

    const override = {
      cpu: optionalPercent(metrics.cpu),
      memory: optionalPercent(metrics.memory),
      load1:
        metrics.load1 != null && Number.isFinite(Number(metrics.load1))
          ? Math.min(1_000_000, Math.max(0, Number(metrics.load1)))
          : undefined,
    };
    return Object.values(override).some((value) => value !== undefined)
      ? override
      : null;
  } catch {
    return null;
  }
}
