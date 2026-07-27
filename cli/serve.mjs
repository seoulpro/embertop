export async function runServe(options) {
  process.env.EMBERTOP_HOST = options.host;
  process.env.EMBERTOP_PORT = String(options.port);
  process.env.EMBERTOP_SITE_NAME = options.site;
  process.env.EMBERTOP_LOG_PATHS = options.logs.join(",");
  process.env.EMBERTOP_LOG_FORMAT = options.format;
  process.env.EMBERTOP_INCLUDE_PATHS = options.includePaths ? "true" : "false";
  process.env.EMBERTOP_SAMPLE_INTERVAL_MS = String(options.interval);
  process.env.EMBERTOP_METRICS_URL = options.metricsUrl;
  process.env.EMBERTOP_METRICS_TOKEN = options.metricsToken;
  if (options.token) process.env.EMBERTOP_COLLECTOR_TOKEN = options.token;
  await import("../collector/index.mjs");
}
