import {
  DEFAULT_SITE_NAME,
  sanitizeText,
} from "../lib/privacy.mjs";
import { splitLogPaths } from "../collector/tailer.mjs";

const DEFAULT_INTERVAL = 1_500;
const COMMANDS = new Set(["watch", "serve", "doctor", "help"]);
const VALUE_OPTIONS = new Set([
  "endpoint",
  "token",
  "log",
  "format",
  "site",
  "interval",
  "host",
  "port",
  "metrics-url",
  "metrics-token",
]);
const ALIASES = new Map([
  ["e", "endpoint"],
  ["t", "token"],
  ["l", "log"],
  ["h", "help"],
  ["v", "version"],
]);

export function parseArguments(argv, environment = process.env) {
  const options = {
    command: "watch",
    endpoint: environment.EMBERTOP_ENDPOINT || "",
    token: "",
    logs: splitLogPaths(environment.EMBERTOP_LOG_PATHS),
    format: environment.EMBERTOP_LOG_FORMAT || "auto",
    site: environment.EMBERTOP_SITE_NAME || DEFAULT_SITE_NAME,
    interval: Number.parseInt(
      environment.EMBERTOP_SAMPLE_INTERVAL_MS || `${DEFAULT_INTERVAL}`,
      10,
    ),
    host: environment.EMBERTOP_HOST || "127.0.0.1",
    port: Number.parseInt(environment.EMBERTOP_PORT || "4318", 10),
    metricsUrl: environment.EMBERTOP_METRICS_URL || "",
    metricsToken: environment.EMBERTOP_METRICS_TOKEN || "",
    includePaths: environment.EMBERTOP_INCLUDE_PATHS !== "false",
    color: !("NO_COLOR" in environment),
    focus: false,
    ascii: false,
    json: false,
    once: false,
    help: false,
    version: false,
  };

  let commandSet = false;
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("-")) {
      if (!commandSet) {
        options.command = raw;
        commandSet = true;
        continue;
      }
      throw new Error(`Unexpected argument: ${raw}`);
    }

    const normalized = raw.startsWith("--")
      ? raw.slice(2)
      : ALIASES.get(raw.slice(1));
    if (!normalized) throw new Error(`Unknown option: ${raw}`);
    const [name, inlineValue] = normalized.split(/=(.*)/s, 2);
    const optionName = ALIASES.get(name) || name;

    if (VALUE_OPTIONS.has(optionName)) {
      const value = inlineValue ?? argv[index + 1];
      if (value == null || (inlineValue == null && value.startsWith("-"))) {
        throw new Error(`Option --${optionName} requires a value`);
      }
      if (inlineValue == null) index += 1;
      if (optionName === "log") options.logs.push(value);
      else if (optionName === "metrics-url") options.metricsUrl = value;
      else if (optionName === "metrics-token") options.metricsToken = value;
      else if (optionName === "interval" || optionName === "port") {
        options[optionName] = Number.parseInt(value, 10);
      } else {
        options[optionName] = value;
      }
      continue;
    }

    if (optionName === "no-color") options.color = false;
    else if (optionName === "hide-paths") options.includePaths = false;
    else if (
      ["focus", "ascii", "json", "once", "help", "version"].includes(
        optionName,
      )
    ) {
      options[optionName] = true;
    } else {
      throw new Error(`Unknown option: ${raw}`);
    }
  }

  if (!COMMANDS.has(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }
  if (!options.token) {
    const collectorMode =
      options.command === "serve" ||
      (options.command === "doctor" && !options.endpoint);
    options.token = collectorMode
      ? environment.EMBERTOP_COLLECTOR_TOKEN || ""
      : environment.EMBERTOP_TOKEN || "";
  }
  if (!["auto", "nginx", "json"].includes(options.format)) {
    throw new Error("--format must be auto, nginx, or json");
  }
  if (!Number.isFinite(options.interval)) options.interval = DEFAULT_INTERVAL;
  options.interval = Math.min(30_000, Math.max(750, options.interval));
  options.site = sanitizeText(options.site, DEFAULT_SITE_NAME, 80);
  if (
    !Number.isInteger(options.port) ||
    options.port < 1 ||
    options.port > 65_535
  ) {
    throw new Error("--port must be between 1 and 65535");
  }
  return options;
}

export function usage(version) {
  return `EMBERTOP ${version}
Server activity, watched like a fire.

USAGE
  embertop [watch] [options]   Watch local or remote telemetry in the terminal
  embertop serve [options]     Expose local telemetry as an authenticated SSE stream
  embertop doctor [options]    Check logs, metrics, and remote connectivity

WATCH OPTIONS
  -e, --endpoint <url>         Read an Embertop SSE stream instead of local metrics
  -t, --token <token>          Bearer token (prefer EMBERTOP_TOKEN)
  -l, --log <path>             Tail an Nginx or JSON access log; repeatable
      --format <format>        auto, nginx, or json (default: auto)
      --site <name>            Label shown in the header (default: this-machine)
      --interval <ms>          Sampling interval, 750–30000 (default: 1500)
      --focus                  Start in distraction-free mode
      --ascii                  Use ASCII glyphs in the terminal UI
      --json                   Emit JSON Lines instead of the terminal UI
      --once                   Emit one frame and exit
      --no-color               Disable ANSI colors
      --hide-paths             Replace every request path with /…

SERVE OPTIONS
      --host <host>            Listen address (default: 127.0.0.1)
      --port <port>            Listen port (default: 4318)
      --metrics-url <url>      Existing CPU/memory/load JSON endpoint
      --metrics-token <token>  Token for the metrics endpoint

TERMINAL KEYS
  f  focus mode     space/p  pause     h  help     q  quit

EXAMPLES
  embertop
  embertop --log /var/log/nginx/access.log
  EMBERTOP_TOKEN=secret embertop -e https://host.example/stream
  embertop serve --log /var/log/nginx/access.log
`;
}
