import type { HttpClient } from "@halonicjs/ports";
import { err } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkPinnedLaunch, spawnFor } from "./connector-pin.ts";

const registryUrl = "https://registry.npmjs.org/";

/** A registry that answers every request with `body`. */
function answering(body: unknown): HttpClient {
  return { fetch: async () => new Response(JSON.stringify(body)) };
}

function npx(registry: "npm" | "pypi" = "npm") {
  return {
    kind: "stdio" as const,
    command: registry === "npm" ? "npx" : "uvx",
    args: ["mail-mcp"],
    env: {},
    pin: { registry, registryUrl, package: "mail-mcp", version: "2.3.1" },
  };
}

verifies("memory.connector-client", () => {
  it("refuses an answer that isn't a package document, without failing on its shape", async () => {
    for (const body of [null, "2.3.1", { name: "mail-mcp", versions: null }, { versions: {} }]) {
      expect(await checkPinnedLaunch(npx(), answering(body))).toEqual(
        err(`${registryUrl} doesn't list mail-mcp 2.3.1`),
      );
    }
    for (const body of [null, { info: null }, { info: { name: "mail-mcp" } }]) {
      expect(await checkPinnedLaunch(npx("pypi"), answering(body))).toEqual(
        err(`${registryUrl} doesn't list mail-mcp 2.3.1`),
      );
    }
  });

  it("asks under the registry address without doubling its trailing slash", async () => {
    const asked: string[] = [];
    const http: HttpClient = {
      fetch: async (url) => {
        asked.push(url);
        return new Response("{}", { status: 404 });
      },
    };
    await checkPinnedLaunch(npx(), http);
    await checkPinnedLaunch(npx("pypi"), http);
    expect(asked).toEqual([
      "https://registry.npmjs.org/mail-mcp",
      "https://registry.npmjs.org/pypi/mail-mcp/2.3.1/json",
    ]);
  });

  it("spawns a program without a pin as configured, on top of everything it inherits", () => {
    const { pin: _pin, ...unpinned } = npx();
    const inherited = { PATH: "/usr/bin", npm_config_registry: "https://npm.acme.test" };
    expect(spawnFor({ ...unpinned, env: { MAIL_ACCOUNT: "acme" } }, null, inherited)).toEqual({
      command: "npx",
      args: ["mail-mcp"],
      env: { ...inherited, MAIL_ACCOUNT: "acme" },
    });
  });

  it("names the pinned version only once, keeping a later bare name such as uvx's command", () => {
    const transport = { ...npx("pypi"), args: ["--from", "Mail_MCP", "mail-mcp"] };
    expect(spawnFor(transport, transport.pin, {}).args).toEqual([
      "--from",
      "mail-mcp==2.3.1",
      "mail-mcp",
    ]);
  });
});
