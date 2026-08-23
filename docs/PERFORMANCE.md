# Terminal performance measurements

Embertop's terminal view redraws at five frames per second. The benchmark in
`benchmark/terminal.mjs` measures the three hot paths that determine whether it
can remain a quiet companion process:

- rendering and line-diffing an animated 92×36 dashboard;
- rendering and line-diffing an unchanged dashboard;
- recording a long request stream into the bounded one-minute traffic window.

Run it from a clean checkout:

```bash
npm run benchmark:quick
npm run benchmark
npm run benchmark -- --json
```

Each scenario is warmed once and then measured in an isolated operation loop.
The full profile uses seven runs, 10,000 terminal frames, and 100,000 traffic
records. The report includes median and p95 elapsed time, time per operation,
an output checksum, and an approximate post-GC heap delta. A negative heap
delta is possible because garbage collection and runtime bookkeeping are not
deterministic.

These measurements are regression evidence, not a universal resource promise.
Compare runs on the same idle machine, Node.js version, terminal dimensions,
and profile. The script does not write to a terminal, open a network socket, or
read access logs; it uses fixed synthetic, privacy-safe input.

## Reference observation

One full run on 2026-08-13 used Node.js v24.4.1 on Darwin arm64 with an Apple
M1 Max. The median core costs were 77.924 µs per animated render-and-diff,
73.413 µs per unchanged render-and-diff, and 1.952 µs per traffic-window
record. At the product's five-frame-per-second cadence, the first figure is
about 0.39 ms of core render-and-diff work per second.

This observation excludes terminal write latency, telemetry collection,
networking, and unrelated process work. It is included to make the current
baseline reproducible, not as a promise for other machines or workloads.
