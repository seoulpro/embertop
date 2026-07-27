#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const SIGNIFICANT_SEVERITIES = new Set(["high", "critical"]);
const ALLOWED_DEVELOPMENT_ADVISORIES = new Map([
  [
    "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
    "brace-expansion in ESLint's development-only glob stack",
  ],
]);

function runAudit(arguments_) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["audit", ...arguments_, "--json"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) throw result.error;

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`npm audit did not return valid JSON${detail ? `: ${detail}` : ""}`);
  }

  if (report.error) {
    throw new Error(
      `npm audit failed: ${report.error.summary ?? report.error.message ?? "unknown error"}`,
    );
  }

  return report;
}

function significantFindings(report) {
  return Object.entries(report.vulnerabilities ?? {}).filter(([, finding]) =>
    SIGNIFICANT_SEVERITIES.has(finding.severity),
  );
}

function rootAdvisories(report, packageName, seen = new Set()) {
  if (seen.has(packageName)) return [];
  seen.add(packageName);

  const finding = report.vulnerabilities?.[packageName];
  if (!finding) return [];

  return finding.via.flatMap((via) => {
    if (typeof via === "string") {
      return rootAdvisories(report, via, seen);
    }
    return [
      {
        name: via.name,
        severity: via.severity,
        url: via.url,
      },
    ];
  });
}

function auditDependencies() {
  const runtimeReport = runAudit(["--omit=dev"]);
  const runtimeFindings = significantFindings(runtimeReport);
  if (runtimeFindings.length > 0) {
    throw new Error(
      `High or critical runtime vulnerabilities: ${runtimeFindings
        .map(([name]) => name)
        .join(", ")}`,
    );
  }
  console.log("Runtime dependency audit passed.");

  const fullReport = runAudit([]);
  const developmentFindings = significantFindings(fullReport);
  if (developmentFindings.length === 0) {
    console.log("Development dependency audit passed.");
    return;
  }

  const rootFindings = new Map();
  const unexplained = [];
  let hasCriticalFinding = false;

  for (const [packageName, finding] of developmentFindings) {
    if (finding.severity === "critical") hasCriticalFinding = true;
    const roots = rootAdvisories(fullReport, packageName);
    if (roots.length === 0) unexplained.push(packageName);
    for (const root of roots) rootFindings.set(root.url, root);
  }

  const unexpected = [...rootFindings.values()].filter(
    (finding) =>
      finding.severity !== "high" ||
      !ALLOWED_DEVELOPMENT_ADVISORIES.has(finding.url),
  );

  if (hasCriticalFinding || unexplained.length > 0 || unexpected.length > 0) {
    const details = [
      ...unexplained.map((name) => `unresolved dependency chain: ${name}`),
      ...unexpected.map(
        (finding) => `${finding.name} (${finding.severity}): ${finding.url}`,
      ),
    ];
    throw new Error(
      `High or critical development vulnerabilities require review:\n${details.join("\n")}`,
    );
  }

  for (const finding of rootFindings.values()) {
    console.warn(
      `Recognized development-only advisory: ${
        ALLOWED_DEVELOPMENT_ADVISORIES.get(finding.url)
      } (${finding.url}).`,
    );
  }
  console.warn(
    `${developmentFindings.length} affected development dependency entries; runtime dependencies remain clear.`,
  );
}

try {
  auditDependencies();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
