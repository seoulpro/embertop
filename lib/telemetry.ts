import { normalizeTelemetryFrame } from "./normalize.mjs";

export const TELEMETRY_SCHEMA_VERSION = 1 as const;

export type VisitorKind = "human" | "crawler" | "unknown";
/** Where a frame came from. There is no synthetic source. */
export type TelemetrySource = "live";

export interface VisitEvent {
  id: string;
  at: string;
  kind: VisitorKind;
  method: string;
  path: string;
  status: number;
  durationMs: number | null;
  agent: string;
}

export interface TelemetryMetrics {
  cpu: number;
  memory: number;
  load1: number;
  requestsPerMinute: number;
  crawlersPerMinute: number;
}

export interface TelemetryFrame {
  schema: typeof TELEMETRY_SCHEMA_VERSION;
  sequence: number;
  at: string;
  source: TelemetrySource;
  site: string;
  metrics: TelemetryMetrics;
  visits: VisitEvent[];
}

/**
 * A rolling one-minute read of the request stream, tallied in the client so
 * it works against any source that implements the documented schema.
 */
export interface TrafficMix {
  total: number;
  sources: { visitor: number; crawler: number; unknown: number };
  outcomes: { ok: number; refused: number; broken: number };
}

export const EMPTY_METRICS: TelemetryMetrics = {
  cpu: 0,
  memory: 0,
  load1: 0,
  requestsPerMinute: 0,
  crawlersPerMinute: 0,
};

export function normalizeFrame(input: unknown): TelemetryFrame | null {
  return normalizeTelemetryFrame(input) as TelemetryFrame | null;
}
