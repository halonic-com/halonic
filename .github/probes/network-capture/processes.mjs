// The session's processes on macOS, from `ps -axo pid=,ppid=,pgid=,comm=`
// samples taken all through the capture: the session's first process, every
// process in its process group, and every process started from those, at any
// depth (a child that moves to a group of its own is still caught by its
// parent).
// Usage: ps -axo pid=,comm= | node processes.mjs <samples> <session pid>
// prints the session's processes that are still running, one per line.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** One { pid, ppid, pgid, comm } per sample line. */
export function parseSamples(text) {
  return text.split("\n").flatMap((line) => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), comm: m[4] }] : [];
  });
}

/** The pids of the session that started as `root`. */
export function sessionPids(samples, root) {
  const pids = new Set([root]);
  for (const s of samples) if (s.pgid === root) pids.add(s.pid);
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of samples)
      if (pids.has(s.ppid) && !pids.has(s.pid)) {
        pids.add(s.pid);
        grew = true;
      }
  }
  return pids;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [samplesFile, root] = process.argv.slice(2);
  const samples = parseSamples(readFileSync(samplesFile, "utf8"));
  const pids = sessionPids(samples, Number(root));
  // A pid counts only with the program it had in the session, not a later
  // program that reuses it.
  const comms = new Set(samples.filter((s) => pids.has(s.pid)).map((s) => `${s.pid} ${s.comm}`));
  for (const line of readFileSync(0, "utf8").split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (m && comms.has(`${m[1]} ${m[2]}`)) console.log(`${m[1]} ${m[2]}`);
  }
}
