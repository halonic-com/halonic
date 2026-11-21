import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-files-host-fixture.ts";

verifies("studio.workspace-files-delete", () => {
  const skill = "hubs/support/library/skills/refunds/SKILL.md";
  const workspace = {
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    [skill]: "---\nname: Refunds\ndescription: Use for refunds\n---\nBe kind.\n",
    "hubs/support/library/skills/refunds/script.sh": "echo",
  };
  const fixes: readonly [KeyboardPlatform, string][] = [
    [
      "windows",
      "To delete refunds, delete the folder hubs\\support\\library\\skills\\refunds in File Explorer.",
    ],
    [
      "macos",
      "To delete refunds, delete the folder hubs/support/library/skills/refunds in Finder.",
    ],
    [
      "linux",
      "To delete refunds, delete the folder hubs/support/library/skills/refunds in your file manager.",
    ],
  ];

  it.each(fixes)(
    "refuses a skill whose folder has other files, naming the file manager on %s",
    async (platform, fix) => {
      const { host, changes } = setup([], {}, workspace, {}, platform);

      await expect(host.remove(skill)).rejects.toMatchObject({
        kind: "unavailable",
        message: "Studio can't delete a skill that has other files in its folder yet.",
        fix,
      });
      expect(changes).toEqual([]);
    },
  );
});
