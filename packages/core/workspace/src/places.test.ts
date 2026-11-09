import { type FilePlace, fileKinds, kindNames } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { placeOf } from "./index.ts";
import { placeMatches } from "./places.ts";

/** A path in the place at the workspace root, in a hub, or both, as its scope allows. */
function examplePaths(place: FilePlace): string[] {
  const folder = place.folder === "" ? "" : `${place.folder}/`;
  const inPlace = `${folder}${place.name.replace("<id>", "acme")}`;
  const paths: string[] = [];
  if (place.scope !== "hub") {
    paths.push(inPlace);
  }
  if (place.scope !== "workspace") {
    paths.push(`hubs/acme-hub/${inPlace}`);
  }
  return paths;
}

verifies("workspace.file-places", () => {
  it("places a hub's agent by its file name", () => {
    expect(placeOf("hubs/billing/agents/clerk.agent.yaml")).toEqual({
      kind: "agent",
      hub: "billing",
      placeId: "clerk",
    });
  });

  it("gives a hub's own file the hub folder as its place id", () => {
    expect(placeOf("hubs/billing/hub.yaml")).toEqual({
      kind: "hub",
      hub: "billing",
      placeId: "billing",
    });
  });

  it("places a skill by its folder", () => {
    expect(placeOf("library/skills/plain-words/SKILL.md")).toEqual({
      kind: "skill",
      hub: null,
      placeId: "plain-words",
    });
  });

  it("gives a workspace file no place id", () => {
    expect(placeOf("models.yaml")).toEqual({ kind: "models", hub: null });
  });

  it("tells a workflow, its test and a routine apart in the same folder", () => {
    expect(placeOf("workflows/invoice.workflow.yaml")?.kind).toBe("workflow");
    expect(placeOf("workflows/invoice.test.yaml")?.kind).toBe("workflowTest");
    expect(placeOf("workflows/routines/hourly.routine.yaml")?.kind).toBe("routine");
  });

  it("places nothing outside the registered places", () => {
    expect(placeOf("README.md")).toBeUndefined();
    expect(placeOf("hubs/billing/flows/archive.flow.yaml")).toBeUndefined();
    // Workspace-only kinds don't sit in a hub, and hub-only kinds not at the root.
    expect(placeOf("hubs/billing/models.yaml")).toBeUndefined();
    expect(placeOf("hub.yaml")).toBeUndefined();
    // `<id>` is one path segment, never a folder.
    expect(placeOf("agents/team/clerk.agent.yaml")).toBeUndefined();
    expect(placeOf("agents/.agent.yaml")).toBeUndefined();
  });

  it("places an example path of every registered place as exactly that kind", () => {
    for (const kind of kindNames()) {
      for (const path of fileKinds[kind].places.flatMap(examplePaths)) {
        const kinds = placeMatches(path).map((match) => match.kind);
        expect({ path, kinds }).toEqual({ path, kinds: [kind] });
      }
    }
  });
});
