import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { formatCast, parseCast } from "../asciicast.ts";
import { captureSession, captureVersion } from "../capture.ts";
import { parseRecording } from "../recording.ts";
import { renderRecording } from "../render.ts";

/**
 * node tooling/recording/src/cli/record.ts capture --bin <folder> --dir <folder> [--recording <file>]
 * node tooling/recording/src/cli/record.ts render --dir <folder> [--recording <file>]
 *
 * `capture` runs the recording's commands for real with the `halonic` in
 * `--bin` and saves `<name>.cast` and `<name>.version` in `--dir`. `render`
 * reads them back and writes `<name>.paced.cast`, `<name>.svg` (animated)
 * and `<name>-still.svg` next to them. The recording defaults to
 * `recordings/first-run.json`.
 */

const usage = [
  "Usage: record.ts capture --bin <folder with halonic> --dir <output folder> [--recording <file>]",
  "       record.ts render --dir <folder with the capture> [--recording <file>]",
].join("\n");

const defaultRecording = join(import.meta.dirname, "..", "..", "recordings", "first-run.json");

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    bin: { type: "string" },
    dir: { type: "string" },
    recording: { type: "string", default: defaultRecording },
  },
});

const [command] = positionals;
const { bin, dir, recording: recordingPath } = values;
try {
  if (command === "capture" && bin !== undefined && dir !== undefined) capture(bin, dir);
  else if (command === "render" && dir !== undefined) render(dir);
  else {
    console.error(usage);
    process.exitCode = 2;
  }
} catch (error) {
  // The library's errors say what to fix; a stack trace would only hide that.
  console.error(`✕ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

function capture(bin: string, dir: string): void {
  const recording = parseRecording(readFileSync(recordingPath, "utf8"));
  const name = basename(recordingPath, ".json");
  const binFolder = resolve(bin);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.version`), captureVersion(binFolder));
  writeFileSync(join(dir, `${name}.cast`), formatCast(captureSession({ recording, binFolder })));
  console.log(`✓ Captured ${name}.cast and ${name}.version in ${dir}`);
}

function render(dir: string): void {
  const recording = parseRecording(readFileSync(recordingPath, "utf8"));
  const name = basename(recordingPath, ".json");
  const versionPath = join(dir, `${name}.version`);
  const rendered = renderRecording({
    recording,
    capture: parseCast(readFileSync(join(dir, `${name}.cast`), "utf8")),
    versionOutput: existsSync(versionPath) ? readFileSync(versionPath, "utf8") : undefined,
  });
  writeFileSync(join(dir, `${name}.paced.cast`), formatCast(rendered.paced));
  writeFileSync(join(dir, `${name}.svg`), rendered.animated);
  writeFileSync(join(dir, `${name}-still.svg`), rendered.still);
  const seconds = (rendered.paced.header.duration ?? 0).toFixed(1);
  console.log(`✓ Rendered ${name}.svg (${kilobytes(rendered.animated)}, plays ${seconds} s)`);
  console.log(`✓ Rendered ${name}-still.svg (${kilobytes(rendered.still)})`);
}

function kilobytes(text: string): string {
  return `${(Buffer.byteLength(text) / 1000).toFixed(1)} KB`;
}
