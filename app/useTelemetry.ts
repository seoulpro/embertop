"use client";

import { useEffect, useRef, useState } from "react";
import {
  EMPTY_METRICS,
  normalizeFrame,
  type TelemetryFrame,
  type VisitEvent,
} from "@/lib/telemetry";
import { createTrafficWindow, emptyTrafficMix } from "@/lib/traffic.mjs";
import type { TrafficMix } from "@/lib/telemetry";

type ConnectionState = "connecting" | "connected" | "reconnecting";

const INITIAL_FRAME: TelemetryFrame = {
  schema: 1,
  sequence: 0,
  at: new Date(0).toISOString(),
  source: "live",
  site: "your-server",
  metrics: {
    ...EMPTY_METRICS,
    cpu: 18,
    memory: 52,
    load1: 0.42,
  },
  visits: [],
};
const CLOCK_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function useTelemetry() {
  const [frame, setFrame] = useState<TelemetryFrame>(INITIAL_FRAME);
  const [connection, setConnection] =
    useState<ConnectionState>("connecting");
  const [recentVisits, setRecentVisits] = useState<VisitEvent[]>([]);
  const [traffic, setTraffic] = useState<TrafficMix>(emptyTrafficMix);
  const windowRef = useRef(createTrafficWindow());

  useEffect(() => {
    const pagePath = window.location.pathname.replace(/\/+$/, "");
    const stream = new EventSource(`${pagePath}/api/stream`);
    const seen = new Set<string>();

    stream.onopen = () => setConnection("connected");
    stream.onmessage = (event) => {
      try {
        const normalized = normalizeFrame(JSON.parse(event.data));
        if (!normalized) return;
        setFrame(normalized);
        setConnection("connected");
        if (normalized.visits.length > 0) {
          // The same visit can appear in consecutive frames; only tally it once.
          const fresh = normalized.visits.filter((visit) => !seen.has(visit.id));
          if (fresh.length > 0) {
            for (const visit of fresh) seen.add(visit.id);
            if (seen.size > 4_000) seen.clear();
            windowRef.current.record(fresh);
            // Enough to fill a tall panel; the list clips whatever does not fit.
            setRecentVisits((current) => [...fresh, ...current].slice(0, 20));
          }
        }
      } catch {
        // Ignore malformed events and keep the last valid frame on screen.
      }
    };
    stream.onerror = () => setConnection("reconnecting");

    // The window expires entries on its own clock, so the mix keeps decaying
    // even when the stream goes quiet.
    const tally = window.setInterval(() => {
      setTraffic(windowRef.current.summary());
    }, 1_000);

    return () => {
      stream.close();
      window.clearInterval(tally);
    };
  }, []);

  return { frame, connection, recentVisits, traffic };
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function useClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  return now ? CLOCK_FORMATTER.format(now) : "--:--:--";
}

export function useCampfireAudio(enabled: boolean, intensity: number) {
  const audioRef = useRef<{
    context: AudioContext;
    source: AudioBufferSourceNode;
    gain: GainNode;
    filter: BiquadFilterNode;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const AudioContextConstructor =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const duration = 3;
    const buffer = context.createBuffer(
      1,
      context.sampleRate * duration,
      context.sampleRate,
    );
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      const pop = Math.random() > 0.9992 ? white * 0.7 : 0;
      channel[index] = previous * 0.42 + pop;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 820;
    filter.Q.value = 0.7;
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    void context.resume().catch(() => {
      // Some browsers keep the context suspended until a later gesture.
    });
    gain.gain.setTargetAtTime(0.03, context.currentTime, 0.18);
    audioRef.current = { context, source, gain, filter };

    return () => {
      if (audioRef.current?.context === context) {
        audioRef.current = null;
      }
      gain.gain.setTargetAtTime(0, context.currentTime, 0.08);
      window.setTimeout(() => {
        try {
          source.stop();
        } catch {
          // The source may already be stopped.
        }
        void context.close().catch(() => {
          // Closing an already-closed context is harmless.
        });
      }, 220);
    };
  }, [enabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.gain.gain.setTargetAtTime(
      0.022 + Math.min(1, intensity / 100) * 0.018,
      audio.context.currentTime,
      0.35,
    );
    audio.filter.frequency.setTargetAtTime(
      680 + intensity * 4,
      audio.context.currentTime,
      0.5,
    );
  }, [intensity]);
}
