import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import cases from "./golden/server-session-cases.json" with { type: "json" };
import { buildServerSessionBrief } from "./server-session-brief.ts";
import {
  remoteRunCommand,
  remoteUploadCommand,
  renderServerSessionGuide,
  renderServerSessionLauncher,
} from "./server-session-launch.ts";
import { validateServerTarget } from "./server-target.ts";

const target = { host: "build.acme.example", user: "ops" };

/** Every line of a brief whose steps try every way into a command line. */
const hostileSteps = [
  "It's done'; rm -rf ~; echo '",
  'Say "$(id)" and `id` and $HOME',
  "Run it ; then && also | this > there",
  "-oProxyCommand=sh --dangerously-skip-permissions",
];

verifies("action-steppers.server-session-launch", () => {
  describe("validateServerTarget", () => {
    it.each(cases.hosts.valid)("takes the host %j", (host) => {
      expect(validateServerTarget({ host, user: "ops" }).ok).toBe(true);
    });
    it.each(cases.hosts.refused)("refuses the host %j", (host) => {
      expect(validateServerTarget({ host, user: "ops" }).ok).toBe(false);
    });
    it.each(cases.users.valid)("takes the user %j", (user) => {
      expect(validateServerTarget({ host: "build.acme.example", user }).ok).toBe(true);
    });
    it.each(cases.users.refused)("refuses the user %j", (user) => {
      expect(validateServerTarget({ host: "build.acme.example", user }).ok).toBe(false);
    });
    it.each(cases.ports.valid)("takes the port %j", (port) => {
      expect(validateServerTarget({ ...target, port }).ok).toBe(true);
    });
    it.each(cases.ports.refused)("refuses the port %j", (port) => {
      expect(validateServerTarget({ ...target, port }).ok).toBe(false);
    });
  });

  describe("renderServerSessionLauncher", () => {
    it("renders the shared golden launcher", () => {
      const { launcher } = cases;
      expect(renderServerSessionLauncher(launcher.target, launcher.task)).toEqual({
        ok: true,
        value: launcher.script.join("\n"),
      });
    });

    it("never holds the brief's text: the brief goes only to the file", () => {
      const block = {
        kind: "server-session" as const,
        task: "HAL-1234",
        steps: hostileSteps,
        doneWhen: "Done.",
      };
      const brief = buildServerSessionBrief(block, "Chief", "https://paperclip.acme.example");
      const script = renderServerSessionLauncher(target, "HAL-1234");
      expect(brief.ok && script.ok).toBe(true);
      for (const line of brief.ok ? brief.value.split("\n").filter(Boolean) : []) {
        expect(script.ok && script.value).not.toContain(line);
      }
    });

    it("refuses a refused host, user or task id instead of rendering it", () => {
      expect(
        renderServerSessionLauncher({ host: "-oProxyCommand=sh", user: "ops" }, "HAL-1").ok,
      ).toBe(false);
      expect(
        renderServerSessionLauncher({ host: "build.acme.example", user: "-l" }, "HAL-1").ok,
      ).toBe(false);
      for (const task of cases.tasks.refused) {
        expect(renderServerSessionLauncher(target, task).ok).toBe(false);
      }
    });
  });

  describe("the remote commands", () => {
    it("start claude with no flag, only the constant prompt that names the brief", () => {
      expect(remoteRunCommand("HAL-1234")).toBe(
        'claude "Read the file .halonic/briefs/HAL-1234.md and follow it."; rm -f .halonic/briefs/HAL-1234.md',
      );
      expect(remoteRunCommand("HAL-1234")).not.toMatch(
        /claude\s+-|--dangerously|--permission-mode/,
      );
    });

    it("sweep only old briefs in the brief folder, after the copy worked", () => {
      expect(remoteUploadCommand("HAL-1234")).toMatch(
        /&& cat > \.halonic\/briefs\/HAL-1234\.md && \{ find \.halonic\/briefs -maxdepth 1 -type f -name "HAL-\*\.md" -mmin \+60 -delete \|\| true; \}$/,
      );
    });
  });

  describe("renderServerSessionGuide", () => {
    it("tells the user how to do it by hand, with the server when it's known", () => {
      const guide = renderServerSessionGuide("Task: …", { ...target, port: 2222 });
      expect(guide.split("\n").slice(0, 3)).toEqual([
        "1. Open a terminal and run: ssh -p 2222 -- ops@build.acme.example",
        "2. On the server, run: claude",
        "3. Paste the brief below as your first message.",
      ]);
      expect(renderServerSessionGuide("Task: …")).toContain("ssh <user>@<your server>");
    });

    it("never names a refused server, so the user can't copy it into a command", () => {
      const guide = renderServerSessionGuide("Task: …", { host: "-oProxyCommand=sh", user: "ops" });
      expect(guide).toContain("ssh <user>@<your server>");
      expect(guide).not.toContain("ProxyCommand");
    });
  });
});
