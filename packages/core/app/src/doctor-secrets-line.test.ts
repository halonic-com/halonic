import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { secretsLine } from "./doctor-secrets-line.ts";

verifies("app.doctor-secrets", () => {
  it("fails with each missing secret and what uses it", () => {
    const missing = [
      {
        secret: "files-token",
        usedBy: [
          { kind: "connector" as const, id: "files" },
          { kind: "connector" as const, id: "notes" },
        ],
      },
      { secret: "mock-key", usedBy: [{ kind: "provider" as const, id: "mock" }] },
    ];
    expect(secretsLine({ missing, unreadable: [] })).toEqual({
      check: "secrets",
      status: "failed",
      missing,
      unreadable: [],
    });
  });

  it("only warns while every secret is set or couldn't be read", () => {
    const unreadable = [
      { secret: "files-token", usedBy: [{ kind: "connector" as const, id: "files" }] },
    ];
    expect(secretsLine({ missing: [], unreadable })).toEqual({
      check: "secrets",
      status: "warning",
      missing: [],
      unreadable,
    });
  });

  it("has no line when no secret is missing or unreadable", () => {
    expect(secretsLine({ missing: [], unreadable: [] })).toBeUndefined();
  });
});
