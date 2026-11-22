import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseFile } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

/** A `deployments.yaml` with one deployment `web` whose `users` block holds `lines`. */
function users(...lines: string[]): string {
  return yaml(
    "deployments:",
    "  web:",
    "    name: Web",
    "    users:",
    ...lines.map((line) => `      ${line}`),
  );
}

/** The warnings of a file that must pass. */
function warningsOf(text: string): unknown[] {
  const parsed = parseFile("deployments", text);
  if (!parsed.ok) {
    expect.fail(`expected deployments to pass, got ${JSON.stringify(parsed.error)}`);
  }
  return [...parsed.value.warnings];
}

verifies("format.deployments-users", () => {
  it("leaves a deployment without a users block as before", () => {
    const value = parsedValue("deployments", yaml("deployments:", "  web:", "    name: Web"));
    expect(value.deployments["web"]).not.toHaveProperty("users");
  });

  it("fills in mode owner and meter none for an empty block", () => {
    const text = yaml("deployments:", "  web:", "    name: Web", "    users: {}");
    const value = parsedValue("deployments", text);
    expect(value.deployments["web"]?.users).toEqual({ mode: "owner", meter: "none" });
  });

  it("reads mode, meter and config limits as written, with action stop by default", () => {
    const text = users(
      "mode: many",
      "meter: config",
      "config:",
      "  limits:",
      "    - { unit: cost, amount: 20, period: month }",
      "    - { unit: harnessMinutes, amount: 600, period: month, action: notify }",
    );
    expect(parsedValue("deployments", text).deployments["web"]?.users).toEqual({
      mode: "many",
      meter: "config",
      config: {
        limits: [
          { unit: "cost", amount: 20, period: "month", action: "stop" },
          { unit: "harnessMinutes", amount: 600, period: "month", action: "notify" },
        ],
      },
    });
    expect(warningsOf(text)).toEqual([]);
  });

  it("accepts meter cloud with its product", () => {
    const text = users("mode: many", "meter: cloud", "cloud:", "  product: prod_acme_code");
    expect(parsedValue("deployments", text).deployments["web"]?.users?.cloud).toEqual({
      product: "prod_acme_code",
    });
  });

  it.each([
    ["mode: everyone", "deployments.web.users.mode invalid_value 5"],
    ["meter: stripe", "deployments.web.users.meter invalid_value 5"],
    ["seats: 5", "deployments.web.users unrecognized_keys 5"],
  ])("refuses %s", (line, expected) => {
    expect(summary(problemsOf("deployments", users(line)))).toEqual([expected]);
  });

  it.each([
    ["unit: minutes, amount: 5, period: day", "unit"],
    ["unit: runs, amount: 0, period: day", "amount"],
    ["unit: runs, amount: -1, period: day", "amount"],
    ["unit: runs, amount: 5, period: week", "period"],
    ["unit: runs, amount: 5, period: day, action: warn", "action"],
  ])("refuses the limit { %s } at its %s", (limit, field) => {
    const text = users("meter: config", "config:", "  limits:", `    - { ${limit} }`);
    const problems = problemsOf("deployments", text);
    expect(problems.map((problem) => problem.path.join("."))).toEqual([
      `deployments.web.users.config.limits.0.${field}`,
    ]);
  });

  it.each([
    ["prod acme", "use letters, digits, '_' or '-'"],
    ["https://cloud.example.com/acme", "use letters, digits, '_' or '-'"],
    ["a".repeat(65), "use at most 64 characters"],
  ])("refuses the product id %s, saying why", (product, reason) => {
    const text = users("meter: cloud", "cloud:", `  product: "${product}"`);
    const problems = problemsOf("deployments", text);
    expect(problems.map((problem) => problem.path.join("."))).toEqual([
      "deployments.web.users.cloud.product",
    ]);
    expect(problems[0]?.message).toContain(reason);
  });

  it("refuses meter cloud without a product, at the meter's line", () => {
    const [problem, ...others] = problemsOf("deployments", users("meter: cloud"));
    expect(others).toEqual([]);
    expect(problem).toMatchObject({
      severity: "error",
      code: "users-cloud-product-missing",
      path: ["deployments", "web", "users", "meter"],
      message: 'Deployment "web" uses meter "cloud", so it needs users.cloud.product',
      line: 5,
    });
  });

  it("refuses a second limit on the same unit and period, at the second one", () => {
    const text = users(
      "meter: config",
      "config:",
      "  limits:",
      "    - { unit: cost, amount: 20, period: month }",
      "    - { unit: cost, amount: 5, period: day }",
      "    - { unit: cost, amount: 30, period: month }",
    );
    const [problem, ...others] = problemsOf("deployments", text);
    expect(others).toEqual([]);
    expect(problem).toMatchObject({
      code: "users-limit-repeated",
      path: ["deployments", "web", "users", "config", "limits", 2],
      message: 'Deployment "web" already has a limit on cost per month',
      line: 10,
    });
  });

  it("warns, without failing, about settings for a meter the deployment doesn't use", () => {
    const text = users(
      "meter: none",
      "config:",
      "  limits: []",
      "cloud:",
      "  product: prod_acme_code",
    );
    expect(warningsOf(text)).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "users-meter-settings-unused",
        path: ["deployments", "web", "users", "config"],
        message: 'Deployment "web" uses meter "none", so its users.config settings are not used',
      }),
      expect.objectContaining({
        code: "users-meter-settings-unused",
        path: ["deployments", "web", "users", "cloud"],
        message: 'Deployment "web" uses meter "none", so its users.cloud settings are not used',
      }),
    ]);
  });
});
