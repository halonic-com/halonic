import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-files-host-fixture.ts";

verifies("studio.workspace-files-syntax-line", () => {
  it("gives the line where a YAML file stops being valid YAML", async () => {
    const { host } = setup([], {}, { "hubs/p/hub.yaml": "id: p\nname: [unclosed\n" });

    expect(await host.yamlSyntaxLine("hubs/p/hub.yaml")).toBeGreaterThan(0);
  });

  it("says nothing for YAML that reads, a file that isn't YAML, a missing file or a file that is too long", async () => {
    const { host } = setup(
      [],
      {},
      {
        "hubs/p/hub.yaml": "id: p\n",
        "notes.md": "id: [unclosed\n",
        "big.yaml": `a: ${"x".repeat(1_000_001)}`,
      },
    );

    expect(await host.yamlSyntaxLine("hubs/p/hub.yaml")).toBeNull();
    expect(await host.yamlSyntaxLine("notes.md")).toBeNull();
    expect(await host.yamlSyntaxLine("gone.yaml")).toBeNull();
    expect(await host.yamlSyntaxLine("big.yaml")).toBeNull();
  });

  it("says nothing for a file whose saving is paused, as its text on disk isn't the editor's", async () => {
    const { host } = setup(["a.yaml"], {}, { "a.yaml": "a: [unclosed\n" });
    host.noteHeld([{ path: "a.yaml", current: "theirs" }]);

    expect(await host.yamlSyntaxLine("a.yaml")).toBeNull();
  });
});
