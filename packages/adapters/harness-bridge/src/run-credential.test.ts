import { readFile } from "node:fs/promises";
import { fixedClock, fixedClockStart } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  type RunCredentialBinding,
  type RunCredentialStore,
  RunCredentials,
  type StoredRunCredential,
} from "./run-credential.ts";

const deadline = fixedClockStart + 60_000;

/** A store that keeps the records in memory, as the run's Durable Object storage would. */
function memoryStore(): RunCredentialStore<RunCredentialBinding> & {
  records: Map<string, StoredRunCredential<RunCredentialBinding>>;
} {
  const records = new Map<string, StoredRunCredential<RunCredentialBinding>>();
  return {
    records,
    read: async (runId) => records.get(runId),
    write: async (record) => {
      records.set(record.binding.runId, record);
    },
  };
}

/** Credentials on a clock that stands still at `now`. */
function credentialsAt(now: number, store = memoryStore()) {
  return { store, credentials: new RunCredentials({ store, clock: fixedClock(now, 0) }) };
}

verifies("harness-bridge.run-credential", () => {
  it("passes the run's own credential and gives its binding", async () => {
    const { credentials } = credentialsAt(fixedClockStart);
    const credential = await credentials.issue({ runId: "run_acme", expiresAt: deadline });

    expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await credentials.check("run_acme", credential)).toEqual({
      ok: true,
      binding: { runId: "run_acme", expiresAt: deadline },
    });
  });

  it("refuses another run's credential", async () => {
    const { credentials } = credentialsAt(fixedClockStart);
    await credentials.issue({ runId: "run_acme", expiresAt: deadline });
    const other = await credentials.issue({ runId: "run_globex", expiresAt: deadline });

    expect(await credentials.check("run_acme", other)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses a request with no credential, or for a run that never had one", async () => {
    const { credentials } = credentialsAt(fixedClockStart);
    const credential = await credentials.issue({ runId: "run_acme", expiresAt: deadline });

    expect(await credentials.check("run_acme", null)).toEqual({ ok: false, reason: "missing" });
    expect(await credentials.check("run_acme", "")).toEqual({ ok: false, reason: "missing" });
    expect(await credentials.check("run_initech", credential)).toEqual({
      ok: false,
      reason: "unknown-run",
    });
  });

  it("refuses the credential from the run's deadline on", async () => {
    const store = memoryStore();
    const credential = await credentialsAt(fixedClockStart, store).credentials.issue({
      runId: "run_acme",
      expiresAt: deadline,
    });

    const { credentials } = credentialsAt(deadline, store);
    expect(await credentials.check("run_acme", credential)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("refuses a revoked credential and never gives the run another", async () => {
    const { credentials } = credentialsAt(fixedClockStart);
    const credential = await credentials.issue({ runId: "run_acme", expiresAt: deadline });
    await credentials.revoke("run_acme");
    await credentials.revoke("run_acme");

    expect(await credentials.check("run_acme", credential)).toEqual({
      ok: false,
      reason: "revoked",
    });
    await expect(credentials.issue({ runId: "run_acme", expiresAt: deadline })).rejects.toThrow(
      "already had a bridge credential",
    );
  });

  it("stores only the credential's SHA-256", async () => {
    const { credentials, store } = credentialsAt(fixedClockStart);
    const credential = await credentials.issue({ runId: "run_acme", expiresAt: deadline });
    const record = store.records.get("run_acme");

    expect(record?.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(record)).not.toContain(credential);
  });

  it("gives a different credential to every run", async () => {
    const { credentials } = credentialsAt(fixedClockStart);
    const first = await credentials.issue({ runId: "run_acme", expiresAt: deadline });
    const second = await credentials.issue({ runId: "run_globex", expiresAt: deadline });

    expect(first).not.toBe(second);
  });

  it("keeps the Web-only entry point free of Node APIs", async () => {
    expect(await nodeImportsReachedFrom("web.ts")).toEqual([]);
  });
});

/** Follows the relative imports from a file under `src/` and lists every `node:` import on the way. */
async function nodeImportsReachedFrom(entry: string): Promise<string[]> {
  const seen = new Set<string>();
  const found: string[] = [];
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    for (const [, specifier] of source.matchAll(/from "([^"]+)"/g)) {
      if (specifier === undefined) continue;
      if (specifier.startsWith("node:")) found.push(`${file}: ${specifier}`);
      if (specifier.startsWith("./")) pending.push(specifier.slice(2));
    }
  }
  return found;
}
