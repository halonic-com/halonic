import { type ChildProcess, spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { allowSrtLoopbackListener, w9Violations } from "./own-sockets.test-helper.ts";

/**
 * The W9 check, tried on programs that open the sockets it must catch, and
 * on one that opens the one it allows. /proc is Linux's, so on macOS
 * there is nothing to try.
 */
const onLinux = process.platform === "linux";

const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
});

/**
 * Starts a program that runs `code` and then waits, and gives its pid once
 * it says it is ready, a moment after its sockets have had time to open. `label` rides in its command line, so the check sees
 * what a real srt process shows (`sandbox-runtime/dist/cli.js`).
 */
async function start(code: string, label = "fake-program"): Promise<number> {
  const child = spawn(
    process.execPath,
    ["-e", `${code}\nsetTimeout(()=>console.log("ready"),300);setInterval(()=>{},1e6)`, label],
    {
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  children.push(child);
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.stdout?.once("data", () => resolve());
  });
  return child.pid ?? 0;
}

const listenTcp = (host: string) =>
  `require("net").createServer().listen(0, ${JSON.stringify(host)});`;
const srt = "/x/node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js";

describe.skipIf(!onLinux)("the W9 check", () => {
  it("passes a program with a filesystem socket only", async () => {
    const pid = await start(
      `require("net").createServer().listen(require("path").join(require("os").tmpdir(), "w9-" + process.pid + ".sock"));`,
    );
    expect(await w9Violations(pid)).toEqual([]);
  });

  it("fails a TCP listener on every address, IPv4 and IPv6, in a program that isn't srt", async () => {
    for (const host of ["127.0.0.1", "0.0.0.0", "::", "::1"]) {
      const pid = await start(listenTcp(host));
      expect(await w9Violations(pid), host).toHaveLength(1);
    }
  });

  it("fails an IPv4-mapped listener", async () => {
    const pid = await start(listenTcp("::ffff:127.0.0.1"));
    expect(await w9Violations(pid)).toHaveLength(1);
  });

  it("fails a UDP socket, IPv4 and IPv6", async () => {
    for (const type of ["udp4", "udp6"]) {
      const pid = await start(`require("dgram").createSocket("${type}").bind(0);`);
      expect(await w9Violations(pid), type).toHaveLength(1);
    }
  });

  it("fails an abstract Unix socket", async () => {
    const pid = await start(`require("net").createServer().listen("\\0w9-" + process.pid);`);
    expect(await w9Violations(pid)).toHaveLength(1);
  });

  it("fails a listener in a program started by the one it checks", async () => {
    const pid = await start(
      `require("child_process").spawn(process.execPath, ["-e", ${JSON.stringify(`${listenTcp("127.0.0.1")}setInterval(()=>{},1e6)`)}], { stdio: "ignore" });
       require("child_process").execSync("sleep 0.5");`,
    );
    expect(await w9Violations(pid)).toHaveLength(1);
  });

  it("allows srt's one listener on 127.0.0.1 while the exception stands", async () => {
    expect(allowSrtLoopbackListener).toBe(true);
    const pid = await start(listenTcp("127.0.0.1"), srt);
    expect(await w9Violations(pid)).toEqual([]);
  });

  it("fails srt's listener on any other address, a second one, and a UDP socket", async () => {
    for (const code of [
      listenTcp("0.0.0.0"),
      listenTcp("::"),
      listenTcp("::ffff:127.0.0.1"),
      `${listenTcp("127.0.0.1")}${listenTcp("127.0.0.1")}`,
      `${listenTcp("127.0.0.1")}require("dgram").createSocket("udp4").bind(0);`,
    ]) {
      const pid = await start(code, srt);
      expect(await w9Violations(pid), code).toHaveLength(1);
    }
  });

  it("doesn't widen the exception: a program that isn't srt still fails on 127.0.0.1", async () => {
    const pid = await start(listenTcp("127.0.0.1"), "not-srt");
    expect(await w9Violations(pid)).toHaveLength(1);
  });
});
