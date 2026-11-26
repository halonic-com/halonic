import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  changelogSection,
  changesetEntry,
  fitNotes,
  notesMaxLength,
  previewNotes,
} from "./release-notes.ts";

const changelog = `# @halonicjs/app-studio

## 0.1.1

### Patch Changes

- 9800bc3: Accepting a run's changes never writes into Halonic's data folder.
- 9f2c645: Add trigger asks what the agent should do
  before it writes the routine.

## 0.1.0

First release of Halonic.

### Command line

- \`halonic test\` runs the tests of a workspace's workflows.
`;

function changeset(body: string, packages = ['"@halonicjs/app-studio": patch']): string {
  return `---\n${packages.join("\n")}\n---\n\n${body}\n`;
}

verifies("publish.release-notes", () => {
  describe("changelogSection", () => {
    it("takes the version's entries without the kind heading and the commit hashes", () => {
      expect(changelogSection(changelog, "0.1.1")).toBe(
        "- Accepting a run's changes never writes into Halonic's data folder.\n" +
          "- Add trigger asks what the agent should do\n  before it writes the routine.",
      );
    });

    it("keeps prose and the headings people wrote, up to the end of the file", () => {
      expect(changelogSection(changelog, "0.1.0")).toBe(
        "First release of Halonic.\n\n### Command line\n\n- `halonic test` runs the tests of a workspace's workflows.",
      );
    });

    it("takes the newest section for latest, as dry runs do", () => {
      expect(changelogSection(changelog, "latest")).toBe(changelogSection(changelog, "0.1.1"));
    });

    it("has none for a version the changelog doesn't name, or names without text", () => {
      expect(changelogSection(changelog, "0.1.2")).toBeUndefined();
      expect(changelogSection(changelog, "0.1")).toBeUndefined();
      expect(
        changelogSection("## 0.2.0\n\n### Patch Changes\n\n## 0.1.0\n", "0.2.0"),
      ).toBeUndefined();
    });

    it("reads a changelog with Windows line ends", () => {
      expect(changelogSection(changelog.replaceAll("\n", "\r\n"), "0.1.1")).toBe(
        changelogSection(changelog, "0.1.1"),
      );
    });
  });

  describe("changesetEntry", () => {
    it("lists a changeset that names the app, with later lines under the dash", () => {
      expect(
        changesetEntry(changeset("Settings has an Update track.\n\nPick Stable or Preview.")),
      ).toBe("- Settings has an Update track.\n  \n  Pick Stable or Preview.");
    });

    it("leaves out a changeset users don't see, one without a body, and text without front matter", () => {
      expect(
        changesetEntry(changeset("Internal.", ['"@halonicjs/core-engine": patch'])),
      ).toBeUndefined();
      expect(changesetEntry(changeset(""))).toBeUndefined();
      expect(changesetEntry("Just text.")).toBeUndefined();
    });
  });

  describe("fitNotes", () => {
    it("keeps notes that fit as they are", () => {
      expect(fitNotes("- One.\n- Two.")).toBe("- One.\n- Two.");
    });

    it("cuts long notes at the start of an entry, within the limit, and counts what it left out", () => {
      const entry = `- ${"y".repeat(998)}`;
      const text = Array.from({ length: 25 }, () => entry).join("\n");
      const notes = fitNotes(text);
      expect(notes.length).toBeLessThanOrEqual(notesMaxLength);
      expect(
        notes
          .split("\n\n")[0]
          ?.split("\n")
          .every((line) => line === entry),
      ).toBe(true);
      expect(notes.endsWith("\n\nAnd 6 more changes.")).toBe(true);
    });

    it("counts one left out as one change", () => {
      const first = `- ${"z".repeat(notesMaxLength - 60)}`;
      expect(fitNotes(`${first}\n- ${"w".repeat(100)}`)).toBe(`${first}\n\nAnd 1 more change.`);
    });
  });

  describe("previewNotes", () => {
    it("lists the app's changes since the stable release, newest first", () => {
      const notes = previewNotes(
        [
          changeset("Newest."),
          changeset("Not ours.", ['"@halonicjs/tooling-check": patch']),
          changeset("Older."),
        ],
        "0.1.1",
      );
      expect(notes).toBe("Changes since 0.1.1, newest first:\n\n- Newest.\n- Older.");
    });

    it("counts the changes past the length limit", () => {
      const changesets = Array.from({ length: 200 }, (_, index) =>
        changeset(`Change ${index}. ${"x".repeat(150)}`),
      );
      const notes = previewNotes(changesets, "0.1.1") ?? "";
      const shown = notes.match(/^- /gm)?.length ?? 0;
      expect(notes.length).toBeLessThanOrEqual(notesMaxLength);
      expect(notes).toContain("- Change 0.");
      expect(notes.endsWith(`\n\nAnd ${200 - shown} more changes.`)).toBe(true);
    });

    it("has none when no changeset names the app", () => {
      expect(
        previewNotes([changeset("x", ['"@halonicjs/tooling-check": patch'])], "0.1.1"),
      ).toBeUndefined();
    });
  });
});
