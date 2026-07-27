function clamp(value, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  return Math.min(maximum, Math.max(minimum, numeric));
}

const TRAFFIC_SATURATION = 120;

/**
 * @param {{ cpu?: number, memory?: number, requestsPerMinute?: number }} metrics
 * @returns {{ flame: number, embers: number, traffic: number, cpu: number, memory: number }}
 */
export function fireModel(metrics = {}) {
  const cpu = clamp(metrics.cpu, 0, 100) / 100;
  const memory = clamp(metrics.memory, 0, 100) / 100;
  const rpm = Math.max(0, Number(metrics.requestsPerMinute) || 0);
  const traffic = Math.min(1, rpm / TRAFFIC_SATURATION);

  const flame = clamp(0.14 + cpu * 0.7 + traffic * 0.16, 0, 1);
  const embers = clamp(0.18 + memory * 0.82, 0, 1);

  return { flame, embers, traffic, cpu, memory };
}
