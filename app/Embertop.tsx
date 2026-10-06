"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_METRICS } from "@/lib/telemetry";
import { FireCanvas } from "./FireCanvas";
import {
  useCampfireAudio,
  useClock,
  useReducedMotion,
  useTelemetry,
} from "./useTelemetry";

const ICON_PATHS = {
  flame: [
    "M12 3c1 5-4 5-4 9a4 4 0 0 0 8 0c0-2-1-4-2-5 0 3-2 3-2 3 1-3 0-5 0-7Z",
    "M12 14c-2 2-2 4 0 5 2-1 2-3 0-5Z",
  ],
  sound: [
    "M11 5 6 9H3v6h3l5 4V5Z",
    "M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14",
  ],
  muted: ["M11 5 6 9H3v6h3l5 4V5Z", "m16 9 6 6m0-6-6 6"],
  pause: ["M8 5v14M16 5v14"],
  play: ["m8 5 11 7-11 7V5Z"],
  screen: ["M4 4h16v12H4V4Z", "M8 20h8m-4-4v4"],
  focus: ["M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"],
  readings: ["M4 5h16v14H4V5Z", "M14 5v14m3-10h1m-1 3h1m-1 3h1"],
  help: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2m0 3h.01",
  ],
  close: ["m6 6 12 12M18 6 6 18"],
};

function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
    >
      {ICON_PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

function Reading({
  label,
  caption,
  value,
  tone = "flame",
}: {
  label: string;
  caption: string;
  value: number | null;
  tone?: "flame" | "ember";
}) {
  return (
    <div className={`reading reading-${tone}`}>
      <div className="reading-line">
        <span className="reading-label">
          {label}
          <em>{caption}</em>
        </span>
        <span className="reading-value">
          {value == null ? "—" : Math.round(value)}
          {value == null ? null : <span className="unit">%</span>}
        </span>
      </div>
      <div className={`gauge gauge-${tone}`} aria-hidden="true">
        <span
          style={{
            width: `${value == null ? 0 : Math.min(100, Math.max(0, value))}%`,
          }}
        />
      </div>
    </div>
  );
}

function Band({
  label,
  segments,
  total,
}: {
  label: string;
  segments: { kind: string; label: string; count: number }[];
  total: number;
}) {
  const present = segments.filter((segment) => segment.count > 0);
  return (
    <div className="band" role="group" aria-label={label}>
      <p className="band-label">{label}</p>
      <div className="band-track" aria-hidden="true">
        {present.map((segment) => (
          <span
            key={segment.kind}
            className={`band-fill band-${segment.kind}`}
            style={{ flexGrow: segment.count }}
          />
        ))}
      </div>
      <p className="band-keys">
        {present.map((segment) => (
          <span
            key={segment.kind}
            className={`band-key band-text-${segment.kind}`}
            title={`${segment.count} of ${total} observed requests`}
          >
            <i aria-hidden="true" />
            {segment.label}
            <span>{Math.round((segment.count / total) * 100)}%</span>
          </span>
        ))}
      </p>
    </div>
  );
}

function formatElapsed(isoDate: string, referenceTime: number) {
  const elapsed = Math.max(0, referenceTime - new Date(isoDate).getTime());
  if (elapsed < 4_000) return "now";
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1_000)}s`;
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  return `${Math.floor(elapsed / 3_600_000)}h`;
}

interface WakeSentinel {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

function WakeControl() {
  const sentinelRef = useRef<WakeSentinel | null>(null);
  const requestedRef = useRef(false);
  const requestingRef = useRef(false);
  const mountedRef = useRef(false);
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);

  const acquire = useCallback(async () => {
    if (requestingRef.current || sentinelRef.current || !requestedRef.current)
      return;
    requestingRef.current = true;
    try {
      const wakeLockNavigator = navigator as Navigator & {
        wakeLock: { request(type: "screen"): Promise<WakeSentinel> };
      };
      const sentinel = await wakeLockNavigator.wakeLock.request("screen");
      if (!mountedRef.current || !requestedRef.current) {
        await sentinel.release();
        return;
      }
      sentinelRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        if (sentinelRef.current !== sentinel) return;
        sentinelRef.current = null;
        if (document.visibilityState === "visible")
          requestedRef.current = false;
        if (mountedRef.current) setActive(false);
      });
      setActive(true);
      setFailed(false);
    } catch {
      requestedRef.current = false;
      if (mountedRef.current) {
        setActive(false);
        setFailed(true);
      }
    } finally {
      requestingRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const detectSupport = window.setTimeout(
      () => setSupported("wakeLock" in navigator),
      0,
    );
    const restore = () => {
      if (document.visibilityState === "visible" && requestedRef.current)
        void acquire();
    };
    document.addEventListener("visibilitychange", restore);
    return () => {
      mountedRef.current = false;
      requestedRef.current = false;
      window.clearTimeout(detectSupport);
      document.removeEventListener("visibilitychange", restore);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      void sentinel?.release().catch(() => {});
    };
  }, [acquire]);

  const toggle = async () => {
    if (requestedRef.current) {
      requestedRef.current = false;
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setActive(false);
      await sentinel?.release().catch(() => {});
    } else {
      requestedRef.current = true;
      await acquire();
    }
  };

  return (
    <button
      type="button"
      className="action"
      onClick={() => void toggle()}
      disabled={!supported}
      aria-pressed={active}
      title={
        !supported
          ? "This browser can't keep the screen awake"
          : failed
            ? "Screen wake lock wasn't available. Try again."
            : "Keep the screen from sleeping"
      }
    >
      <Icon name="screen" />
      <span>{active ? "Screen on" : "Keep awake"}</span>
    </button>
  );
}

function FireGuide({
  dialogRef,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="fire-guide"
      aria-labelledby="guide-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="guide-content">
        <div className="guide-head">
          <span className="eyebrow">A machine, made visible</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Close guide"
            onClick={() => dialogRef.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="guide-title">Reading the fire</h2>
        <p className="guide-intro">
          CPU lifts the flame. Memory warms the embers.
          <br />
          Every request leaves a spark.
        </p>
        <dl className="spark-guide">
          {[
            {
              kind: "visitor",
              name: "Visitors",
              description: "Warm sparks rise with a served page.",
            },
            {
              kind: "crawler",
              name: "Crawlers",
              description: "Cyan sparks mark self-identified crawlers.",
            },
            {
              kind: "unknown",
              name: "Unidentified",
              description: "Violet sparks mark scripts or unknown agents.",
            },
            {
              kind: "refused",
              name: "Refused · 4xx",
              description: "Short-lived sparks fall back to the coals.",
            },
            {
              kind: "broken",
              name: "Failed · 5xx",
              description: "A larger red burst marks a server error.",
            },
          ].map((spark) => (
            <div
              key={spark.kind}
              className={`spark-row band-text-${spark.kind}`}
            >
              <dt>
                <i aria-hidden="true" />
                {spark.name}
              </dt>
              <dd>{spark.description}</dd>
            </div>
          ))}
        </dl>
        <p className="guide-note">
          Traffic mix shows requests observed in this browser over the last 60
          seconds.
        </p>
        <div className="guide-shortcuts" aria-label="Keyboard shortcuts">
          <span>
            <kbd>F</kbd> Focus
          </span>
          <span>
            <kbd>M</kbd> Sound
          </span>
          <span>
            <kbd>Space</kbd> Pause
          </span>
          <span>
            <kbd>H</kbd> Guide
          </span>
          <span>
            <kbd>Esc</kbd> Back
          </span>
        </div>
      </div>
    </dialog>
  );
}

export function Embertop() {
  const {
    frame: liveFrame,
    hasFrame,
    connection,
    recentVisits: liveRecentVisits,
    traffic: liveTraffic,
  } = useTelemetry();
  const reducedMotion = useReducedMotion();
  const { time: clock, timestamp } = useClock();
  const guideRef = useRef<HTMLDialogElement>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [pausedSnapshot, setPausedSnapshot] = useState({
    frame: liveFrame,
    recentVisits: liveRecentVisits,
    traffic: liveTraffic,
    hasFrame,
    at: 0,
  });
  const frame = paused ? pausedSnapshot.frame : liveFrame;
  const metrics = frame?.metrics ?? EMPTY_METRICS;
  const site = frame?.site ?? "awaiting telemetry";
  const recentVisits = paused ? pausedSnapshot.recentVisits : liveRecentVisits;
  const traffic = paused ? pausedSnapshot.traffic : liveTraffic;
  const ready = paused ? pausedSnapshot.hasFrame : hasFrame;
  const referenceTime = paused ? pausedSnapshot.at : timestamp;
  const filteredVisits = errorsOnly
    ? recentVisits.filter((visit) => visit.status >= 400)
    : recentVisits;

  useCampfireAudio(soundEnabled, metrics.cpu);

  const toggleFocus = useCallback(
    () => setFocusMode((current) => !current),
    [],
  );
  const toggleSound = useCallback(
    () => setSoundEnabled((current) => !current),
    [],
  );
  const openGuide = useCallback(() => guideRef.current?.showModal(), []);
  const togglePause = useCallback(() => {
    if (!paused)
      setPausedSnapshot({
        frame: liveFrame,
        recentVisits: liveRecentVisits,
        traffic: liveTraffic,
        hasFrame,
        at: Date.now(),
      });
    setPaused(!paused);
  }, [liveFrame, liveRecentVisits, liveTraffic, hasFrame, paused]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        guideRef.current?.open ||
        target?.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
        )
      )
        return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat)
        return;
      if (event.key === "Escape") setFocusMode(false);
      if (event.key.toLowerCase() === "f") toggleFocus();
      if (event.key.toLowerCase() === "m") toggleSound();
      if (event.key.toLowerCase() === "h") openGuide();
      if (event.code === "Space") {
        if (
          target?.closest(
            "button, a[href], summary, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='option'], [role='menuitem'], [role='tab']",
          )
        )
          return;
        event.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [toggleFocus, togglePause, toggleSound, openGuide]);

  const connectionLabel = paused
    ? "paused"
    : connection === "connected"
      ? "live"
      : connection === "connecting"
        ? "connecting"
        : "reconnecting";
  const stageCaption = paused
    ? "A moment, held still."
    : connection === "reconnecting"
      ? "Reconnecting. Last readings held."
      : ready
        ? "Your server, at a glance."
        : "Connecting to your server…";

  return (
    <main
      className={`app ${focusMode ? "is-focus" : ""}`}
      data-paused={paused}
      data-connection={connection}
    >
      <FireCanvas
        metrics={metrics}
        visits={frame?.visits ?? []}
        paused={paused}
        reducedMotion={reducedMotion}
        layout={focusMode ? "focus" : "default"}
      />
      <header className="bar bar-top">
        <div className="identity">
          <span className="wordmark">
            <Icon name="flame" />
            embertop
          </span>
          <span className="site" title={site}>
            {site}
          </span>
        </div>
        <div className="status">
          <span
            className={`link link-${paused ? "paused" : connection}`}
            role="status"
            aria-live="polite"
          >
            <i aria-hidden="true" />
            {connectionLabel}
          </span>
          <time aria-label="Local time">{clock}</time>
        </div>
      </header>
      <section className="stage" aria-label="Fireplace">
        <div className="hearth-intro">
          <p className="eyebrow">Ambient observability</p>
          <h1>
            Every request
            <br />
            <span>leaves a spark.</span>
          </h1>
          <p className="stage-caption">{stageCaption}</p>
        </div>
        <aside
          className="readout"
          aria-label="Live server readings"
          aria-busy={!ready}
        >
          <div className="section-head">
            <h2>Machine</h2>
            <span>
              {paused
                ? "Snapshot"
                : connection === "connected"
                  ? "Live readings"
                  : ready
                    ? "Last readings"
                    : "awaiting first reading"}
            </span>
          </div>
          <div className="readings">
            <Reading
              label="CPU"
              caption="flame"
              value={ready ? metrics.cpu : null}
            />
            <Reading
              label="Memory"
              caption="embers"
              value={ready ? metrics.memory : null}
              tone="ember"
            />
          </div>
          <div className="load-reading">
            <span>1 min load average</span>
            <strong>{ready ? metrics.load1.toFixed(2) : "—"}</strong>
          </div>
          <div className="bands">
            <div className="section-head bands-head">
              <h2>Traffic</h2>
              <span>Last 60 seconds</span>
            </div>
            <div className="traffic-reading">
              <strong>
                {ready
                  ? metrics.requestsPerMinute.toLocaleString("en-US")
                  : "—"}
              </strong>
              <span>requests / min</span>
            </div>
            {traffic.total === 0 ? (
              <div className="band band-idle">
                <div className="band-track" aria-hidden="true" />
                <p className="band-quiet">
                  {ready
                    ? "No requests observed in the last minute"
                    : "Waiting for live traffic"}
                </p>
              </div>
            ) : (
              <>
                <p className="mix-caption">
                  Traffic mix
                  <span>{traffic.total.toLocaleString("en-US")} observed</span>
                </p>
                <Band
                  label="Who arrived"
                  total={traffic.total}
                  segments={[
                    {
                      kind: "visitor",
                      label: "visitors",
                      count: traffic.sources.visitor,
                    },
                    {
                      kind: "crawler",
                      label: "crawlers",
                      count: traffic.sources.crawler,
                    },
                    {
                      kind: "unknown",
                      label: "unidentified",
                      count: traffic.sources.unknown,
                    },
                  ]}
                />
                <Band
                  label="Responses"
                  total={traffic.total}
                  segments={[
                    { kind: "ok", label: "served", count: traffic.outcomes.ok },
                    {
                      kind: "refused",
                      label: "refused",
                      count: traffic.outcomes.refused,
                    },
                    {
                      kind: "broken",
                      label: "failed",
                      count: traffic.outcomes.broken,
                    },
                  ]}
                />
              </>
            )}
          </div>
          <div className="feed">
            <div className="section-head feed-head">
              <h2>Requests</h2>
              <div
                className="feed-filters"
                role="group"
                aria-label="Filter recent requests"
              >
                <button
                  type="button"
                  aria-pressed={!errorsOnly}
                  onClick={() => setErrorsOnly(false)}
                >
                  All
                </button>
                <button
                  type="button"
                  aria-pressed={errorsOnly}
                  onClick={() => setErrorsOnly(true)}
                >
                  4xx / 5xx
                </button>
              </div>
            </div>
            <p className="privacy-note">addresses and query strings dropped</p>
            {filteredVisits.length === 0 ? (
              <div className="feed-empty">
                <Icon name="flame" />
                <p>
                  {errorsOnly
                    ? "No errors in recent requests."
                    : ready
                      ? "Waiting for the next spark."
                      : "Listening for your server…"}
                </p>
              </div>
            ) : (
              <ol
                className="feed-list"
                aria-label={
                  errorsOnly
                    ? "Recent requests with 4xx or 5xx responses"
                    : "Recent requests"
                }
                tabIndex={0}
              >
                {filteredVisits.map((visit) => (
                  <li
                    className={`visit visit-${visit.status >= 500 ? "broken" : visit.status >= 400 ? "refused" : visit.kind}`}
                    key={visit.id}
                  >
                    <span className="visit-mark" aria-hidden="true" />
                    <span className="sr-only">
                      {visit.status >= 500
                        ? "Server error"
                        : visit.status >= 400
                          ? "Refused"
                          : visit.kind === "crawler"
                            ? "Crawler"
                            : visit.kind === "human"
                              ? "Visitor"
                              : "Unidentified"}
                      :{" "}
                    </span>
                    <span className="visit-method">{visit.method}</span>
                    <span
                      className="visit-path"
                      title={visit.path || "Path hidden"}
                    >
                      {visit.path || "Path hidden"}
                    </span>
                    <span
                      className="visit-status"
                      title={
                        visit.durationMs == null
                          ? "Response status"
                          : `${visit.durationMs} ms`
                      }
                    >
                      {visit.status}
                    </span>
                    <time dateTime={visit.at} title={visit.at}>
                      {formatElapsed(visit.at, referenceTime)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {paused && (
            <p className="snapshot-note">
              <Icon name="pause" />
              Readings paused. Collection continues.
            </p>
          )}
        </aside>
      </section>
      <footer className="bar bar-bottom">
        <button
          type="button"
          className="action guide-trigger"
          onClick={openGuide}
          aria-label="Reading the fire"
          aria-haspopup="dialog"
          title="Reading the fire (H)"
        >
          <Icon name="help" />
          <span>Reading the fire</span>
          <kbd aria-hidden="true">H</kbd>
        </button>
        <div className="actions" role="group" aria-label="Fireplace controls">
          <button
            type="button"
            className="action"
            onClick={toggleSound}
            aria-pressed={soundEnabled}
            title="Toggle the crackle of the fire (M)"
          >
            <Icon name={soundEnabled ? "sound" : "muted"} />
            <span>{soundEnabled ? "Sound on" : "Sound off"}</span>
            <kbd aria-hidden="true">M</kbd>
          </button>
          <button
            type="button"
            className="action"
            onClick={togglePause}
            aria-pressed={paused}
            title="Pause or resume the fire and readings (Space)"
          >
            <Icon name={paused ? "play" : "pause"} />
            <span>{paused ? "Resume" : "Pause"}</span>
            <kbd aria-hidden="true">Space</kbd>
          </button>
          <WakeControl />
          <button
            type="button"
            className="action action-primary"
            onClick={toggleFocus}
            aria-pressed={focusMode}
            title="Hide or show the readings (F)"
          >
            <Icon name={focusMode ? "readings" : "focus"} />
            <span>{focusMode ? "Show readings" : "Just the fire"}</span>
            <kbd aria-hidden="true">F</kbd>
          </button>
        </div>
      </footer>
      <FireGuide dialogRef={guideRef} />
    </main>
  );
}
