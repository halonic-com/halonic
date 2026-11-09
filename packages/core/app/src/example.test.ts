import { expect, it } from "vitest";
import { runExample } from "../examples/edit-save-undo.ts";

it("the README example runs and gives the results its comments promise", async () => {
  expect(await runExample()).toEqual([
    'opened: store "name: Clerk\\n", workspace "name: Clerk\\n", unsaved: nothing',
    "event: Renamed the agent",
    'edited: store "name: Clerk\\n", workspace "name: Senior Clerk\\n", unsaved: hubs/acme/agents/clerk.agent.yaml',
    "event: Saved 1 file",
    "event: wrote hubs/acme/agents/clerk.agent.yaml",
    "workspace.save wrote 1 file",
    'saved: store "name: Senior Clerk\\n", workspace "name: Senior Clerk\\n", unsaved: nothing',
    "event: Undone",
    'undone: store "name: Senior Clerk\\n", workspace "name: Clerk\\n", unsaved: hubs/acme/agents/clerk.agent.yaml',
  ]);
});
