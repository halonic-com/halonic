import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { sampleFiles } from "./sample-files.ts";

/** Every file under `folder`, dotfiles included, as `/` paths relative to `root`. */
function filesOnDisk(folder: string, root = folder): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesOnDisk(join(folder, entry.name), root)
      : [relative(root, join(folder, entry.name)).split("\\").join("/")],
  );
}

verifies("studio.try-sample", () => {
  it("bundles exactly the files of examples/acme", () => {
    const onDisk = filesOnDisk(join(import.meta.dirname, "../../../../examples/acme")).sort();

    expect(Object.keys(sampleFiles()).sort()).toEqual(onDisk);
  });

  it("bundles their contents, not their paths", () => {
    expect(sampleFiles()["workspace.yaml"]).toContain("name:");
  });

  // The workspace feature's `openOnSupportReply` opens a fresh demo on this workflow by its
  // location; if Acme renames or moves it, the demo would open on a page that isn't found.
  it("bundles the Support reply workflow the demo opens on", () => {
    const workflow = sampleFiles()["hubs/support/workflows/support-reply.workflow.yaml"];

    expect(workflow).toContain("id: support-reply");
    expect(workflow).toContain("name: Support reply");
  });
});
