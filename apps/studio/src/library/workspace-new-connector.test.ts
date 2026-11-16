import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceNewConnector } from "./workspace-new-connector.ts";

function setup() {
  const store: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
  };
  const changes: Array<[string, Record<string, string | null>]> = [];
  const host = new WorkspaceNewConnector({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (label, made) => changes.push([label, made]),
    },
    onChange: () => () => undefined,
  });
  return { host, changes };
}

const blank = {
  name: "Notes",
  hub: null,
  way: "http",
  account: "",
  url: "https://mcp.example.com",
  command: "",
  secret: "",
} as const;

verifies("library.new-connector", () => {
  it("lists the hubs and the three ways, and names the file the connector would be", async () => {
    const { host } = setup();
    await host.prepare();
    expect(host.hubs()).toEqual([{ id: "support", name: "Support" }]);
    expect(host.ways()).toEqual(["google", "http", "stdio"]);
    expect(host.file({ name: "", hub: "support" })).toBe("hubs/support/library/connectors/");
    expect(host.file({ name: "Notes", hub: "support" })).toBe(
      "hubs/support/library/connectors/notes.connector.yaml",
    );
  });

  it("writes an MCP connector as one change that asks about every tool", async () => {
    const { host, changes } = setup();
    const made = await host.create({ ...blank, secret: "NOTES_TOKEN" });
    expect(made).toEqual({ hub: null, id: "notes" });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[0]).toBe("Added connector notes");
    const text = changes[0]?.[1]["library/connectors/notes.connector.yaml"] ?? "";
    expect(text).toContain("https://mcp.example.com");
    expect(text).toContain("NOTES_TOKEN");
    expect(text).toContain("approve: all");
  });

  it("asks first only for the Google tools that change or send something", async () => {
    const { host, changes } = setup();
    await host.create({ ...blank, name: "Mail", hub: "support", way: "google", account: "a@b.co" });
    const text = changes[0]?.[1]["hubs/support/library/connectors/mail.connector.yaml"] ?? "";
    expect(text).toContain("gmail_send");
    expect(text).toContain("drive_move_file");
    expect(text).not.toContain("gmail_search");
  });

  it("refuses with a sentence and writes nothing", async () => {
    const { host, changes } = setup();
    await expect(host.create({ ...blank, name: " " })).rejects.toThrow("Give it a name.");
    expect(changes).toEqual([]);
  });
});
