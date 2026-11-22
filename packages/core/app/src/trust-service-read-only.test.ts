import type { Digest, TrustRecord } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { location, program, setUpTrustService, subject } from "./testing/trust-service-fixtures.ts";
import type { TrustService, TrustSubject } from "./trust-service.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** Trusts the workspace as a person would: with the fingerprint the check showed. */
async function trustAsPerson(service: TrustService, workspace: TrustSubject): Promise<void> {
  const shown = await service.check(workspace);
  if (shown.status === "refused") throw new Error("The check refused the workspace.");
  expect((await service.grant(workspace, shown.fingerprint, "cli")).ok).toBe(true);
}

verifies("app.trust-service-read-only", () => {
  it("says trusted for files that only lost a connector, and keeps the record as it was", async () => {
    const { service, store } = setUpTrustService(digest);
    await trustAsPerson(service, subject(program("files"), program("mail")));
    const before = (await store.get(location)) as TrustRecord;

    const check = await service.check(subject(program("files")), { readOnly: true });

    expect(check.status).toBe("trusted");
    if (check.status !== "trusted") return;
    expect(check.shrunk.connectors).toEqual(["mail"]);
    expect(await store.get(location)).toEqual(before);
  });

  it("gives the grant of the stored record, so a check against the store still passes", async () => {
    const { service, store } = setUpTrustService(digest);
    await trustAsPerson(service, subject(program("files"), program("mail")));
    const before = (await store.get(location)) as TrustRecord;

    const check = await service.check(subject(program("files")), { readOnly: true });

    expect(check.status).toBe("trusted");
    if (check.status !== "trusted") return;
    expect(check.grant).toEqual({ location, fingerprint: before.fingerprint });
    expect(check.fingerprint).not.toBe(before.fingerprint);
    expect(check.trustedAt).toBe(before.grantedAt);
  });

  it("still shrinks the record on a check that isn't read-only", async () => {
    const { service, store } = setUpTrustService(digest);
    await trustAsPerson(service, subject(program("files"), program("mail")));

    const check = await service.check(subject(program("files")));

    expect(check.status).toBe("trusted");
    if (check.status !== "trusted") return;
    expect((await store.get(location))?.fingerprint).toBe(check.fingerprint);
  });

  it("says changed for files with a connector the record lacks, and writes nothing", async () => {
    const { service, store } = setUpTrustService(digest);
    await trustAsPerson(service, subject(program("files")));
    const before = (await store.get(location)) as TrustRecord;

    const check = await service.check(subject(program("files"), program("mail")), {
      readOnly: true,
    });

    expect(check.status).toBe("changed");
    expect(check).not.toHaveProperty("grant");
    expect(await store.get(location)).toEqual(before);
  });
});
