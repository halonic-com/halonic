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

  it("replaces the integration steps too with the workspace's own skill", async () => {
    const workspace = await load({ [authoringSkillPath]: skill("Always answer in Dutch.") });
    expect(authoringInstructions(workspace)).not.toContain("integration_guide");
  });
});

verifies("assistant.build.integration-steps", () => {
  it("offers a built-in integration that fits before building one", () => {
    expect(builtInAuthoringInstructions).toContain(
      "Check what's already there first: the built-in Gmail and Google Drive",
    );
    expect(builtInAuthoringInstructions).toContain(
      "If one fits, offer it instead of building a new one.",
    );
  });

  it("asks only for the address, the tools and the sign-in, read-only by default", () => {
    expect(builtInAuthoringInstructions).toContain(
      "Ask only for what you still need: the service's address, which tools to offer (read-only unless they ask for more), and how it signs in",
    );
  });

  it("stops for a service that signs in only with OAuth", () => {
    expect(builtInAuthoringInstructions).toContain(
      "If the service signs in only with OAuth, say plainly that you can't build that sign-in here, and stop.",
    );
  });

  it("names `integration_guide`, and says it's there only once the workspace is trusted", () => {
    expect(builtInAuthoringInstructions).toContain(
      "Read the integration guide with `integration_guide` and follow it.",
    );
    expect(builtInAuthoringInstructions).toContain(
      "until then, say that the integration can be built once the workspace is trusted.",
    );
  });

  it("checks every reply with the kit's `checkReply`, so a changed reply names its field", () => {
    expect(builtInAuthoringInstructions).toContain(
      "Check every reply from the service with the kit's `checkReply` and a `z.object(...)` schema",
    );
  });

  it("stops after two failed fixes and says what's wrong", () => {
    expect(builtInAuthoringInstructions).toContain(
      "If it still fails after two fixes, stop and say what's wrong",
    );
  });

  it("never asks for a key in the chat", () => {
    expect(builtInAuthoringInstructions).toContain(
      "Never ask for a key, token or password in the chat",
    );
    const asksForAKey = /\b(paste|send|give|share|type)\b[^.\n]*\b(key|token|password)\b/i;
    for (const line of builtInAuthoringInstructions.split("\n")) {
      if (!line.includes("Never ask")) expect(line).not.toMatch(asksForAKey);
    }
  });
});
