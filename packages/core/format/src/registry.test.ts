import { describe, expect, it } from "vitest";
import { fileKinds, isKindName, isReservedPath, kindNames, RESERVED_FOLDER } from "./index.ts";

describe("format.kind-registry", () => {
  it("lists the 14 kinds the old schema and loader read, workspace-level first", () => {
    expect(kindNames()).toEqual([
      "workspace",
      "deployments",
      "models",
      "provider",
      "runtime",
      "knowledge",
      "collection",
      "connector",
      "skill",
      "hub",
      "agent",
      "workflow",
      "workflowTest",
      "routine",
    ]);
  });

  it("registers each kind under its own name, with a schema and at least one place", () => {
    for (const name of kindNames()) {
      const kind = fileKinds[name];
      expect(kind.name).toBe(name);
      expect(kind.about).not.toBe("");
      expect(kind.places.length).toBeGreaterThan(0);
    }
  });

  it("places every kind in the one layout", () => {
    const places = kindNames().flatMap((name) =>
      fileKinds[name].places.map(
        (place) => `${name}: ${place.scope} ${place.folder}/${place.name}`,
      ),
    );
    expect(places).toEqual([
      "workspace: workspace /workspace.yaml",
      "deployments: workspace /deployments.yaml",
      "models: workspace /models.yaml",
      "provider: workspace providers/<id>.yaml",
      "runtime: workspace runtimes/<id>.yaml",
      "knowledge: workspace-and-hub library/knowledge/<id>.yaml",
      "collection: workspace library/collections/<id>.collection.yaml",
      "connector: workspace-and-hub library/connectors/<id>.connector.yaml",
      "skill: workspace-and-hub library/skills/<id>/SKILL.md",
      "hub: hub /hub.yaml",
      "agent: workspace-and-hub agents/<id>.agent.yaml",
      "workflow: workspace-and-hub workflows/<id>.workflow.yaml",
      "workflowTest: workspace-and-hub workflows/<id>.test.yaml",
      "routine: workspace-and-hub workflows/routines/<id>.routine.yaml",
    ]);
  });

  it("knows its kind names and nothing else", () => {
    expect(isKindName("workflowTest")).toBe(true);
    expect(isKindName("flow")).toBe(false);
    expect(isKindName("toString")).toBe(false);
  });
});

describe("format.reserved-folder", () => {
  it("is called .halonic", () => {
    expect(RESERVED_FOLDER).toBe(".halonic");
  });

  it.each([
    ".halonic",
    ".halonic/staging/abc/hub.yaml",
    "hubs/billing/.halonic",
    "hubs/billing/.halonic/source.json",
    "hubs/billing/.halonic/agents/clerk.agent.yaml",
  ])("reserves %s", (path) => {
    expect(isReservedPath(path)).toBe(true);
  });

  it.each([
    "hubs/billing/agents/clerk.agent.yaml",
    "hubs/billing/library/.halonic/x.yaml",
    ".halonic-notes.md",
    "hubs/.halonic/hub.yaml",
    "docs/.halonic/x",
  ])("leaves %s to the loader", (path) => {
    expect(isReservedPath(path)).toBe(false);
  });
});
