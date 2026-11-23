import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runningLine } from "./turns.ts";

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
