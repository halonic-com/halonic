import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { maxAnswerCharacters } from "./answer-cap.ts";
import { CodingToolSet } from "./coding-tool-set.ts";
import { removeTestFolders, testFolders } from "./folders.test-helper.ts";

afterEach(removeTestFolders);

async function toolSet() {
  const folders = await testFolders();
  const tools = new CodingToolSet({ folders });
  const call = (name: string, args: Record<string, unknown>) =>
    tools.call(name, args, new AbortController().signal);
  return { folders, tools, call };
}

verifies("coding-tools.tool-set", () => {
  it("lists the three reading tools, all named as only reading", async () => {
    const { tools } = await toolSet();
    const listed = await tools.list();
    expect(listed.map((tool) => tool.name)).toEqual(["read_ranges", "search", "repo_map"]);
    for (const tool of listed) {
      expect(tool.description).not.toBe("");
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
    }
    expect(tools.readOnlyToolNames).toEqual(["read_ranges", "search", "repo_map"]);
  });

  it("answers a call to a tool it doesn't offer with an error that names its tools", async () => {
    const { call } = await toolSet();
    expect(await call("delete_files", {})).toEqual({
      text: "There is no tool 'delete_files' here. The tools are: read_ranges, search, repo_map.",
      isError: true,
    });
  });

  it("gives a refusal as an error result", async () => {
    const { call } = await toolSet();
    const result = await call("read_ranges", { files: [{ path: "../x" }] });
    expect(result.isError).toBe(false);
    expect(result.text).toContain("outside the working folder");
    expect(await call("search", { pattern: "(", regex: true })).toMatchObject({ isError: true });
  });

  it("keeps every answer within its size", async () => {
    const { folders, call } = await toolSet();
    for (let index = 0; index < 300; index += 1)
      await folders.write(`p${index}/package.json`, "{}");
    const result = await call("repo_map", {});
    expect(result.isError).toBe(false);
    expect(result.text.length).toBeLessThanOrEqual(maxAnswerCharacters);
  });
});
