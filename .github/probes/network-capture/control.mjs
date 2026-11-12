// The control for the network capture: one HTTPS fetch of example.com, made
// at the end of the session while the session's capture still runs. It writes
// what the report needs to find its packets to <out>: its pid, when it
// started, and the local port and address of its connection. Exits 1 when the
// fetch fails.
// Usage: control.mjs <out.json>
import { writeFileSync } from "node:fs";
import https from "node:https";

const out = process.argv[2];
const result = { pid: process.pid, start: Date.now(), ok: false };
const done = (error) => {
  if (error) result.error = String(error.message ?? error);
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
};

const req = https.get("https://example.com/", { agent: false, timeout: 20_000 }, (res) => {
  result.status = res.statusCode;
  res.resume();
  res.on("end", () => {
    result.ok = true;
    done();
  });
});
req.on("socket", (socket) =>
  socket.once("connect", () => {
    result.localPort = socket.localPort;
    result.address = socket.remoteAddress;
  }),
);
req.on("timeout", () => req.destroy(new Error("timed out after 20 s")));
req.on("error", done);
