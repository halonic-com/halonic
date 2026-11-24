import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { TestStore } from "../testing/test-workspace.test-helper.ts";
import {
  authoringInstructions,
  authoringSkillPath,
  builtInAuthoringInstructions,
  builtInAuthoringSkill,
  ownAuthoringSkill,
} from "./authoring-skill.ts";

const workspaceYaml = "id: acme\nname: Acme\n";
const skill = (body: string) =>
  `---\nname: halonic-authoring\ndescription: How to build here.\n---\n\n${body}\n`;
const load = (files: Record<string, string>) =>
  loadWorkspace(new TestStore({ "workspace.yaml": workspaceYaml, ...files }));

verifies("assistant.build.authoring-skill-override", () => {
  it("tells the model the built-in instructions when the workspace has no skill of its own", async () => {
    const workspace = await load({});
    expect(ownAuthoringSkill(workspace)).toBeUndefined();
    expect(authoringInstructions(workspace)).toBe(builtInAuthoringInstructions);
  });

  it("tells the model the workspace's own skill instead", async () => {
    const workspace = await load({ [authoringSkillPath]: skill("Always answer in Dutch.") });
    expect(ownAuthoringSkill(workspace)?.path).toBe(authoringSkillPath);
    expect(authoringInstructions(workspace)).toBe("Always answer in Dutch.");
  });

  it("takes a hub's skill when the root has none, and the root's over a hub's", async () => {
    const hub = `hubs/support/${authoringSkillPath}`;
    const files = { "hubs/support/hub.yaml": "id: support\nname: Support\n" };
    const inHub = await load({ ...files, [hub]: skill("Hub rules.") });
    expect(authoringInstructions(inHub)).toBe("Hub rules.");
    const both = await load({
      ...files,
      [hub]: skill("Hub rules."),
      [authoringSkillPath]: skill("Root rules."),
    });
    expect(authoringInstructions(both)).toBe("Root rules.");
  });

  it("keeps the built-in instructions for a skill with an empty body or an error", async () => {
    expect(authoringInstructions(await load({ [authoringSkillPath]: skill("") }))).toBe(
      builtInAuthoringInstructions,
    );
    const broken = "---\nname: halonic-authoring\n---\nNo description.\n";
    expect(authoringInstructions(await load({ [authoringSkillPath]: broken }))).toBe(
      builtInAuthoringInstructions,
    );
  });

  it("writes the built-in skill as a skill the workspace loads, with the same instructions", async () => {
    const workspace = await load({ [authoringSkillPath]: builtInAuthoringSkill });
    expect(workspace.issues).toEqual([]);
    expect(authoringInstructions(workspace)).toBe(builtInAuthoringInstructions.trim());
  });
});
