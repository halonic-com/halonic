import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { compareSetups, ticksToKeep } from "./compare-setups.ts";
import { atlasService, ledgerService, publishedSetup } from "./services.test-helper.ts";
import type { StepId } from "./setup-step.ts";
import { setupSteps } from "./setup-steps.ts";

const allSteps: StepId[] = [
  "project",
  "apis",
  "consent",
  "scopes",
  "client",
  "credentials",
  "sign-in",
];

const ledgerOnly = setupSteps(publishedSetup([ledgerService]));
const ledgerAndAtlas = setupSteps(publishedSetup([ledgerService, atlasService]));

verifies("google-setup.service-changes", () => {
  it("reopens only the steps a new service needs, with its new rows", () => {
    const changes = compareSetups(ledgerOnly, ledgerAndAtlas);
    expect(changes.addedServices).toEqual([{ id: "atlas", label: "Atlas" }]);
    expect(changes.removedServices).toEqual([]);
    expect(changes.reopened).toEqual(["apis", "scopes", "sign-in"]);
    expect(changes.steps.find((step) => step.step === "apis")).toEqual({
      step: "apis",
      change: "reopened",
      newRows: [{ kind: "api", key: "atlas.googleapis.com" }],
      valuesChanged: false,
    });
    expect(changes.steps.find((step) => step.step === "sign-in")).toEqual({
      step: "sign-in",
      change: "reopened",
      newRows: [
        { kind: "scope", key: "https://www.googleapis.com/auth/atlas.readonly" },
        { kind: "check", key: "atlas" },
      ],
      valuesChanged: false,
    });
    expect(ticksToKeep(changes, allSteps)).toEqual(["project", "consent", "client", "credentials"]);
  });

  it("keeps every tick when a service is unticked", () => {
    const changes = compareSetups(ledgerAndAtlas, ledgerOnly);
    expect(changes.removedServices).toEqual([{ id: "atlas", label: "Atlas" }]);
    expect(changes.reopened).toEqual([]);
    expect(changes.steps.find((step) => step.step === "scopes")).toEqual({
      step: "scopes",
      change: "lost-only",
      lostRows: [{ kind: "scope", key: "https://www.googleapis.com/auth/atlas.readonly" }],
    });
    expect(ticksToKeep(changes, allSteps)).toEqual(allSteps);
  });

  it("reopens step 3 and drops step 4 when a personal app goes back to Testing", () => {
    const testing = setupSteps({ ...publishedSetup([ledgerService]), publishing: "testing" });
    const changes = compareSetups(ledgerOnly, testing);
    expect(changes.reopened).toEqual(["consent"]);
    expect(ticksToKeep(changes, allSteps)).toEqual([
      "project",
      "apis",
      "client",
      "credentials",
      "sign-in",
    ]);
  });

  it("reopens sign-in for a new scope when step 4 is switched off", () => {
    const before = setupSteps({ ...publishedSetup([ledgerService]), listScopes: false });
    const after = setupSteps({
      ...publishedSetup([ledgerService, atlasService]),
      listScopes: false,
    });
    expect(compareSetups(before, after).reopened).toEqual(["apis", "sign-in"]);
  });

  it("reopens the steps that depend on the account type when it changes", () => {
    const workspace = setupSteps({ ...publishedSetup([ledgerService]), accountType: "workspace" });
    const changes = compareSetups(ledgerOnly, workspace);
    expect(changes.reopened).toEqual(["project", "consent", "sign-in"]);
    expect(changes.addedServices).toEqual([]);
  });

  it("keeps the ticks when only the project ID changes", () => {
    const withProject = setupSteps({ ...publishedSetup([ledgerService]), projectId: "halonic-x1" });
    const changes = compareSetups(ledgerOnly, withProject);
    expect(changes.steps.every((step) => step.change === "unchanged")).toBe(true);
  });

  it("asks for step 4 again after the switch goes off and on", () => {
    const switchedOff = setupSteps({ ...publishedSetup([ledgerService]), listScopes: false });
    const off = compareSetups(ledgerOnly, switchedOff);
    expect(off.reopened).toEqual([]);
    expect(ticksToKeep(off, allSteps)).not.toContain("scopes");

    const on = compareSetups(switchedOff, ledgerOnly);
    expect(on.steps.find((step) => step.step === "scopes")).toEqual({
      step: "scopes",
      change: "reopened",
      newRows: [{ kind: "scope", key: "https://www.googleapis.com/auth/ledger" }],
      valuesChanged: true,
    });
  });
});
