import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [red, green, blue] = hex
    .slice(1)
    .match(/../g)
    .map((part) => channel(Number.parseInt(part, 16)));
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function color(css, variable) {
  const value = css.match(
    new RegExp(`--${variable}:\\s*(#[0-9a-f]{6})`, "i"),
  )?.[1];
  assert.ok(value, `expected --${variable} to be a six-digit hex color`);
  return value;
}

test("muted interface text meets normal-text contrast", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const background = color(css, "bg");

  for (const variable of ["fg-3", "fg-4"]) {
    const ratio = contrast(color(css, variable), background);
    assert.ok(
      ratio >= 4.5,
      `--${variable} contrast is ${ratio.toFixed(2)}:1; expected at least 4.5:1`,
    );
  }
});
