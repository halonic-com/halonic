import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { integrationPolicy } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

/** The sign-in of the design, as a sheet; each test changes or adds lines. */
function sheet(
  options: { kit?: number; signIn?: string[]; hosts?: string; secrets?: string[] } = {},
) {
  return yaml(
    "id: example",
    "version: 1.0.0",
    `kit: ${options.kit ?? 2}`,
    "provides: [connector]",
    `hosts: ${options.hosts ?? "[api.example.com]"}`,
    "secrets:",
    ...(options.secrets ?? [
      "  example-client:",
      "    purpose: The client secret of your Example app.",
    ]),
    "signIns:",
    ...(options.signIn ?? signIn()),
  );
}

/** The lines of `example-account`, with these lines replacing the ones that start with their key. */
function signIn(changes: Record<string, string> = {}): string[] {
  const fields: Record<string, string> = {
    purpose: "Access to your Example account.",
    flow: "oauth-code",
    authorizeUrl: "https://auth.example.com/oauth/authorize",
    tokenUrl: "https://auth.example.com/oauth/token",
    revokeUrl: "https://revoke.example.com/oauth/revoke",
    clientId: "{ fromSetting: clientId }",
    clientSecret: "example-client",
    scopes: "[{ scope: projects.read, reason: Reads your projects. }]",
    access: "{ hosts: [api.example.com], as: bearer }",
    ...changes,
  };
  return [
    "  example-account:",
    ...Object.entries(fields).flatMap(([key, value]) =>
      value === "" ? [] : [`    ${key}: ${value}`],
    ),
  ];
}

function codes(text: string): string[] {
  return summary(problemsOf("integration", text)).map((line) => line.split(" ")[1] ?? "");
}

verifies("format.integration-sign-ins", () => {
  it("reads the sign-in of the design, with clientAuth defaulting to post", () => {
    const parsed = parsedValue("integration", sheet());
    expect(parsed.signIns["example-account"]?.clientAuth).toBe("post");
    expect(parsed.signIns["example-account"]?.access).toEqual({
      hosts: ["api.example.com"],
      as: "bearer",
    });
  });

  it("refuses signIns below kit 2", () => {
    expect(codes(sheet({ kit: 1 }))).toEqual(["sign-ins-need-kit-2"]);
  });

  it("has no form placement for a token", () => {
    const form = signIn({ access: "{ hosts: [api.example.com], as: form }" });
    expect(problemsOf("integration", sheet({ signIn: form })).length).toBeGreaterThan(0);
  });

  it("refuses an access host the sheet doesn't list", () => {
    const other = signIn({ access: "{ hosts: [other.example.com], as: bearer }" });
    expect(codes(sheet({ signIn: other }))).toEqual(["sign-in-host-not-declared"]);
  });

  describe("the URLs", () => {
    it("takes extra authorize parameters but not the ones Halonic sets", () => {
      const url = (query: string) =>
        sheet({ signIn: signIn({ authorizeUrl: `"https://auth.example.com/authorize${query}"` }) });
      parsedValue("integration", url("?audience=api&prompt=consent"));
      for (const query of [
        "?redirect_uri=x",
        "?a=1&State=x",
        "?%63lient_id=x",
        "?scope=a",
        "?code_challenge=x",
      ]) {
        expect(codes(url(query)), query).toEqual(["sign-in-reserved-parameter"]);
      }
    });

    it("refuses plain http, and a query on the other URLs", () => {
      const tokenUrl = (value: string) => sheet({ signIn: signIn({ tokenUrl: `"${value}"` }) });
      expect(
        problemsOf("integration", tokenUrl("http://auth.example.com/token")).length,
      ).toBeGreaterThan(0);
      expect(codes(tokenUrl("https://auth.example.com/token?x=1"))).toEqual(["sign-in-url-query"]);
    });

    it("reads a self-hosted host from a public setting only", () => {
      const gitlab = (addressClass: string) =>
        sheet({
          hosts: `[{ fromSetting: gitlab, class: ${addressClass} }, api.example.com]`,
          signIn: signIn({ tokenUrl: "{ fromSetting: gitlab, path: /oauth/token }" }),
        });
      parsedValue("integration", gitlab("public"));
      expect(codes(gitlab("private"))).toEqual(["sign-in-setting-not-public"]);
    });
  });

  describe("the client secret", () => {
    it("refuses one that has hosts, is undeclared, is shared or is unused", () => {
      const withHosts = [
        "  example-client:",
        "    purpose: p",
        "    hosts: [api.example.com]",
        "    as: bearer",
      ];
      expect(codes(sheet({ secrets: withHosts }))).toEqual(["client-secret-has-hosts"]);
      expect(codes(sheet({ secrets: ["  other:", "    purpose: p"] }))).toEqual([
        "client-secret-not-declared",
        "client-secret-unused",
      ]);
      const twice = [
        ...signIn(),
        ...signIn().map((line) => line.replace("example-account", "second")),
      ];
      expect(codes(sheet({ signIn: twice }))).toEqual(["client-secret-shared"]);
      expect(codes(sheet({ signIn: signIn({ clientSecret: "" }) }))).toEqual([
        "client-secret-unused",
      ]);
    });
  });

  describe("the policy", () => {
    it("gives the access hosts and placement, and the client secret only the token and revoke hosts", () => {
      const resolved = integrationPolicy(parsedValue("integration", sheet()), {});
      expect(resolved.ok && resolved.value.policy.signIns).toEqual({
        "example-account": {
          hosts: ["api.example.com"],
          as: "bearer",
          clientSecret: {
            name: "example-client",
            hosts: ["auth.example.com", "revoke.example.com"],
          },
        },
      });
      expect(resolved.ok && resolved.value.policy.secrets).toEqual({});
    });

    it("resolves a { fromSetting } token host from its setting", () => {
      const text = sheet({
        hosts: "[{ fromSetting: gitlab, class: public }, api.example.com]",
        signIn: signIn({ tokenUrl: "{ fromSetting: gitlab, path: /oauth/token }", revokeUrl: "" }),
      });
      const resolved = integrationPolicy(parsedValue("integration", text), {
        gitlab: "https://git.example.com",
      });
      expect(
        resolved.ok && resolved.value.policy.signIns["example-account"]?.clientSecret?.hosts,
      ).toEqual(["git.example.com"]);
    });

    it("keeps a header placement with its prefix", () => {
      const header = signIn({
        access: "{ hosts: [api.example.com], as: header, header: x-token, prefix: 'Token ' }",
      });
      const resolved = integrationPolicy(parsedValue("integration", sheet({ signIn: header })), {});
      expect(resolved.ok && resolved.value.policy.signIns["example-account"]).toMatchObject({
        as: "header",
        header: "x-token",
        prefix: "Token ",
      });
    });
  });
});
