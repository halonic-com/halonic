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

verifies("format.plugin-backend-sign-ins", () => {
  it("refuses a backend that declares a sign-in, at the sign-in", () => {
    const signIns = [
      "  signIns:",
      "    example-account:",
      "      purpose: Access to your Example account.",
      "      flow: oauth-code",
      "      authorizeUrl: https://auth.example.com/authorize",
      "      tokenUrl: https://auth.example.com/token",
      "      clientId: example-app-id",
      "      access: { hosts: [api.example.com], as: bearer }",
    ];
    const problems = problemsOf("plugin", plugin(...signIns));
    expect(problems.map(({ code, path }) => [code, path.join(".")])).toEqual([
      ["backend-sign-in", "backend.signIns.example-account"],
    ]);
  });

  it("passes a backend without sign-ins", () => {
    expect(parseFile("plugin", plugin()).ok).toBe(true);
  });
});
