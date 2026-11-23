import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { chatTools } from "../testing/call-tool.test-helper.ts";
import { testWorkspace } from "../testing/test-workspace.test-helper.ts";

const workspaceYaml = "id: acme\nname: Acme\n";
const sorter = "hubs/support/agents/sorter.agent.yaml";

verifies("assistant.build.validate-with-proposals", () => {
  it("checks a change to review, as it is in the file", async () => {
    const workspace = testWorkspace({ "workspace.yaml": workspaceYaml });
    const call = chatTools(workspace);
    await call("propose_file", { path: sorter, content: "id: sorter\n", why: "A sorter" });
    expect(await call("validate")).toBe(`error ${sorter}: Missing required key "name"`);
  });

  it("says there are no problems when every change is valid", async () => {
    const workspace = testWorkspace({ "workspace.yaml": workspaceYaml });
    const call = chatTools(workspace);
    await call("propose_file", {
      path: sorter,
      content: "id: sorter\nname: Sorter\n",
      why: "A sorter",
    });
    expect(await call("validate")).toBe("No problems.");
  });

  it("checks an untrusted workspace's items too", async () => {
    const workspace = testWorkspace(
      { "workspace.yaml": "id: acme\nname: [\n", "package.json": "{" },
      false,
    );
    expect(await chatTools(workspace)("validate")).toMatch(/^error workspace\.yaml: [^\n]+$/u);
  });
});
