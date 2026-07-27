"use client";

import { useEffect, useRef } from "react";
import { fireModel } from "@/lib/fire.mjs";
import type { TelemetryMetrics, VisitEvent } from "@/lib/telemetry";

/**
 * Every dimension in the hearth derives from one number — the width of the
 * coal bed — so the fire stays in proportion whether it is filling a display
 * or tucked into a phone. This is the bed width the composition is drawn at.
 */
const REFERENCE_SPREAD = 178;
const HEARTH_Y = 0.79;
const MAX_FLAMES = 320;
const MAX_SPARKS = 220;
const MAX_SMOKE = 54;

const HUE_HUMAN = 34;
const HUE_CRAWLER = 191;
// Ashy violet rather than a saturated magenta: foreign, but still a coal.
const HUE_UNKNOWN = 268;
const SATURATION_UNKNOWN = 46;
const HUE_ERROR = 6;

interface Flame {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  seed: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  saturation: number;
}

interface Smoke {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  spin: number;
}

interface Log {
  offset: number;
  lift: number;
  length: number;
  radius: number;
  angle: number;
  tone: number;
  grain: number[];
}

interface Coal {
  offset: number;
  depth: number;
  phase: number;
  speed: number;
  scale: number;
}

/** Small deterministic PRNG so the hearth keeps its shape across resizes. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Radial blobs are the hot path: one gradient per particle per frame stalls on
 * low-power displays, so blobs are baked once per colour and blitted after.
 */
function createSpriteCache() {
  const cache = new Map<string, HTMLCanvasElement>();
  return (hue: number, lightness: number, saturation = 100) => {
    const roundedHue = Math.round(hue / 5) * 5;
    const roundedLightness = Math.round(lightness / 6) * 6;
    const key = `${roundedHue}:${roundedLightness}:${saturation}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const size = 64;
    const sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    const spriteContext = sprite.getContext("2d");
    if (spriteContext) {
      const gradient = spriteContext.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      gradient.addColorStop(
        0,
        `hsla(${roundedHue}, ${saturation}%, ${roundedLightness}%, 1)`,
      );
      gradient.addColorStop(
        0.34,
        `hsla(${roundedHue}, ${saturation}%, ${Math.max(
          28,
          roundedLightness - 20,
        )}%, 0.5)`,
      );
      gradient.addColorStop(1, `hsla(${roundedHue}, ${saturation}%, 38%, 0)`);
      spriteContext.fillStyle = gradient;
      spriteContext.fillRect(0, 0, size, size);
    }
    cache.set(key, sprite);
    return sprite;
  };
}

export function FireCanvas({
  metrics,
  visits,
  paused,
  reducedMotion,
  layout,
}: {
  metrics: TelemetryMetrics;
  visits: VisitEvent[];
  paused: boolean;
  reducedMotion: boolean;
  /** Changes when the stylesheet may have moved the hearth. */
  layout?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const metricsRef = useRef(metrics);
  const pausedRef = useRef(paused);
  const sparkQueueRef = useRef<VisitEvent[]>([]);
  const remeasureRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (visits.length > 0) {
      sparkQueueRef.current = [
        ...sparkQueueRef.current,
        ...visits.slice(-8),
      ].slice(-32);
    }
  }, [visits]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const spriteFor = createSpriteCache();
    const flames: Flame[] = [];
    const sparks: Spark[] = [];
    const smoke: Smoke[] = [];

    let width = 0;
    let height = 0;
    let scale = 1;
    let hearthX = 0;
    let hearthY = 0;
    let bedSpread = 0;
    let animationFrame = 0;
    let staticTimer: number | null = null;
    let previousTime = performance.now();
    let flameRemainder = 0;
    let smokeRemainder = 0;
    let pausedFrameDrawn = false;
    let staticSignature = "";

    const random = createRandom(0x10ca21);

    const coals: Coal[] = Array.from({ length: 26 }, () => ({
      offset: (random() - 0.5) * 1.9,
      depth: random(),
      phase: random() * Math.PI * 2,
      speed: 0.5 + random() * 1.1,
      scale: 0.55 + random() * 0.85,
    }));

    // Three logs leaning into each other, back to front.
    const logs: Log[] = [
      {
        offset: -0.06,
        lift: -0.055,
        length: 1.02,
        radius: 0.1,
        angle: -0.13,
        tone: 0.82,
        grain: [0.24, 0.5, 0.71],
      },
      {
        offset: 0.09,
        lift: 0.01,
        length: 0.94,
        radius: 0.112,
        angle: 0.16,
        tone: 1,
        grain: [0.3, 0.58],
      },
      {
        offset: -0.13,
        lift: 0.07,
        length: 0.8,
        radius: 0.088,
        angle: -0.05,
        tone: 0.9,
        grain: [0.36, 0.66],
      },
    ];

    const resize = () => {
      // clientWidth/clientHeight ignore CSS transforms, so a scaled stage does
      // not inflate the backing store or shift the drawing origin.
      const nextWidth = Math.max(1, canvas.clientWidth);
      const nextHeight = Math.max(1, canvas.clientHeight);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      // The stylesheet owns where the hearth sits, so breakpoints can move the
      // fire out from under whichever panels are on screen.
      const styles = getComputedStyle(canvas);
      const declaredY = Number.parseFloat(styles.getPropertyValue("--hearth-y"));
      const declaredX = Number.parseFloat(styles.getPropertyValue("--hearth-x"));
      const hearthRatioY = Number.isFinite(declaredY) ? declaredY : HEARTH_Y;
      const hearthRatioX = Number.isFinite(declaredX) ? declaredX : 0.5;

      // Keep particles in flight anchored to the hearth when the stage resizes.
      const previousX = hearthX;
      const previousY = hearthY;
      const previousScale = scale || 1;

      width = nextWidth;
      height = nextHeight;
      hearthX = width * hearthRatioX;
      hearthY = height * hearthRatioY;
      // Whichever axis is tightest decides how big the fire can be; everything
      // else is expressed as a multiple of that.
      bedSpread = Math.max(48, Math.min(width * 0.3, height * 0.27, 190));
      scale = bedSpread / REFERENCE_SPREAD;

      const ratio = scale / previousScale;
      for (const particle of [...flames, ...sparks, ...smoke]) {
        particle.x = hearthX + (particle.x - previousX) * ratio;
        particle.y = hearthY + (particle.y - previousY) * ratio;
        particle.size *= ratio;
      }

      canvas.width = Math.round(nextWidth * pixelRatio);
      canvas.height = Math.round(nextHeight * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      pausedFrameDrawn = false;
      staticSignature = "";
    };

    // The canvas never changes size when panels hide, so a layout change has
    // to ask for the hearth position to be read again.
    remeasureRef.current = resize;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const spawnFlame = (model: ReturnType<typeof fireModel>) => {
      if (flames.length >= MAX_FLAMES) return;
      const spread = bedSpread * 0.44;
      const life = 0.7 + Math.random() * (0.5 + model.flame * 0.55);
      flames.push({
        x: hearthX + (Math.random() - 0.5) * spread,
        y: hearthY - Math.random() * 10 * scale,
        vx: (Math.random() - 0.5) * 22 * scale,
        vy: -(95 + Math.random() * 75 + model.flame * 140) * scale,
        life,
        maxLife: life,
        size: (15 + Math.random() * 21 + model.flame * 13) * scale,
        seed: Math.random() * Math.PI * 2,
      });
    };

    const spawnSmoke = (model: ReturnType<typeof fireModel>) => {
      if (smoke.length >= MAX_SMOKE) return;
      const life = 1.5 + Math.random() * 1.5;
      smoke.push({
        x: hearthX + (Math.random() - 0.5) * bedSpread * 0.5,
        y: hearthY - (110 + model.flame * 150) * scale,
        vx: (Math.random() - 0.5) * 20 * scale,
        vy: -(30 + Math.random() * 26 + model.flame * 28) * scale,
        life,
        maxLife: life,
        size: (26 + Math.random() * 30) * scale,
        spin: (Math.random() - 0.5) * 0.5,
      });
    };

    const spawnVisitSparks = () => {
      const queue = sparkQueueRef.current.splice(0);
      for (const visit of queue) {
        const broken = visit.status >= 500;
        // 4xx never became a page. It leaves the coals and dies at knee
        // height instead of riding the column up.
        const refused = !broken && visit.status >= 400;
        const hue = broken
          ? HUE_ERROR
          : visit.kind === "crawler"
            ? HUE_CRAWLER
            : visit.kind === "human"
              ? HUE_HUMAN
              : HUE_UNKNOWN;
        const saturation =
          !broken && visit.kind !== "crawler" && visit.kind !== "human"
            ? SATURATION_UNKNOWN
            : 100;
        const count = broken ? 14 : refused ? 5 : 8;
        for (let index = 0; index < count; index += 1) {
          if (sparks.length >= MAX_SPARKS) break;
          const life = refused
            ? 0.32 + Math.random() * 0.3
            : 0.9 + Math.random() * 1.1;
          sparks.push({
            x: hearthX + (Math.random() - 0.5) * bedSpread * 0.4,
            y: hearthY - Math.random() * 24 * scale,
            vx: (Math.random() - 0.5) * (refused ? 76 : 54) * scale,
            vy:
              -(refused ? 46 + Math.random() * 40 : 135 + Math.random() * 145) *
              scale,
            life,
            maxLife: life,
            size: (1.3 + Math.random() * 2.2) * scale,
            hue,
            saturation,
          });
        }
      }
    };

    /** Warm light the fire throws into the room, plus its pool on the floor. */
    const drawRoomLight = (model: ReturnType<typeof fireModel>, flicker: number) => {
      const breath = 0.94 + Math.sin(flicker * 1.7) * 0.04 + Math.sin(flicker * 4.3) * 0.02;
      const reach = Math.max(width * 0.62, height * 0.78);

      context.save();
      context.globalCompositeOperation = "lighter";

      const ambient = context.createRadialGradient(
        hearthX,
        hearthY - height * 0.1,
        0,
        hearthX,
        hearthY - height * 0.1,
        reach,
      );
      const strength = (0.05 + model.flame * 0.1 + model.embers * 0.035) * breath;
      ambient.addColorStop(0, `rgba(255, 122, 52, ${strength})`);
      ambient.addColorStop(0.3, `rgba(196, 66, 26, ${strength * 0.3})`);
      ambient.addColorStop(1, "rgba(48, 16, 10, 0)");
      context.fillStyle = ambient;
      context.fillRect(0, 0, width, height);

      // Light spilling forward across the ground, flattened into perspective.
      // The gradient is squashed with the path so it fades out exactly at the
      // ellipse instead of being cut off part-way through.
      const floorRadius = bedSpread * 3.4;
      context.save();
      context.translate(hearthX, hearthY + bedSpread * 0.16);
      context.scale(1, 0.3);
      const floor = context.createRadialGradient(0, 0, 0, 0, 0, floorRadius);
      const floorStrength = (0.05 + model.embers * 0.07 + model.flame * 0.035) * breath;
      floor.addColorStop(0, `rgba(255, 116, 48, ${floorStrength})`);
      floor.addColorStop(0.38, `rgba(178, 56, 22, ${floorStrength * 0.34})`);
      floor.addColorStop(1, "rgba(90, 26, 14, 0)");
      context.fillStyle = floor;
      context.beginPath();
      context.arc(0, 0, floorRadius, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.restore();
    };

    const drawEmberBed = (model: ReturnType<typeof fireModel>, flicker: number) => {
      context.save();
      context.globalCompositeOperation = "lighter";

      const liveCoals = Math.round(8 + model.embers * (coals.length - 8));
      for (let index = 0; index < liveCoals; index += 1) {
        const coal = coals[index];
        const cx = hearthX + coal.offset * bedSpread * 0.78;
        // The bed spills forward of the stack so the coals stay visible
        // instead of being buried under the logs.
        const cy = hearthY + (0.1 + coal.depth * 0.22) * bedSpread;
        const breath = 0.5 + 0.5 * Math.sin(flicker * coal.speed + coal.phase);
        const radius = (0.04 + model.embers * 0.062) * bedSpread * coal.scale;
        const alpha = (0.2 + model.embers * 0.46) * (0.45 + breath * 0.55);
        const lightness = 52 + breath * 22 + model.embers * 10;
        context.globalAlpha = alpha;
        context.drawImage(
          spriteFor(19 + model.embers * 9, lightness),
          cx - radius * 1.5,
          cy - radius * 0.95,
          radius * 3,
          radius * 1.9,
        );
      }
      context.globalAlpha = 1;
      context.restore();
    };

    /**
     * A split log: dark charred crown, glowing underside where it meets the
     * coals, visible end grain, and burn cracks that open up as it heats.
     */
    const drawLog = (log: Log, model: ReturnType<typeof fireModel>) => {
      const length = log.length * bedSpread * 1.5;
      const radius = log.radius * bedSpread;
      const x = hearthX + log.offset * bedSpread;
      const y = hearthY + log.lift * bedSpread + radius * 0.35;

      context.save();
      context.translate(x, y);
      context.rotate(log.angle);

      const half = length / 2;
      const body = context.createLinearGradient(0, -radius, 0, radius);
      body.addColorStop(0, `rgba(${58 * log.tone}, ${43 * log.tone}, ${35 * log.tone}, 1)`);
      body.addColorStop(0.34, `rgba(${38 * log.tone}, ${26 * log.tone}, ${21 * log.tone}, 1)`);
      body.addColorStop(0.74, `rgba(${30 * log.tone}, ${18 * log.tone}, ${14 * log.tone}, 1)`);
      body.addColorStop(1, `rgba(${86 * log.tone}, ${34 * log.tone}, ${14 * log.tone}, 1)`);

      context.beginPath();
      context.roundRect(-half, -radius, length, radius * 2, radius * 0.9);
      context.fillStyle = body;
      context.fill();

      // Bark grain running the length of the log.
      context.save();
      context.clip();
      context.lineWidth = Math.max(1, radius * 0.09);
      for (const grain of log.grain) {
        const gy = -radius + radius * 2 * grain;
        context.strokeStyle = `rgba(12, 7, 5, ${0.4 - grain * 0.12})`;
        context.beginPath();
        context.moveTo(-half * 0.94, gy);
        context.bezierCurveTo(
          -half * 0.3,
          gy - radius * 0.16,
          half * 0.3,
          gy + radius * 0.16,
          half * 0.94,
          gy,
        );
        context.stroke();
      }

      // Burn cracks glowing along the hot underside.
      const crackGlow = 0.25 + model.flame * 0.6;
      context.lineWidth = Math.max(1, radius * 0.11);
      context.strokeStyle = `rgba(255, 132, 48, ${crackGlow * 0.55})`;
      for (let index = 0; index < 4; index += 1) {
        const cx = -half * 0.6 + (length * 0.3 * index) / 3;
        context.beginPath();
        context.moveTo(cx, radius * 0.42);
        context.lineTo(cx + radius * 0.34, radius * 0.9);
        context.stroke();
      }
      context.restore();

      // Rim of firelight caught along the lower edge only.
      context.save();
      context.beginPath();
      context.rect(-half, radius * 0.1, length, radius);
      context.clip();
      context.beginPath();
      context.roundRect(-half, -radius, length, radius * 2, radius * 0.9);
      context.strokeStyle = `rgba(255, 132, 58, ${0.1 + model.embers * 0.14})`;
      context.lineWidth = Math.max(1, radius * 0.1);
      context.stroke();
      context.restore();

      // End grain: concentric rings on the cut face.
      for (const end of [-1, 1]) {
        const ex = end * half;
        context.save();
        context.translate(ex, 0);
        const face = context.createLinearGradient(0, -radius, 0, radius);
        face.addColorStop(0, `rgba(${74 * log.tone}, ${56 * log.tone}, ${44 * log.tone}, 1)`);
        face.addColorStop(1, `rgba(${44 * log.tone}, ${28 * log.tone}, ${20 * log.tone}, 1)`);
        context.fillStyle = face;
        context.beginPath();
        context.ellipse(0, 0, radius * 0.3, radius * 0.96, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(16, 10, 7, 0.45)";
        context.lineWidth = Math.max(0.6, radius * 0.05);
        for (const ring of [0.66, 0.36]) {
          context.beginPath();
          context.ellipse(0, 0, radius * 0.3 * ring, radius * 0.96 * ring, 0, 0, Math.PI * 2);
          context.stroke();
        }
        context.restore();
      }

      context.restore();
    };

    const drawSmoke = (flicker: number) => {
      context.save();
      context.globalCompositeOperation = "lighter";
      for (const puff of smoke) {
        const progress = Math.max(0, puff.life / puff.maxLife);
        const age = 1 - progress;
        const radius = puff.size * (0.6 + age * 2.4);
        const alpha = Math.min(1, age * 3) * progress * 0.045;
        context.globalAlpha = alpha;
        context.drawImage(
          // Nearly desaturated: smoke should catch firelight, not glow itself.
          spriteFor(24, 30, 14),
          puff.x - radius + Math.sin(flicker * 0.6 + puff.spin) * radius * 0.12,
          puff.y - radius,
          radius * 2,
          radius * 2.1,
        );
      }
      context.globalAlpha = 1;
      context.restore();
    };

    /**
     * Flame colour is driven by height above the hearth, not by particle age:
     * white-yellow where it leaves the coals, deep orange as it lets go.
     */
    const drawFlames = (model: ReturnType<typeof fireModel>) => {
      const span = Math.max(1, (135 + model.flame * 130) * scale);
      context.save();
      context.globalCompositeOperation = "lighter";

      for (const flame of flames) {
        const progress = Math.max(0, flame.life / flame.maxLife);
        const rise = Math.min(1, Math.max(0, (hearthY - flame.y) / span));
        const hue = 46 - rise * 30;
        const lightness = 80 - rise * 38;
        const radius = flame.size * (0.5 + progress * 0.5) * (1 - rise * 0.22);
        const alpha =
          Math.min(1, (1 - progress) * 4) * Math.pow(progress, 0.72) * (1 - rise * 0.4) * 0.85;
        if (alpha <= 0.004) continue;
        context.globalAlpha = alpha;
        context.drawImage(
          spriteFor(hue, lightness),
          flame.x - radius * 0.78,
          flame.y - radius * 1.25,
          radius * 1.56,
          radius * 2.5,
        );
      }

      // White-hot core sitting in the coals.
      const coreRadius = (30 + model.flame * 46) * scale;
      context.globalAlpha = 0.3 + model.flame * 0.34;
      context.drawImage(
        spriteFor(42, 86),
        hearthX - coreRadius,
        hearthY - coreRadius * 1.5,
        coreRadius * 2,
        coreRadius * 2.4,
      );

      context.globalAlpha = 1;
      context.restore();
    };

    const drawSparks = () => {
      context.save();
      context.globalCompositeOperation = "lighter";
      for (const spark of sparks) {
        const progress = Math.max(0, spark.life / spark.maxLife);
        const twinkle = 0.55 + 0.45 * Math.sin(spark.life * 19 + spark.x);
        const alpha = Math.min(1, (1 - progress) * 6) * Math.pow(progress, 1.35) * twinkle;
        if (alpha <= 0.004) continue;
        const radius = spark.size * (0.7 + progress * 0.5);
        context.globalAlpha = alpha;
        context.drawImage(
          spriteFor(spark.hue, 74, spark.saturation),
          spark.x - radius * 2.4,
          spark.y - radius * 2.4,
          radius * 4.8,
          radius * 4.8,
        );
      }
      context.globalAlpha = 1;
      context.restore();
    };

    const advance = (delta: number, model: ReturnType<typeof fireModel>, now: number) => {
      flameRemainder += (46 + model.flame * 72 + model.traffic * 26) * delta;
      while (flameRemainder >= 1) {
        spawnFlame(model);
        flameRemainder -= 1;
      }

      smokeRemainder += (3.4 + model.flame * 5) * delta;
      while (smokeRemainder >= 1) {
        spawnSmoke(model);
        smokeRemainder -= 1;
      }

      spawnVisitSparks();

      for (let index = flames.length - 1; index >= 0; index -= 1) {
        const flame = flames[index];
        flame.life -= delta;
        if (flame.life <= 0) {
          flames.splice(index, 1);
          continue;
        }
        flame.x += flame.vx * delta;
        flame.y += flame.vy * delta;
        // Draw the column back toward its axis so the fire necks in as it rises.
        flame.vx += (hearthX - flame.x) * 2.6 * delta;
        flame.vx += Math.sin(now * 0.0021 + flame.seed + flame.y * 0.014) * 38 * scale * delta;
        flame.vy *= 1 - 1.15 * delta;
      }

      for (let index = sparks.length - 1; index >= 0; index -= 1) {
        const spark = sparks[index];
        spark.life -= delta;
        if (spark.life <= 0) {
          sparks.splice(index, 1);
          continue;
        }
        spark.x += spark.vx * delta;
        spark.y += spark.vy * delta;
        spark.vx += Math.sin(now * 0.0016 + spark.y * 0.02) * 14 * scale * delta;
        // Embers lose their lift quickly and fall back rather than sailing off.
        spark.vy += 105 * scale * delta;
        spark.vy *= 1 - 0.85 * delta;
        spark.vx *= 1 - 1.1 * delta;
      }

      for (let index = smoke.length - 1; index >= 0; index -= 1) {
        const puff = smoke[index];
        puff.life -= delta;
        if (puff.life <= 0) {
          smoke.splice(index, 1);
          continue;
        }
        puff.x += puff.vx * delta;
        puff.y += puff.vy * delta;
        puff.vx += Math.sin(now * 0.0009 + puff.y * 0.006) * 16 * scale * delta;
        puff.vy *= 1 - 0.22 * delta;
      }
    };

    const compose = (model: ReturnType<typeof fireModel>, flicker: number) => {
      context.clearRect(0, 0, width, height);
      drawRoomLight(model, flicker);
      drawSmoke(flicker);
      // Logs first, then the coal bed spilling out in front of them, so the
      // stack reads as sitting *in* the fire rather than on top of a decal.
      for (const log of logs) drawLog(log, model);
      drawEmberBed(model, flicker);
      drawFlames(model);
      drawSparks();
    };

    const render = (now: number) => {
      animationFrame = requestAnimationFrame(render);
      if (pausedRef.current && pausedFrameDrawn) {
        previousTime = now;
        return;
      }
      pausedFrameDrawn = pausedRef.current;

      const delta = Math.min(0.04, (now - previousTime) / 1000);
      previousTime = now;
      const model = fireModel(metricsRef.current);
      if (!pausedRef.current) advance(delta, model, now);
      compose(model, now * 0.0035);
    };

    /**
     * Reduced motion still gets a fire, settled into a steady state rather than
     * animated: the same composition, simulated once and redrawn only when the
     * readings actually move.
     */
    const renderStatic = () => {
      sparkQueueRef.current.length = 0;
      const model = fireModel(metricsRef.current);
      const signature = `${Math.round(model.flame * 40)}:${Math.round(model.embers * 40)}`;
      if (signature === staticSignature) return;
      staticSignature = signature;

      flames.length = 0;
      sparks.length = 0;
      smoke.length = 0;
      flameRemainder = 0;
      smokeRemainder = 0;
      for (let step = 0; step < 90; step += 1) {
        advance(1 / 30, model, step * 33);
      }
      compose(model, 0);
    };

    if (reducedMotion) {
      renderStatic();
      staticTimer = window.setInterval(renderStatic, 400);
    } else {
      animationFrame = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      if (staticTimer != null) window.clearInterval(staticTimer);
      observer.disconnect();
      remeasureRef.current = null;
    };
  }, [reducedMotion]);

  useEffect(() => {
    remeasureRef.current?.();
  }, [layout]);

  return <canvas ref={canvasRef} className="fire-canvas" aria-hidden="true" />;
}
