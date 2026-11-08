import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { accountTypeFromAddress } from "./account-type.ts";
import { atlasService, ledgerService, personalSetup } from "./services.test-helper.ts";
import type { SetupStep, StepId } from "./setup-step.ts";
import { setupSteps } from "./setup-steps.ts";

/** The step with the given id; fails the test when it's missing. */
function step<Id extends StepId>(
  steps: readonly SetupStep[],
  id: Id,
): Extract<SetupStep, { id: Id }> {
  const found = steps.find((candidate): candidate is Extract<SetupStep, { id: Id }> => {
    return candidate.id === id;
  });
  if (found === undefined) {
    throw new Error(`No step "${id}"`);
  }
  return found;
}

function copyValues(setupStep: SetupStep): Record<string, string> {
  return Object.fromEntries(setupStep.copyValues.map(({ id, value }) => [id, value]));
}

verifies("google-setup.steps", () => {
  it("lists the seven steps in order with the flow's own values", () => {
    const { steps } = setupSteps(personalSetup([ledgerService]));
    expect(steps.map(({ id, number }) => `${number} ${id}`)).toEqual([
      "1 project",
      "2 apis",
      "3 consent",
      "4 scopes",
      "5 client",
      "6 credentials",
      "7 sign-in",
    ]);
    expect(copyValues(step(steps, "project"))).toEqual({ "project-name": "halonic" });
    expect(copyValues(step(steps, "consent"))).toEqual({
      "app-name": "Halonic (own app)",
      "support-email": "someone@example.com",
      "contact-email": "someone@example.com",
    });
    expect(copyValues(step(steps, "client"))).toEqual({ "client-name": "Halonic desktop" });
    expect(steps.map((s) => s.doneWhen)).toEqual([
      "marked-done",
      "marked-done",
      "marked-done",
      "marked-done",
      "client-id-saved",
      "client-id-and-secret-saved",
      "signed-in-and-checked",
    ]);
  });

  it("lists one service's API and scope without a switch-on-all link", () => {
    const { steps } = setupSteps(personalSetup([ledgerService]));
    const apis = step(steps, "apis");
    expect(apis.apis.map((row) => row.name)).toEqual(["Ledger API"]);
    expect(apis.switchOnAllUrl).toBeUndefined();
    expect(copyValues(step(steps, "scopes"))).toEqual({
      "all-scopes": "https://www.googleapis.com/auth/ledger",
    });
  });

  it("joins the services' APIs and scopes, keeping each service's reason", () => {
    const { steps, services } = setupSteps(personalSetup([ledgerService, atlasService]));
    expect(services).toEqual([
      { id: "ledger", label: "Ledger" },
      { id: "atlas", label: "Atlas" },
    ]);
    expect(step(steps, "apis").apis.map(({ api, neededBy }) => ({ api, neededBy }))).toEqual([
      { api: "ledger.googleapis.com", neededBy: ["ledger", "atlas"] },
      { api: "atlas.googleapis.com", neededBy: ["atlas"] },
    ]);
    const scopes = step(steps, "scopes").scopes;
    expect(scopes).toEqual([
      {
        scope: "https://www.googleapis.com/auth/ledger",
        restricted: true,
        neededBy: [
          { service: "ledger", reason: "Reads and writes your ledger" },
          { service: "atlas", reason: "Places entries on your maps" },
        ],
      },
      {
        scope: "https://www.googleapis.com/auth/atlas.readonly",
        restricted: false,
        neededBy: [{ service: "atlas", reason: "Reads your maps" }],
      },
    ]);
    expect(copyValues(step(steps, "scopes"))["all-scopes"]).toBe(
      "https://www.googleapis.com/auth/ledger,https://www.googleapis.com/auth/atlas.readonly",
    );
    const signIn = step(steps, "sign-in");
    expect(signIn.scopesToGrant).toEqual(scopes);
    expect(signIn.checks).toEqual([
      { service: "ledger", request: ledgerService.googleCheck },
      { service: "atlas" },
    ]);
  });

  it("lists a service once on a scope its sheet names twice", () => {
    const repeated = {
      ...ledgerService,
      googleScopes: [
        ...ledgerService.googleScopes,
        { scope: "https://www.googleapis.com/auth/ledger", reason: "Writes your ledger" },
      ],
    };
    const { steps } = setupSteps(personalSetup([repeated]));
    expect(step(steps, "scopes").scopes).toEqual([
      {
        scope: "https://www.googleapis.com/auth/ledger",
        restricted: true,
        neededBy: [{ service: "ledger", reason: "Reads and writes your ledger" }],
      },
    ]);
  });

  it("refuses a setup with no services or with two services of one id", () => {
    expect(() => setupSteps(personalSetup([]))).toThrow(RangeError);
    expect(() => setupSteps(personalSetup([ledgerService, ledgerService]))).toThrow(RangeError);
  });
});

verifies("google-setup.step-links", () => {
  const twoServices = personalSetup([ledgerService, atlasService]);

  it("opens every Console link in the project when its ID is known", () => {
    const { steps, projectIdIgnored } = setupSteps({ ...twoServices, projectId: "halonic-x1" });
    expect(projectIdIgnored).toBe(false);
    expect(step(steps, "project").links).toEqual([
      { id: "new-project", url: "https://console.cloud.google.com/projectcreate" },
    ]);
    const apis = step(steps, "apis");
    expect(apis.apis.map((row) => row.enableUrl)).toEqual([
      "https://console.cloud.google.com/apis/library/ledger.googleapis.com?project=halonic-x1",
      "https://console.cloud.google.com/apis/library/atlas.googleapis.com?project=halonic-x1",
    ]);
    expect(apis.switchOnAllUrl).toBe(
      "https://console.cloud.google.com/flows/enableapi?apiid=ledger.googleapis.com,atlas.googleapis.com&project=halonic-x1",
    );
    const urls = steps.flatMap((s) => s.links.map((link) => `${link.id} ${link.url}`));
    expect(urls).toEqual([
      "new-project https://console.cloud.google.com/projectcreate",
      "branding https://console.cloud.google.com/auth/branding?project=halonic-x1",
      "audience https://console.cloud.google.com/auth/audience?project=halonic-x1",
      "data-access https://console.cloud.google.com/auth/scopes?project=halonic-x1",
      "clients https://console.cloud.google.com/auth/clients?project=halonic-x1",
      "create-client https://console.cloud.google.com/auth/clients/create?project=halonic-x1",
      "clients https://console.cloud.google.com/auth/clients?project=halonic-x1",
    ]);
  });

  it("leaves the project out when none is given", () => {
    const { steps, projectIdIgnored } = setupSteps(twoServices);
    expect(projectIdIgnored).toBe(false);
    expect(step(steps, "consent").links[0]?.url).toBe(
      "https://console.cloud.google.com/auth/branding",
    );
    expect(step(steps, "apis").switchOnAllUrl).toBe(
      "https://console.cloud.google.com/flows/enableapi?apiid=ledger.googleapis.com,atlas.googleapis.com",
    );
  });

  it("ignores a project ID that isn't valid, and says so", () => {
    const notIds = [
      "Halonic X",
      "halon",
      `h${"a".repeat(30)}`,
      "halonic-",
      "1halonic",
      "a/../b?x=1",
    ];
    for (const projectId of notIds) {
      const { steps, projectIdIgnored } = setupSteps({ ...twoServices, projectId });
      expect(projectIdIgnored, projectId).toBe(true);
      const allUrls = steps.flatMap((s) => s.links.map((link) => link.url)).join(" ");
      expect(allUrls, projectId).not.toContain("project=");
    }
    expect(setupSteps({ ...twoServices, projectId: " halonic-x1 " }).projectIdIgnored).toBe(false);
    expect(setupSteps({ ...twoServices, projectId: "" }).projectIdIgnored).toBe(false);
  });

  it("refuses an API that isn't a Google API host", () => {
    for (const api of [
      "example.com/x",
      "ledger.googleapis.com.example.com",
      "LEDGER.googleapis.com",
    ]) {
      const service = { ...ledgerService, googleApis: [{ api, name: "Ledger API" }] };
      expect(() => setupSteps(personalSetup([service])), api).toThrow(RangeError);
    }
  });
});

verifies("google-setup.workspace-or-personal", () => {
  it("makes a personal account's app External, published and warned about", () => {
    const { steps, accountType } = setupSteps(personalSetup([ledgerService]));
    expect(accountType).toBe("personal");
    expect(step(steps, "project").location).toBe("any");
    expect(step(steps, "consent").audience).toBe("external");
    expect(step(steps, "consent").requiredTicks).toEqual(["in-production"]);
    expect(step(steps, "sign-in").beforeSignIn).toBe("warning-preview");
  });

  it("keeps a Workspace account's app Internal, in the organisation, with an admin note", () => {
    const setup = { ...personalSetup([ledgerService]), accountType: "workspace" as const };
    const { steps } = setupSteps(setup);
    expect(step(steps, "project").location).toBe("inside-organisation");
    expect(step(steps, "consent").audience).toBe("internal");
    expect(step(steps, "consent").requiredTicks).toEqual([]);
    expect(step(steps, "sign-in").beforeSignIn).toBe("admin-note");
  });

  it("knows only Google's consumer domains as personal", () => {
    expect(accountTypeFromAddress("someone@gmail.com")).toBe("personal");
    expect(accountTypeFromAddress("Someone@GoogleMail.com")).toBe("personal");
    expect(accountTypeFromAddress("someone@example.com")).toBeUndefined();
    expect(accountTypeFromAddress("gmail.com")).toBeUndefined();
  });
});

verifies("google-setup.scopes-switch", () => {
  it("leaves step 4 out and renumbers the rest, keeping their ids", () => {
    const { steps } = setupSteps({ ...personalSetup([ledgerService]), listScopes: false });
    expect(steps.map(({ id, number }) => `${number} ${id}`)).toEqual([
      "1 project",
      "2 apis",
      "3 consent",
      "4 client",
      "5 credentials",
      "6 sign-in",
    ]);
  });

  it("still lists the scopes to grant on step 7", () => {
    const { steps } = setupSteps({ ...personalSetup([ledgerService]), listScopes: false });
    expect(step(steps, "sign-in").scopesToGrant.map((row) => row.scope)).toEqual([
      "https://www.googleapis.com/auth/ledger",
    ]);
  });

  it("lists step 4 when the switch isn't set", () => {
    const { steps } = setupSteps(personalSetup([ledgerService]));
    expect(steps.some((s) => s.id === "scopes")).toBe(true);
  });
});
