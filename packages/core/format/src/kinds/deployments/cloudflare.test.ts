import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseFile } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

/** A `deployments.yaml` with one deployment `cloud`, its `host` and extra lines under it. */
function cloud(host: string, ...lines: string[]): string {
  return yaml("deployments:", "  cloud:", "    name: Cloud", `    host: ${host}`, ...lines);
}

/** A Cloudflare deployment whose `cloudflare` block holds `lines`. */
function cloudflare(...lines: string[]): string {
  return cloud("cloudflare", "    cloudflare:", ...lines.map((line) => `      ${line}`));
}

/** The warnings of a file that must pass. */
function warningsOf(text: string): unknown[] {
  const parsed = parseFile("deployments", text);
  if (!parsed.ok) {
    expect.fail(`expected deployments to pass, got ${JSON.stringify(parsed.error)}`);
  }
  return [...parsed.value.warnings];
}

verifies("format.deployments-cloudflare", () => {
  it("reads the cloudflare and limits blocks as written, with no warnings", () => {
    const text = cloud(
      "cloudflare",
      "    stage: production",
      "    cloudflare:",
      "      worker: acme-halonic",
      "      domain: halonic.example.com",
      "      location: eu",
      "    limits:",
      "      dailyRequests: 50000",
    );
    expect(parsedValue("deployments", text).deployments["cloud"]).toEqual({
      name: "Cloud",
      host: "cloudflare",
      stage: "production",
      shadow: false,
      cloudflare: { worker: "acme-halonic", domain: "halonic.example.com", location: "eu" },
      limits: { dailyRequests: 50000 },
    });
    expect(warningsOf(text)).toEqual([]);
  });

  it("leaves both blocks out when the file does", () => {
    const deployment = parsedValue("deployments", cloud("local")).deployments["cloud"];
    expect(deployment).not.toHaveProperty("cloudflare");
    expect(deployment).not.toHaveProperty("limits");
  });

  it("needs a worker in the cloudflare block", () => {
    expect(summary(problemsOf("deployments", cloudflare("domain: halonic.example.com")))).toEqual([
      "deployments.cloud.cloudflare.worker invalid_type 5",
    ]);
  });

  it.each(["Acme", "-acme", "acme-", "acme_halonic", "acme.halonic"])(
    "refuses the worker name %s, saying why",
    (worker) => {
      const problems = problemsOf("deployments", cloudflare(`worker: "${worker}"`));
      expect(summary(problems)).toEqual(["deployments.cloud.cloudflare.worker invalid_format 6"]);
      expect(problems[0]?.message).toBe(
        "use lowercase letters, digits or '-', not at the start or end",
      );
    },
  );

  it("accepts a worker name of 63 characters and refuses 64, saying why", () => {
    expect(
      parsedValue("deployments", cloudflare(`worker: ${"a".repeat(63)}`)).deployments["cloud"]
        ?.cloudflare?.worker,
    ).toHaveLength(63);
    const problems = problemsOf("deployments", cloudflare(`worker: ${"a".repeat(64)}`));
    expect(summary(problems)).toEqual(["deployments.cloud.cloudflare.worker too_big 6"]);
    expect(problems[0]?.message).toContain("at most 63 characters");
  });

  it.each([
    "https://halonic.example.com",
    "Halonic.example.com",
    "localhost",
    "halonic.example.com/app",
    "halonic.example.com:8443",
    "-halonic.example.com",
    "10.0.0.1",
  ])("refuses the domain %s, saying what a domain looks like", (domain) => {
    const problems = problemsOf("deployments", cloudflare("worker: acme", `domain: "${domain}"`));
    expect(summary(problems)).toEqual(["deployments.cloud.cloudflare.domain invalid_format 7"]);
    expect(problems[0]?.message).toBe("use a lowercase host name such as halonic.example.com");
  });

  it.each(["halonic.example.com", "a.co", "eu-1.halonic.example.com", "halonic.xn--p1ai"])(
    "accepts the domain %s",
    (domain) => {
      const text = cloudflare("worker: acme", `domain: ${domain}`);
      expect(parsedValue("deployments", text).deployments["cloud"]?.cloudflare?.domain).toBe(
        domain,
      );
    },
  );

  it("refuses a domain longer than 253 characters", () => {
    const domain = `${Array.from({ length: 4 }, () => "a".repeat(63)).join(".")}.com`;
    const problems = problemsOf("deployments", cloudflare("worker: acme", `domain: ${domain}`));
    expect(summary(problems)).toEqual(["deployments.cloud.cloudflare.domain invalid_format 7"]);
  });

  it.each(["us", "EU", "weur"])("refuses the location %s", (location) => {
    const text = cloudflare("worker: acme", `location: ${location}`);
    expect(summary(problemsOf("deployments", text))).toEqual([
      "deployments.cloud.cloudflare.location invalid_value 7",
    ]);
  });

  it("refuses an unknown key in the cloudflare block, such as an account id", () => {
    const text = cloudflare("worker: acme", "accountId: abc");
    expect(summary(problemsOf("deployments", text))).toEqual([
      "deployments.cloud.cloudflare unrecognized_keys 6",
    ]);
  });

  it("refuses an unknown key in the limits block", () => {
    const text = cloud("local", "    limits:", "      monthlyRequests: 5");
    expect(summary(problemsOf("deployments", text))).toEqual([
      "deployments.cloud.limits unrecognized_keys 6",
    ]);
  });

  it.each(["0", "-1", "1.5", '"50000"'])("refuses dailyRequests: %s", (value) => {
    const text = cloud("local", "    limits:", `      dailyRequests: ${value}`);
    const problems = problemsOf("deployments", text);
    expect(problems.map((problem) => problem.path.join("."))).toEqual([
      "deployments.cloud.limits.dailyRequests",
    ]);
  });

  it("warns, without failing, about cloudflare settings on another host", () => {
    const text = cloud("local", "    cloudflare:", "      worker: acme");
    expect(warningsOf(text)).toEqual([
      {
        severity: "warning",
        source: "check",
        code: "cloudflare-settings-unused",
        path: ["deployments", "cloud", "cloudflare"],
        message: 'Deployment "cloud" runs on host "local", so its cloudflare settings are not used',
        line: 6,
        col: 7,
      },
    ]);
  });

  it("does not warn about limits on another host: the ceiling applies on every host", () => {
    expect(warningsOf(cloud("local", "    limits:", "      dailyRequests: 10"))).toEqual([]);
  });
});
