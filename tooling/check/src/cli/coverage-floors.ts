import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  type FloorsByManifest,
  loweredFloorMessage,
  loweredFloors,
  lowerFloorLabel,
  readFloor,
} from "../lib/coverage-floor-diff.ts";

/**
 * Fails when a pull request lowers a package's coverage floor compared with
 * the target branch. Run as `coverage-floors.ts <base-sha> <head-sha>` inside
 * a clone that has both commits. The `coverage-floor-lowered` label on the
 * pull request (read from the event file) allows it.
 */

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function floorsAt(commit: string): FloorsByManifest {
  const floors = new Map<string, ReturnType<typeof readFloor>>();
  const files = git("ls-tree", "-r", "--name-only", commit)
    .split("\n")
    .filter((file) => /(^|\/)package\.json$/.test(file) && !file.includes("node_modules/"));
  for (const file of files) {
    const floor = readFloor(git("show", `${commit}:${file}`));
    if (floor !== undefined) {
      floors.set(file, floor);
    }
  }
  return floors as FloorsByManifest;
}

function labels(eventPath = process.env["GITHUB_EVENT_PATH"]): string[] {
  if (eventPath === undefined || eventPath === "") {
    return [];
  }
  const event = JSON.parse(readFileSync(eventPath, "utf8")) as {
    pull_request?: { labels?: { name?: string }[] };
  };
  return (event.pull_request?.labels ?? []).flatMap((label) => label.name ?? []);
}

if (import.meta.main) {
  const [base, head] = process.argv.slice(2);
  if (base === undefined || head === undefined) {
    console.error("coverage-floors: usage: coverage-floors.ts <base-sha> <head-sha>");
    process.exit(2);
  }
  const lowered = loweredFloors(floorsAt(base), floorsAt(head));
  if (lowered.length === 0) {
    console.log("coverage-floors: no floor went down.");
  } else if (labels().includes(lowerFloorLabel)) {
    console.log(
      `coverage-floors: ${lowered.length} floor value(s) lowered, allowed by the "${lowerFloorLabel}" label.`,
    );
  } else {
    console.error(loweredFloorMessage(lowered));
    process.exitCode = 1;
  }
}
