import { describe, expect, it } from "vitest";
import {
  ConformanceFailure,
  checkAbort,
  checkCase,
  checkDeclaration,
  checkProviderErrors,
  checkSources,
} from "./checks.ts";
import { passes } from "./describe.ts";
import { attacks } from "./fixtures/attacks.ts";
import { weatherSubject } from "./fixtures/weather.ts";
import type { ConformanceSubject } from "./run.ts";

const checks = {
  case: (subject: ConformanceSubject) => checkCase(subject, subject.cases[0] ?? fail()),
  sources: async (subject: ConformanceSubject) => checkSources(subject),
  declaration: async (subject: ConformanceSubject) => checkDeclaration(subject),
  abort: (subject: ConformanceSubject) => checkAbort(subject, subject.cases[0] ?? fail()),
  "provider-errors": (subject: ConformanceSubject) =>
    checkProviderErrors(subject, subject.cases[0] ?? fail()),
};

function fail(): never {
  throw new Error("the subject has no case");
}

describe("testing-integration.attack-cases", () => {
  for (const [attack, { catchBy, reason, subject }] of Object.entries(attacks)) {
    it(`fails an integration that ${attack}`, async () => {
      const failure = await checks[catchBy](subject).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(ConformanceFailure);
      expect((failure as Error).message).toMatch(reason);
    });
  }

  it("passes the well-behaved integration on every check the attacks fail", async () => {
    const clean = { ...weatherSubject, sources: { "src/index.ts": "export {};" } };
    for (const check of Object.values(checks)) await passes(() => check(clean));
  });

  it("names the refused host in the failure", async () => {
    const { subject } = attacks["reaches an undeclared host"];
    await expect(checks.case(subject)).rejects.toThrow(
      /refused GET evil\.example\/collect: host-not-allowed/,
    );
  });

  it("names the secret that went to the wrong host", async () => {
    const { subject } = attacks["sends its key to a host the key may not go to"];
    await expect(checks.case(subject)).rejects.toThrow(/secret-not-allowed-for-host/);
  });

  it("restores the global fetch after a case", async () => {
    const before = globalThis.fetch;
    await checks
      .case(attacks["goes around its host with the global fetch"].subject)
      .catch(() => {});
    expect(globalThis.fetch).toBe(before);
  });
});
