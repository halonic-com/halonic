import type { Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { choiceSettings, chosenSecrets } from "./workspace-choices.ts";

const raw: Secrets = {
  get: async (name) => ({ "gitlab-secret": "fake-gitlab-value-0001" })[name] ?? null,
};

verifies("integration-kit.workspace-choices", () => {
  it("reads the sheet's secret name as the workspace's pick, and nothing else", async () => {
    const secrets = chosenSecrets(raw, { secretNames: { "client-secret": "gitlab-secret" } });

    expect(await secrets.get("client-secret")).toBe("fake-gitlab-value-0001");
    expect(await secrets.get("gitlab-secret")).toBeNull();
  });

  it("reads nothing when no secret was picked", async () => {
    expect(await chosenSecrets(raw, undefined).get("client-secret")).toBeNull();
  });

  it("gives the settings of the choices as they are, or none", () => {
    const settings = { url: "http://localhost:11434" };

    expect(choiceSettings({ settings })).toBe(settings);
    expect(choiceSettings(undefined)).toEqual({});
  });
});
