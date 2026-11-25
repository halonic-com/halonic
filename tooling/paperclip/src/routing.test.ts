import { AGENT_NAME_PATTERN, ROUTING_ROLES } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { type RoutedPull, reviewerFor, reviewerRoleFor } from "./reviewer-paths.ts";
import { agentNamePattern, areaOwnerFor, personFor, routingRoles } from "./routing.ts";
import { routingOf } from "./routing-load.ts";
import { snapshotWith } from "./routing.test-helper.ts";

/** The routing that names today's people. */
const today = routingOf(
  snapshotWith({ roles: { "code-reviewer": "liam", "second-reviewer": "julian" } }),
);

const manifest = JSON.stringify({ name: "@halonicjs/acme", version: "0.1.0" });

/** The inputs of the `paperclip.reviewer-paths` cases, with the reviewer each gets. */
const cases: readonly (readonly [RoutedPull, "julian" | "liam"])[] = [
  [
    { files: ["packages/studio/features/inbox/src/view.tsx"], changedLines: 120, sensitive: false },
    "julian",
  ],
  [{ files: ["package.json"], changedLines: 2, sensitive: false }, "liam"],
  [{ files: [".github/workflows/ci.yml"], changedLines: 2, sensitive: false }, "liam"],
  [{ files: ["packages/x/src/sandbox/fence.ts"], changedLines: 2, sensitive: false }, "liam"],
  [
    { files: ["tooling/paperclip/src/reviewer-paths.ts"], changedLines: 2, sensitive: false },
    "liam",
  ],
  [{ files: ["packages/core/app/src/a.ts"], changedLines: 1501, sensitive: false }, "liam"],
  [{ files: ["packages/core/app/src/a.ts"], changedLines: 1500, sensitive: false }, "julian"],
  [{ files: ["packages/core/app/src/a.ts"], changedLines: 5, sensitive: true }, "liam"],
  [
    {
      files: ["packages/core/app/src/a.test.ts", "docs/a.md"],
      changedLines: 2000,
      sensitive: false,
    },
    "julian",
  ],
  [{ files: ["apps/cli/src/messages/sandbox.ts"], changedLines: 2, sensitive: false }, "julian"],
  [{ files: ["apps/cli/package.json"], changedLines: 2, sensitive: false }, "liam"],
  [
    {
      files: ["apps/cli/package.json"],
      changedLines: 2,
      sensitive: false,
      manifests: {
        "apps/cli/package.json": {
          before: manifest,
          after: manifest.replace("}", ',"main":"b.js"}'),
        },
      },
    },
    "julian",
  ],
];

verifies("paperclip.reviewer-routing", () => {
  describe("reviewerFor", () => {
    test.each(cases)(
      "%j goes to the same reviewer with no routing and today's",
      (pull, reviewer) => {
        expect(reviewerFor(pull)).toBe(reviewer);
        expect(reviewerFor(pull, undefined)).toBe(reviewer);
        expect(reviewerFor(pull, today)).toBe(reviewer);
        expect(reviewerRoleFor(pull)).toBe(
          reviewer === "julian" ? "second-reviewer" : "code-reviewer",
        );
      },
    );

    test("names whoever the routing says covers the role", () => {
      const routing = routingOf(
        snapshotWith({ roles: { "code-reviewer": "owen", "second-reviewer": "kim" } }),
      );
      expect(reviewerFor(cases[0]?.[0] as RoutedPull, routing)).toBe("kim");
      expect(reviewerFor(cases[1]?.[0] as RoutedPull, routing)).toBe("owen");
    });

    test("a role the routing leaves out goes to the code reviewer, never to no one", () => {
      const routing = routingOf(snapshotWith({ roles: { "code-reviewer": "owen" } }));
      expect(reviewerFor(cases[0]?.[0] as RoutedPull, routing)).toBe("owen");
      expect(reviewerFor(cases[0]?.[0] as RoutedPull, routingOf(snapshotWith({})))).toBe("liam");
      expect(personFor("approver", routing)).toBe("owen");
      expect(personFor("approver", undefined)).toBe("liam");
    });

    test.each([
      ["an unknown role", { roles: { approver: "kim" } }],
      ["an empty person", { roles: { "second-reviewer": "" } }],
      ["a login field", { roles: { "second-reviewer": "kim" }, login: "kim" }],
      ["an email", { roles: { "second-reviewer": "kim@example.com" } }],
      [
        "an area named like a key",
        { roles: { "second-reviewer": "kim" }, areas: { "api-token": "kim" } },
      ],
      ["a key as a name", { roles: { "second-reviewer": `sk-ant-api03-${"q7x2lm9k".repeat(3)}` } }],
    ])("a routing with %s is refused, and reviewerFor gives today's reviewer", (_, routing) => {
      const refused = routingOf(snapshotWith(routing));
      expect(refused).toBeUndefined();
      for (const [pull, reviewer] of cases) {
        expect(reviewerFor(pull, refused)).toBe(reviewer);
      }
    });

    test("a name that skipped the loader isn't used", () => {
      const unchecked = { roles: { "second-reviewer": "" }, areas: { docs: "Not A Name" } };
      expect(reviewerFor(cases[0]?.[0] as RoutedPull, unchecked)).toBe("liam");
      expect(areaOwnerFor("docs", "Maya", unchecked)).toBe("liam");
    });
  });

  test("knows the same roles and names as the snapshot loader", () => {
    expect(routingRoles).toEqual(ROUTING_ROLES);
    expect(agentNamePattern.source).toBe(AGENT_NAME_PATTERN.source);
  });

  describe("areaOwnerFor", () => {
    test("takes the area table's owner without a routing", () => {
      expect(areaOwnerFor("integrations", "Tomas, with Ravi", undefined)).toBe("Tomas, with Ravi");
    });

    test("takes the routing's owner, and the code reviewer for an area it leaves out", () => {
      const routing = routingOf(
        snapshotWith({ roles: { "code-reviewer": "owen" }, areas: { docs: "maya" } }),
      );
      expect(areaOwnerFor("docs", "Maya", routing)).toBe("maya");
      expect(areaOwnerFor("studio", "Elena", routing)).toBe("owen");
      expect(areaOwnerFor("constructor", "Liam", routing)).toBe("owen");
    });
  });
});
