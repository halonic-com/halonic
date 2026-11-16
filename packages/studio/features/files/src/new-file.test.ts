import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkNewPath, defaultNewFilePath, startingPath } from "./new-file.ts";

verifies("files.ui.new-file", () => {
  it("starts at hubs/ or at the focused folder", () => {
    expect(startingPath(undefined)).toBe(defaultNewFilePath);
    expect(startingPath("hubs/p/agents")).toBe("hubs/p/agents/");
  });

  it("asks for a file name when there is none", () => {
    expect(checkNewPath("")).toBe("missing");
    expect(checkNewPath("  ")).toBe("missing");
    expect(checkNewPath("hubs/")).toBe("missing");
  });

  it("keeps the file inside the workspace", () => {
    expect(checkNewPath("../x.yaml")).toBe("outside");
    expect(checkNewPath("hubs/../../x.yaml")).toBe("outside");
    expect(checkNewPath("/etc/x.yaml")).toBe("outside");
  });

  it("refuses the local data", () => {
    expect(checkNewPath(".studio/x.yaml")).toBe("private");
  });

  it("accepts a path with new folders", () => {
    expect(checkNewPath("hubs/p/agents/b.agent.yaml")).toBeUndefined();
    expect(checkNewPath("notes.md")).toBeUndefined();
  });
});
