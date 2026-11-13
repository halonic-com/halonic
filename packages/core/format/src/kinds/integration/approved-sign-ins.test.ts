import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { approvedSignIns } from "../../index.ts";
import { parsedValue, yaml } from "../../test/parse.spec.ts";

function sheet(tokenUrl = '"https://auth.example.com/oauth/token"', hosts = "[api.example.com]") {
  return yaml(
    "id: example",
    "version: 1.0.0",
    "kit: 2",
    "provides: [connector]",
    `hosts: ${hosts}`,
    "secrets:",
    "  example-client:",
    "    purpose: The client secret of your Example app.",
    "signIns:",
    "  example-account:",
    "    purpose: Access to your Example account.",
    "    flow: oauth-code",
    '    authorizeUrl: "https://auth.example.com/oauth/authorize?audience=api"',
    `    tokenUrl: ${tokenUrl}`,
    '    revokeUrl: "https://revoke.example.com/oauth/revoke"',
    "    clientId: { fromSetting: clientId }",
    "    clientSecret: example-client",
    "    clientAuth: basic",
    "    scopes: [{ scope: projects.read, reason: Reads your projects. }]",
    "    access: { hosts: [api.example.com], as: bearer }",
  );
}

function approved(text: string, settings: Record<string, unknown>) {
  const resolved = approvedSignIns(parsedValue("integration", text), settings);
  return resolved.ok ? resolved.value["example-account"] : resolved.error;
}

verifies("format.integration-approved-sign-ins", () => {
  it("fills in the client ID, the scopes and the access hosts", () => {
    expect(approved(sheet(), { clientId: "abc123" })).toEqual({
      flow: "oauth-code",
      authorizeUrl: "https://auth.example.com/oauth/authorize?audience=api",
      tokenUrl: "https://auth.example.com/oauth/token",
      revokeUrl: "https://revoke.example.com/oauth/revoke",
      clientId: "abc123",
      clientAuth: "basic",
      clientSecretName: "example-client",
      scopes: ["projects.read"],
      accessHosts: ["api.example.com"],
      as: "bearer",
    });
  });

  it("carries revokeEndsClientGrants when the sheet says so and leaves the key out otherwise", () => {
    const text = sheet().replace(
      '    revokeUrl: "https://revoke.example.com/oauth/revoke"',
      '    revokeUrl: "https://revoke.example.com/oauth/revoke"\n    revokeEndsClientGrants: true',
    );
    expect(approved(text, { clientId: "abc123" })).toMatchObject({ revokeEndsClientGrants: true });
    expect(approved(sheet(), { clientId: "abc123" })).not.toHaveProperty("revokeEndsClientGrants");
  });

  it("turns a { fromSetting, path } URL into the setting's host and the path", () => {
    const text = sheet(
      "{ fromSetting: gitlab, path: /oauth/token }",
      "[{ fromSetting: gitlab, class: public }, api.example.com]",
    );
    expect(approved(text, { clientId: "abc123", gitlab: "https://git.example.com" })).toMatchObject(
      { tokenUrl: "https://git.example.com/oauth/token" },
    );
  });

  it("refuses a client ID setting that is missing or has a space", () => {
    const code = (settings: Record<string, unknown>) =>
      (approved(sheet(), settings) as { code: string }[])[0]?.code;
    expect(code({})).toBe("client-id-missing");
    expect(code({ clientId: "a b" })).toBe("client-id-invalid");
  });

  it("refuses a sign-in whose address setting is missing or outside its class", () => {
    const text = sheet(
      "{ fromSetting: gitlab, path: /oauth/token }",
      "[{ fromSetting: gitlab, class: public }, api.example.com]",
    );
    const codes = (settings: Record<string, unknown>) =>
      (approved(text, { clientId: "abc123", ...settings }) as { code: string }[]).map(
        (problem) => problem.code,
      );
    expect(codes({})).toContain("setting-missing");
    expect(codes({ gitlab: "http://192.168.1.5" })).toContain("setting-outside-class");
    expect(codes({ gitlab: "https://192.168.1.5" })).toContain("setting-outside-class");
  });

  it("refuses plain http for a sign-in's address", () => {
    const text = sheet(
      "{ fromSetting: gitlab, path: /oauth/token }",
      "[{ fromSetting: gitlab, class: public }, api.example.com]",
    );
    const problems = approved(text, { clientId: "abc123", gitlab: "http://git.example.com" });
    expect((problems as { code: string }[]).map((problem) => problem.code)).toContain(
      "plain-http-not-local",
    );
  });
});
