#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { runDoctor } from "../cli/doctor.mjs";
import { parseArguments, usage } from "../cli/options.mjs";
import { runServe } from "../cli/serve.mjs";
import { codes, paint } from "../cli/terminal.mjs";
import { runWatch } from "../cli/watch.mjs";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.version) {
    process.stdout.write(`${packageJson.version}\n`);
  } else if (options.help || options.command === "help") {
    process.stdout.write(usage(packageJson.version));
  } else if (options.command === "serve") {
    await runServe(options);
  } else if (options.command === "doctor") {
    await runDoctor(options);
  } else {
    await runWatch(options);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const color = !("NO_COLOR" in process.env) && process.stderr.isTTY;
  process.stderr.write(`${paint(color, codes.red, "error:")} ${message}\n\n`);
  process.stderr.write("Run `embertop --help` for usage.\n");
  process.exitCode = 1;
}
