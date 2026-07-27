# Third-party notices

Embertop itself is [MIT](LICENSE). This file records the third-party material
that travels inside a built artifact — the standalone server output or the
npm package — and the terms it travels under.

## Instrument Sans

The interface uses a single typeface, **Instrument Sans**, loaded through
`next/font/google`. It is downloaded at build time and **self-hosted**: the
`.woff2` files are written into the build output and served from the same
origin, so a running instance makes no request to Google and sets no
third-party cookies.

Because the font files are redistributed with the build, its licence travels
with them.

- Project: <https://github.com/Instrument/instrument-sans>
- Copyright: 2022 The Instrument Sans Project Authors
- Licence: **SIL Open Font License 1.1** (`OFL-1.1`)
- Full licence text: [`licenses/Instrument-Sans-OFL.txt`](licenses/Instrument-Sans-OFL.txt)

OFL-1.1 requires the licence text to accompany the font wherever it is
redistributed, so the full text is vendored in this repository rather than
merely linked. Copy `licenses/` alongside the build output when you deploy it. Under it the font may be bundled and redistributed, including
commercially. It may not be sold on its own, and any modified version must not
use the reserved name "Instrument Sans".

## Project artwork

`public/og.png` is a render of the application's own fire canvas, and
`app/icon.svg` is hand-written SVG. Both are original to this project and
covered by its licence.

## Runtime dependencies

The standalone server ships a handful of packages, all permissive and
compatible with MIT:

| Licence | Packages |
|---|---|
| MIT | `next`, `@next/env`, `react`, `react-dom`, `styled-jsx`, `client-only` |
| Apache-2.0 | `@swc/helpers` |

There is no copyleft component in the shipped artifact, and it contains no
native binaries at all.

Image optimization is disabled in [`next.config.ts`](next.config.ts) because
nothing here uses `next/image`. Left on, Next.js traces `sharp` and its
`libvips` binary (**LGPL-3.0-or-later**) into the output. The exclusion
patterns match anywhere in the tree because pnpm and Yarn store those packages
under paths that a `node_modules/@img/**` pattern does not catch. **Re-enabling
image optimization, or loosening those patterns, reintroduces an LGPL
obligation.**

The CLI and collector add nothing: their execution path uses only Node.js
built-ins.

## Build and development dependencies

TypeScript, ESLint, and their transitive dependencies are used to build and
check the project and are **not** distributed with it. They are predominantly
MIT, Apache-2.0, and ISC. `caniuse-lite` (CC-BY-4.0) and `axe-core` (MPL-2.0)
appear in that tree; neither is present in any shipped artifact.

To reproduce this audit:

```bash
npm ci && npm run build
```

Then inspect `.next/standalone/node_modules`.
