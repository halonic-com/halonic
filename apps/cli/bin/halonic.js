#!/usr/bin/env node
// The `halonic` program. Plain JavaScript on purpose: on a Node.js too old to strip types,
// importing `main.ts` fails with a raw ERR_UNKNOWN_FILE_EXTENSION stack trace, so the version
// check has to run first, in a file every Node.js can parse (HAL-6414).
import { nodeTooOldLines } from "./node-floor.js";

const tooOld = nodeTooOldLines(process.versions.node);
if (tooOld.length > 0) {
  process.stderr.write(`${tooOld.join("\n")}\n`);
  process.exitCode = 1;
} else if (process.argv[2] === "coding-tools") {
  // A harness program's coding tools server: standard output carries its MCP lines only (HAL-17183).
  const { serveCliCodingTools } = await import("../src/coding-tools-mode.ts");
  const code = await serveCliCodingTools(process.argv.slice(3));
  // A server that couldn't start reads nothing more, so an open input mustn't keep it running.
  if (code === 0) process.exitCode = code;
  else process.exit(code);
} else {
  await import("../src/main.ts");
}
