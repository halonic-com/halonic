// Checks the third-party notices the Android app ships (HAL-12585), as the
// built file holds them: our LICENSE and NOTICE first, then the npm packages,
// the Rust crates of the Android targets and the Gradle libraries that
// `pnpm check:sbom --notices --with-licence --gradle` writes. A build that
// dropped the asset, or wrote it without one of its parts, fails here.
//
// It needs no Android tools:
//   unzip -p app.aab base/assets/THIRD-PARTY-NOTICES.txt > notices.txt
//   unzip -p app.apk assets/THIRD-PARTY-NOTICES.txt > notices.txt
//   node check-notices.mjs notices.txt

import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";
import { pathToFileURL } from "node:url";

const sections = ["npm packages", "Rust crates", "Android libraries (Gradle)"];

/** What the notices text is missing, one line each; empty when nothing is. */
export function noticeProblems(text) {
  const has = (pattern) => pattern.test(text);
  const checks = [
    [
      "it doesn't open with our own licence",
      text.startsWith("Halonic is licensed under the following licence."),
    ],
    [
      "it has no Apache License 2.0 text",
      has(/^\s*Apache License\n\s*Version 2\.0, January 2004$/m),
    ],
    ["it has no copy of our NOTICE", has(/^Halonic, Copyright \d{4} The Halonic Authors$/m)],
    ...sections.map((title) => [
      `it has no "${title}" section`,
      text.includes(`\n${title}\n${"-".repeat(title.length)}\n`),
    ]),
    ["it lists no androidx library", has(/^androidx\.[\w.]+:[\w.-]+ \d/m)],
    ["it lists no Android-only Rust crate (jni)", has(/^jni \d/m)],
  ];
  return checks.filter(([, passed]) => !passed).map(([problem]) => problem);
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
  const file = argv[2];
  if (file === undefined) {
    console.error("Usage: node check-notices.mjs <THIRD-PARTY-NOTICES.txt>");
    exit(2);
  }
  const problems = noticeProblems(readFileSync(file, "utf8"));
  for (const problem of problems) {
    console.log(
      `::error title=Third-party notices::The app's THIRD-PARTY-NOTICES.txt: ${problem}.`,
    );
  }
  if (problems.length > 0) exit(1);
  console.log(
    "The app's THIRD-PARTY-NOTICES.txt has our licence, the npm, Rust and Gradle sections.",
  );
}
