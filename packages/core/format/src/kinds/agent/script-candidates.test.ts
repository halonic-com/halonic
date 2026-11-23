import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { scriptCandidates } from "./working-folder-start.ts";

verifies("format.working-folder-start", () => {
  it("lists the program and argument pieces as they are, then each argument and module to fill", () => {
    expect(
      scriptCandidates({ cwd: ".", program: "python", args: ["-m", "tools.mail", "--a=b.py"] }),
    ).toEqual([
      { shown: "python", path: "python", filled: false },
      { shown: "--a", path: "--a", filled: false },
      { shown: "b.py", path: "b.py", filled: false },
      { shown: "-m", path: "-m", filled: true },
      { shown: "tools.mail", path: "tools.mail", filled: true },
      { shown: "tools.mail", path: "tools/mail", filled: true },
      { shown: "--a=b.py", path: "--a=b.py", filled: true },
    ]);
  });

  it("reads empty inline code as no script, and any other empty argument as the start folder", () => {
    expect(scriptCandidates({ cwd: ".", program: "node", args: ["-e", ""] })).toEqual([
      { shown: "node", path: "node", filled: false },
      { shown: "-e", path: "-e", filled: true },
    ]);
    expect(scriptCandidates({ cwd: ".", program: "python", args: [""] })).toEqual([
      { shown: "python", path: "python", filled: false },
      { shown: "", path: "", filled: true },
    ]);
  });
});
