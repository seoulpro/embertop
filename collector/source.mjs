import {
  DEFAULT_SITE_NAME,
  sanitizeText,
} from "../lib/privacy.mjs";
import { createSystemSampler, fetchMetricOverrides } from "./system.mjs";
import { AccessLogTailer } from "./tailer.mjs";

export class TelemetrySource {
  #sequence = 0;
  #requestBuckets = [];

  /**
   * @param {{
   *   site?: string,
   *   logPaths?: string[],
   *   logFormat?: string,
   *   includePaths?: boolean,
   *   metricsUrl?: string,
   *   metricsToken?: string,
   *   requestTimeoutMs?: number,
   * }} [options]
   */
  constructor({
    site = DEFAULT_SITE_NAME,
    logPaths = [],
    logFormat = "auto",
    includePaths = true,
    metricsUrl = "",
    metricsToken = "",
    requestTimeoutMs = 1_000,
  } = {}) {
    this.site = sanitizeText(site, DEFAULT_SITE_NAME, 80);
    this.metricsUrl = metricsUrl;
    this.metricsToken = metricsToken;
    this.requestTimeoutMs = requestTimeoutMs;
    this.sampler = createSystemSampler();
    this.tailer = new AccessLogTailer({
      paths: logPaths,
      format: logFormat,
      includePaths,
    });
  }

  async initialize() {
    this.sampler.sample();
    const baselineDelay = new Promise((resolve) => setTimeout(resolve, 100));
    await this.tailer.initialize();
    await baselineDelay;
  }

  #rates() {
    const cutoff = Date.now() - 60_000;
    while (this.#requestBuckets[0]?.at < cutoff) {
      this.#requestBuckets.shift();
    }
    return {
      requestsPerMinute: this.#requestBuckets.reduce(
        (total, bucket) => total + bucket.requests,
        0,
      ),
      crawlersPerMinute: this.#requestBuckets.reduce(
        (total, bucket) => total + bucket.crawlers,
        0,
      ),
    };
  }

  #recordVisits(visits) {
    if (visits.length === 0) return;

    const now = Date.now();
    const bucketTime = now - (now % 1_000);
    let bucket = this.#requestBuckets.at(-1);
    if (!bucket || bucket.at !== bucketTime) {
      bucket = {
        at: bucketTime,
        requests: 0,
        crawlers: 0,
      };
      this.#requestBuckets.push(bucket);
    }

    bucket.requests += visits.length;
    bucket.crawlers += visits.filter(
      (visit) => visit.kind === "crawler",
    ).length;
  }

  async nextFrame() {
    const visits = await this.tailer.poll();
    this.#recordVisits(visits);

    const system = this.sampler.sample();
    const override = await fetchMetricOverrides({
      url: this.metricsUrl,
      token: this.metricsToken,
      timeoutMs: this.requestTimeoutMs,
    });
    this.#sequence += 1;

    return {
      schema: 1,
      sequence: this.#sequence,
      at: new Date().toISOString(),
      source: "live",
      site: this.site,
      metrics: {
        cpu: override?.cpu ?? system.cpu,
        memory: override?.memory ?? system.memory,
        load1: override?.load1 ?? system.load1,
        ...this.#rates(),
      },
      visits: visits.slice(-24),
    };
  }
}
