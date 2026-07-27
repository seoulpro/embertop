import {
  normalizeFrame,
  type TelemetryFrame,
} from "@/lib/telemetry";
import { DEFAULT_SITE_NAME } from "@/lib/privacy.mjs";
import { drainSseEvents } from "@/lib/sse.mjs";
import { TelemetrySource } from "@/collector/source.mjs";
import { splitLogPaths } from "@/collector/tailer.mjs";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const UPSTREAM_CONNECT_TIMEOUT_MS = 5_000;
const SAMPLE_INTERVAL_MS = Math.min(
  30_000,
  Math.max(
    750,
    Number.parseInt(process.env.EMBERTOP_SAMPLE_INTERVAL_MS || "1500", 10) ||
      1500,
  ),
);

// A browser dashboard has no login of its own, so an open instance should not
// be able to exhaust the server by opening connections.
const MAX_CLIENTS = 64;

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "Content-Encoding": "identity",
  "X-Accel-Buffering": "no",
  "X-Content-Type-Options": "nosniff",
} as const;

function sse(data: unknown, event?: string): Uint8Array {
  const prefix = event ? `event: ${event}\n` : "";
  return encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`);
}

/**
 * With no collector configured the web server reads the machine it is running
 * on, using the very same sampler as `embertop watch`. There is no synthetic
 * mode: what the page shows is always something that actually happened.
 *
 * One sampler is shared by every connected browser. Polling it per connection
 * would let two tabs each drain half of the new access-log lines.
 */
let sampler: TelemetrySource | null = null;
let samplerReady: Promise<unknown> | null = null;
let ticker: ReturnType<typeof setTimeout> | null = null;
let lastFrame: TelemetryFrame | null = null;
const listeners = new Set<(frame: TelemetryFrame) => void>();

function localSampler() {
  if (!sampler) {
    sampler = new TelemetrySource({
      site: process.env.EMBERTOP_SITE_NAME || DEFAULT_SITE_NAME,
      logPaths: splitLogPaths(process.env.EMBERTOP_LOG_PATHS),
      logFormat: process.env.EMBERTOP_LOG_FORMAT || "auto",
      includePaths: process.env.EMBERTOP_INCLUDE_PATHS !== "false",
      metricsUrl: process.env.EMBERTOP_METRICS_URL || "",
      metricsToken: process.env.EMBERTOP_METRICS_TOKEN || "",
      requestTimeoutMs: Math.max(500, SAMPLE_INTERVAL_MS - 150),
    });
    samplerReady = sampler.initialize().catch(() => {
      // A missing or unreadable log file must not take the metrics down.
    });
  }
  return { source: sampler, ready: samplerReady };
}

async function pump() {
  const { source, ready } = localSampler();
  // Sampling before initialization would miss the CPU baseline and could
  // replay log lines that were already on disk at startup.
  await ready;
  try {
    const frame = normalizeFrame(await source.nextFrame());
    if (frame) {
      lastFrame = frame;
      for (const listener of listeners) listener(frame);
    }
  } catch {
    // Keep sampling; a transient read failure should not end the stream.
  }
  if (listeners.size > 0) ticker = setTimeout(pump, SAMPLE_INTERVAL_MS);
  else ticker = null;
}

function subscribe(listener: (frame: TelemetryFrame) => void) {
  listeners.add(listener);
  if (!ticker) ticker = setTimeout(pump, 0);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && ticker) {
      clearTimeout(ticker);
      ticker = null;
    }
  };
}

function createLocalStream(request: Request): Response {
  if (listeners.size >= MAX_CLIENTS) {
    return Response.json(
      { error: "too_many_clients" },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
  let unsubscribe = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
      };

      const push = (frame: TelemetryFrame) => {
        if (closed) return;
        if (controller.desiredSize == null || controller.desiredSize > 0) {
          controller.enqueue(sse(frame));
        }
      };

      if (request.signal.aborted) return close();
      // Hand a second tab the reading already on screen elsewhere, before
      // subscribing, so the first live frame is not sent twice.
      if (lastFrame) push(lastFrame);
      unsubscribe = subscribe(push);
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      unsubscribe();
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}

async function proxyLiveStream(request: Request, upstreamUrl: string) {
  const headers = new Headers({
    Accept: "text/event-stream",
    "User-Agent": "embertop-web",
  });
  const token = process.env.EMBERTOP_UPSTREAM_TOKEN;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let upstream: Response;
  const connectionController = new AbortController();
  const relayAbort = () => connectionController.abort(request.signal.reason);
  if (request.signal.aborted) relayAbort();
  else request.signal.addEventListener("abort", relayAbort, { once: true });
  const connectTimer = setTimeout(
    () =>
      connectionController.abort(
        new Error("telemetry upstream connection timed out"),
      ),
    UPSTREAM_CONNECT_TIMEOUT_MS,
  );
  try {
    upstream = await fetch(upstreamUrl, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: connectionController.signal,
    });
  } catch {
    request.signal.removeEventListener("abort", relayAbort);
    return Response.json(
      {
        error: "upstream_unreachable",
        message: "The telemetry collector could not be reached.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(connectTimer);
  }

  if (
    !upstream.ok ||
    !upstream.body ||
    !upstream.headers.get("content-type")?.includes("text/event-stream")
  ) {
    request.signal.removeEventListener("abort", relayAbort);
    try {
      await upstream.body?.cancel();
    } catch {
      // The upstream may already have closed its body.
    }
    return Response.json(
      {
        error: "upstream_rejected",
        status: upstream.status,
      },
      { status: 502 },
    );
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const normalizedStream = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const drained = drainSseEvents(buffer);
        buffer = drained.remainder;

        for (const data of drained.events) {
          try {
            const frame = normalizeFrame(JSON.parse(data));
            if (frame) controller.enqueue(sse(frame));
          } catch {
            // Ignore malformed upstream events.
          }
        }
      },
      flush() {
        request.signal.removeEventListener("abort", relayAbort);
      },
    }),
  );

  return new Response(normalizedStream, { headers: STREAM_HEADERS });
}

export async function GET(request: Request) {
  const upstreamUrl = process.env.EMBERTOP_UPSTREAM_URL?.trim();
  if (!upstreamUrl) return createLocalStream(request);

  try {
    const url = new URL(upstreamUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error("Unsupported upstream protocol");
    }
  } catch {
    return Response.json(
      { error: "invalid_upstream_url" },
      { status: 500 },
    );
  }

  return proxyLiveStream(request, upstreamUrl);
}
