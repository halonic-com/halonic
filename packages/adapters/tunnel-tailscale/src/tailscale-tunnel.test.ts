import type { TunnelConfig, TunnelStatus } from "@halonicjs/ports";
import { tunnelProviderContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { nodeName, ScriptedRunner } from "./scripted-runner.test-helper.ts";
import { TailscaleTunnel } from "./tailscale-tunnel.ts";

const config: TunnelConfig = { gateway: { host: "127.0.0.1", port: 4100 } };

tunnelProviderContract("tailscale", async () => ({
  provider: new TailscaleTunnel({ runner: new ScriptedRunner() }),
  config,
}));

const failedExit = { kind: "done", code: 1, stdout: "", stderr: "" } as const;

/** The tunnel's current status: the first of a new stream. */
async function currentStatus(tunnel: TailscaleTunnel): Promise<TunnelStatus> {
  for await (const status of tunnel.status()) return status;
  throw new Error("the status stream ended without a status");
}

/** Starts a tunnel on `runner` and expects it to go down with `reason`. */
async function expectDown(runner: ScriptedRunner, reason: string): Promise<void> {
  const tunnel = new TailscaleTunnel({ runner });
  await expect(tunnel.start(config)).rejects.toThrow(reason);
  expect(await currentStatus(tunnel)).toMatchObject({ state: "down", reason });
}

verifies("tunnel-tailscale.provider", () => {
  describe("TailscaleTunnel", () => {
    it("serves the gateway on the tailnet over HTTPS and gives a wss endpoint", async () => {
      const runner = new ScriptedRunner();
      const tunnel = new TailscaleTunnel({ runner });
      const endpoint = await tunnel.start(config);
      expect(endpoint).toEqual({
        providerId: "tailscale",
        url: `wss://${nodeName}:8443`,
        public: false,
      });
      expect(runner.calls).toContainEqual([
        "serve",
        "--bg",
        "--https=8443",
        "http://127.0.0.1:4100",
      ]);
      expect(await tunnel.capabilities()).toEqual({
        id: "tailscale",
        public: false,
        encryptsPath: true,
      });
    });

    it("writes no port for 443 and brackets a ::1 gateway", async () => {
      const runner = new ScriptedRunner();
      const tunnel = new TailscaleTunnel({ runner, servePort: 443 });
      const endpoint = await tunnel.start({ gateway: { host: "::1", port: 4100 } });
      expect(endpoint.url).toBe(`wss://${nodeName}`);
      expect(runner.calls).toContainEqual(["serve", "--bg", "--https=443", "http://[::1]:4100"]);
    });

    it("never builds a funnel, sign-in or reset command, nor one that carries a key", async () => {
      const runner = new ScriptedRunner();
      const tunnel = new TailscaleTunnel({ runner });
      await tunnel.start(config);
      await tunnel.stop();
      const words = runner.calls.flat();
      for (const banned of ["funnel", "up", "login", "reset", "--authkey"]) {
        expect(words).not.toContain(banned);
      }
      expect(words.some((word) => /key/i.test(word))).toBe(false);
    });

    it("refuses a port where Funnel is on, without adding an entry", async () => {
      const funnel = { AllowFunnel: { [`${nodeName}:8443`]: true } };
      const runner = new ScriptedRunner({
        "serve-status": { kind: "done", code: 0, stdout: JSON.stringify(funnel), stderr: "" },
      });
      await expectDown(runner, "public-refused");
      expect(runner.calls.some((call) => call.includes("--bg"))).toBe(false);
    });

    it("leaves the person's own entry on its port alone", async () => {
      const own = { TCP: { "8443": { HTTPS: true } } };
      const runner = new ScriptedRunner({
        "serve-status": { kind: "done", code: 0, stdout: JSON.stringify(own), stderr: "" },
      });
      await expectDown(runner, "provider-error");
      expect(runner.calls.map((call) => call.join(" "))).toEqual([
        "status --json",
        "serve status --json",
      ]);
    });

    it("is signed-out when the node needs a sign-in, and offline when it isn't running", async () => {
      const status = (state: string) => ({
        kind: "done" as const,
        code: 0,
        stdout: JSON.stringify({ BackendState: state }),
        stderr: "",
      });
      await expectDown(new ScriptedRunner({ status: status("NeedsLogin") }), "signed-out");
      await expectDown(new ScriptedRunner({ status: status("Stopped") }), "offline");
      await expectDown(new ScriptedRunner({ status: failedExit }), "offline");
    });

    it("is not-installed without the program, and a provider-error when it hangs", async () => {
      await expectDown(new ScriptedRunner({ status: { kind: "missing" } }), "not-installed");
      const hung = { kind: "failed", why: "tailscale didn't answer within 10000 ms." } as const;
      await expectDown(new ScriptedRunner({ status: hung }), "provider-error");
      await expectDown(new ScriptedRunner({ "serve-add": hung }), "provider-error");
    });

    it("refuses a tailnet name a URL could misread", async () => {
      const odd = JSON.stringify({
        BackendState: "Running",
        Self: { DNSName: "a@evil.io.", Online: true },
      });
      await expectDown(
        new ScriptedRunner({ status: { kind: "done", code: 0, stdout: odd, stderr: "" } }),
        "provider-error",
      );
    });

    it("removes only its own entry on stop, and nothing when it added none", async () => {
      const runner = new ScriptedRunner();
      const tunnel = new TailscaleTunnel({ runner });
      await tunnel.stop();
      expect(runner.calls).toEqual([]);
      await tunnel.start(config);
      await tunnel.stop();
      expect(runner.calls.at(-1)).toEqual(["serve", "--https=8443", "off"]);
    });

    it("takes its entry away again when a stop comes while it is being added", async () => {
      const runner = new ScriptedRunner();
      let release = () => {};
      runner.holdAdd = new Promise((resolve) => {
        release = resolve;
      });
      const tunnel = new TailscaleTunnel({ runner });
      const started = tunnel.start(config);
      const rejected = expect(started).rejects.toThrow("stopped before it was ready");
      await Promise.resolve();
      while (!runner.calls.some((call) => call.includes("--bg"))) await Promise.resolve();
      const stopped = tunnel.stop();
      release();
      await rejected;
      await stopped;
      expect(runner.calls.at(-1)).toEqual(["serve", "--https=8443", "off"]);
      expect(await currentStatus(tunnel)).toMatchObject({ state: "down", reason: "stopped" });
    });

    it("leaves an entry the person put on its port since alone on stop", async () => {
      const runner = new ScriptedRunner();
      const tunnel = new TailscaleTunnel({ runner });
      await tunnel.start(config);
      runner.served = { hostPort: `${nodeName}:8443`, target: "http://127.0.0.1:3000" };
      await tunnel.stop();
      expect(runner.calls.some((call) => call.includes("off"))).toBe(false);
      expect(runner.served).toEqual({
        hostPort: `${nodeName}:8443`,
        target: "http://127.0.0.1:3000",
      });
    });

    it("removes nothing, and says so, when the serve config can't be read at stop", async () => {
      const runner = new ScriptedRunner();
      const tunnel = new TailscaleTunnel({ runner });
      await tunnel.start(config);
      runner.script = { "serve-status": failedExit };
      await expect(tunnel.stop()).rejects.toThrow("couldn't be read");
      expect(runner.calls.some((call) => call.includes("off"))).toBe(false);
    });

    it("says so when its entry couldn't be removed", async () => {
      const runner = new ScriptedRunner({ "serve-off": failedExit });
      const tunnel = new TailscaleTunnel({ runner });
      await tunnel.start(config);
      await expect(tunnel.stop()).rejects.toThrow("couldn't be removed");
      expect(await currentStatus(tunnel)).toMatchObject({ state: "down", reason: "stopped" });
    });

    it("can start again after a start that went down", async () => {
      const runner = new ScriptedRunner({ status: { kind: "missing" } });
      const tunnel = new TailscaleTunnel({ runner });
      await expect(tunnel.start(config)).rejects.toThrow("not-installed");
      runner.script = {};
      await expect(tunnel.start(config)).resolves.toMatchObject({ providerId: "tailscale" });
    });
  });
});

verifies("tunnel-tailscale.tailnet-host", () => {
  describe("TailscaleTunnel for the host", () => {
    it("is installed when the program runs, signed in or not, and not without it", async () => {
      expect(await new TailscaleTunnel({ runner: new ScriptedRunner() }).installed()).toBe(true);
      const signedOut = new ScriptedRunner({ status: failedExit });
      expect(await new TailscaleTunnel({ runner: signedOut }).installed()).toBe(true);
      const missing = new ScriptedRunner({ status: { kind: "missing" } });
      expect(await new TailscaleTunnel({ runner: missing }).installed()).toBe(false);
      const hung = new ScriptedRunner({ status: { kind: "failed", why: "timed out" } });
      expect(await new TailscaleTunnel({ runner: hung }).installed()).toBe(false);
    });

    it("gives the Host a phone's request carries through the tunnel", async () => {
      const runner = new ScriptedRunner();
      expect(await new TailscaleTunnel({ runner }).tailnetHosts()).toEqual([`${nodeName}:8443`]);
      expect(await new TailscaleTunnel({ runner, servePort: 443 }).tailnetHosts()).toEqual([
        nodeName,
        `${nodeName}:443`,
      ]);
    });

    it("gives no name when the node isn't usable", async () => {
      const offline = JSON.stringify({ BackendState: "Stopped" });
      for (const status of [
        { kind: "missing" } as const,
        failedExit,
        { kind: "done", code: 0, stdout: offline, stderr: "" } as const,
      ]) {
        expect(
          await new TailscaleTunnel({ runner: new ScriptedRunner({ status }) }).tailnetHosts(),
        ).toEqual([]);
      }
    });
  });
});
