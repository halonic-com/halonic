import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { needsApproval, parseFile } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

verifies("format.connector-approve-all", () => {
  it("reads `approve: all` as written, with no warnings", () => {
    const text = yaml(
      "id: files",
      "transport: { stdio: { command: mcp } }",
      "tools:",
      "  approve: all",
    );
    const parsed = parseFile("connector", text);
    expect(parsed.ok && parsed.value.warnings).toEqual([]);
    expect(parsedValue("connector", text).tools).toEqual({ approve: "all" });
  });

  it("gives no warning about allowed tools, because `all` names none", () => {
    const text = yaml(
      "id: files",
      "transport: { stdio: { command: mcp } }",
      "tools:",
      "  allow: [read]",
      "  approve: all",
    );
    const parsed = parseFile("connector", text);
    expect(parsed.ok && parsed.value.warnings).toEqual([]);
  });

  it("refuses any other word", () => {
    const text = yaml(
      "id: files",
      "transport: { stdio: { command: mcp } }",
      "tools:",
      "  approve: every",
    );
    expect(summary(problemsOf("connector", text))).toEqual(["tools.approve invalid_union 4"]);
  });

  it("asks about every tool with `all`, even one the file never names", () => {
    expect(needsApproval({ approve: "all" }, "delete_file")).toBe(true);
    expect(needsApproval({ approve: "all" }, "added_later")).toBe(true);
  });

  it("asks only about the listed tools with a list", () => {
    expect(needsApproval({ approve: ["send_mail"] }, "send_mail")).toBe(true);
    expect(needsApproval({ approve: ["send_mail"] }, "read_mail")).toBe(false);
    expect(needsApproval({ approve: [] }, "read_mail")).toBe(false);
  });
});
