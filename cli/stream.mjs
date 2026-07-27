import { normalizeTelemetryFrame } from "../lib/normalize.mjs";
import { drainSseEvents } from "../lib/sse.mjs";

export function validateEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("endpoint must be a valid HTTP or HTTPS URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "endpoint must use HTTP or HTTPS and must not contain credentials",
    );
  }
  return url;
}

export async function readSse(endpoint, token, onFrame, signal) {
  const url = validateEndpoint(endpoint);
  const headers = { Accept: "text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const connectionController = new AbortController();
  const relayAbort = () => connectionController.abort(signal.reason);
  if (signal.aborted) relayAbort();
  else signal.addEventListener("abort", relayAbort, { once: true });
  const connectTimer = setTimeout(
    () => connectionController.abort(new Error("stream connection timed out")),
    10_000,
  );
  let reader;

  try {
    const response = await fetch(url, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: connectionController.signal,
    });
    clearTimeout(connectTimer);
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`stream returned HTTP ${response.status}`);
    }
    if (!response.body) throw new Error("stream response has no body");
    if (
      !response.headers.get("content-type")?.includes("text/event-stream")
    ) {
      await response.body.cancel();
      throw new Error("endpoint is not an SSE stream");
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const drained = drainSseEvents(buffer);
      buffer = drained.remainder;
      for (const data of drained.events) {
        if (!data) continue;
        try {
          const frame = normalizeTelemetryFrame(JSON.parse(data));
          if (frame) onFrame(frame);
        } catch {
          // Keep the last valid frame when an event is malformed.
        }
      }
    }
    if (!signal.aborted) throw new Error("stream ended");
  } finally {
    clearTimeout(connectTimer);
    signal.removeEventListener("abort", relayAbort);
    try {
      await reader?.cancel();
    } catch {
      // The stream may already be closed or aborted.
    }
  }
}

export function wait(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    let timer;
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}
