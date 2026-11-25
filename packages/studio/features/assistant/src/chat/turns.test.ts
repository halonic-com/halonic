import { fenceUntrusted } from "@halonicjs/app";
import { toolTexts } from "@halonicjs/assistant";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runningLine, turnsOf } from "./turns.ts";

const call = (name: string, path?: string) => ({
  id: "t1",
  name,
  arguments: path === undefined ? {} : { path },
});

verifies("assistant.chat.enter-sends", () => {
  it("says each Build chat tool in its own words, and any other as using it", () => {
    const file = "hubs/acme/workflows/triage.workflow.yaml";
    expect(runningLine(undefined)).toBe("Running · thinking");
    expect(runningLine(call("list_files"))).toBe("Running · listing files");
    expect(runningLine(call("read_file", file))).toBe("Running · reading triage.workflow.yaml");
    expect(runningLine(call("schema"))).toBe("Running · checking the schema");
    expect(runningLine(call("propose_file", file))).toBe("Running · changing triage.workflow.yaml");
    expect(runningLine(call("propose_file"))).toBe("Running · changing a file");
    expect(runningLine(call("propose_delete"))).toBe("Running · deleting a file");
    expect(runningLine(call("validate"))).toBe("Running · checking the workspace");
    expect(runningLine(call("show"))).toBe("Running · showing an item");
    expect(runningLine(call("acme-mail__send_reply"))).toBe("Running · using send reply");
  });
});

verifies("assistant.build.proposal-card", () => {
  it("shows a write the tool made as its card, and a refused one as its tool line", () => {
    const file = "models.yaml";
    const write = {
      id: "w1",
      name: "propose_file",
      arguments: { path: file, content: "a", why: "B" },
    };
    const remove = { id: "w2", name: "propose_delete", arguments: { path: file, why: "C" } };
    const refused = { id: "w3", name: "propose_file", arguments: { path: ".git/x", content: "" } };
    const [turn] = turnsOf(
      [
        { role: "user", content: "Tidy up" },
        { role: "assistant", content: "", toolCalls: [write, remove, refused] },
        { role: "tool", toolCallId: "w1", name: "propose_file", content: toolTexts.changed(file) },
        {
          role: "tool",
          toolCallId: "w2",
          name: "propose_delete",
          content: toolTexts.deleted(file),
        },
        {
          role: "tool",
          toolCallId: "w3",
          name: "propose_file",
          content: toolTexts.cantWrite(".git/x"),
        },
      ],
      new Map(),
      false,
    );
    expect(turn?.steps).toEqual([
      { kind: "proposal", callId: "w1", path: file, why: "B", content: "a", afterReading: [] },
      { kind: "proposal", callId: "w2", path: file, why: "C", content: null, afterReading: [] },
      { kind: "tool", callId: "w3", name: "propose_file", state: "done" },
    ]);
  });
});

verifies("assistant.build.loaded-page", () => {
  it("gives a proposal written after a docs page the page's site", () => {
    const file = "models.yaml";
    const read = {
      id: "r1",
      name: "read_docs",
      arguments: { url: "https://docs.example.com/api" },
    };
    const write = (id: string) => ({
      id,
      name: "propose_file",
      arguments: { path: file, content: "a", why: "B" },
    });
    const written = (id: string) =>
      ({
        role: "tool",
        toolCallId: id,
        name: "propose_file",
        content: toolTexts.changed(file),
      }) as const;
    const [turn] = turnsOf(
      [
        { role: "user", content: "Use the docs" },
        { role: "assistant", content: "", toolCalls: [write("w1"), read, write("w2")] },
        written("w1"),
        { role: "tool", toolCallId: "r1", name: "read_docs", content: fenceUntrusted("Hi") },
        written("w2"),
      ],
      new Map(),
      false,
    );
    const afterReading = turn?.steps.map((step) =>
      step.kind === "proposal" ? step.afterReading : undefined,
    );
    expect(afterReading).toEqual([[], undefined, ["docs.example.com"]]);
  });
});
