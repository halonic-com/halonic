import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type FilesHostParts, WorkspaceFilesHost } from "./workspace-files-host.ts";

function hostWith(texts: Record<string, string>): WorkspaceFilesHost {
  const parts = {
    store: { list: async () => [] },
    files: { read: async (path: string) => texts[path] ?? null },
  };
  return new WorkspaceFilesHost(parts as unknown as FilesHostParts);
}

verifies("studio.workspace-files-syntax-line", () => {
  it("gives the line where a YAML file stops being valid YAML", async () => {
    const host = hostWith({ "hubs/p/hub.yaml": "id: p\nname: [unclosed\n" });

    expect(await host.yamlSyntaxLine("hubs/p/hub.yaml")).toBeGreaterThan(0);
  });

  it("says nothing for YAML that reads, a file that isn't YAML, a missing file or a file that is too long", async () => {
    const host = hostWith({
      "hubs/p/hub.yaml": "id: p\n",
      "notes.md": "id: [unclosed\n",
      "big.yaml": `a: [${"x".repeat(1_000_001)}`,
    });

    expect(await host.yamlSyntaxLine("hubs/p/hub.yaml")).toBeNull();
    expect(await host.yamlSyntaxLine("notes.md")).toBeNull();
    expect(await host.yamlSyntaxLine("gone.yaml")).toBeNull();
    expect(await host.yamlSyntaxLine("big.yaml")).toBeNull();
  });

  it("says nothing while the file's saving is paused because it changed outside", async () => {
    const host = hostWith({ "a.yaml": "id: [mine" });
    expect(await host.yamlSyntaxLine("a.yaml")).toBeGreaterThan(0);

    host.noteHeld([{ path: "a.yaml", current: "id: theirs" }]);

    expect(await host.yamlSyntaxLine("a.yaml")).toBeNull();
  });
});
