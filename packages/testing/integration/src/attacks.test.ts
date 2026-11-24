import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, onTestFinished } from "vitest";
import {
  checkAbort,
  checkCase,
  checkConnectIsQuiet,
  checkDeclaration,
  checkProviderErrors,
  checkSources,
} from "./checks.ts";
import { checkOwnSources, passes } from "./describe.ts";
import { ConformanceFailure } from "./failure.ts";
import { attacks, laterAttacks } from "./fixtures/attacks.ts";
import { weatherSubject } from "./fixtures/weather.ts";
import { type ConformanceSubject, keepTrippedUntilTestEnds, tripNetworkGlobals } from "./run.ts";

const checks = {
  case: (subject: ConformanceSubject) => checkCase(subject, subject.cases[0] ?? fail()),
  sources: async (subject: ConformanceSubject) => checkSources(subject),
  declaration: async (subject: ConformanceSubject) => checkDeclaration(subject),
  connect: (subject: ConformanceSubject) => checkConnectIsQuiet(subject),
  abort: (subject: ConformanceSubject) => checkAbort(subject, subject.cases[0] ?? fail()),
  "provider-errors": (subject: ConformanceSubject) =>
    checkProviderErrors(subject, subject.cases[0] ?? fail()),
};

function fail(): never {
  throw new Error("the subject has no case");
}

/** One test per attack: the check named for it fails with the failure named for it. */
function itFailsEach(cases: Record<string, (typeof attacks)[keyof typeof attacks]>): void {
  for (const [attack, { catchBy, reason, subject }] of Object.entries(cases)) {
    it(`fails an integration that ${attack}`, async () => {
      const failure = await checks[catchBy](subject).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(ConformanceFailure);
      expect((failure as Error).message).toMatch(reason);
    });
  }
}

verifies("integration.attack-cases", () => {
  itFailsEach(attacks);

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
    // Registered first, so it runs after the case's own end-of-test hook.
    onTestFinished(() => expect(globalThis.fetch).toBe(before));
    await checks
      .case(attacks["goes around its host with the global fetch"].subject)
      .catch(() => {});
    expect(globalThis.fetch).not.toBe(before);
  });
});

verifies("integration.source-scan-imports", () => {
  itFailsEach({
    "imports a file-system module in its source":
      laterAttacks["imports a file-system module in its source"],
  });

  it("scans the code beside the test file when the test passes no sources", () => {
    expect(() => checkOwnSources(weatherSubject)).toThrow(
      /source-scan\.ts:\d+: eval or new Function/,
    );
  });

  // Built from parts: this file is in the package the scan with no sources
  // reads, so a written-out import here would count as this file's own.
  const importLine = (path: string) => `import { weather } from ${'"'}${path}${'"'};\n`;

  /** Runs `check` as if the running test were `test/conformance.test.ts` of a made-up package with these files. */
  function asTestIn(files: Record<string, string>, check: () => void): void {
    const folder = mkdtempSync(join(tmpdir(), "halonic-integration-"));
    const testPath = expect.getState().testPath;
    try {
      for (const [path, text] of Object.entries({ "package.json": "{}", ...files })) {
        mkdirSync(dirname(join(folder, path)), { recursive: true });
        writeFileSync(join(folder, path), text);
      }
      expect.setState({ testPath: join(folder, "test", "conformance.test.ts") });
      check();
    } finally {
      expect.setState({ testPath: testPath ?? "" });
      rmSync(folder, { recursive: true, force: true });
    }
  }

  it("scans the files a test with no sources imports from outside its own folder", () => {
    asTestIn(
      {
        "test/conformance.test.ts": importLine("../src/index.ts"),
        "test/names.ts": "export const city = 'Ghent';\n",
        "src/index.ts":
          'import { readFileSync } from "fs";\nexport const weather = readFileSync;\n',
      },
      () =>
        expect(() => checkOwnSources(weatherSubject)).toThrow(
          /src\/index\.ts:1: imports other than its own files, zod or the kit/,
        ),
    );
  });

  it("fails a test with no sources that imports code outside its package", () => {
    asTestIn({ "test/conformance.test.ts": importLine("../../elsewhere/index.ts") }, () =>
      expect(() => checkOwnSources(weatherSubject)).toThrow(/outside its package; pass/),
    );
  });

  it("fails a direct source check that has no sources to scan", () => {
    expect(() => checkSources(weatherSubject)).toThrow(/pass `sources`/);
  });
});

verifies("integration.late-calls-and-hidden-keys", () => {
  const { "imports a file-system module in its source": _imports, ...runTime } = laterAttacks;
  itFailsEach(runTime);

  it("keeps the network tripwires in place until the test ends", async () => {
    const before = globalThis.fetch;
    onTestFinished(() => expect(globalThis.fetch).toBe(before));
    await passes(() => checks.case(weatherSubject));
    expect(globalThis.fetch).not.toBe(before);
  });

  // The global is called after the case returned, as a promise the integration
  // didn't wait for would call it. The test runs the end-of-test hook itself,
  // so it can expect the failure instead of failing.
  it("fails the test when the integration uses a global after its case returned", () => {
    const before = globalThis.fetch;
    const calls: string[] = [];
    const endOfTest: Array<() => void> = [];
    keepTrippedUntilTestEnds(tripNetworkGlobals(calls), calls, (hook) => endOfTest.push(hook));
    expect(() => globalThis.fetch("https://evil.example/collect")).toThrow(/host\.http/);
    expect(endOfTest).toHaveLength(1);
    expect(() => endOfTest[0]?.()).toThrow(/used the global fetch after it answered/);
    expect(globalThis.fetch).toBe(before);
  });
});
