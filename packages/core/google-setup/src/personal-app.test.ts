import { fixedClock, fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { clientSecretStore } from "./client-secret-store.ts";
import { memoryRecords } from "./memory-records.test-helper.ts";
import { memoryTokens } from "./memory-tokens.test-helper.ts";
import { ledgerService, personalSetup, publishedSetup } from "./services.test-helper.ts";
import type { SetupRoute } from "./setup-input.ts";
import { setupInputOf } from "./setup-input-of.ts";
import { setupRecords } from "./setup-records.ts";
import type { ConsentStep, SetupSteps } from "./setup-step.ts";
import { setupSteps } from "./setup-steps.ts";

// Fake values only, without the GOCSPX- prefix the leak check looks for.
const fakeClientId = "1234-abc123.apps.googleusercontent.com";
const fakeSecret = "fake-client-secret-one";

const route: SetupRoute = { app: "own", runsOn: "this-computer" };
const connector = { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" };

function numbered({ steps }: SetupSteps): string[] {
  return steps.map(({ id, number }) => `${number} ${id}`);
}

function consent({ steps }: SetupSteps): ConsentStep {
  const found = steps.find((step): step is ConsentStep => step.id === "consent");
  if (found === undefined) throw new Error('No step "consent"');
  return found;
}

function newStores() {
  const ids = fixedIds();
  const setups = setupRecords({ records: memoryRecords(), clock: fixedClock(), ids });
  return { setups, secrets: clientSecretStore(memoryTokens(), ids) };
}

/** A personal account in Testing, listed as a test user and signed in, as step 7 leaves it. */
async function signedInInTesting({ setups, secrets }: ReturnType<typeof newStores>) {
  const { accountRef } = await setups.start({ route, accountType: "personal", connector });
  await setups.update(accountRef, { kind: "test-user", ticked: true });
  await setups.update(accountRef, { kind: "client-id", clientId: fakeClientId });
  const clientRef = await secrets.saveClientSecret(fakeSecret);
  await setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  await setups.update(accountRef, { kind: "signed-in" });
  return accountRef;
}

verifies("google-setup.personal-testing", () => {
  it("gives a personal app in Testing six steps, no Scopes step and the test-user tick", () => {
    const setup = setupSteps(personalSetup([ledgerService]));
    expect(numbered(setup)).toEqual([
      "1 project",
      "2 apis",
      "3 consent",
      "4 client",
      "5 credentials",
      "6 sign-in",
    ]);
    expect(consent(setup)).toMatchObject({
      publishing: "testing",
      parts: "all",
      requiredTicks: ["test-user"],
    });
    expect(consent(setup).copyValues).toContainEqual({
      id: "test-user",
      value: "someone@example.com",
    });
  });

  it("gives a published personal app seven steps and the In production tick", () => {
    const setup = setupSteps(publishedSetup([ledgerService]));
    expect(setup.steps).toHaveLength(7);
    expect(setup.steps[3]?.id).toBe("scopes");
    expect(consent(setup).requiredTicks).toEqual(["in-production"]);
    expect(consent(setup).copyValues.map((value) => value.id)).not.toContain("test-user");
  });

  it("keeps a Workspace account's seven steps, whatever the publishing says", () => {
    const workspace = { ...personalSetup([ledgerService]), accountType: "workspace" as const };
    for (const setup of [workspace, { ...workspace, publishing: "testing" as const }]) {
      const steps = setupSteps(setup);
      expect(steps.steps).toHaveLength(7);
      expect(consent(steps)).toMatchObject({ publishing: null, requiredTicks: [] });
    }
  });

  it("asks a second account on a shared app in Testing only to add itself as a test user", () => {
    const setup = setupSteps({ ...personalSetup([ledgerService]), sharedApp: true });
    expect(consent(setup)).toMatchObject({ parts: "test-user-only", requiredTicks: ["test-user"] });
    const published = setupSteps({ ...publishedSetup([ledgerService]), sharedApp: true });
    expect(consent(published).parts).toBe("all");
  });

  it("saves the test-user tick, and switching publishing reopens step 3", async () => {
    const { setups } = newStores();
    const { accountRef } = await setups.start({ route, accountType: "personal", connector });
    await setups.update(accountRef, { kind: "test-user", ticked: true });
    const ticked = await setups.update(accountRef, { kind: "step-done", step: "consent" });
    expect(ticked.personalApp).toEqual({
      publishing: "testing",
      testUserTickedAt: expect.any(String),
      sharedApp: false,
    });

    const published = await setups.update(accountRef, {
      kind: "publishing",
      publishing: "production",
    });
    expect(published.personalApp?.publishing).toBe("production");
    expect(published.stepsDone.consent).toBeUndefined();

    await setups.update(accountRef, { kind: "in-production", ticked: true });
    const back = await setups.update(accountRef, { kind: "publishing", publishing: "testing" });
    expect(back.personalApp?.publishing).toBe("testing");
    expect(back.inProductionTickedAt).toBeNull();
  });

  it("leaves a Workspace record without a personal app", async () => {
    const { setups } = newStores();
    const { accountRef } = await setups.start({ route, accountType: "workspace", connector });
    const record = await setups.update(accountRef, {
      kind: "publishing",
      publishing: "production",
    });
    expect(record.personalApp).toBeNull();
    expect(
      setupSteps(setupInputOf(record, "someone@example.com", [ledgerService])).steps,
    ).toHaveLength(7);
  });

  it("reads an older personal record ticked In production as published", async () => {
    const { setups } = newStores();
    const { accountRef } = await setups.start({ route, accountType: "personal", connector });
    const record = await setups.update(accountRef, { kind: "in-production", ticked: true });
    const input = setupInputOf(record, "someone@example.com", [ledgerService]);
    expect(input.publishing).toBe("production");
    expect(setupSteps(input).steps).toHaveLength(7);
  });

  it("shares an app in Testing with step 3 open again for the second address", async () => {
    const stores = newStores();
    const first = await signedInInTesting(stores);
    const { accountRef: second } = await stores.setups.start({
      route,
      accountType: "personal",
      connector,
    });

    const shared = await stores.setups.shareClient(second, first);
    expect(shared.personalApp).toEqual({
      publishing: "testing",
      testUserTickedAt: null,
      sharedApp: true,
    });
    expect(Object.keys(shared.stepsDone).sort()).toEqual(
      ["apis", "client", "credentials", "project", "scopes"].sort(),
    );
    const steps = setupSteps(setupInputOf(shared, "other@example.com", [ledgerService]));
    expect(consent(steps)).toMatchObject({ parts: "test-user-only", requiredTicks: ["test-user"] });
    expect(steps.steps.find((step) => shared.stepsDone[step.id] === undefined)?.id).toBe("consent");
  });

  it("refuses to share an app in Testing whose own address isn't ticked as a test user", async () => {
    const stores = newStores();
    const first = await signedInInTesting(stores);
    await stores.setups.update(first, { kind: "test-user", ticked: false });
    const { accountRef: second } = await stores.setups.start({
      route,
      accountType: "personal",
      connector,
    });
    await expect(stores.setups.shareClient(second, first)).rejects.toMatchObject({
      reason: "cannot-share",
    });
  });
});
