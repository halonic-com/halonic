import { readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { delimiter, dirname, join } from "node:path";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { plainGit, repositoryWith, Scratch, testRunner } from "../src/fixtures.test-helper.ts";
import { makeRunCheckout, makeRunCheckoutFence, type RunCheckoutFence } from "../src/index.ts";

/**
 * A run's program, started in a real sandbox session on a real run
 * checkout, trying what a hostile one would: planting a git hook or setting
 * that the host's next git command would run, changing the shared
 * repository the checkout borrows its objects from, writing outside the
 * checkout, and reaching the network. Like `sandbox-srt`'s fence tests, these need
 * a machine where the sandbox starts, and run with `pnpm test:fence`.
 *
 * The fence decides reads by what it denies, so the one host secret is
 * denied here, as Halonic's data folder is in a run.
 */
const sandbox = new SrtSandbox();

/** What a host-only server answers; the program must never read it. */
const hostBody = "host-only-body";

/** A variable only the host has; the program must never see it. */
const hostCanary = { name: "HALONIC_RUN_CHECKOUT_CANARY", value: "host-only-canary-value" };

/** Runs `script` in the session and returns what it printed, its errors too. */
async function run(session: SandboxSession, script: string): Promise<string> {
  const started = await session.start({ program: "sh", args: ["-c", `(${script}) 2>&1`] });
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of started.stdout) text += decoder.decode(chunk, { stream: true });
  await started.exited;
  return text + decoder.decode();
}

/** A server on this computer's loopback that answers every request with {@link hostBody}. */
async function listeningServer(): Promise<{ server: Server; port: number }> {
  const server = createServer((_request, response) => response.end(hostBody));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

const scratch = new Scratch();

describe("a run's program trying to get out of its sandbox session", () => {
  let base: string;
  let shared: string;
  let checkout: string;
  let fence: RunCheckoutFence;
  let session: SandboxSession;
  let host: { server: Server; port: number };
  let sharedBefore: string;

  const inBase = (...parts: string[]) => join(base, ...parts);

  /** What says the shared repository is untouched: its refs and the object list. */
  async function sharedState(): Promise<string> {
    return (
      (await plainGit(shared, ["for-each-ref"])) + (await plainGit(shared, ["count-objects", "-v"]))
    );
  }

  beforeAll(async () => {
    shared = await repositoryWith(scratch, { "tool.txt": "the tool" });
    base = await scratch.folder();
    checkout = inBase("run");
    const start = (await plainGit(shared, ["rev-parse", "HEAD"])).trim();
    sharedBefore = await sharedState();

    const runner = await testRunner(scratch);
    await makeRunCheckout(runner, {
      shared,
      folder: checkout,
      branch: "acme/task-1",
      start,
      remote: "https://example.com/acme/app.git",
    });
    await runner.close();
    fence = await makeRunCheckoutFence(checkout);

    await writeFile(inBase("secret.txt"), "host-secret");
    await writeFile(inBase("outside.txt"), "outside-original");
    host = await listeningServer();
    process.env[hostCanary.name] = hostCanary.value;

    session = await sandbox.open({
      workingFolder: checkout,
      tempFolder: fence.tempFolder,
      settingsFolder: null,
      readOnlyPaths: fence.readOnlyPaths,
      deniedPaths: [inBase("secret.txt")],
      env: {
        HOME: fence.tempFolder,
        PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter),
        ...fence.env,
      },
      network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
      timeLimitMs: 120_000,
    });
  });

  afterAll(async () => {
    delete process.env[hostCanary.name];
    await session?.close();
    host?.server.close();
    await scratch.remove();
  });

  it("writes in its checkout and its temp folder, which a run needs to work", async () => {
    const output = await run(
      session,
      `echo mine > ${checkout}/notes.txt && echo cache > ${fence.env.TURBO_CACHE_DIR}/entry && echo temp > ${fence.tempFolder}/file && echo ok`,
    );
    expect(output.trim()).toBe("ok");
    expect(await readFile(join(checkout, "notes.txt"), "utf8")).toBe("mine\n");
  });

  it("can't plant a git hook or change the checkout's settings, which the host's git would run", async () => {
    const config = await readFile(join(checkout, ".git", "config"), "utf8");
    const hook = join(checkout, ".git", "hooks", "pre-commit");
    const settings = join(checkout, ".git", "config");
    await run(session, `echo '#!/bin/sh' > ${hook}`);
    await run(
      session,
      `printf '[core]\\n\\tfsmonitor = touch ${inBase("pwned")}\\n' >> ${settings}`,
    );
    await expect(stat(hook)).rejects.toThrow();
    expect(await readFile(settings, "utf8")).toBe(config);
    await plainGit(checkout, ["status", "--porcelain"]);
    await expect(stat(inBase("pwned"))).rejects.toThrow();
  });

  it("can't change the shared repository it borrows its objects from", async () => {
    await run(session, `echo ${"1".repeat(40)} > ${shared}/.git/refs/heads/planted`);
    await run(
      session,
      `echo changed > ${shared}/tool.txt; echo '#!/bin/sh' > ${shared}/.git/hooks/pre-commit`,
    );
    expect(await sharedState()).toBe(sharedBefore);
    expect(await readFile(join(shared, "tool.txt"), "utf8")).toBe("the tool");
    await expect(stat(join(shared, ".git", "hooks", "pre-commit"))).rejects.toThrow();
  });

  it("can't write outside the checkout or read a host secret", async () => {
    await run(session, `echo changed > ${inBase("outside.txt")}`);
    expect(await readFile(inBase("outside.txt"), "utf8")).toBe("outside-original");
    expect(await run(session, `cat ${inBase("secret.txt")}`)).not.toContain("host-secret");
  });

  it("can't reach a server on this computer or on the internet", async () => {
    const probe = (url: string) =>
      run(
        session,
        `'${process.execPath}' -e 'fetch(process.argv[1]).then(r => r.text()).then(t => console.log("reached:" + t), e => console.log("refused:" + e.message))' ${url}`,
      );
    const local = await probe(`http://127.0.0.1:${host.port}/`);
    const outside = await probe("http://example.com/");
    expect(local).not.toContain(hostBody);
    expect(outside).not.toContain("Example Domain");
    expect(local + outside).toMatch(/refused:|reached:/);
  });

  it("doesn't get the host's environment", async () => {
    const env = await run(session, "env");
    expect(env).toContain(`TMPDIR=${fence.tempFolder}`);
    expect(env).not.toContain(hostCanary.name);
    expect(env).not.toContain(hostCanary.value);
  });
});
