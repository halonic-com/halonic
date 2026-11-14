// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import type { ListedToolDifference } from "../listed-tools-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ListedToolChanges } from "./listed-tool-changes.tsx";

afterEach(unmountAll);

function difference(overrides: Partial<ListedToolDifference>): ListedToolDifference {
  return {
    path: "description",
    before: "Finds notes.",
    after: "Finds notes fast.",
    hidden: null,
    ...overrides,
  };
}

describe("ListedToolChanges", () => {
  verifies("library.listed-tools-changed-columns", () => {
    it("shows the approved and the new version, with removed words struck and added words underlined", () => {
      const view = render(
        <ListedToolChanges
          differences={[difference({})]}
          serverChanged={false}
          sourceName="Notes server"
        />,
      );
      expect(view.textContent).toContain("Description");
      expect(view.textContent).toContain("Approved version");
      expect(view.textContent).toContain("New version");
      expect(view.querySelector(".line-through")?.textContent).toBe("notes.");
      expect(view.querySelector(".underline")?.textContent).toBe("notes fast.");
    });

    it("labels a change in plain words, never by its path", () => {
      const view = render(
        <ListedToolChanges
          differences={[
            difference({ path: "name" }),
            difference({ path: "parameters/properties/id/description" }),
            difference({ path: "parameters/required" }),
          ]}
          serverChanged={false}
          sourceName="Notes server"
        />,
      );
      const text = view.textContent ?? "";
      expect(text).toContain("Name");
      expect(text).toContain("Argument id: description");
      expect(text).toContain("Required arguments");
      expect(text).not.toContain("parameters/");
    });

    it("says why a change can't be seen, once", () => {
      const view = render(
        <ListedToolChanges
          differences={[difference({ before: "a\u200Bb", after: "ab", hidden: "format" })]}
          serverChanged={false}
          sourceName="Notes server"
        />,
      );
      const text = view.textContent ?? "";
      expect(text.split("characters you can't see")).toHaveLength(2);
    });

    it("says (none) for a new text and (removed) for a removed one", () => {
      const view = render(
        <ListedToolChanges
          differences={[difference({ before: null }), difference({ path: "x", after: null })]}
          serverChanged={false}
          sourceName="Notes server"
        />,
      );
      expect(view.textContent).toContain("(none)");
      expect(view.textContent).toContain("(removed)");
    });

    it("does not say (none) for a text that exists but is empty", () => {
      const view = render(
        <ListedToolChanges
          differences={[difference({ before: "", after: "Now has text." })]}
          serverChanged={false}
          sourceName="Notes server"
        />,
      );
      expect(view.textContent).not.toContain("(none)");
    });

    it("shows a plate, not columns, when only the server changed", () => {
      const view = render(
        <ListedToolChanges differences={[]} serverChanged sourceName="Notes server" />,
      );
      expect(view.textContent).toContain("Notes server connects differently");
      expect(view.textContent).not.toContain("Approved version");
    });

    it("shows nothing for a tool that did not change", () => {
      const view = render(
        <ListedToolChanges differences={[]} serverChanged={false} sourceName="Notes server" />,
      );
      expect(view.textContent).toBe("");
    });
  });
});
