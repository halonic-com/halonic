import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { OpenFolderAssistant } from "./assistant-workspace.ts";

const folders: string[] = [];

afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

async function folderWith(files: Record<string, string>): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "assistant-workspace-"));
  folders.push(folder);
  await mkdir(join(folder, "providers"));
  for (const [path, text] of Object.entries(files)) await writeFile(join(folder, path), text);
  return folder;
}

const workspaceYaml = (extra = "") => `version: 1\nid: acme\nname: Acme\n${extra}`;
const providerYaml = (secret: string) =>
  `version: 1\nid: main\ntype: anthropic\nsecret: ${secret}\n`;

/** Waits for the first read, which the constructor starts. */
async function settled(assistant: OpenFolderAssistant) {
  await vi.waitFor(() => expect(assistant.current()).not.toBeNull());
  return assistant;
}

verifies("settings.ai-agent-key-line", () => {
  it("reads the folder's name, privacy, own model and the secret names its providers use", async () => {
    const folder = await folderWith({
      "workspace.yaml": workspaceYaml("privacy:\n  localOnly: true\nassistant:\n  model: smart\n"),
      "providers/main.yaml": providerYaml("Anthropic-Key"),
    });
    const assistant = await settled(
      new OpenFolderAssistant({
        definitions: new FolderDefinitionStore(folder),
        name: "folder",
        onChange: () => () => {},
      }),
    );
    const facts = assistant.current();
    expect(facts).toMatchObject({ name: "Acme", localOnly: true, sessionModel: "smart" });
    expect(facts?.usesSecret("anthropic_key")).toBe(true);
    expect(facts?.usesSecret("other")).toBe(false);
    expect(facts?.usesSecret("not a name")).toBe(false);
    assistant.dispose();
  });

  it("reads again when the files change, and tells listeners only of a difference", async () => {
    const folder = await folderWith({ "workspace.yaml": workspaceYaml() });
    let changed = () => {};
    const assistant = await settled(
      new OpenFolderAssistant({
        definitions: new FolderDefinitionStore(folder),
        name: "folder",
        onChange: (listener) => {
          changed = listener;
          return () => {};
        },
      }),
    );
    const heard = vi.fn();
    assistant.subscribe(heard);
    changed();
    await assistant.refresh();
    expect(heard).not.toHaveBeenCalled();
    await writeFile(join(folder, "workspace.yaml"), workspaceYaml("privacy:\n  localOnly: true\n"));
    changed();
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    expect(assistant.current()?.localOnly).toBe(true);
    assistant.dispose();
  });

  it("asks the keychain whether a key is stored, and says it can't without one", async () => {
    const folder = await folderWith({ "workspace.yaml": workspaceYaml() });
    const options = {
      definitions: new FolderDefinitionStore(folder),
      name: "folder",
      onChange: () => () => {},
    };
    const withKeychain = new OpenFolderAssistant({
      ...options,
      secrets: { get: async (name) => (name === "set" ? "value" : null) },
    });
    expect(await withKeychain.keyStored("set")).toBe(true);
    expect(await withKeychain.keyStored("missing")).toBe(false);
    const without = new OpenFolderAssistant(options);
    await expect(without.keyStored("set")).rejects.toThrow("no keychain");
    withKeychain.dispose();
    without.dispose();
  });

  it("keeps its last facts and reports when the folder can't be read", async () => {
    const onError = vi.fn();
    const assistant = new OpenFolderAssistant({
      definitions: {
        location: "/nowhere",
        list: async () => {
          throw new Error("denied");
        },
        read: async () => null,
        version: async () => "none",
      },
      name: "folder",
      onChange: () => () => {},
      onError,
    });
    await assistant.refresh();
    expect(assistant.current()).toBeNull();
    expect(onError).toHaveBeenCalled();
    assistant.dispose();
  });
});
