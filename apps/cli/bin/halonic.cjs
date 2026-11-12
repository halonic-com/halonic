#!/usr/bin/env node
// The `halonic` command's first file (HAL-6517). It checks the Node version
// before anything of ours is loaded: src/main.ts needs Node 26.12 to run
// TypeScript, and an older Node (such as Ubuntu's apt Node 12 or 18) would
// stop on a raw syntax or file-extension error instead.
//
// Old JavaScript only, so Node 12 can read this file: no `?.`, no `??`, no
// top-level await, and CommonJS so it loads without the ES module loader.
"use strict";

const needed = [26, 12];
const found = process.versions.node;
const parts = found.split(".").map(Number);
const major = parts[0];
const minor = parts[1];

if (major < needed[0] || (major === needed[0] && minor < needed[1])) {
  process.stderr.write(
    `✕ Halonic needs Node.js 26.12 or later, but this is Node.js ${found}. ` +
      "Install a newer one, for example with nvm install 26.\n",
  );
  process.exitCode = 1;
} else {
  import("../src/main.ts");
}
