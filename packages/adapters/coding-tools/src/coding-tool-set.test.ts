import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { secretRemoved } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { maxAnswerCharacters, maxLineCharacters } from "./answer-cap.ts";
import { type CodingToolChoice, CodingToolSet } from "./coding-tool-set.ts";
import { removeTestFolders, testFolders } from "./folders.test-helper.ts";

afterEach(removeTestFolders);

/** A made-up value, used as the session's one secret. */
const secret = "made-up-secret-7f3a9c2e";

async function toolSet(choice: CodingToolChoice = "read-only") {
  const folders = await testFolders();
  const tools = new CodingToolSet({ folders, choice, testEnvironment: {}, secrets: [secret] });
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

verifies("coding-tools.tool-set", () => {
  it("removes the secrets from a test log read with read_ranges", async () => {
    const { folders, call } = await toolSet();
    const log = join(folders.testLogFolder, "run-1.log");
    await writeFile(log, `token=${secret}\nok\n`);
    const result = await call("read_ranges", { files: [{ path: log }] });
    expect(result.text).toContain(`1\ttoken=${secretRemoved}`);
    expect(result.text).not.toContain(secret.slice(0, 12));
  });

  it("removes a secret that a cut line would have split", async () => {
    const { folders, call } = await toolSet();
    const before = "x".repeat(maxLineCharacters - 10);
    await folders.write("long.txt", `${before}${secret} and more`);
    const result = await call("read_ranges", { files: [{ path: "long.txt" }] });
    expect(result.text).toContain(`${before}${secretRemoved.slice(0, 10)}`);
    expect(result.text).not.toContain(secret.slice(0, 10));
  });

  it("removes the secrets from every tool's answer", async () => {
    const { folders, call } = await toolSet();
    await folders.write("config.txt", `key: ${secret}\n`);
    const found = await call("search", { pattern: "key" });
    expect(found.text).toContain(secretRemoved);
    expect(found.text).not.toContain(secret);
  });
});

verifies("coding-tools.read-only-choice", () => {
  it("offers run_tests too with the choice all, not named as only reading", async () => {
    const { tools } = await toolSet("all");
    const listed = await tools.list();
    expect(listed.map((tool) => tool.name)).toEqual([
      "read_ranges",
      "search",
      "repo_map",
      "run_tests",
    ]);
    expect(tools.readOnlyToolNames).toEqual(["read_ranges", "search", "repo_map"]);
  });

  it("answers run_tests as a tool it doesn't offer with the choice read-only", async () => {
    const { call } = await toolSet("read-only");
    const result = await call("run_tests", { command: "echo hi" });
    expect(result).toEqual({
      text: "There is no tool 'run_tests' here. The tools are: read_ranges, search, repo_map.",
      isError: true,
    });
  });
});
