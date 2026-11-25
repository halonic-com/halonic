import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test } from "vitest";
import { type GuardDeps, type PluginAnswer, redirectMessage, runGuard } from "./guard.ts";
import type { GuardedCommand } from "./match.ts";
import { pluginAsker, pluginKey, realGh, routeUrl } from "./node.ts";

/** A wrapper whose `gh` and plugin are fakes; records what ran and what was printed. */
function fakeGuard(
  args: string,
  options: { answer?: PluginAnswer; agentId?: string | undefined } = {},
) {
  const ran: string[][] = [];
  const asked: GuardedCommand[] = [];
  const printed: string[] = [];
  const deps: GuardDeps = {
    args: args.split(" "),
    agentId: "agentId" in options ? options.agentId : "agent-priya",
    context: {
      ghRepo: undefined,
      remotes: () => new Map([["origin", "https://github.com/halonic-com/halonic.git"]]),
    },
    askPlugin: async (command) => {
      asked.push(command);
      return options.answer;
    },
    runGh: async (ghArgs) => {
      ran.push([...ghArgs]);
      return 3;
    },
    writeError: (text) => printed.push(text),
  };
  return { deps, ran, asked, printed };
}

verifies("paperclip.gh-guard", () => {
  describe("the wrapper", () => {
    test("answers a status read with the tool call when the plugin says so", async () => {
      const fake = fakeGuard("pr checks 5208", { answer: { redirect: true } });
      expect(await runGuard(fake.deps)).toBe(1);
      expect(fake.ran).toEqual([]);
      expect(fake.asked).toEqual(["pr checks"]);
      const text = fake.printed.join("");
      expect(text).toContain('pr_status({"pr": 5208})');
      expect(text).toContain("select:mcp__paperclip-assigned__halonic_agent-tools_pr_status");
    });

    test("names the workspace plugin's my_prs for a list, and my_prs for the number when the read named none", () => {
      const list = redirectMessage({
        command: "pr list",
        repo: "halonic-com/halonic",
        pr: undefined,
        tool: "my_prs",
      });
      expect(list).toContain("  my_prs()\n");
      expect(list).toContain("select:mcp__paperclip-assigned__halonic-ws_company_my_prs");
      const checks = redirectMessage({
        command: "pr checks",
        repo: "halonic-com/halonic",
        pr: undefined,
        tool: "pr_status",
      });
      expect(checks).toContain('pr_status({"pr": <number>})');
      expect(checks).toContain("my_prs() lists your pull requests with their numbers.");
    });

    test.each([
      ["the plugin says no", { answer: { redirect: false } }],
      ["the plugin doesn't answer", {}],
    ])("runs gh with its arguments and exit code when %s", async (_why, options) => {
      const fake = fakeGuard("pr checks 5208", options);
      expect(await runGuard(fake.deps)).toBe(3);
      expect(fake.ran).toEqual([["pr", "checks", "5208"]]);
      expect(fake.printed).toEqual([]);
    });

    test("doesn't ask the plugin about a call it doesn't answer, or outside an agent's run", async () => {
      const other = fakeGuard("pr view 5208 --json body", { answer: { redirect: true } });
      expect(await runGuard(other.deps)).toBe(3);
      const notAgent = fakeGuard("pr checks 5208", {
        answer: { redirect: true },
        agentId: undefined,
      });
      expect(await runGuard(notAgent.deps)).toBe(3);
      expect([...other.asked, ...notAgent.asked]).toEqual([]);
    });
  });

  describe("asking the plugin", () => {
    const env = { apiUrl: "http://paperclip.test/api/", apiKey: "run-key", companyId: "acme" };

    test("posts the command to the plugin's route with the run's key", async () => {
      const sent: { url: string; init: RequestInit | undefined }[] = [];
      const ask = pluginAsker(env, async (url, init) => {
        sent.push({ url: String(url), init });
        return new Response(JSON.stringify({ redirect: true }), { status: 200 });
      });
      expect(await ask("pr view")).toEqual({ redirect: true });
      expect(sent[0]?.url).toBe(
        `http://paperclip.test/api/plugins/${pluginKey}/api/gh-guard?companyId=acme`,
      );
      expect(sent[0]?.init?.method).toBe("POST");
      expect(sent[0]?.init?.body).toBe(JSON.stringify({ subcommand: "pr view" }));
      expect(new Headers(sent[0]?.init?.headers).get("authorization")).toBe("Bearer run-key");
    });

    test("gives no answer for an error, a refusal, a body it can't read or a missing key", async () => {
      const failing = pluginAsker(env, async () => {
        throw new Error("connection refused");
      });
      const refusing = pluginAsker(env, async () => new Response("{}", { status: 404 }));
      const garbled = pluginAsker(env, async () => new Response("<html>", { status: 200 }));
      const keyless = pluginAsker({ ...env, apiKey: undefined }, async () => {
        throw new Error("must not be asked");
      });
      for (const ask of [failing, refusing, garbled, keyless]) {
        expect(await ask("pr checks")).toBeUndefined();
      }
    });

    test("the route's address, with or without /api on the base", () => {
      expect(routeUrl("http://h:3100", "c 1")).toBe(
        `http://h:3100/api/plugins/${pluginKey}/api/gh-guard?companyId=c%201`,
      );
      expect(routeUrl("http://h:3100/api", "c")).toBe(routeUrl("http://h:3100/", "c"));
    });
  });

  describe("finding the real gh", () => {
    let root: string | undefined;
    afterEach(() => {
      if (root !== undefined) rmSync(root, { recursive: true, force: true });
      root = undefined;
    });

    test("skips the wrapper itself, a link to it, and folders without an executable gh", () => {
      root = mkdtempSync(join(tmpdir(), "gh-guard-"));
      const folder = (name: string) => {
        const path = join(root ?? "", name);
        mkdirSync(path);
        return path;
      };
      const wrapperDir = folder("wrapper");
      const linkDir = folder("link");
      const plainDir = folder("plain");
      const realDir = folder("real");
      const wrapper = join(wrapperDir, "gh");
      writeFileSync(wrapper, "#!/bin/sh\n");
      chmodSync(wrapper, 0o755);
      symlinkSync(wrapper, join(linkDir, "gh"));
      writeFileSync(join(plainDir, "gh"), "not executable");
      writeFileSync(join(realDir, "gh"), "#!/bin/sh\n");
      chmodSync(join(realDir, "gh"), 0o755);
      const path = ["", wrapperDir, linkDir, plainDir, realDir].join(delimiter);
      expect(realGh(path, wrapper)).toBe(join(realDir, "gh"));
      expect(realGh([wrapperDir, linkDir].join(delimiter), wrapper)).toBeUndefined();
    });
  });
});
