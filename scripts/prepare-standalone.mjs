import { cp } from "node:fs/promises";

/**
 * `.next/standalone` is the deployable artifact, so everything required to run
 * *and* to redistribute it legally has to be inside: the static assets, the
 * public directory, and the licences covering the bundled font and runtime.
 */
await Promise.all([
  cp("public", ".next/standalone/public", { recursive: true, force: true }),
  cp(".next/static", ".next/standalone/.next/static", {
    recursive: true,
    force: true,
  }),
  cp("licenses", ".next/standalone/licenses", { recursive: true, force: true }),
  cp("LICENSE", ".next/standalone/LICENSE", { force: true }),
  cp("THIRD-PARTY-NOTICES.md", ".next/standalone/THIRD-PARTY-NOTICES.md", {
    force: true,
  }),
]);
