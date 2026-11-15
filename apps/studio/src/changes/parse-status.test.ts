import { describe, expect, it } from "vitest";
import { parseStatus } from "./parse-status.ts";

const hash = "0".repeat(40);
const ordinaryRecord = (xy: string, path: string) =>
  `1 ${xy} N... 100644 100644 100644 ${hash} ${hash} ${path}`;

describe("parseStatus", () => {
  it("reads a modified, an added and an untracked file", () => {
    const output = [
      ordinaryRecord(".M", "hubs/sales/hub.yaml"),
      ordinaryRecord("A.", "skills/tone/SKILL.md"),
      "? notes.txt",
      "",
    ].join("\0");
    expect(parseStatus(output)).toEqual([
      { path: "hubs/sales/hub.yaml", status: "modified", staged: false },
      { path: "skills/tone/SKILL.md", status: "added", staged: true },
      { path: "notes.txt", status: "untracked", staged: false },
    ]);
  });

  it("gives two changes for a path changed in the index and again in the tree", () => {
    expect(parseStatus(`${ordinaryRecord("MM", "models.yaml")}\0`)).toEqual([
      { path: "models.yaml", status: "modified", staged: true },
      { path: "models.yaml", status: "modified", staged: false },
    ]);
  });

  it("keeps spaces in a path and reads a rename with its old path", () => {
    const rename = `2 R. N... 100644 100644 100644 ${hash} ${hash} R100 hubs/Sales team/new.yaml\0hubs/Sales team/old.yaml\0`;
    expect(parseStatus(rename)).toEqual([
      {
        path: "hubs/Sales team/new.yaml",
        status: "renamed",
        staged: true,
        from: "hubs/Sales team/old.yaml",
      },
    ]);
  });

  it("reads a conflicted file", () => {
    const conflict = `u UU N... 100644 100644 100644 100644 ${hash} ${hash} ${hash} hub.yaml\0`;
    expect(parseStatus(conflict)).toEqual([
      { path: "hub.yaml", status: "conflicted", staged: false },
    ]);
  });

  it("reads nothing from an empty answer", () => {
    expect(parseStatus("")).toEqual([]);
  });
});
