import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

/** A Cloudflare account id as Cloudflare shows it: 32 lowercase hex characters. */
const ACCOUNT = "0123456789abcdef0123456789abcdef";

/** A Cloudflare deployment `cloud` whose `cloudflare` block holds `lines`. */
function cloudflare(...lines: string[]): string {
  return yaml(
    "deployments:",
    "  cloud:",
    "    name: Cloud",
    "    host: cloudflare",
    "    cloudflare:",
    ...lines.map((line) => `      ${line}`),
  );
}

verifies("format.deployments-cloudflare-account", () => {
  it("reads the account id as written, with the account's name as a comment", () => {
    const text = cloudflare("worker: acme", `account: ${ACCOUNT} # Acme Ltd`);
    expect(parsedValue("deployments", text).deployments["cloud"]?.cloudflare).toEqual({
      worker: "acme",
      account: ACCOUNT,
    });
  });

  it("leaves the account out when the file does", () => {
    const settings = parsedValue("deployments", cloudflare("worker: acme")).deployments["cloud"]
      ?.cloudflare;
    expect(settings).not.toHaveProperty("account");
  });

  it.each([
    ["the account's name", "Acme Ltd"],
    ["upper case", ACCOUNT.toUpperCase()],
    ["31 characters", ACCOUNT.slice(1)],
    ["33 characters", `${ACCOUNT}0`],
    ["a character that isn't hex", `${ACCOUNT.slice(1)}g`],
  ])("refuses %s, saying to use the id Cloudflare shows", (_case, account) => {
    const problems = problemsOf("deployments", cloudflare("worker: acme", `account: "${account}"`));
    expect(summary(problems)).toEqual(["deployments.cloud.cloudflare.account invalid_format 7"]);
    expect(problems[0]?.message).toBe(
      "use the 32-character account id Cloudflare shows, not the account's name",
    );
  });
});
