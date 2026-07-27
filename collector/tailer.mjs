import { open, stat } from "node:fs/promises";
import { parseLogLine } from "./parsers.mjs";

export function splitLogPaths(value) {
  if (Array.isArray(value)) {
    return value.map((path) => String(path).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);
}

export class AccessLogTailer {
  #offsets = new Map();
  #fragments = new Map();

  constructor({
    paths = [],
    format = "auto",
    includePaths = true,
    maximumReadBytes = 1_048_576,
  } = {}) {
    this.paths = splitLogPaths(paths);
    this.format = ["auto", "nginx", "json"].includes(format)
      ? format
      : "auto";
    this.includePaths = includePaths;
    this.maximumReadBytes = maximumReadBytes;
  }

  async initialize() {
    await Promise.all(this.paths.map((path) => this.#initializePath(path)));
  }

  async #initializePath(path) {
    try {
      const details = await stat(path);
      this.#offsets.set(path, {
        inode: details.ino,
        position: details.size,
      });
      this.#fragments.set(path, "");
    } catch {
      this.#offsets.delete(path);
    }
  }

  async #pollPath(path) {
    let details;
    try {
      details = await stat(path);
    } catch {
      return [];
    }

    let cursor = this.#offsets.get(path);
    if (!cursor) {
      await this.#initializePath(path);
      return [];
    }
    if (cursor.inode !== details.ino || details.size < cursor.position) {
      cursor = { inode: details.ino, position: 0 };
      this.#fragments.set(path, "");
    }
    if (details.size === cursor.position) return [];

    const start = Math.max(
      cursor.position,
      details.size - this.maximumReadBytes,
    );
    const skippedPrefix = start > cursor.position;
    const length = details.size - start;
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      cursor.position = details.size;
      cursor.inode = details.ino;
      this.#offsets.set(path, cursor);

      const fragment = skippedPrefix ? "" : this.#fragments.get(path) || "";
      const complete = `${fragment}${buffer
        .subarray(0, bytesRead)
        .toString("utf8")}`;
      const lines = complete.split(/\r?\n/);
      this.#fragments.set(path, lines.pop() || "");
      if (skippedPrefix) lines.shift();

      return lines
        .map((line) =>
          parseLogLine(line, this.format, {
            includePaths: this.includePaths,
          }),
        )
        .filter(Boolean);
    } finally {
      await handle.close();
    }
  }

  async poll() {
    const batches = await Promise.all(
      this.paths.map((path) => this.#pollPath(path).catch(() => [])),
    );
    return batches.flat();
  }
}
