import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseFile } from "../../index.ts";
import { problemsOf, yaml } from "../../test/parse.spec.ts";

/** The text of a plugin whose backend has the lines of `extra`, with `sdk: 2` so a sign-in passes the sheet's own check. */
function plugin(...extra: string[]): string {
  return yaml(
    "id: weather",
    "version: 1.0.0",
    "sdk: 2",
    "name: Weather",
    "backend:",
    "  hosts: [api.example.com]",
    ...extra,
  );
}

const signIn = [
  "  signIns:",
  "    example-account:",
  "      purpose: Access to your Example account.",
  "      flow: oauth-code",
  "      authorizeUrl: https://auth.example.com/authorize",
  "      tokenUrl: https://auth.example.com/token",
  "      clientId: example-app-id",
  "      access: { hosts: [api.example.com], as: bearer }",
];

verifies("format.plugin-backend-sign-ins", () => {
  it("passes a backend that declares a sign-in", () => {
    expect(parseFile("plugin", plugin(...signIn)).ok).toBe(true);
  });

  it("checks a backend's sign-in as a sheet's, at its place under backend", () => {
    const revoked = [...signIn, "      revokeUrl: https://revoke.example.net/revoke"];
    const problems = problemsOf("plugin", plugin(...revoked).replace("sdk: 2", "sdk: 1"));
    expect(problems.map(({ code, path }) => [code, path.join(".")])).toEqual([
      ["sign-ins-need-kit-2", "sdk"],
      ["sign-in-revoke-host", "backend.signIns.example-account.revokeUrl"],
    ]);
    expect(problems[0]?.message).toBe(
      'Plugin "weather": signIns need sdk: 2 or higher, and this plugin says sdk: 1. Set sdk: 2',
    );
  });

  it("passes a backend without sign-ins", () => {
    expect(parseFile("plugin", plugin()).ok).toBe(true);
  });
});
