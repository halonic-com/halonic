import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { PlacementReader } from "@halonicjs/app";
import type { Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cliProviderKeys } from "./cli-provider-keys.ts";
import { agentsWithProviderKey, withHarnessProviderKeys } from "./doctor-provider-keys.ts";
import { doctorWorkspace } from "./doctor-workspace.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-doctor-provider-keys-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes the files, by path in the workspace, and loads the workspace from them. */
async function workspaceOf(files: Record<string, string>): Promise<LoadedWorkspace> {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

/**
 * Choices that put the agents named in `onThisComputer` on this computer, and
 * every other in the sandbox. A name is an agent id, or `hub/agent` for one hub only.
 */
function placementOf(...onThisComputer: string[]): PlacementReader {
  return {
    where: async ({ hub, agent }) =>
      onThisComputer.includes(agent) || onThisComputer.includes(`${hub}/${agent}`)
        ? {
            runsOn: "this-computer",
            agentFingerprint: "sha256:0",
            chosenAt: "2026-11-20T09:00:00Z",
          }
        : { runsOn: "sandbox", agentFingerprint: "sha256:0", reason: "not-chosen" },
  };
}

const files = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-key\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
  "hubs/support/agents/writer.agent.yaml":
    "id: writer\nname: Writer\nharness: claude-code\nmodel: claude/claude-sonnet-5-5\n",
  "hubs/support/agents/coder.agent.yaml": "id: coder\nname: Coder\nharness: codex\n",
  "hubs/support/agents/helper.agent.yaml": "id: helper\nname: Helper\n",
};

/** Doctor never reads a key's value: a secret read fails the test. */
const noSecrets: Secrets = {
  get: async (name) => {
    throw new Error(`Doctor read the secret ${name}.`);
  },
};

/** The harness agents `run` gives a provider key, and the keys they get. */
async function providerKeyAgentsOf(
  workspace: LoadedWorkspace,
  placement: PlacementReader,
  { trusted = false }: { trusted?: boolean } = {},
) {
  const keys = cliProviderKeys({
    workspace: () => workspace,
    secrets: noSecrets,
    trusted,
    keyOrigins: { allowedOrigins: async () => undefined },
  });
  return agentsWithProviderKey({
    workspace,
    placement,
    location: root,
    readFile: async (path) => new Uint8Array(await readFile(join(root, path))),
    access: (agent) => keys.accessFor(agent),
  });
}

/** The ids of the harness agents `run` gives a provider key. */
async function keyedOf(
  workspace: LoadedWorkspace,
  placement: PlacementReader,
  options: { trusted?: boolean } = {},
): Promise<ReadonlySet<string>> {
  return (await providerKeyAgentsOf(workspace, placement, options)).agents;
}

/** The workspace as `doctor` reads it from its files, before the keys are added. */
function doctorWorkspaceOf(workspace: LoadedWorkspace) {
  return doctorWorkspace({
    workspace,
    integrations: [],
    location: root,
    fallbackName: "acme",
    commandPaths: new Map(),
  });
}

verifies("app.doctor-agent-sign-in", () => {
  it("names a sandboxed harness agent that run gives a provider key, as run decides it (HAL-14661)", async () => {
    const workspace = await workspaceOf(files);

    // Coder's Codex calls OpenAI, which has no provider with a key here; Helper is in Halonic's loop.
    expect(await keyedOf(workspace, placementOf())).toEqual(new Set(["writer"]));
    // On this computer, the program's own sign-in is used.
    expect(await keyedOf(workspace, placementOf("writer"))).toEqual(new Set());
  });

  it("leaves in an agent whose placement can't be read, so the Harnesses line still asks about it", async () => {
    const unreadable: PlacementReader = {
      where: async () => {
        throw new Error("The choices can't be read.");
      },
    };

    expect(await keyedOf(await workspaceOf(files), unreadable)).toEqual(new Set());
  });

  it("leaves in an agent run would stop on, so the Harnesses line still asks about it", async () => {
    const workspace = await workspaceOf({
      ...files,
      // Two keyed Anthropic providers and a model that points to neither.
      "providers/spare.yaml": "id: spare\ntype: anthropic\nsecret: spare-key\n",
      "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\nharness: claude-code\n",
    });

    expect(await keyedOf(workspace, placementOf())).toEqual(new Set());
  });

  it("names an agent whose model is an alias on this computer too, as run gives it the alias's key", async () => {
    const workspace = await workspaceOf({
      ...files,
      "models.yaml": "aliases:\n  smart:\n    provider: claude\n    model: claude-sonnet-5-5\n",
      "hubs/support/agents/writer.agent.yaml":
        "id: writer\nname: Writer\nharness: claude-code\nmodel: smart\n",
    });

    expect(await keyedOf(workspace, placementOf("writer"), { trusted: true })).toEqual(
      new Set(["writer"]),
    );
    // Untrusted, run stops before it names a key, so the line stays.
    expect(await keyedOf(workspace, placementOf("writer"))).toEqual(new Set());
  });

  it("names an agent at the root only when it gets a key in every hub, as each hub keeps its own choice", async () => {
    const workspace = await workspaceOf({
      "workspace.yaml": files["workspace.yaml"],
      "providers/claude.yaml": files["providers/claude.yaml"],
      "hubs/support/hub.yaml": files["hubs/support/hub.yaml"],
      "hubs/reports/hub.yaml": "id: reports\nname: Reports\n",
      "agents/writer.agent.yaml": files["hubs/support/agents/writer.agent.yaml"],
    });

    expect(await keyedOf(workspace, placementOf())).toEqual(new Set(["writer"]));
    expect(await keyedOf(workspace, placementOf("reports/writer"))).toEqual(new Set());
  });
});

verifies("cli.doctor-secrets", () => {
  /** C536 G1: a root agent of Claude Code without a model, and one keyed Anthropic provider no alias uses. */
  const noModel = {
    "workspace.yaml": files["workspace.yaml"],
    "providers/claude.yaml": files["providers/claude.yaml"],
    "hubs/support/hub.yaml": files["hubs/support/hub.yaml"],
    "agents/writer2.agent.yaml": "id: writer2\nname: Writer two\nharness: claude-code\n",
  };

  it("keeps the key run gives a harness agent without a model, so doctor checks it (HAL-15086)", async () => {
    const workspace = await workspaceOf(noModel);

    const found = await providerKeyAgentsOf(workspace, placementOf());

    expect(found.agents).toEqual(new Set(["writer2"]));
    expect(found.keys).toEqual([{ provider: "claude", secret: "anthropic-key" }]);
    // On this computer the program's own sign-in is used, so no key is needed.
    expect((await providerKeyAgentsOf(workspace, placementOf("writer2"))).keys).toEqual([]);
  });

  it("keeps the key of an agent that gets it in one hub only, as that run still needs it", async () => {
    const workspace = await workspaceOf({
      ...noModel,
      "hubs/reports/hub.yaml": "id: reports\nname: Reports\n",
    });

    const found = await providerKeyAgentsOf(workspace, placementOf("reports/writer2"));

    expect(found.agents).toEqual(new Set());
    expect(found.keys).toEqual([{ provider: "claude", secret: "anthropic-key" }]);
  });

  it("adds a key the Models line doesn't check to the secrets, used by its provider", async () => {
    const workspace = doctorWorkspaceOf(await workspaceOf(noModel));

    const withKeys = withHarnessProviderKeys(workspace, [
      { provider: "claude", secret: "anthropic-key" },
    ]);

    expect(withKeys.secrets).toEqual([
      { secret: "anthropic-key", usedBy: [{ kind: "provider", id: "claude" }] },
    ]);
  });

  it("leaves out a key the Models line checks already, so no secret is named twice", async () => {
    const workspace = doctorWorkspaceOf(
      await workspaceOf({
        ...noModel,
        "models.yaml": "aliases:\n  smart:\n    provider: claude\n    model: claude-sonnet-5-5\n",
      }),
    );

    const withKeys = withHarnessProviderKeys(workspace, [
      { provider: "claude", secret: "anthropic-key" },
    ]);

    expect(withKeys.secrets).toEqual([]);
  });

  it("adds the provider to a secret a connector uses too, named as first written", async () => {
    const workspace = doctorWorkspaceOf(
      await workspaceOf({
        ...noModel,
        "library/connectors/files.connector.yaml":
          "name: Files\ntransport:\n  stdio:\n    command: acme-files\n    secretEnv:\n      FILES_TOKEN: ANTHROPIC_KEY\n",
        "hubs/support/agents/helper.agent.yaml":
          "id: helper\nname: Helper\ninstructions: Help.\nconnectors: [files]\n",
      }),
    );

    const withKeys = withHarnessProviderKeys(workspace, [
      { provider: "claude", secret: "anthropic-key" },
    ]);

    expect(withKeys.secrets).toEqual([
      {
        secret: "ANTHROPIC_KEY",
        usedBy: [
          { kind: "connector", id: "files" },
          { kind: "provider", id: "claude" },
        ],
      },
    ]);
  });
});
