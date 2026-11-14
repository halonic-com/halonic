import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { type NewLibraryItem, newLibraryFile } from "./new-library-item.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

const base = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
  "library/collections/claims.collection.yaml":
    "id: claims\nname: Claims\nfields:\n  name:\n    type: text\n",
};

function workspaceWith(files: Record<string, string> = {}): Promise<LoadedWorkspace> {
  return loadWorkspace(new TestDefinitionStore({ ...base, ...files }));
}

/** Makes the file, adds it to the workspace and loads it again, so the file's own checks run. */
async function made(item: NewLibraryItem, files: Record<string, string> = {}) {
  const result = newLibraryFile(await workspaceWith(files), item);
  if (!result.ok) {
    throw new Error(result.error);
  }
  const reloaded = await workspaceWith({ ...files, [result.value.path]: result.value.text });
  return { ...result.value, issues: reloaded.issues, reloaded };
}

verifies("app.new-library-item", () => {
  it("numbers the id of a collection when another has it", async () => {
    const file = await made({ kind: "collection", name: "Claims" });

    expect(file.path).toBe("library/collections/claims-2.collection.yaml");
    expect(file.text).toContain("required: true");
    expect(file.issues).toEqual([]);
  });

  it("makes a skill in a hub with its name and description in the header", async () => {
    const file = await made({
      kind: "skill",
      name: "Acme refunds",
      description: "Use for refund questions",
      hub: "acme",
    });

    expect(file.path).toBe("hubs/acme/library/skills/acme-refunds/SKILL.md");
    expect(file.text).toContain("name: Acme refunds");
    expect(file.text).toContain("description: Use for refund questions");
    expect(file.issues).toEqual([]);
  });

  it("shares a skill at the root when no hub is given", async () => {
    const file = await made({ kind: "skill", name: "Triage", description: "Sort mail", hub: null });

    expect(file.path).toBe("library/skills/triage/SKILL.md");
  });

  it("only counts the ids of the same place", async () => {
    const file = await made(
      { kind: "skill", name: "Triage", description: "Sort mail", hub: "acme" },
      { "library/skills/triage/SKILL.md": "---\nname: Triage\ndescription: Sort.\n---\n" },
    );

    expect(file.id).toBe("triage");
  });

  it("makes every tool of a new connector ask first, whatever the transport", async () => {
    const transports = [
      { google: { account: "fin@acme.example", askFirst: ["gmail_send"] } },
      { http: { url: "https://notes.acme.dev/mcp" } },
      { stdio: { command: "npx -y @acme/notes-mcp" } },
    ] as const;
    for (const transport of transports) {
      const file = await made({ kind: "connector", name: "Notes", hub: "acme", transport });

      expect(file.path).toBe("hubs/acme/library/connectors/notes.connector.yaml");
      expect(file.text).toContain("google" in transport ? "- gmail_send" : "approve: all");
      expect(file.issues).toEqual([]);
    }
  });

  it("names the secret, never a value, for an HTTP connector and a local program", async () => {
    const http = await made({
      kind: "connector",
      name: "Notes",
      hub: null,
      transport: { http: { url: "https://notes.acme.dev/mcp" } },
      secret: "NOTES_TOKEN",
    });
    const stdio = await made({
      kind: "connector",
      name: "Notes",
      hub: null,
      transport: { stdio: { command: "npx -y @acme/notes-mcp" } },
      secret: "NOTES_TOKEN",
    });

    expect(http.text).toContain("secret: NOTES_TOKEN");
    expect(stdio.text).toContain("NOTES_TOKEN: NOTES_TOKEN");
    expect(stdio.text).toContain("command: npx");
    expect(http.issues).toEqual([]);
    expect(stdio.issues).toEqual([]);
  });

  it("gives a Google connector no secret", async () => {
    const file = await made({
      kind: "connector",
      name: "Mail",
      hub: null,
      transport: { google: { account: "fin@acme.example", askFirst: [] } },
      secret: "IGNORED",
    });

    expect(file.text).not.toContain("secret");
  });

  it("refuses an empty name, a skill with no description and a connector with no connection", async () => {
    const workspace = await workspaceWith();
    const skill = { kind: "skill", name: "Triage", description: " ", hub: null } as const;
    const connector = {
      kind: "connector",
      name: "Notes",
      hub: null,
      transport: { http: { url: " " } },
    } as const;

    expect(newLibraryFile(workspace, { kind: "collection", name: "  " })).toEqual({
      ok: false,
      error: "name_missing",
    });
    expect(newLibraryFile(workspace, skill)).toEqual({ ok: false, error: "description_missing" });
    expect(newLibraryFile(workspace, connector)).toEqual({
      ok: false,
      error: "connection_missing",
    });
  });
});
