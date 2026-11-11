import type { SandboxBlock, SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostSandbox, AgentHostSession } from "./sandbox.ts";

/** A made-up folder; the stand-in passes paths on without reading them. */
const root = "/halonic-test";

const profile: SandboxProfile = {
  workingFolder: `${root}/acme/agents/writer`,
  tempFolder: `${root}/temp/run-1`,
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [`${root}/home/.ssh`],
  env: { PATH: "/usr/bin" },
  network: { bridge: { host: "127.0.0.1", port: 41817 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

const capabilities = { files: "shared", strength: "os" } as const;

/** A host whose sandbox opens `s1`, fenced. */
function hostWithSession(): FakeHost {
  return new FakeHost()
    .answer("GET /v1/sandbox/capabilities", ok(capabilities))
    .answer("POST /v1/sandbox/sessions/open", ok({ session: "s1", fence: { state: "fenced" } }))
    .answer("POST /v1/sandbox/sessions/close", ok({ closed: true }));
}

verifies("agent-host-client.sandbox", () => {
  describe("AgentHostSandbox", () => {
    it("answers its capabilities as the host did when it connected", async () => {
      const sandbox = await AgentHostSandbox.connect(hostWithSession());
      expect(sandbox.capabilities()).toEqual(capabilities);
    });

    it("answers check as the host does", async () => {
      const check = { ok: false, reason: "bubblewrap-missing", missing: ["bwrap"] };
      const host = hostWithSession().answer("GET /v1/sandbox/check", ok(check));
      const sandbox = await AgentHostSandbox.connect(host);
      expect(await sandbox.check()).toEqual(check);
    });

    it("opens a session in the host with the profile unchanged", async () => {
      const host = hostWithSession();
      const session = await (await AgentHostSandbox.connect(host)).open(profile);
      expect(host.calls).toContainEqual({
        route: "POST /v1/sandbox/sessions/open",
        body: { profile },
      });
      expect(session).toBeInstanceOf(AgentHostSession);
      expect((session as AgentHostSession).hostId).toBe("s1");
      expect(session.fence).toEqual({ state: "fenced" });
      expect(session.profile).toBe(profile);
    });

    it("throws the host's refusal with its status, kind and message", async () => {
      const host = hostWithSession().answer(
        "POST /v1/sandbox/sessions/open",
        refused(422, "sandbox_open_failed", "bubblewrap is missing"),
      );
      const sandbox = await AgentHostSandbox.connect(host);
      await expect(sandbox.open(profile)).rejects.toMatchObject({
        name: "AgentHostError",
        status: 422,
        kind: "sandbox_open_failed",
        message: "bubblewrap is missing",
      });
    });

    it("refuses an answer of the wrong shape", async () => {
      const host = new FakeHost().answer("GET /v1/sandbox/capabilities", ok({ files: "all" }));
      await expect(AgentHostSandbox.connect(host)).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });

    it("names the route and status when a refusal has no message", async () => {
      const host = new FakeHost().answer("GET /v1/sandbox/capabilities", { status: 500, body: "" });
      await expect(AgentHostSandbox.connect(host)).rejects.toThrow(
        "The agent host answered GET /v1/sandbox/capabilities with 500 (unknown).",
      );
    });
  });

  describe("AgentHostSession", () => {
    const fileBlock: SandboxBlock = {
      kind: "file",
      path: `${root}/home/.ssh/id_ed25519`,
      access: "read",
    };
    const networkBlock: SandboxBlock = { kind: "network", host: "example.com", port: 443 };

    it("passes each blocked access the host streams to every listener", async () => {
      const host = hostWithSession();
      const blocked = host.nextStream("POST /v1/sandbox/sessions/blocked");
      const session = await (await AgentHostSandbox.connect(host)).open(profile);
      const heard: SandboxBlock[] = [];
      session.onBlocked(() => {
        throw new Error("a listener that fails");
      });
      session.onBlocked((block) => heard.push(block));
      const stream = await blocked;
      expect(stream.body).toEqual({ session: "s1" });

      stream.send(fileBlock);
      stream.send({ kind: "file", path: 3 });
      stream.send(networkBlock);
      await expect.poll(() => heard).toEqual([fileBlock, networkBlock]);
    });

    it("stops listening when a listener says so", async () => {
      const host = hostWithSession();
      const blocked = host.nextStream("POST /v1/sandbox/sessions/blocked");
      const session = await (await AgentHostSandbox.connect(host)).open(profile);
      const heard: SandboxBlock[] = [];
      const stop = session.onBlocked((block) => heard.push(block));
      const stream = await blocked;
      stream.send(fileBlock);
      await expect.poll(() => heard).toHaveLength(1);
      stop();
      stream.send(networkBlock);
      stream.end();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(heard).toEqual([fileBlock]);
    });

    it("refuses to start a program itself", async () => {
      const session = await (await AgentHostSandbox.connect(hostWithSession())).open(profile);
      await expect(session.start({ program: "sh", args: [] })).rejects.toThrow(
        "This sandbox session is open in the agent host",
      );
    });

    it("closes in the host once, and stops its blocked stream", async () => {
      const host = hostWithSession();
      const blocked = host.nextStream("POST /v1/sandbox/sessions/blocked");
      const session = await (await AgentHostSandbox.connect(host)).open(profile);
      const stream = await blocked;
      await Promise.all([session.close(), session.close()]);
      await session.close();
      const closes = host.calls.filter((call) => call.route === "POST /v1/sandbox/sessions/close");
      expect(closes).toEqual([
        { route: "POST /v1/sandbox/sessions/close", body: { session: "s1" } },
      ]);
      expect(stream.signal.aborted).toBe(true);
    });

    it("counts a session the host has already closed as closed", async () => {
      const host = hostWithSession().answer(
        "POST /v1/sandbox/sessions/close",
        refused(404, "unknown_session", "The agent host has no open sandbox session with this id."),
      );
      const session = await (await AgentHostSandbox.connect(host)).open(profile);
      await expect(session.close()).resolves.toBeUndefined();
    });

    it("throws any other refusal to close", async () => {
      const host = hostWithSession().answer(
        "POST /v1/sandbox/sessions/close",
        refused(500, "internal", "The agent host failed."),
      );
      const session = await (await AgentHostSandbox.connect(host)).open(profile);
      await expect(session.close()).rejects.toMatchObject({ status: 500, kind: "internal" });
    });

    it("goes on without blocked accesses when the host refuses their stream", async () => {
      const host = hostWithSession().refuseStream(
        "POST /v1/sandbox/sessions/blocked",
        refused(404, "unknown_session", "gone"),
      );
      const session = await (await AgentHostSandbox.connect(host)).open(profile);
      session.onBlocked(() => {});
      await expect(session.close()).resolves.toBeUndefined();
    });
  });
});
