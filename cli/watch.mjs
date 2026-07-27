import { TelemetrySource } from "../collector/source.mjs";
import { createTrafficWindow, emptyTrafficMix } from "../lib/traffic.mjs";
import { readSse, wait } from "./stream.mjs";
import {
  padLine,
  renderDashboard,
  resolveCapabilities,
} from "./terminal.mjs";

function emptyFrame(site) {
  return {
    schema: 1,
    sequence: 0,
    at: new Date().toISOString(),
    source: "live",
    site,
    metrics: {
      cpu: 0,
      memory: 0,
      load1: 0,
      requestsPerMinute: 0,
      crawlersPerMinute: 0,
    },
    visits: [],
  };
}

const ANIMATED_STATUSES = new Set(["live", "local"]);

export function shouldAdvanceAnimation(state) {
  return (
    !state.paused &&
    !state.help &&
    ANIMATED_STATUSES.has(state.status)
  );
}

export function createTerminalUpdate(
  previousLines,
  nextLines,
  width,
  force = false,
) {
  const safeWidth = Math.max(1, Math.floor(width) || 1);
  const lines = nextLines.map((line) => padLine(line, safeWidth));

  if (force || previousLines == null) {
    return {
      lines,
      output: `\u001b[H${lines.join("\n")}\u001b[0J`,
    };
  }

  let output = "";
  const rowCount = Math.max(previousLines.length, lines.length);
  const blank = " ".repeat(safeWidth);
  for (let row = 0; row < rowCount; row += 1) {
    const line = lines[row] ?? blank;
    if (line === previousLines[row]) continue;
    output += `\u001b[${row + 1};1H${line}\u001b[K`;
  }
  return { lines, output };
}

async function watchJson(options) {
  if (!options.endpoint) {
    const source = new TelemetrySource({
      site: options.site,
      logPaths: options.logs,
      logFormat: options.format,
      includePaths: options.includePaths,
      metricsUrl: options.metricsUrl,
      metricsToken: options.metricsToken,
      requestTimeoutMs: Math.max(500, options.interval - 150),
    });
    await source.initialize();
    do {
      process.stdout.write(`${JSON.stringify(await source.nextFrame())}\n`);
      if (options.once) return;
      await wait(options.interval, new AbortController().signal);
    } while (true);
  }

  const controller = new AbortController();
  let printed = false;
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    let retry = 500;
    while (!controller.signal.aborted) {
      try {
        await readSse(
          options.endpoint,
          options.token,
          (frame) => {
            process.stdout.write(`${JSON.stringify(frame)}\n`);
            printed = true;
            if (options.once) controller.abort();
          },
          controller.signal,
        );
        retry = 500;
      } catch (error) {
        if (controller.signal.aborted) break;
        if (options.once && !printed) throw error;
        await wait(retry, controller.signal);
        retry = Math.min(8_000, retry * 2);
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

async function watchTerminal(options) {
  const capabilities = resolveCapabilities(process.env);
  const state = {
    frame: emptyFrame(options.site),
    latest: null,
    status: options.endpoint ? "connecting" : "local",
    paused: false,
    focus: options.focus,
    help: false,
    tick: 0,
    color: options.color && process.stdout.isTTY,
    colorLevel: capabilities.colorLevel,
    ascii: options.ascii || !capabilities.unicode,
    traffic: emptyTrafficMix(),
  };
  const trafficWindow = createTrafficWindow();
  const countedVisits = new Set();
  // A visit can repeat across consecutive frames; tally each one once.
  const ingest = (frame) => {
    const fresh = (frame?.visits ?? []).filter(
      (visit) => !countedVisits.has(visit.id),
    );
    if (fresh.length === 0) return;
    for (const visit of fresh) countedVisits.add(visit.id);
    if (countedVisits.size > 4_000) countedVisits.clear();
    trafficWindow.record(fresh);
  };
  const controller = new AbortController();
  let sampleTimer = null;
  let renderTimer = null;
  let previousLines = null;
  let previousColumns = 0;
  let previousRows = 0;
  let restoreInput = () => {};
  let screenEntered = false;
  let stopped = false;
  let resolveStop;
  const stopSignal = new Promise((resolve) => {
    resolveStop = resolve;
  });

  const render = ({ advance = false, force = false } = {}) => {
    if (advance && shouldAdvanceAnimation(state)) state.tick += 1;
    if (!state.paused) state.traffic = trafficWindow.summary();

    const columns = process.stdout.columns || 92;
    const rows = process.stdout.rows || 36;
    const resized =
      columns !== previousColumns || rows !== previousRows;
    const nextLines = renderDashboard({
      ...state,
      columns,
      rows,
    });
    const update = createTerminalUpdate(
      previousLines,
      nextLines,
      columns,
      force || resized,
    );

    previousLines = update.lines;
    previousColumns = columns;
    previousRows = rows;
    if (update.output) process.stdout.write(update.output);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    if (sampleTimer) clearTimeout(sampleTimer);
    if (renderTimer) clearInterval(renderTimer);
    restoreInput();
    if (screenEntered) {
      process.stdout.write("\u001b[0m\u001b[?25h\u001b[?1049l");
    }
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    resolveStop();
  };

  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.setEncoding("utf8");
      process.stdin.resume();
      const onKey = (key) => {
        if (key === "q" || key === "\u0003") return stop();
        if (key === "f") state.focus = !state.focus;
        if (key === " " || key === "p") {
          state.paused = !state.paused;
          if (!state.paused && state.latest) state.frame = state.latest;
        }
        if (key === "h" || key === "?") state.help = !state.help;
        render();
      };
      process.stdin.on("data", onKey);
      restoreInput = () => {
        process.stdin.removeListener("data", onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
      };
    }

    process.stdout.write("\u001b[?1049h\u001b[2J\u001b[H\u001b[?25l");
    screenEntered = true;
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    render({ force: true });
    renderTimer = setInterval(
      () => render({ advance: true }),
      200,
    );

    if (options.endpoint) {
      void (async () => {
        let retry = 500;
        while (!controller.signal.aborted) {
          state.status = "connecting";
          try {
            await readSse(
              options.endpoint,
              options.token,
              (frame) => {
                state.latest = frame;
                ingest(frame);
                if (!state.paused) state.frame = frame;
                state.status = "live";
              },
              controller.signal,
            );
            retry = 500;
          } catch {
            if (controller.signal.aborted) return;
            state.status = "reconnecting";
            await wait(retry, controller.signal);
            retry = Math.min(8_000, retry * 2);
          }
        }
      })();
    } else {
      const source = new TelemetrySource({
        site: options.site,
        logPaths: options.logs,
        logFormat: options.format,
        includePaths: options.includePaths,
        metricsUrl: options.metricsUrl,
        metricsToken: options.metricsToken,
        requestTimeoutMs: Math.max(500, options.interval - 150),
      });
      await source.initialize();
      if (controller.signal.aborted) return;
      const sample = async () => {
        try {
          const frame = await source.nextFrame();
          state.latest = frame;
          ingest(frame);
          if (!state.paused) state.frame = frame;
          state.status = "local";
        } catch {
          state.status = "error";
        }
      };
      await sample();
      if (controller.signal.aborted) return;
      const scheduleSample = async () => {
        await sample();
        if (!controller.signal.aborted) {
          sampleTimer = setTimeout(
            () => void scheduleSample(),
            options.interval,
          );
        }
      };
      sampleTimer = setTimeout(
        () => void scheduleSample(),
        options.interval,
      );
    }

    if (controller.signal.aborted) return;
    render();
    await stopSignal;
  } finally {
    stop();
  }
}

export async function runWatch(options) {
  const jsonOutput = options.json || options.once || !process.stdout.isTTY;
  return jsonOutput ? watchJson(options) : watchTerminal(options);
}
