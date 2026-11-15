// @vitest-environment jsdom

import { afterEach, expect, it } from "vitest";
import { show, unmount } from "../test-support.tsx";
import { WorkflowPage } from "./workflow-page.tsx";

afterEach(unmount);

it("names the workflow and has nothing to press", async () => {
  const item = { kind: "workflow", hub: "acme", id: "mail-triage" };
  const page = await show(<WorkflowPage item={item} context={{} as never} Sections={() => null} />);

  expect(page.querySelector("h1")?.textContent).toBe("mail-triage");
  expect(page.querySelectorAll("button")).toHaveLength(0);
});
