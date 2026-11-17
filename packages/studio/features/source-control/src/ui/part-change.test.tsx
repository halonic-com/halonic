// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { openItem } from "../test-support/open-item.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";
import { partChangeKind } from "./part-change.tsx";

afterEach(unmountAll);

const agentPath = "agents/triage.agent.yaml";

async function pageFor(before: string, after: string) {
  const fake = fakeSource({
    kind: "ready",
    changes: [{ path: agentPath, status: "modified", staged: false }],
  });
  fake.setTexts(agentPath, { before, after });
  const root = render(<ChangesView list={new ChangesList(fake.source)} />);
  await act(settle);
  return openItem(root, "Triage");
}

verifies("source-control.changed-words", () => {
  describe("the words of a change", () => {
    it("says CHANGED with the old value struck through and the new one after it", async () => {
      const page = await pageFor(
        "id: triage\nname: Triage\nmodel: claude\n",
        "id: triage\nname: Triage\nmodel: gpt\n",
      );
      expect(page.textContent).toContain("CHANGED");
      expect(page.querySelector("del")?.textContent).toBe("Before: claude");
      expect(page.querySelector("ins")?.textContent).toBe("After: gpt");
    });

    it("says ADDED with no old value", async () => {
      const page = await pageFor(
        "id: triage\nname: Triage\n",
        "id: triage\nname: Triage\nmodel: gpt\n",
      );
      expect(page.textContent).toContain("ADDED");
      expect(page.querySelector("del")).toBeNull();
      expect(page.querySelector("ins")?.textContent).toBe("After: gpt");
    });

    it("says REMOVED with no new value", async () => {
      const page = await pageFor(
        "id: triage\nname: Triage\nmodel: gpt\n",
        "id: triage\nname: Triage\n",
      );
      expect(page.textContent).toContain("REMOVED");
      expect(page.querySelector("ins")).toBeNull();
      expect(page.querySelector("del")?.textContent).toBe("Before: gpt");
    });

    it("tells nothing for a part neither version has a value for", () => {
      expect(partChangeKind({ found: false }, { found: false })).toBeNull();
    });
  });
});
