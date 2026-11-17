// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { openItem } from "../test-support/open-item.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

const notes = "notes/todo.txt";
const agent = "agents/triage.agent.yaml";

async function openPage() {
  const fake = fakeSource({
    kind: "ready",
    changes: [
      { path: notes, status: "modified", staged: false },
      { path: agent, status: "modified", staged: false },
    ],
  });
  fake.setTexts(notes, { before: "buy milk\n", after: "buy oat milk\n" });
  fake.setTexts(agent, {
    before: "id: triage\nname: Triage\nmodel: claude\n",
    after: "id: triage\nname: Triage\nmodel: gpt\n",
  });
  const root = render(<ChangesView list={new ChangesList(fake.source)} />);
  await act(settle);
  return root;
}

const advanced = (page: ParentNode) =>
  [...page.querySelectorAll<HTMLElement>("button")].find(
    (element) => element.textContent?.trim() === "Advanced",
  );

verifies("source-control.cant-describe", () => {
  describe("a file Halonic can't describe", () => {
    it("says so, names the file as CHANGED in mono, and starts with Advanced open", async () => {
      const page = openItem(await openPage(), "todo.txt");
      expect(page.textContent).toContain("Halonic can't describe this change.");
      expect(page.textContent).toContain("CHANGED");
      expect(page.querySelector("code")?.textContent).toBe(notes);
      expect(advanced(page)?.getAttribute("aria-expanded")).toBe("true");
      expect(page.textContent).toContain("+ buy oat milk");
      expect(page.textContent).toContain("Undo these changes");
    });

    it("leaves a described item alone, with Advanced closed", async () => {
      const page = openItem(await openPage(), "Triage");
      expect(page.textContent).not.toContain("can't describe");
      expect(advanced(page)?.getAttribute("aria-expanded")).toBe("false");
    });
  });
});
