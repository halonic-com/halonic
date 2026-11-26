import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readSnapshot, type SnapshotProblem } from "./snapshot.ts";

const commit = "0123456789abcdef0123456789abcdef01234567";

/** A snapshot with no tools and this routing, as JSON data. */
function withRouting(routing: unknown): unknown {
  return { format: 1, workspace: { name: "Acme", commit }, tools: [], routing };
}

/** The snapshot's problems as "path code", failing the test when it passes. */
function problemsOf(data: unknown): string[] {
  const read = readSnapshot(data);
  if (read.ok) {
    expect.fail("expected the snapshot to be refused");
  }
  return read.error.map((problem: SnapshotProblem) => `${problem.path.join(".")} ${problem.code}`);
}

verifies("format.workspace-routing", () => {
  it("reads roles and area owners named by url key, and fills in what is left out", () => {
    const read = readSnapshot(
      withRouting({
        roles: { "code-reviewer": "liam", "second-reviewer": "julian" },
        areas: { "engine-and-cli": "priya" },
      }),
    );
    expect(read.ok && read.value.routing).toEqual({
      roles: { "code-reviewer": "liam", "second-reviewer": "julian" },
      areas: { "engine-and-cli": "priya" },
    });
    const routine = readSnapshot(withRouting({ roles: { "routine-reviewer": "nora" } }));
    expect(routine.ok && routine.value.routing?.roles).toEqual({ "routine-reviewer": "nora" });
    const empty = readSnapshot(withRouting({}));
    expect(empty.ok && empty.value.routing).toEqual({ roles: {}, areas: {} });
  });

  it("keeps a snapshot without routing as it is", () => {
    const read = readSnapshot({ format: 1, workspace: { name: "Acme", commit }, tools: [] });
    expect(read.ok && "routing" in read.value).toBe(false);
  });

  it("refuses an unknown role and a field for a login, an email or a key", () => {
    expect(problemsOf(withRouting({ roles: { approver: "liam" } }))).toEqual([
      "routing.roles unrecognized_keys",
    ]);
    expect(problemsOf(withRouting({ roles: {}, login: "someone" }))).toEqual([
      "routing unrecognized_keys",
    ]);
    expect(problemsOf(withRouting({ areas: { "github-login": "liam" } }))).toEqual([
      "routing.areas.github-login routing-area-looks-like-account",
    ]);
    expect(problemsOf(withRouting({ areas: { "api-token": "liam" } }))).toEqual([
      "routing.areas.api-token routing-area-looks-like-account",
    ]);
  });

  it("refuses an empty person, an email, a bot login and a key as a name", () => {
    for (const person of ["", "liam@example.com", "renovate[bot]", "Liam", "ghp_abc"]) {
      expect(problemsOf(withRouting({ roles: { "code-reviewer": person } }))).toEqual([
        "routing.roles.code-reviewer invalid_format",
      ]);
    }
    const key = `sk-ant-api03-${"q7x2lm9k".repeat(3)}`.slice(0, 40);
    expect(problemsOf(withRouting({ areas: { docs: key } }))).toContain(
      "routing.areas.docs value-looks-like-key",
    );
  });

  it("refuses more than 50 areas", () => {
    const areas = Object.fromEntries(Array.from({ length: 51 }, (_, at) => [`area-${at}`, "liam"]));
    expect(problemsOf(withRouting({ areas }))).toEqual(["routing.areas custom"]);
  });
});
