import { fireModel } from "../lib/fire.mjs";
import {
  distribute,
  emptyTrafficMix,
  OUTCOME_KINDS,
  SOURCE_KINDS,
} from "../lib/traffic.mjs";

export function resolveInterfaceLanguage(environment = process.env) {
  return (environment.EMBERTOP_LANG || "").toLowerCase().startsWith("ko")
    ? "ko"
    : "en";
}

const useKorean = resolveInterfaceLanguage() === "ko";
const ui = useKorean
  ? {
      helpTitle: "embertop",
      focus: "f        수치와 로그를 감춘 멍 모드",
      pause: "space p  화면의 움직임 일시정지",
      closeHelp: "h        도움말 닫기",
      quit: "q        조용히 종료",
      privacy: "IP와 쿼리 문자열은 표시되지 않습니다.",
      showInfo: "f 정보 보기   q 종료",
      cpu: "cpu",
      memory: "메모리",
      load: "load",
      requestsPerMinute: "req/분",
      crawlersPerMinute: "봇/분",
      visitors: { label: "방문자", short: "방문" },
      crawlers: { label: "크롤러", short: "크롤" },
      unidentified: { label: "신원 불명", short: "불명" },
      served: { label: "정상", short: "정상" },
      refused: { label: "거절 4xx", short: "4xx" },
      failed: { label: "오류 5xx", short: "5xx" },
      quiet: "지난 1분간 요청 없음",
      recent: "요청",
      redacted: "IP · 쿼리 제거됨",
      waiting: "다음 불씨를 기다리는 중",
      keys: "f 멍 모드   space 멈춤   h 도움말   q 종료",
      keysCompact: "f 멍   space 멈춤   h 도움   q 종료",
      tooSmall: "터미널을 44×18 이상으로 늘려주세요.",
      connecting: "불씨에 다가가는 중",
      reconnecting: "다시 연결하는 중",
      errored: "연결에 문제가 생겼어요",
      retrying: "잠시 뒤 다시 시도합니다",
      noFrame: "아직 받은 프레임이 없습니다",
      quitOnly: "q 종료",
      justNow: "방금",
      secondsAgo: (n) => `${n}초 전`,
      minutesAgo: (n) => `${n}분 전`,
      lastFrame: (ago) => `마지막 프레임 · ${ago}`,
    }
  : {
      helpTitle: "embertop",
      focus: "f        hide the readings",
      pause: "space p  pause the view",
      closeHelp: "h        close this help",
      quit: "q        quit quietly",
      privacy: "IP addresses and query strings are never displayed.",
      showInfo: "f readings   q quit",
      cpu: "cpu",
      memory: "memory",
      load: "load",
      requestsPerMinute: "req/min",
      crawlersPerMinute: "bots/min",
      visitors: { label: "visitors", short: "people" },
      crawlers: { label: "crawlers", short: "bots" },
      unidentified: { label: "unidentified", short: "unknown" },
      served: { label: "served", short: "ok" },
      refused: { label: "refused 4xx", short: "4xx" },
      failed: { label: "failed 5xx", short: "5xx" },
      quiet: "no requests in the last minute",
      recent: "requests",
      redacted: "ip and query hidden",
      waiting: "waiting for the next spark",
      keys: "f focus   space pause   h help   q quit",
      keysCompact: "f focus   space pause   h help   q quit",
      tooSmall: "Resize the terminal to at least 44×18.",
      connecting: "Reaching for the embers",
      reconnecting: "Reconnecting",
      errored: "The connection ran into a problem",
      retrying: "Retrying shortly",
      noFrame: "no frame received yet",
      quitOnly: "q quit",
      justNow: "just now",
      secondsAgo: (n) => `${n}s ago`,
      minutesAgo: (n) => `${n}m ago`,
      lastFrame: (ago) => `last frame · ${ago}`,
    };

const CLOCK_FORMATTER = new Intl.DateTimeFormat(
  useKorean ? "ko-KR" : "en-GB",
  {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  },
);
const ansiPattern = /\[[0-9;]*m/g;

export const codes = {
  reset: "[0m",
  dim: "[2m",
  bold: "[1m",
  amber: "[38;5;214m",
  gold: "[38;5;220m",
  cream: "[38;5;230m",
  copper: "[38;5;166m",
  red: "[38;5;203m",
  cyan: "[38;5;116m",
  violet: "[38;5;140m",
  gray: "[38;5;245m",
  faint: "[38;5;239m",
};

const basicCodes = {
  reset: "[0m",
  dim: "[2m",
  bold: "[1m",
  amber: "[33m",
  gold: "[93m",
  cream: "[97m",
  copper: "[31m",
  red: "[91m",
  cyan: "[36m",
  violet: "[35m",
  gray: "[37m",
  faint: "[90m",
};

const GLYPHS = {
  unicode: {
    heat: ["░", "▒", "▓", "█"],
    // Increasing block heights make a graded coal bed instead of noise.
    coals: ["▁", "▂", "▃", "▄"],
    sparkError: "✦",
    sparkAlt: "·",
    sparkHuman: "*",
    barFill: "█",
    barEmpty: "░",
    rule: "─",
    dot: "●",
    bullet: "•",
    logL: "╲",
    logR: "╱",
    logBody: "▄",
    separator: "·",
    ell: "…",
  },
  ascii: {
    heat: [".", ":", "+", "#"],
    coals: [".", ":", "+", "#"],
    sparkError: "x",
    sparkAlt: ".",
    sparkHuman: "*",
    barFill: "#",
    barEmpty: "-",
    rule: "-",
    dot: "*",
    bullet: "*",
    logL: "\\",
    logR: "/",
    logBody: "_",
    separator: "-",
    ell: "...",
  },
};

export function paint(enabled, code, text) {
  return enabled ? `${code}${text}${codes.reset}` : text;
}

export function resolveCapabilities(environment = process.env) {
  const term = environment.TERM || "";
  const colorTerm = (environment.COLORTERM || "").toLowerCase();
  const has256 =
    /256color|truecolor|24bit/i.test(term) ||
    colorTerm === "truecolor" ||
    colorTerm === "24bit" ||
    colorTerm === "yes";
  const locale =
    environment.LC_ALL || environment.LC_CTYPE || environment.LANG || "";
  const unicode = locale === "" ? true : /utf-?8/i.test(locale);
  return { colorLevel: has256 ? "256" : "basic", unicode };
}

export function cellWidth(text) {
  let width = 0;
  for (const character of text.replace(ansiPattern, "")) {
    const codePoint = character.codePointAt(0);
    width +=
      codePoint >= 0x1100 &&
      (codePoint <= 0x115f ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0x1f300 && codePoint <= 0x1faff))
        ? 2
        : 1;
  }
  return width;
}

export function padLine(text, width) {
  return `${text}${" ".repeat(Math.max(0, width - cellWidth(text)))}`;
}

function center(text, width) {
  const padding = Math.max(0, Math.floor((width - cellWidth(text)) / 2));
  return `${" ".repeat(padding)}${text}`;
}

function fit(text, maximum, ellipsis = "…") {
  const plain = String(text);
  const safeMaximum = Math.max(0, maximum);
  if (cellWidth(plain) <= safeMaximum) return plain;
  if (safeMaximum === 0) return "";
  let marker = ellipsis;
  while (cellWidth(marker) > safeMaximum) marker = marker.slice(0, -1);
  let output = "";
  for (const character of plain) {
    if (cellWidth(`${output}${character}${marker}`) > safeMaximum) break;
    output += character;
  }
  return `${output}${marker}`;
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function noise(seed) {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

function formatElapsed(at) {
  const elapsed = Math.max(0, Date.now() - Date.parse(at));
  if (!Number.isFinite(elapsed) || elapsed < 4_000) return ui.justNow;
  if (elapsed < 60_000) return ui.secondsAgo(Math.floor(elapsed / 1_000));
  return ui.minutesAgo(Math.floor(elapsed / 60_000));
}

function headerLines(frame, status, paused, width, theme) {
  const { color, pal, g } = theme;
  const statusText = paused ? "paused" : status.toLowerCase();
  const now = CLOCK_FORMATTER.format(new Date());
  const dotCode =
    status === "live"
      ? pal.amber
      : status === "error"
        ? pal.red
        : status === "reconnecting" || status === "connecting"
          ? pal.gold
          : pal.gray;
  const right = `${paint(color, dotCode, `${g.dot} ${statusText}`)}  ${paint(
    color,
    pal.dim,
    now,
  )}`;
  const brand = paint(color, pal.bold, "embertop");
  const siteWidth = Math.max(
    0,
    width - cellWidth(brand) - cellWidth(right) - 3,
  );
  const site = fit(frame.site || "local", siteWidth, g.ell);
  const left = site
    ? `${brand}  ${paint(color, pal.dim, site)}`
    : brand;
  return [
    `${left}${" ".repeat(
      Math.max(1, width - cellWidth(left) - cellWidth(right)),
    )}${right}`,
    paint(color, pal.faint, g.rule.repeat(width)),
  ];
}

/**
 * The hearth is three bands: sparks drifting off the tip, the flame column,
 * and two rows of hearth (crossed logs over a coal bed). The column is shaped
 * by a density falloff rather than raw noise, so it tapers instead of
 * dissolving into static.
 */
function renderFire(frame, width, height, tick, theme) {
  const { color, pal, g } = theme;
  const model = fireModel(frame.metrics);
  const lines = [];
  const visits = Array.isArray(frame.visits) ? frame.visits : [];

  const hearthRows = 2;
  const available = Math.max(3, height - hearthRows);
  const logHalf = Math.max(4, Math.min(Math.floor(width * 0.16), 13));
  const maxHalfWidth = Math.max(
    2,
    Math.min(logHalf - 1, 2 + Math.round(model.flame * (logHalf - 2))),
  );

  const sparkRows = Math.min(3, Math.max(1, available - 3));
  // Load decides most of the flame's height; the room it has decides the rest,
  // so "just the fire" genuinely gets a bigger fire. Everything above stays
  // dark, which is where the sparks drift.
  const bodyHeight = Math.max(
    2,
    Math.min(
      available - sparkRows,
      Math.round(available * (0.22 + model.flame * 0.55)),
    ),
  );
  for (
    let padding = available - sparkRows - bodyHeight;
    padding > 0;
    padding -= 1
  ) {
    lines.push("");
  }

  for (let row = 0; row < sparkRows; row += 1) {
    // Higher spark rows drift wider, as though the draught is spreading them.
    const spread = maxHalfWidth + 2 + (sparkRows - row) * 2;
    const cells = Array.from({ length: spread * 2 + 1 }, () => " ");
    let placed = false;
    for (let index = 0; index < visits.length; index += 1) {
      const visit = visits[index];
      const seed = hash(`${visit.id}:${row}`);
      if (seed % sparkRows !== row) continue;
      const glyph =
        visit.status >= 500
          ? g.sparkError
          : index % 2
            ? g.sparkAlt
            : g.sparkHuman;
      const code =
        visit.status >= 500
          ? pal.red
          : visit.kind === "crawler"
            ? pal.cyan
            : pal.gold;
      cells[seed % cells.length] = paint(color, code, glyph);
      placed = true;
    }
    lines.push(placed ? center(cells.join("").trimEnd(), width) : "");
  }

  for (let row = 0; row < bodyHeight; row += 1) {
    // 0 at the coals, 1 at the tip.
    const up = bodyHeight === 1 ? 0 : (bodyHeight - 1 - row) / (bodyHeight - 1);
    const halfWidth = Math.max(
      0,
      Math.round(maxHalfWidth * Math.pow(1 - up, 0.85)),
    );
    const sway = Math.sin(tick * 0.14 + up * 3.1) * up * 2.2;
    let flame = "";

    for (let column = -halfWidth - 1; column <= halfWidth + 1; column += 1) {
      const distance = Math.abs(column - sway) / (halfWidth + 0.85);
      const density =
        (1 - distance * distance) * (1 - up * 0.5) +
        noise(frame.sequence * 97 + tick * 13 + row * 31 + column * 17) * 0.3 -
        0.18;
      if (density <= 0.06) {
        flame += " ";
        continue;
      }
      // Hottest in the core near the coals, cooling outward and upward.
      const heat = density * (1.1 - up * 0.6) + model.flame * 0.22;
      const glyph =
        heat > 1.12
          ? g.heat[3]
          : heat > 0.82
            ? g.heat[2]
            : heat > 0.5
              ? g.heat[1]
              : g.heat[0];
      const code =
        heat > 1.12
          ? pal.cream
          : heat > 0.82
            ? pal.gold
            : heat > 0.5
              ? pal.amber
              : pal.copper;
      flame += paint(color, code, glyph);
    }
    lines.push(center(flame.trimEnd(), width));
  }

  // Crossed logs: dark wood with the middle lit by whatever is underneath.
  let stack = paint(color, pal.faint, g.logL);
  for (let index = 0; index < logHalf * 2; index += 1) {
    const middle = 1 - Math.abs(index - (logHalf * 2 - 1) / 2) / logHalf;
    const lit = middle > 0.55 && model.embers > 0.3;
    stack += paint(color, lit ? pal.copper : pal.faint, g.logBody);
  }
  stack += paint(color, pal.faint, g.logR);
  lines.push(center(stack, width));

  const bedHalf = Math.max(2, Math.round((logHalf - 1) * (0.5 + model.embers * 0.5)));
  let bed = "";
  for (let index = -bedHalf; index <= bedHalf; index += 1) {
    const middle = 1 - Math.abs(index) / (bedHalf + 0.6);
    const warmth =
      middle * model.embers +
      noise(frame.sequence * 41 + index * 67 + tick) * 0.28 -
      0.14;
    if (warmth <= 0.08) {
      bed += " ";
      continue;
    }
    const level = warmth > 0.62 ? 3 : warmth > 0.42 ? 2 : warmth > 0.22 ? 1 : 0;
    const code =
      level === 3
        ? pal.gold
        : level === 2
          ? pal.amber
          : level === 1
            ? pal.copper
            : pal.faint;
    bed += paint(color, code, g.coals[level]);
  }
  lines.push(center(bed.trimEnd(), width));
  return lines.slice(0, Math.max(0, height));
}

/**
 * One row of the traffic mix: a label and a stacked run of blocks whose
 * colours match the sparks in the fire, so the key is the same in both.
 */
/**
 * Two rows: the words, then the bar. Each word is printed in the colour and
 * order of the segment it names, so the band explains itself without a key
 * somewhere else on the screen. Classes with no traffic are not mentioned,
 * which makes one appearing the thing you notice.
 */
function band(counts, kinds, styles, width, theme) {
  const { color, pal, g } = theme;
  const total = kinds.reduce((sum, kind) => sum + (counts[kind] || 0), 0);
  if (total === 0) {
    return [
      paint(color, pal.faint, ui.quiet),
      paint(color, pal.faint, g.barEmpty.repeat(width)),
    ];
  }

  const present = kinds.filter((kind) => counts[kind] > 0);
  const share = (kind) => Math.round((counts[kind] / total) * 100);
  // Percentages first; drop them, then shorten, if the row will not fit.
  const layouts = [
    (kind) => `${styles[kind].label} ${share(kind)}%`,
    (kind) => styles[kind].label,
    (kind) => styles[kind].short,
  ];
  let words = "";
  for (const layout of layouts) {
    const plain = present.map(layout).join("   ");
    if (cellWidth(plain) <= width || layout === layouts[layouts.length - 1]) {
      words = present
        .map((kind) => paint(color, styles[kind].code, layout(kind)))
        .join("   ");
      break;
    }
  }

  const cells = distribute(counts, kinds, width);
  let track = "";
  for (let index = 0; index < kinds.length; index += 1) {
    if (cells[index] <= 0) continue;
    const style = styles[kinds[index]];
    // Texture as well as colour, so the band still reads under NO_COLOR.
    track += paint(color, style.code, style.glyph.repeat(cells[index]));
  }
  return [words, track];
}

function bar(value, width, theme, code) {
  const { color, pal, g } = theme;
  const bounded = Math.max(0, Math.min(100, Number(value) || 0));
  const filled = Math.round((bounded / 100) * width);
  return `${paint(color, code, g.barFill.repeat(filled))}${paint(
    color,
    pal.faint,
    g.barEmpty.repeat(width - filled),
  )}`;
}

function renderHelp(width, height, theme) {
  const { color, pal, g } = theme;
  const entries = [ui.focus, ui.pause, ui.closeHelp, ui.quit];
  const block = [
    paint(color, pal.bold, ui.helpTitle),
    "",
    ...entries,
    "",
    paint(color, pal.dim, ui.privacy),
  ].map((line) => fit(line, width, g.ell));

  // Centre the block as a whole so the key column stays aligned inside it.
  const blockWidth = Math.max(...block.map((line) => cellWidth(line)));
  const left = " ".repeat(Math.max(0, Math.floor((width - blockWidth) / 2)));
  const lines = block.map((line) => (line ? `${left}${line}` : ""));

  const top = Math.max(0, Math.floor((height - lines.length) / 2));
  const output = [...Array.from({ length: top }, () => ""), ...lines];
  while (output.length < height) output.push("");
  return output.slice(0, height);
}

function renderStatus(frame, width, height, theme, status) {
  const { color, pal, g } = theme;
  const lines = headerLines(frame, status, false, width, theme);
  const title =
    status === "connecting"
      ? ui.connecting
      : status === "error"
        ? ui.errored
        : ui.reconnecting;
  const embers = `${g.heat[0]}  ${g.heat[1]}  ${g.sparkAlt}  ${g.heat[1]}  ${g.heat[0]}`;
  const last =
    frame.sequence > 0 ? ui.lastFrame(formatElapsed(frame.at)) : ui.noFrame;
  const block = [
    center(paint(color, pal.copper, embers), width),
    "",
    center(paint(color, pal.gray, title), width),
    center(paint(color, pal.dim, ui.retrying), width),
    "",
    center(paint(color, pal.faint, last), width),
  ];
  const remaining = Math.max(0, height - lines.length - block.length - 1);
  const top = Math.floor(remaining / 2);
  for (let index = 0; index < top; index += 1) lines.push("");
  lines.push(...block);
  while (lines.length < height - 1) lines.push("");
  lines.push(paint(color, pal.faint, ui.quitOnly));
  return lines;
}

export function renderDashboard(state) {
  const {
    frame,
    status = "live",
    paused = false,
    focus = false,
    help = false,
    tick = 0,
    traffic = emptyTrafficMix(),
    color = false,
    ascii = false,
    colorLevel = "256",
  } = state;
  const theme = {
    color,
    pal: colorLevel === "basic" ? basicCodes : codes,
    g: ascii ? GLYPHS.ascii : GLYPHS.unicode,
  };
  const { pal, g } = theme;

  const requestedWidth = Number(state.columns);
  const requestedHeight = Number(state.rows);
  const terminalWidth = Number.isFinite(requestedWidth)
    ? Math.max(1, Math.floor(requestedWidth))
    : process.stdout.columns || 92;
  const terminalHeight = Number.isFinite(requestedHeight)
    ? Math.max(1, Math.floor(requestedHeight))
    : process.stdout.rows || 36;
  const width = Math.min(terminalWidth, 150);
  const height = Math.min(terminalHeight, 70);
  if (terminalWidth < 44 || terminalHeight < 18) {
    const message = [
      paint(color, pal.bold, "EMBERTOP"),
      "",
      center(fit(ui.tooSmall, width, g.ell), width),
      center(
        fit(`${terminalWidth}x${terminalHeight} -> 44x18`, width, g.ell),
        width,
      ),
    ];
    return message.slice(0, height);
  }
  if (help) return renderHelp(width, height, theme);
  if (
    status === "connecting" ||
    status === "reconnecting" ||
    status === "error"
  ) {
    return renderStatus(frame, width, height, theme, status);
  }

  const metrics = frame.metrics;
  const lines = headerLines(frame, status, paused, width, theme);

  if (focus) {
    lines.push(...renderFire(frame, width, height - 3, tick, theme));
    lines.push("");
    lines.push(
      center(paint(color, pal.faint, fit(ui.showInfo, width, g.ell)), width),
    );
    return lines;
  }

  const compact = height < 22;
  const metricRows = width >= 76 ? 1 : 2;
  // The fire needs five rows before it stops looking like a fire. Give back
  // spacing, then log lines, then the bands, rather than letting the layout
  // spill past the bottom of the terminal.
  const MIN_FIRE = 5;
  const fixedRows = metricRows + 5;
  let visitRows = height >= 32 ? 4 : height >= 22 ? 2 : 1;
  let bandSpacers = 1;
  let showBands = true;
  let fireHeight =
    height - lines.length - fixedRows - visitRows - bandSpacers - 4;

  if (fireHeight < MIN_FIRE) {
    fireHeight += bandSpacers;
    bandSpacers = 0;
  }
  if (fireHeight < MIN_FIRE && visitRows > 1) {
    fireHeight += visitRows - 1;
    visitRows = 1;
  }
  if (fireHeight < MIN_FIRE) {
    fireHeight += 4;
    showBands = false;
  }

  lines.push(...renderFire(frame, width, Math.max(MIN_FIRE, fireHeight), tick, theme));
  lines.push("");

  // Readings: label, figure, bar — aligned so the two gauges read as a pair.
  const labelWidth =
    Math.max(cellWidth(ui.cpu), cellWidth(ui.memory)) + 2;
  const gauge = (label, value, barWidth, code) =>
    `${padLine(label, labelWidth)}${String(Math.round(value)).padStart(
      3,
    )}%  ${bar(value, barWidth, theme, code)}`;

  if (width >= 76) {
    const barWidth = Math.max(
      4,
      Math.floor((width - (labelWidth + 7) * 2 - 4) / 2),
    );
    const cpu = gauge(ui.cpu, metrics.cpu, barWidth, pal.amber);
    const memory = gauge(ui.memory, metrics.memory, barWidth, pal.copper);
    lines.push(
      `${cpu}${" ".repeat(
        Math.max(2, width - cellWidth(cpu) - cellWidth(memory)),
      )}${memory}`,
    );
  } else {
    const barWidth = Math.max(6, width - labelWidth - 7);
    lines.push(gauge(ui.cpu, metrics.cpu, barWidth, pal.amber));
    lines.push(gauge(ui.memory, metrics.memory, barWidth, pal.copper));
  }

  const gap = `   ${g.separator}   `;
  const summary = [
    `${metrics.requestsPerMinute || 0} ${ui.requestsPerMinute}`,
    `${ui.load} ${Number(metrics.load1 || 0).toFixed(2)}`,
  ].join(gap);
  lines.push(paint(color, pal.dim, fit(summary, width, g.ell)));

  // Who is knocking, and what the server said back.
  if (showBands && traffic.total === 0) {
    const bandWidth = Math.max(8, Math.min(width, 52));
    lines.push(paint(color, pal.faint, fit(ui.quiet, width, g.ell)));
    lines.push(paint(color, pal.faint, g.barEmpty.repeat(bandWidth)));
    // Hold the rows the two bands would have taken so the fire keeps its size.
    lines.push("");
    lines.push("");
    if (bandSpacers) lines.push("");
  } else if (showBands) {
    const bandWidth = Math.max(8, Math.min(width, 52));
    lines.push(
      ...band(
        traffic.sources,
        SOURCE_KINDS,
        {
          visitor: { ...ui.visitors, code: pal.amber, glyph: g.heat[3] },
          crawler: { ...ui.crawlers, code: pal.cyan, glyph: g.heat[1] },
          unknown: { ...ui.unidentified, code: pal.violet, glyph: g.heat[2] },
        },
        bandWidth,
        theme,
      ),
    );
    if (bandSpacers) lines.push("");
    lines.push(
      // A healthy minute is almost all light texture; trouble adds weight.
      ...band(
        traffic.outcomes,
        OUTCOME_KINDS,
        {
          ok: { ...ui.served, code: pal.faint, glyph: g.heat[0] },
          refused: { ...ui.refused, code: pal.gold, glyph: g.heat[2] },
          broken: { ...ui.failed, code: pal.red, glyph: g.heat[3] },
        },
        bandWidth,
        theme,
      ),
    );
  }
  lines.push("");
  const recent = paint(color, pal.gray, ui.recent);
  const redacted = paint(color, pal.faint, ui.redacted);
  const heading = `${recent}${" ".repeat(
    Math.max(1, width - cellWidth(recent) - cellWidth(redacted)),
  )}${redacted}`;
  lines.push(
    cellWidth(heading) <= width ? heading : paint(color, pal.gray, ui.recent),
  );

  const visits = Array.isArray(frame.visits)
    ? frame.visits.slice(-visitRows)
    : [];
  if (visits.length === 0) {
    lines.push(paint(color, pal.faint, fit(ui.waiting, width, g.ell)));
  } else {
    // Fixed-width trailing columns so status, timing, and age line up; the
    // path takes whatever is left and is dropped column by column as the
    // terminal narrows.
    const showAgent = width >= 88;
    const showDuration = width >= 68;
    const agentWidth = showAgent ? 12 : 0;
    for (const visit of visits.reverse()) {
      const emberCode =
        visit.status >= 500
          ? pal.red
          : visit.status >= 400
            ? pal.gold
            : visit.kind === "crawler"
              ? pal.cyan
              : visit.kind === "human"
                ? pal.amber
                : pal.violet;
      const method = padLine(fit(String(visit.method || "GET"), 5, g.ell), 5);
      const prefix = `${paint(color, emberCode, g.bullet)} ${method} `;

      let suffix = `  ${String(visit.status || 0).padStart(3)}`;
      if (showDuration) {
        const duration =
          visit.durationMs == null ? "" : `${Math.round(visit.durationMs)}ms`;
        suffix += `  ${duration.padStart(7)}`;
      }
      if (showAgent) {
        suffix += `  ${padLine(
          fit(visit.agent || "Unknown", agentWidth, g.ell),
          agentWidth,
        )}`;
      }
      const plainSuffix = suffix;
      const pathWidth = Math.max(
        1,
        width - cellWidth(prefix) - cellWidth(plainSuffix),
      );
      lines.push(
        `${prefix}${padLine(
          fit(visit.path || "/", pathWidth, g.ell),
          pathWidth,
        )}${paint(color, pal.faint, plainSuffix)}`,
      );
    }
  }
  while (lines.length < height - 1) lines.push("");
  lines.push(
    paint(
      color,
      pal.faint,
      fit(compact ? ui.keysCompact : ui.keys, width, g.ell),
    ),
  );
  return lines;
}
