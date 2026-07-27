"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FireCanvas } from "./FireCanvas";
import {
  useCampfireAudio,
  useClock,
  useReducedMotion,
  useTelemetry,
} from "./useTelemetry";

function Reading({
  label,
  caption,
  value,
  progress,
  tone = "flame",
}: {
  label: string;
  caption: string;
  value: number;
  progress: number | null;
  tone?: "flame" | "ember";
}) {
  return (
    <div className="reading">
      <div className="reading-line">
        <span className="reading-label">
          {label}
          <em>{caption}</em>
        </span>
        <span className="reading-value">
          {Math.round(value)}
          <span className="unit">%</span>
        </span>
      </div>
      <div className={`gauge gauge-${tone}`} aria-hidden="true">
        <span
          style={{
            width: `${progress == null ? 0 : Math.max(1.5, progress)}%`,
            opacity: progress == null ? 0.2 : 1,
          }}
        />
      </div>
    </div>
  );
}

/**
 * A stacked band of the last minute, captioned by words in the same colour as
 * the segment they name and in the same order. The key is the band, so nothing
 * has to be looked up somewhere else on the screen — and a class that is not
 * happening does not appear at all, which makes its arrival the signal.
 */
function Band({
  segments,
  total,
}: {
  segments: { kind: string; label: string; count: number }[];
  total: number;
}) {
  const present = segments.filter((segment) => segment.count > 0);

  return (
    <div className="band">
      <p className="band-keys">
        {present.map((segment) => (
          <span key={segment.kind} className={`band-key band-text-${segment.kind}`}>
            {segment.label} {Math.round((segment.count / total) * 100)}%
          </span>
        ))}
      </p>
      <div className="band-track">
        {present.map((segment) => (
          <span
            key={segment.kind}
            className={`band-fill band-${segment.kind}`}
            style={{ flexGrow: segment.count }}
            title={`${segment.label}: ${segment.count}`}
          />
        ))}
      </div>
    </div>
  );
}

function formatElapsed(isoDate: string) {
  const elapsed = Math.max(0, Date.now() - new Date(isoDate).getTime());
  if (elapsed < 4_000) return "now";
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1_000)}s`;
  return `${Math.floor(elapsed / 60_000)}m`;
}

function WakeControl() {
  const sentinelRef = useRef<{
    release(): Promise<void>;
    addEventListener(type: string, listener: () => void): void;
  } | null>(null);
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const detectSupport = window.setTimeout(() => {
      setSupported("wakeLock" in (navigator as Navigator & { wakeLock?: unknown }));
    }, 0);
    return () => {
      window.clearTimeout(detectSupport);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      void sentinel?.release().catch(() => {
        // The browser may already have released the lock.
      });
    };
  }, []);

  const toggle = async () => {
    if (active) {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setActive(false);
      try {
        await sentinel?.release();
      } catch {
        // The browser may already have released the lock.
      }
      return;
    }

    try {
      const wakeLockNavigator = navigator as Navigator & {
        wakeLock: {
          request(type: "screen"): Promise<{
            release(): Promise<void>;
            addEventListener(type: string, listener: () => void): void;
          }>;
        };
      };
      const sentinel = await wakeLockNavigator.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      sentinel.addEventListener("release", () => setActive(false));
      setActive(true);
    } catch {
      setActive(false);
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
        supported
          ? "Keep the screen from sleeping"
          : "This browser can't keep the screen awake"
      }
    >
      {active ? "Screen on" : "Keep awake"}
    </button>
  );
}

export function Embertop() {
  const {
    frame: liveFrame,
    connection,
    recentVisits: liveRecentVisits,
    traffic,
  } = useTelemetry();
  const reducedMotion = useReducedMotion();
  const clock = useClock();
  const [focusMode, setFocusMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pausedSnapshot, setPausedSnapshot] = useState({
    frame: liveFrame,
    recentVisits: liveRecentVisits,
  });
  const frame = paused ? pausedSnapshot.frame : liveFrame;
  const recentVisits = paused ? pausedSnapshot.recentVisits : liveRecentVisits;

  useCampfireAudio(soundEnabled, frame.metrics.cpu);

  const toggleFocus = useCallback(() => {
    setFocusMode((current) => !current);
  }, []);
  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => !current);
  }, []);
  const togglePause = useCallback(() => {
    if (!paused) {
      setPausedSnapshot({ frame: liveFrame, recentVisits: liveRecentVisits });
    }
    setPaused(!paused);
  }, [liveFrame, liveRecentVisits, paused]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
        )
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key.toLowerCase() === "f") toggleFocus();
      if (event.key.toLowerCase() === "m") toggleSound();
      if (event.code === "Space") {
        if (
          target?.closest(
            "button, a[href], summary, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='option'], [role='menuitem'], [role='tab']",
          )
        ) {
          return;
        }
        event.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [toggleFocus, togglePause, toggleSound]);

  const connectionLabel =
    connection === "connected"
      ? "live"
      : connection === "connecting"
        ? "connecting"
        : "reconnecting";

  return (
    <main className={`app ${focusMode ? "is-focus" : ""}`} data-paused={paused}>
      <FireCanvas
        metrics={frame.metrics}
        visits={frame.visits}
        paused={paused}
        reducedMotion={reducedMotion}
        layout={focusMode ? "focus" : "default"}
      />

      <header className="bar bar-top">
        <div className="identity">
          <span className="wordmark">embertop</span>
          <span className="site">{frame.site}</span>
        </div>
        <div className="status">
          <span
            className={`link link-${connection}`}
            role="status"
            aria-live="polite"
          >
            <i aria-hidden="true" />
            {connectionLabel}
          </span>
          <time>{clock}</time>
        </div>
      </header>

      <section className="stage" aria-label="Fireplace">
        <aside className="readout" aria-label="Live server readings">
          <div className="readings">
            <Reading
              label="CPU"
              caption="flame"
              value={frame.metrics.cpu}
              progress={frame.metrics.cpu}
            />
            <Reading
              label="Memory"
              caption="embers"
              value={frame.metrics.memory}
              progress={frame.metrics.memory}
              tone="ember"
            />
          </div>

          <div className="bands">
            {/* The crawler share used to be a separate figure here; the band
                below states it better, so only the totals remain. */}
            <div className="bands-head">
              <h2>Last 60 seconds</h2>
              <span>
                {frame.metrics.requestsPerMinute} requests
                <em> · </em>
                load {frame.metrics.load1.toFixed(2)}
              </span>
            </div>
            {traffic.total === 0 ? (
              // An idle server is the usual case; it should say so once.
              <div className="band">
                <p className="band-keys band-quiet">No requests in the last minute</p>
                <div className="band-track" />
              </div>
            ) : (
              <>
                <Band
                  total={traffic.total}
                  segments={[
                    { kind: "visitor", label: "visitors", count: traffic.sources.visitor },
                    { kind: "crawler", label: "crawlers", count: traffic.sources.crawler },
                    {
                      kind: "unknown",
                      label: "unidentified",
                      count: traffic.sources.unknown,
                    },
                  ]}
                />
                <Band
                  total={traffic.total}
                  segments={[
                    { kind: "ok", label: "served", count: traffic.outcomes.ok },
                    { kind: "refused", label: "refused", count: traffic.outcomes.refused },
                    { kind: "broken", label: "failed", count: traffic.outcomes.broken },
                  ]}
                />
              </>
            )}
          </div>

          <div className="feed">
            <div className="feed-head">
              <h2>Requests</h2>
              <p>addresses and query strings dropped</p>
            </div>
            {recentVisits.length === 0 ? (
              <p className="feed-empty">Waiting for the next spark.</p>
            ) : (
              <ol className="feed-list">
                {/* The list is clipped by its flex box, so it simply fills
                    whatever height the panel has left. */}
                {recentVisits.map((visit) => (
                  <li
                    className={`visit visit-${
                      visit.status >= 500
                        ? "broken"
                        : visit.status >= 400
                          ? "refused"
                          : visit.kind
                    }`}
                    key={visit.id}
                  >
                    <span className="visit-mark" aria-hidden="true" />
                    <span className="visit-method">{visit.method}</span>
                    <span className="visit-path">{visit.path}</span>
                    <span className="visit-status">{visit.status}</span>
                    <time dateTime={visit.at}>{formatElapsed(visit.at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </section>

      <footer className="bar bar-bottom">
        <div className="actions">
          <button
            type="button"
            className="action"
            onClick={toggleSound}
            aria-pressed={soundEnabled}
            title="Toggle the crackle of the fire (M)"
          >
            {soundEnabled ? "Sound on" : "Sound off"}
            <kbd aria-hidden="true">M</kbd>
          </button>
          <button
            type="button"
            className="action"
            onClick={togglePause}
            aria-pressed={paused}
            title="Pause or resume the motion (Space)"
          >
            {paused ? "Resume" : "Pause"}
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
            {focusMode ? "Show readings" : "Just the fire"}
            <kbd aria-hidden="true">F</kbd>
          </button>
        </div>
      </footer>
    </main>
  );
}
