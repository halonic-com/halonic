import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type IntegrationSheet, integrationPolicy } from "../../index.ts";
import { parsedValue, yaml } from "../../test/parse.spec.ts";

function fixture(name: string): IntegrationSheet {
  return parsedValue(
    "integration",
    readFileSync(join(import.meta.dirname, "fixtures", `${name}.yaml`), "utf8"),
  );
}

/** A sheet with one host from the `url` setting and a secret for it. */
function fromSetting(optional: boolean): IntegrationSheet {
  return parsedValue(
    "integration",
    yaml(
      "id: mcp",
      "version: 1.0.0",
      "kit: 1",
      "provides: [connector]",
      "hosts: [{ fromSetting: url }]",
      "secrets:",
      "  mcp-key:",
      "    purpose: key",
      "    hosts: [{ fromSetting: url }]",
      "    as: bearer",
      `    optional: ${optional}`,
    ),
  );
}

function resolve(sheet: IntegrationSheet, settings: Record<string, unknown>) {
  const resolved = integrationPolicy(sheet, settings);
  if (!resolved.ok) {
    expect.fail(`expected a policy, got ${JSON.stringify(resolved.error)}`);
  }
  return resolved.value;
}

function problems(sheet: IntegrationSheet, settings: Record<string, unknown>): string[] {
  const resolved = integrationPolicy(sheet, settings);
  if (resolved.ok) {
    expect.fail(`expected problems, got ${JSON.stringify(resolved.value)}`);
  }
  return resolved.error.map((problem) => `${problem.path.join(".")} ${problem.code}`);
}

describe("format.integration-policy", () => {
  it("gives fixed hosts, secrets, tokens and limits as the kit takes them", () => {
    expect(resolve(fixture("model-gemini"), {})).toEqual({
      policy: {
        name: "model-gemini",
        hosts: ["generativelanguage.googleapis.com"],
        secrets: { "gemini-key": { hosts: ["generativelanguage.googleapis.com"] } },
        tokens: [],
      },
      limits: { headersTimeoutMs: 600000 },
    });
    const tokens = parsedValue(
      "integration",
      yaml(
        "id: notes",
        "version: 1.0.0",
        "kit: 1",
        "provides: [connector]",
        "hosts: [api.example.com]",
        "tokens: [{ name: refresh, purpose: p }]",
      ),
    );
    expect(resolve(tokens, {}).policy.tokens).toEqual(["refresh"]);
  });

  it("resolves a host from an https setting, with the optional secret", () => {
    expect(
      resolve(fixture("knowledge-mcp"), { url: "https://MCP.example.com:443/sse?x=1" }),
    ).toEqual({
      policy: {
        name: "knowledge-mcp",
        hosts: ["mcp.example.com"],
        secrets: { "mcp-server-key": { hosts: ["mcp.example.com"], optional: true } },
        tokens: [],
      },
    });
  });

  it("allows plain http to this machine, with a secret", () => {
    const { policy } = resolve(fromSetting(false), { url: "http://localhost:11434" });
    expect(policy.hosts).toEqual([]);
    expect(policy.localHosts).toEqual(["localhost:11434"]);
    expect(policy.secrets).toEqual({ "mcp-key": { hosts: ["localhost:11434"] } });
  });

  it("allows plain http to a private network, but a secret only when it's optional", () => {
    expect(problems(fromSetting(false), { url: "http://192.168.1.5:8080/mcp" })).toEqual([
      "secrets.mcp-key.hosts.0 secret-over-plain-http",
    ]);
    const { policy } = resolve(fromSetting(true), { url: "http://192.168.1.5:8080/mcp" });
    expect(policy.localHosts).toEqual(["192.168.1.5:8080"]);
    expect(policy.secrets).toEqual({ "mcp-key": { hosts: ["192.168.1.5:8080"], optional: true } });
  });

  it.each([
    "http://mcp.example.com",
    "http://8.8.8.8",
    "http://169.254.169.254",
    "http://172.32.0.1",
    "http://127.example.com",
    "http://127.0.0.1.example.com",
    "http://10.example.com",
    "http://[::]",
  ])("refuses plain http to %s, which isn't local", (url) => {
    expect(problems(fromSetting(true), { url })).toEqual([
      "hosts.0 plain-http-not-local",
      "secrets.mcp-key.hosts.0 plain-http-not-local",
    ]);
  });

  it.each([
    [{}, "setting-missing"],
    [{ url: "" }, "setting-missing"],
    [{ url: 8080 }, "setting-missing"],
    [{ url: "ftp://mcp.example.com" }, "setting-not-a-url"],
    [{ url: "mcp.example.com" }, "setting-not-a-url"],
    [{ url: "https://user:pass@mcp.example.com" }, "setting-not-a-url"],
    [{ url: "https://mcp.example.com:99999" }, "setting-not-a-url"],
    [{ url: "https://mcp.example.com:0443" }, "setting-not-a-url"],
    [{ url: "https://127.1" }, "setting-not-a-url"],
    [{ url: "https://0x7f.0.0.1" }, "setting-not-a-url"],
    [{ url: "https://mcp_server.example.com" }, "setting-not-a-url"],
    [{ url: "http://[0:0:0:0:0:0:0:1]" }, "setting-not-a-url"],
    [{ url: "http://[0::1]" }, "setting-not-a-url"],
    [{ url: "http://[::0001]" }, "setting-not-a-url"],
    [{ url: "http://[::ffff:127.0.0.1]" }, "setting-not-a-url"],
    [{ url: "https://[1:2:3:4:5:6:7::]" }, "setting-not-a-url"],
    [{ url: "https://[1:0:0:2:0:0:0:3]" }, "setting-not-a-url"],
    [{ url: "https://[2001:db8:0:0:1::1]" }, "setting-not-a-url"],
    [{ url: "https://[1::2:3:4:5:6:7:8]" }, "setting-not-a-url"],
    [{ url: "https://[1:2:3:4:5:6:7]" }, "setting-not-a-url"],
    [{ url: "https://[1::2::3]" }, "setting-not-a-url"],
    [{ url: "https://[:1::]" }, "setting-not-a-url"],
  ])("refuses the setting %j", (settings, code) => {
    expect(problems(fromSetting(true), settings)).toEqual([
      `hosts.0 ${code}`,
      `secrets.mcp-key.hosts.0 ${code}`,
    ]);
  });

  it("lets a secret go over plain http only to a whole loopback address", () => {
    const { policy } = resolve(fromSetting(false), { url: "http://127.8.9.10:8080" });
    expect(policy.secrets).toEqual({ "mcp-key": { hosts: ["127.8.9.10:8080"] } });
    expect(problems(fromSetting(false), { url: "http://10.0.0.7" })).toEqual([
      "secrets.mcp-key.hosts.0 secret-over-plain-http",
    ]);
  });

  it("doesn't read a setting from the object's prototype", () => {
    const sheet = parsedValue(
      "integration",
      yaml(
        "id: mcp",
        "version: 1.0.0",
        "kit: 1",
        "provides: [connector]",
        "hosts: [{ fromSetting: toString }]",
      ),
    );
    expect(problems(sheet, {})).toEqual(["hosts.0 setting-missing"]);
  });

  it.each([
    "https://mcp.example.com",
    "https://mcp.example.com:8443/path",
    "HTTPS://Mcp.Example.COM:443",
    "http://localhost:80/",
    "http://LOCALHOST:3000",
    "http://127.0.0.1:8080?q",
    "http://10.0.0.7#top",
    "http://[::1]:8080",
    "http://[fd12:3456::1]",
    "http://[fd00:0:0:1::]",
    "https://[::]",
    "https://[1:0:0:2::3]",
    "https://[2001:db8::1:0:0:1]",
    "https://[1:2:3:4:5:6:7:8]",
    "https://[1:2:3:4:5:6:7:0]",
  ])("reads the host of %s as URL does", (url) => {
    const { policy } = resolve(fromSetting(true), { url });
    expect([...policy.hosts, ...(policy.localHosts ?? [])]).toEqual([new URL(url).host]);
  });
});
