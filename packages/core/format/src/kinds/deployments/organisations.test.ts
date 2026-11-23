import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseFile } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

const ORG = "org_acme0000000000001";
const OTHER_ORG = "org_acme0000000000002";
const ANNA = "eu_anna000000000001";
const BEN = "eu_ben0000000000001";

/** A `deployments.yaml` whose deployment `web` has `meter: config` and a `config` block of `lines`. */
function config(...lines: string[]): string {
  return yaml(
    "deployments:",
    "  web:",
    "    name: Web",
    "    users:",
    "      mode: many",
    "      meter: config",
    "      config:",
    ...lines.map((line) => `        ${line}`),
  );
}

/** A `config` block with one organisation `ORG` of `lines` (its keys after `id`). */
function organisation(...lines: string[]): string {
  return config(
    "limits: [{ unit: runs, amount: 5, period: day }]",
    "organisations:",
    `  - id: ${ORG}`,
    ...lines.map((line) => `    ${line}`),
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
  it("leaves a config block without organisations as before", () => {
    const text = config("limits: [{ unit: runs, amount: 5, period: day }]");
    expect(parsedValue("deployments", text).deployments["web"]?.users?.config).not.toHaveProperty(
      "organisations",
    );
  });

  it("reads an organisation with its pool, concurrency and members, with no warnings", () => {
    const text = organisation(
      "limits: [{ unit: cost, amount: 100, period: month }]",
      "concurrency: 4",
      "members:",
      `  - { actor: ${ANNA}, role: owner }`,
      `  - actor: ${BEN}`,
      "    role: member",
      "    limits: [{ unit: cost, amount: 100, period: month, action: notify }]",
      "    concurrency: 4",
    );
    expect(
      parsedValue("deployments", text).deployments["web"]?.users?.config?.organisations,
    ).toEqual([
      {
        id: ORG,
        limits: [{ unit: "cost", amount: 100, period: "month", action: "stop" }],
        concurrency: 4,
        members: [
          { actor: ANNA, role: "owner" },
          {
            actor: BEN,
            role: "member",
            limits: [{ unit: "cost", amount: 100, period: "month", action: "notify" }],
            concurrency: 4,
          },
        ],
      },
    ]);
    expect(warningsOf(text)).toEqual([]);
  });

  it.each([
    ["id: org_short", "id"],
    ["id: team_acme0000000000001", "id"],
    ["concurrency: 0", "concurrency"],
    ["concurrency: 1.5", "concurrency"],
    ["seats: 5", ""],
  ])("refuses an organisation with %s", (line, field) => {
    const text = config(
      "organisations:",
      `  - ${line.startsWith("id:") ? line : `id: ${ORG}`}`,
      ...(line.startsWith("id:") ? [] : [`    ${line}`]),
      `    members: [{ actor: ${ANNA}, role: owner }]`,
    );
    const paths = problemsOf("deployments", text).map((problem) => problem.path.join("."));
    expect(paths).toEqual([
      `deployments.web.users.config.organisations.0${field ? `.${field}` : ""}`,
    ]);
  });

  it.each([
    ["{ actor: eu_short, role: owner }", "actor", "use 'eu_' and 16 to 40 letters or digits"],
    [`{ actor: ${ANNA}, role: boss }`, "role", ""],
    [`{ actor: ${ANNA}, role: owner, concurrency: 0 }`, "concurrency", ""],
  ])("refuses the member %s at its %s", (member, field, reason) => {
    const problems = problemsOf("deployments", organisation(`members: [${member}]`));
    expect(problems.map((problem) => problem.path.join("."))).toEqual([
      `deployments.web.users.config.organisations.0.members.0.${field}`,
    ]);
    expect(problems[0]?.message).toContain(reason);
  });

  it("refuses an organisation without an owner, at its members", () => {
    const text = organisation(`members: [{ actor: ${ANNA}, role: admin }]`);
    expect(problemsOf("deployments", text)).toEqual([
      expect.objectContaining({
        code: "users-organisation-owner-missing",
        path: ["deployments", "web", "users", "config", "organisations", 0, "members"],
        message: `Organisation "${ORG}" needs at least one member with role "owner"`,
      }),
    ]);
    expect(summary(problemsOf("deployments", organisation("members: []")))).toEqual([
      "deployments.web.users.config.organisations.0.members users-organisation-owner-missing 11",
    ]);
  });

  it("refuses a person listed twice in one organisation, at the second entry", () => {
    const text = organisation(
      "members:",
      `  - { actor: ${ANNA}, role: owner }`,
      `  - { actor: ${ANNA}, role: member }`,
    );
    expect(problemsOf("deployments", text)).toEqual([
      expect.objectContaining({
        code: "users-member-repeated",
        path: ["deployments", "web", "users", "config", "organisations", 0, "members", 1, "actor"],
        message: `Organisation "${ORG}" already has member "${ANNA}"`,
      }),
    ]);
  });

  it("accepts one person in two organisations, and refuses an organisation id listed twice", () => {
    const member = `    members: [{ actor: ${ANNA}, role: owner }]`;
    const two = (second: string) =>
      config(
        "limits: [{ unit: runs, amount: 5, period: day }]",
        "organisations:",
        `  - id: ${ORG}`,
        member,
        `  - id: ${second}`,
        member,
      );
    expect(warningsOf(two(OTHER_ORG))).toEqual([]);
    expect(problemsOf("deployments", two(ORG))).toEqual([
      expect.objectContaining({
        code: "users-organisation-repeated",
        path: ["deployments", "web", "users", "config", "organisations", 1, "id"],
        message: `Deployment "web" already has organisation "${ORG}"`,
      }),
    ]);
  });

  it("refuses a member's limit with no pool limit on its unit and period", () => {
    const text = organisation(
      "limits: [{ unit: cost, amount: 100, period: month }]",
      "members:",
      `  - { actor: ${ANNA}, role: owner, limits: [{ unit: cost, amount: 5, period: day }] }`,
    );
    expect(problemsOf("deployments", text)).toEqual([
      expect.objectContaining({
        code: "users-member-limit-outside-pool",
        path: [
          "deployments",
          "web",
          "users",
          "config",
          "organisations",
          0,
          "members",
          0,
          "limits",
          0,
        ],
        message: `Member "${ANNA}" has a limit on cost per day, but organisation "${ORG}" has none to share`,
      }),
    ]);
  });

  it("refuses a member's limit above the pool's amount", () => {
    const text = organisation(
      "limits: [{ unit: cost, amount: 100, period: month }]",
      "members:",
      `  - { actor: ${ANNA}, role: owner, limits: [{ unit: cost, amount: 120, period: month }] }`,
    );
    expect(problemsOf("deployments", text)).toEqual([
      expect.objectContaining({
        code: "users-member-limit-above-pool",
        path: [
          ...["deployments", "web", "users", "config", "organisations", 0],
          ...["members", 0, "limits", 0, "amount"],
        ],
        message: `Member "${ANNA}" may use 120 cost per month, more than organisation "${ORG}" has in all (100)`,
      }),
    ]);
  });

  it("refuses a pool limit and a member's limit given twice on one unit and period", () => {
    const text = organisation(
      "limits:",
      "  - { unit: cost, amount: 100, period: month }",
      "  - { unit: cost, amount: 10, period: day }",
      "  - { unit: cost, amount: 80, period: month }",
      "members:",
      `  - actor: ${ANNA}`,
      "    role: owner",
      "    limits:",
      "      - { unit: cost, amount: 50, period: month }",
      "      - { unit: cost, amount: 60, period: month }",
    );
    const organisationPath = ["deployments", "web", "users", "config", "organisations", 0];
    expect(problemsOf("deployments", text)).toEqual([
      expect.objectContaining({
        code: "users-limit-repeated",
        path: [...organisationPath, "limits", 2],
        message: `Organisation "${ORG}" already has a limit on cost per month`,
      }),
      expect.objectContaining({
        code: "users-limit-repeated",
        path: [...organisationPath, "members", 0, "limits", 1],
        message: `Member "${ANNA}" already has a limit on cost per month`,
      }),
    ]);
  });

  it("refuses a member's concurrency above the organisation's, and allows it when either is unset", () => {
    const text = (organisationLine: string) =>
      organisation(organisationLine, `members: [{ actor: ${ANNA}, role: owner, concurrency: 5 }]`);
    expect(problemsOf("deployments", text("concurrency: 4"))).toEqual([
      expect.objectContaining({
        code: "users-member-concurrency-above-organisation",
        path: [
          "deployments",
          "web",
          "users",
          "config",
          "organisations",
          0,
          "members",
          0,
          "concurrency",
        ],
        message: `Member "${ANNA}" may have 5 runs at once, more than organisation "${ORG}" allows (4)`,
      }),
    ]);
    expect(warningsOf(text("limits: []"))).toEqual([]);
  });

  it("warns that meter config with no config block or no limits counts nothing", () => {
    const message =
      'Deployment "web" uses meter "config" but has no limits, so it counts nothing, like meter "none"';
    const noBlock = yaml("deployments:", "  web:", "    name: Web", "    users: { meter: config }");
    expect(warningsOf(noBlock)).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "users-config-limits-missing",
        path: ["deployments", "web", "users", "meter"],
        message,
      }),
    ]);
    expect(warningsOf(config("limits: []"))).toEqual([
      expect.objectContaining({
        code: "users-config-limits-missing",
        path: ["deployments", "web", "users", "config", "limits"],
      }),
    ]);
  });
});
