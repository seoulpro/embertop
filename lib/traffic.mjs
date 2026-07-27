/**
 * Two independent readings of the same request stream:
 *
 *   source  — who is knocking (a visitor, a named crawler, or something that
 *             did not identify itself)
 *   outcome — what the server said back (served, refused, or broke)
 *
 * Keeping them apart is what makes the mix legible: a crawler collecting 404s
 * and a visitor collecting 404s are different stories, and a single blended
 * bar would hide both.
 */

const WINDOW_MS = 60_000;
const MAX_ENTRIES = 900;

export const SOURCE_KINDS = ["visitor", "crawler", "unknown"];
export const OUTCOME_KINDS = ["ok", "refused", "broken"];

export function classifyVisit(visit) {
  const status = Number(visit?.status) || 0;
  return {
    source:
      visit?.kind === "crawler"
        ? "crawler"
        : visit?.kind === "human"
          ? "visitor"
          : "unknown",
    outcome: status >= 500 ? "broken" : status >= 400 ? "refused" : "ok",
  };
}

export function emptyTrafficMix() {
  return {
    total: 0,
    sources: { visitor: 0, crawler: 0, unknown: 0 },
    outcomes: { ok: 0, refused: 0, broken: 0 },
  };
}

/**
 * A rolling one-minute tally of everything that has come past. Fed from the
 * visit stream rather than the collector so it also works against a custom
 * SSE source that only implements the documented schema.
 */
export function createTrafficWindow({ windowMs = WINDOW_MS } = {}) {
  let entries = [];

  const prune = (now) => {
    const cutoff = now - windowMs;
    let index = 0;
    while (index < entries.length && entries[index].at < cutoff) index += 1;
    if (index > 0) entries = entries.slice(index);
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(entries.length - MAX_ENTRIES);
    }
  };

  return {
    record(visits, now = Date.now()) {
      for (const visit of visits ?? []) {
        const at = Date.parse(visit?.at);
        entries.push({
          at: Number.isFinite(at) ? at : now,
          ...classifyVisit(visit),
        });
      }
      prune(now);
    },
    summary(now = Date.now()) {
      prune(now);
      const mix = emptyTrafficMix();
      for (const entry of entries) {
        mix.total += 1;
        mix.sources[entry.source] += 1;
        mix.outcomes[entry.outcome] += 1;
      }
      return mix;
    },
  };
}

/**
 * Turn counts into integer cell widths that add up to exactly `width`, so a
 * stacked bar never overflows its row or leaves a gap. Any class with at
 * least one request keeps at least one cell — a single 5xx in a quiet minute
 * should still be visible.
 */
export function distribute(counts, kinds, width) {
  const total = kinds.reduce((sum, kind) => sum + (counts[kind] || 0), 0);
  if (total <= 0 || width <= 0) return kinds.map(() => 0);

  const exact = kinds.map((kind) => ((counts[kind] || 0) / total) * width);
  const cells = exact.map((value, index) =>
    counts[kinds[index]] > 0 ? Math.max(1, Math.floor(value)) : 0,
  );

  let remainder = width - cells.reduce((sum, value) => sum + value, 0);
  // Hand out or claw back the rounding error, largest fractional part first.
  const order = kinds
    .map((kind, index) => ({ index, fraction: exact[index] % 1 }))
    .sort((a, b) => b.fraction - a.fraction);
  let cursor = 0;
  while (remainder > 0) {
    cells[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  while (remainder < 0) {
    const candidate = order[cursor % order.length].index;
    if (cells[candidate] > 1) {
      cells[candidate] -= 1;
      remainder += 1;
    }
    cursor += 1;
    if (cursor > order.length * width) break;
  }
  return cells;
}
