import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  ADDRESS_CLASSES,
  type AddressClass,
  type IntegrationSheet,
  integrationPolicy,
} from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

function fixture(name: string): IntegrationSheet {
  return parsedValue(
    "integration",
    readFileSync(join(import.meta.dirname, "fixtures", `${name}.yaml`), "utf8"),
  );
}

/** A sheet with one host of `addressClass` from the `url` setting, and a secret for it. */
function fromSetting(addressClass: AddressClass, optional: boolean): IntegrationSheet {
  return parsedValue(
    "integration",
    yaml(
      "id: mcp",
      "version: 1.0.0",
      "kit: 1",
      "provides: [connector]",
      `hosts: [{ fromSetting: url, class: ${addressClass} }]`,
      "secrets:",
      "  mcp-key:",
      "    purpose: key",
      "    hosts: [{ fromSetting: url }]",
      "    as: bearer",
      `    optional: ${optional}`,
    ),
  );
}

/** A sheet with one host of `addressClass` from the `url` setting, and no secret. */
function hostOnly(addressClass: AddressClass): IntegrationSheet {
  return parsedValue(
    "integration",
    yaml(
      "id: mcp",
      "version: 1.0.0",
      "kit: 1",
      "provides: [connector]",
      `hosts: [{ fromSetting: url, class: ${addressClass} }]`,
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
        secrets: {
          "gemini-key": {
            hosts: ["generativelanguage.googleapis.com"],
            placement: { as: "header", header: "x-goog-api-key" },
          },
        },
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

  it("gives each secret's placement as the sheet says, for the kit to hold the code to", () => {
    const sheet = parsedValue(
      "integration",
      yaml(
        "id: notes",
        "version: 1.0.0",
        "kit: 1",
        "provides: [connector]",
        "hosts: [api.example.com, oauth.example.com]",
        "secrets:",
        "  example-key:",
        "    purpose: key",
        "    hosts: [api.example.com]",
        "    as: header",
        "    header: Authorization",
        '    prefix: "Token "',
        "  client-secret:",
        "    purpose: secret",
        "    hosts: [oauth.example.com]",
        "    as: form",
        "    field: client_secret",
      ),
    );
    const { secrets } = resolve(sheet, {}).policy;
    expect(secrets["example-key"]?.placement).toEqual({
      as: "header",
      header: "Authorization",
      prefix: "Token ",
    });
    expect(secrets["client-secret"]?.placement).toEqual({ as: "form", field: "client_secret" });
  });

  it("resolves a host from an https setting, with the optional secret", () => {
    expect(
      resolve(fixture("knowledge-mcp"), { url: "https://MCP.example.com:443/sse?x=1" }),
    ).toEqual({
      policy: {
        name: "knowledge-mcp",
        hosts: ["mcp.example.com"],
        secrets: {
          "mcp-server-key": {
            hosts: ["mcp.example.com"],
            optional: true,
            placement: { as: "bearer" },
          },
        },
        tokens: [],
      },
    });
  });

  it("allows plain http to this machine, with a secret", () => {
    const { policy } = resolve(fromSetting("loopback", false), { url: "http://localhost:11434" });
    expect(policy.hosts).toEqual([]);
    expect(policy.localHosts).toEqual(["localhost:11434"]);
    expect(policy.secrets).toEqual({
      "mcp-key": { hosts: ["localhost:11434"], placement: { as: "bearer" } },
    });
  });

  it.each([false, true])(
    "refuses a secret over plain http to a private network, optional: %s",
    (optional) => {
      expect(
        problems(fromSetting("private", optional), { url: "http://192.168.1.5:8080/mcp" }),
      ).toEqual(["secrets.mcp-key.hosts.0 secret-over-plain-http"]);
    },
  );

  it("allows https to a private network, with the secret", () => {
    const { policy } = resolve(fromSetting("private", false), {
      url: "https://192.168.1.5:8443/mcp",
    });
    expect(policy.hosts).toEqual(["192.168.1.5:8443"]);
    expect(policy.secrets).toEqual({
      "mcp-key": { hosts: ["192.168.1.5:8443"], placement: { as: "bearer" } },
    });
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
    expect(problems(fromSetting("public", true), { url })).toEqual([
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
    expect(problems(fromSetting("public", true), settings)).toEqual([
      `hosts.0 ${code}`,
      `secrets.mcp-key.hosts.0 ${code}`,
    ]);
  });

  it("lets a secret go over plain http only to a whole loopback address", () => {
    const { policy } = resolve(fromSetting("loopback", false), { url: "http://127.8.9.10:8080" });
    expect(policy.secrets).toEqual({
      "mcp-key": { hosts: ["127.8.9.10:8080"], placement: { as: "bearer" } },
    });
    expect(problems(fromSetting("private", false), { url: "http://10.0.0.7" })).toEqual([
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
        "hosts: [{ fromSetting: toString, class: public }]",
      ),
    );
    expect(problems(sheet, {})).toEqual(["hosts.0 setting-missing"]);
  });

  it.each<[string, AddressClass]>([
    ["https://mcp.example.com", "public"],
    ["https://mcp.example.com:8443/path", "public"],
    ["HTTPS://Mcp.Example.COM:443", "public"],
    ["http://localhost:80/", "loopback"],
    ["http://LOCALHOST:3000", "loopback"],
    ["http://127.0.0.1:8080?q", "loopback"],
    ["http://10.0.0.7#top", "private"],
    ["http://[::1]:8080", "loopback"],
    ["http://[fd12:3456::1]", "private"],
    ["http://[fd00:0:0:1::]", "private"],
    ["https://[fd00::]", "private"],
    ["https://[fd01:0:0:2::3]", "private"],
    ["https://[fd01:db8::1:0:0:1]", "private"],
    ["https://[fd01:2:3:4:5:6:7:8]", "private"],
    ["https://[fd01:2:3:4:5:6:7:0]", "private"],
  ])("reads the host of %s as URL does", (url, addressClass) => {
    const { policy } = resolve(hostOnly(addressClass), { url });
    expect([...policy.hosts, ...(policy.localHosts ?? [])]).toEqual([new URL(url).host]);
  });
});

verifies("format.integration-host-class", () => {
  const sheetWith = (...lines: string[]) =>
    yaml("id: mcp", "version: 1.0.0", "kit: 1", "provides: [connector]", ...lines);

  it.each([
    ["hosts: [{ fromSetting: url }]", "hosts.0 invalid_union 5"],
    ["hosts: [{ fromSetting: url, class: anywhere }]", "hosts.0 invalid_union 5"],
  ])("refuses %s, which has no class it knows", (line, expected) => {
    expect(summary(problemsOf("integration", sheetWith(line)))).toEqual([expected]);
  });

  it("keeps the class in hosts, not in a secret's hosts", () => {
    const text = sheetWith(
      "hosts: [{ fromSetting: url, class: public }]",
      "secrets:",
      "  mcp-key:",
      "    purpose: key",
      "    hosts: [{ fromSetting: url, class: public }]",
      "    as: bearer",
    );
    expect(summary(problemsOf("integration", text))).toEqual([
      "secrets.mcp-key.hosts.0 unrecognized_keys 9",
    ]);
  });

  it.each<[AddressClass, string[], string[]]>([
    [
      "loopback",
      ["http://localhost:8080", "http://127.0.0.2", "https://[::1]:8443"],
      ["http://192.168.1.5", "https://mcp.example.com"],
    ],
    [
      "private",
      ["http://192.168.1.5:8123", "https://[fd12::1]"],
      ["http://localhost:8123", "https://nas.example.com", "https://[fe80::1]"],
    ],
    [
      "public",
      ["https://mcp.example.com"],
      [
        "https://localhost",
        "https://app.localhost",
        "https://10.0.0.7",
        "https://8.8.8.8",
        "https://[::]",
      ],
    ],
  ])("takes a %s setting only inside its class", (addressClass, inside, outside) => {
    for (const url of inside) {
      const { policy } = resolve(hostOnly(addressClass), { url });
      expect([...policy.hosts, ...(policy.localHosts ?? [])]).toEqual([new URL(url).host]);
    }
    for (const url of outside) {
      expect(problems(fromSetting(addressClass, true), { url })).toEqual([
        "hosts.0 setting-outside-class",
        "secrets.mcp-key.hosts.0 setting-outside-class",
      ]);
    }
  });

  it("refuses plain http to a public host before its class", () => {
    expect(problems(fromSetting("public", true), { url: "http://mcp.example.com" })).toEqual([
      "hosts.0 plain-http-not-local",
      "secrets.mcp-key.hosts.0 plain-http-not-local",
    ]);
  });

  it.each(["https://169.254.169.254", "https://[::]"])("refuses %s under every class", (url) => {
    for (const addressClass of ADDRESS_CLASSES) {
      expect(problems(fromSetting(addressClass, true), { url })).toEqual([
        "hosts.0 setting-outside-class",
        "secrets.mcp-key.hosts.0 setting-outside-class",
      ]);
    }
  });

  it("says what the class allows and the host it got", () => {
    const resolved = integrationPolicy(fromSetting("private", true), {
      url: "http://localhost:8123",
    });
    expect(resolved.ok ? [] : resolved.error.map((problem) => problem.message)).toEqual([
      'mcp: the setting "url" must hold a URL with a private network address (10/8, 172.16/12, 192.168/16 or fc00::/7), not localhost:8123',
      'mcp: the setting "url" must hold a URL with a private network address (10/8, 172.16/12, 192.168/16 or fc00::/7), not localhost:8123',
    ]);
  });
});
