import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { TelemetrySource } from "../collector/source.mjs";
import { fetchMetricOverrides } from "../collector/system.mjs";
import { validateEndpoint } from "./stream.mjs";
import { codes, paint } from "./terminal.mjs";

export async function runDoctor(options) {
  const checks = [];
  const add = (ok, label, detail) => checks.push({ ok, label, detail });
  const [major, minor] = process.versions.node.split(".").map(Number);
  add(
    major > 22 || (major === 22 && minor >= 13),
    "Node.js",
    process.versions.node,
  );

  for (const path of options.logs) {
    try {
      await access(path, fsConstants.R_OK);
      add(true, "Access log", path);
    } catch {
      add(false, "Access log", `${path} is not readable`);
    }
  }

  if (options.endpoint) {
    try {
      const url = validateEndpoint(options.endpoint);
      const headers = { Accept: "text/event-stream" };
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      const response = await fetch(url, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(3_000),
      });
      const contentType = response.headers.get("content-type") || "";
      add(
        response.ok && contentType.includes("text/event-stream"),
        "SSE endpoint",
        `${response.status} ${contentType || "unknown content type"}`,
      );
      await response.body?.cancel();
    } catch (error) {
      add(
        false,
        "SSE endpoint",
        error instanceof Error ? error.message : "unreachable",
      );
    }
  } else {
    if (options.metricsUrl) {
      const override = await fetchMetricOverrides({
        url: options.metricsUrl,
        token: options.metricsToken,
        timeoutMs: 3_000,
      });
      add(
        Boolean(override),
        "Metrics endpoint",
        override ? "reachable, valid JSON" : "unreachable or invalid response",
      );
    }

    const source = new TelemetrySource({
      site: options.site,
      logPaths: [],
    });
    await source.initialize();
    const frame = await source.nextFrame();
    add(
      Number.isFinite(frame.metrics.cpu),
      "Local metrics",
      `CPU ${frame.metrics.cpu}% · MEM ${frame.metrics.memory}% · LOAD ${frame.metrics.load1}`,
    );

    const publicBind = !["127.0.0.1", "::1", "localhost"].includes(
      options.host,
    );
    add(
      !publicBind || Boolean(options.token),
      "Collector security",
      publicBind
        ? options.token
          ? "token configured"
          : "a token is required for a public bind"
        : "localhost only",
    );
  }

  for (const check of checks) {
    const color = options.color && process.stdout.isTTY;
    const mark = check.ok
      ? paint(color, codes.cyan, "✓")
      : paint(color, codes.red, "✗");
    process.stdout.write(
      `${mark} ${check.label.padEnd(19)} ${paint(
        color,
        codes.dim,
        check.detail,
      )}\n`,
    );
  }
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}
