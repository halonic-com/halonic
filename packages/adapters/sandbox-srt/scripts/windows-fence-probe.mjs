// The two canary probes of the sandbox fence proof, run through the srt CLI
// on a real Windows machine (HAL-1919). A hidden file and a blocked loopback
// port: the fence holds only if the program inside cannot read the one or
// reach the other, and a control write shows the program ran at all.
//
// It works outside the user profile (RUNNER_TEMP in CI), because the sandbox
// account cannot look inside the profile of the user who ran the install.
// Run from this package after `windows-install`. Exit codes: 0 fenced, 1 a leak
// was observed, 2 or 3 the probes did not run (port in the proxy range, or the
// program inside gave no result), so a retry is allowed.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srtCli = join(packageDir, "node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js");

const root = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), "halonic-fence-"));
const work = join(root, "work");
const hidden = join(root, "hidden");
mkdirSync(work);
mkdirSync(hidden);
const canaryFile = join(hidden, "canary.txt");
writeFileSync(canaryFile, "canary");

// A loopback port the fence must block: srt only permits 60080-60089.
let connections = 0;
const server = createServer((socket) => {
  connections += 1;
  socket.destroy();
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const canaryPort = server.address().port;
if (canaryPort >= 60080 && canaryPort <= 60089) {
  console.error(`Port ${canaryPort} is inside the proxy range, so it proves nothing.`);
  process.exit(2);
}

// The program inside the fence. It prints one JSON line.
const child = join(work, "child.mjs");
writeFileSync(
  child,
  `import { readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
const result = { control: false, file: "unknown", port: "unknown" };
try { writeFileSync(${JSON.stringify(join(work, "control.txt"))}, "ran"); result.control = true; } catch {}
try { readFileSync(${JSON.stringify(canaryFile)}); result.file = "read"; } catch { result.file = "blocked"; }
await new Promise((done) => {
  const socket = connect({ host: "127.0.0.1", port: ${canaryPort} });
  const finish = (outcome) => { result.port = outcome; socket.destroy(); done(); };
  socket.setTimeout(5000, () => finish("blocked"));
  socket.on("connect", () => finish("reached"));
  socket.on("error", () => finish("blocked"));
});
console.log(JSON.stringify(result));
`,
);

const settings = join(root, "settings.json");
writeFileSync(
  settings,
  JSON.stringify({
    network: { allowedDomains: [], deniedDomains: [] },
    filesystem: {
      denyRead: [canaryFile],
      allowRead: [work],
      allowWrite: [work],
      denyWrite: [],
    },
  }),
);

// Async spawn: spawnSync would block the event loop, so the canary server could
// never count a connection made while srt runs.
const run = await new Promise((done) => {
  const proc = spawn(
    process.execPath,
    [srtCli, "-s", settings, "-c", `"${process.execPath}" "${child}"`],
    { timeout: 120_000 },
  );
  let stdout = "";
  let stderr = "";
  proc.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
  proc.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
  proc.on("error", () => done({ status: null, stdout, stderr }));
  proc.on("close", (status) => done({ status, stdout, stderr }));
});
await new Promise((done) => server.close(done));
console.log(`srt exit code: ${run.status}`);
console.log(`stdout: ${run.stdout}`);
console.log(`stderr: ${run.stderr}`);

// One pass/fail line per case, for the job summary (the job fails on a leak).
function writeSummary(cases) {
  const lines = cases.map(([name, ok]) => `- ${ok ? "PASS" : "FAIL"}: ${name}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Sandbox fence on Windows\n\n${lines.join("\n")}\n`,
    );
  }
}

let result;
try {
  result = JSON.parse(run.stdout.trim().split(/\r?\n/).pop());
} catch {
  // A host-side connection is an observed leak even when the child printed nothing.
  if (connections !== 0) {
    writeSummary([["canary port saw no connection", false]]);
    console.error(`NOT FENCED: the canary port saw ${connections} connection(s).`);
    process.exit(1);
  }
  writeSummary([["the program inside the sandbox gave a result", false]]);
  console.error(
    "NOT FENCED: the program inside the sandbox gave no result, so the probes did not run.",
  );
  process.exit(3);
}
writeSummary([
  ["control write worked", result.control === true],
  ["hidden file unreadable", result.file === "blocked"],
  ["canary port unreachable", result.port === "blocked"],
  ["canary port saw no connection", connections === 0],
]);
const problems = [];
if (!result.control)
  problems.push("the control write failed, so the program did not run as expected");
if (result.file !== "blocked") problems.push(`the hidden file was ${result.file}`);
if (result.port !== "blocked") problems.push(`the canary port was ${result.port}`);
if (connections !== 0) problems.push(`the canary port saw ${connections} connection(s)`);
if (problems.length > 0) {
  console.error(`NOT FENCED: ${problems.join("; ")}.`);
  process.exit(1);
}
console.log("FENCED: hidden file unreadable, canary port unreachable, control write worked.");
// Read the control file back from outside, to prove the write landed in the work folder.
console.log(`control file: ${readFileSync(join(work, "control.txt"), "utf8")}`);
