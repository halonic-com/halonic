import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  chainHistory,
  changelogHistory,
  historyMaxLength,
  historyMaxVersions,
  limitHistory,
  previewRelease,
  previousPreview,
  type ReleaseNote,
} from "./release-notes.ts";

/** A changelog of 0.4.1 to 0.4.4, newest first, as `changeset version` writes it. */
const changelog = `# @halonicjs/app-studio

## 0.4.4

### Patch Changes

- 1a2b3c4: The Inbox opens on the newest card.

## 0.4.3

### Patch Changes

- 2b3c4d5: Runs list today's summary first.

## 0.4.2

### Minor Changes

- 3c4d5e6: Agents can ask in the sandbox.

## 0.4.1

### Patch Changes

- 4d5e6f7: Welcome says why the demo can't be copied.
`;

function note(version: string, length = 10): ReleaseNote {
  return { version, notes: `- ${"x".repeat(length - 2)}` };
}

verifies("publish.release-notes-history", () => {
  describe("changelogHistory", () => {
    it("lists the notes of every version up to the release, newest first, for an install that skipped some", () => {
      expect(changelogHistory(changelog, "0.4.4")).toEqual([
        { version: "0.4.4", notes: "- The Inbox opens on the newest card." },
        { version: "0.4.3", notes: "- Runs list today's summary first." },
        { version: "0.4.2", notes: "- Agents can ask in the sandbox." },
        { version: "0.4.1", notes: "- Welcome says why the demo can't be copied." },
      ]);
    });

    it("starts at the version released, leaving out newer sections", () => {
      expect(changelogHistory(changelog, "0.4.2").map((entry) => entry.version)).toEqual([
        "0.4.2",
        "0.4.1",
      ]);
    });

    it("is empty for a version the changelog doesn't have", () => {
      expect(changelogHistory(changelog, "0.4.5")).toEqual([]);
    });
  });

  describe("limitHistory", () => {
    it("keeps the newest versions that fit and drops the older ones", () => {
      const half = historyMaxLength / 2;
      const kept = limitHistory([note("0.4.4", half), note("0.4.3", half), note("0.4.2", 10)]);
      expect(kept.map((entry) => entry.version)).toEqual(["0.4.4", "0.4.3"]);
    });

    it("keeps at most the most versions", () => {
      const many = Array.from({ length: historyMaxVersions + 5 }, (_, index) =>
        note(`0.0.${index}`),
      );
      expect(limitHistory(many)).toHaveLength(historyMaxVersions);
    });

    it("always keeps the newest, however long", () => {
      expect(limitHistory([note("0.4.4", historyMaxLength + 1), note("0.4.3")])).toHaveLength(1);
    });
  });

  describe("chainHistory", () => {
    const own = { version: "0.4.4-preview.12", notes: "- Newest build." };

    it("puts the build's own notes before the previous build's list", () => {
      const previous = [
        { version: "0.4.4-preview.11", notes: "- Build 11." },
        { version: "0.4.4-preview.9", notes: "- Build 9." },
      ];
      expect(chainHistory(own, previous)).toEqual([own, ...previous]);
    });

    it("leaves out entries that aren't a version and its notes, and repeats of a version", () => {
      const previous = [
        { version: "0.4.4-preview.12", notes: "- An older copy." },
        { version: "0.4.4-preview.11" },
        { version: 11, notes: "- Not a version." },
        "text",
        null,
        { version: "0.4.4-preview.10", notes: "- Build 10." },
        { version: "0.4.4-preview.10", notes: "- Again." },
      ];
      expect(chainHistory(own, previous)).toEqual([
        own,
        { version: "0.4.4-preview.10", notes: "- Build 10." },
      ]);
    });

    it("starts a new list when the previous one isn't a list", () => {
      expect(chainHistory(own, { version: "x" })).toEqual([own]);
      expect(chainHistory(own, undefined)).toEqual([own]);
    });
  });

  describe("previousPreview", () => {
    const source = "0123456789abcdef0123456789abcdef01234567";

    it("reads the previous build's version, commit and list", () => {
      const list = [{ version: "0.4.4-preview.11", notes: "- Build 11." }];
      const manifest = { version: "0.4.4-preview.11", halonic: { source, releaseNotes: list } };
      expect(previousPreview(manifest)).toEqual({
        version: "0.4.4-preview.11",
        source,
        releaseNotes: list,
      });
    });

    it("has none for a build without a full commit or a version, or text that isn't a manifest", () => {
      expect(previousPreview({ version: "0.4.4-preview.11", halonic: {} })).toBeUndefined();
      expect(
        previousPreview({ version: "0.4.4-preview.11", halonic: { source: "0123abc" } }),
      ).toBeUndefined();
      expect(previousPreview({ halonic: { source } })).toBeUndefined();
      expect(previousPreview({ version: "0.4.4-preview.11" })).toBeUndefined();
      expect(previousPreview(null)).toBeUndefined();
      expect(previousPreview("text")).toBeUndefined();
    });
  });

  describe("previewRelease", () => {
    const changeset =
      '---\n"@halonicjs/app-studio": patch\n---\n\nThe Inbox opens on the newest card.\n';
    const previous = [{ version: "0.4.4-preview.11", notes: "- Build 11." }];

    it("lists the build's changes since the previous build before that build's list", () => {
      expect(previewRelease("0.4.4-preview.12", [changeset], "0.4.4-preview.11", previous)).toEqual(
        {
          own: "Changes since 0.4.4-preview.11, newest first:\n\n- The Inbox opens on the newest card.",
          history: [
            {
              version: "0.4.4-preview.12",
              notes:
                "Changes since 0.4.4-preview.11, newest first:\n\n- The Inbox opens on the newest card.",
            },
            ...previous,
          ],
        },
      );
    });

    it("says a build without changes has none and leaves it out of the list", () => {
      expect(previewRelease("0.4.4-preview.12", [], "0.4.4-preview.11", previous)).toEqual({
        own: "No changes users see since 0.4.4-preview.11.",
        history: previous,
      });
    });
  });
});
