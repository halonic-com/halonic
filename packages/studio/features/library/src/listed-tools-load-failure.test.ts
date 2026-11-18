import { EngineNotAnswering, engineWords } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ConnectorCouldntList, WorkspaceNotTrusted } from "./listed-tools-host.ts";
import { loadFailureLine } from "./listed-tools-load-failure.ts";
import { refusalLineText } from "./refusal-line.ts";

const desktop = engineWords["desktop-app"];

function textOf(error: unknown, engine = desktop): string {
  return refusalLineText(loadFailureLine(error, "notes-mcp", engine).parts);
}

verifies("library.listed-tools-waiting", () => {
  describe("loadFailureLine", () => {
    it("names a missing program in code type, with Try again", () => {
      const line = loadFailureLine(
        new ConnectorCouldntList({ reason: "program-missing", program: "npx" }),
        "notes-mcp",
        desktop,
      );

      expect(line.parts).toEqual([
        { text: "Couldn't list the tools: notes-mcp needs the program " },
        { text: "npx", code: true },
        { text: ", which isn't on this computer. Install it, then try again." },
      ]);
      expect(line).toMatchObject({ button: "try-again", copyDetails: false });
      expect(line.command).toBeUndefined();
    });

    it("names a secret that isn't set and gives the command that sets it", () => {
      const line = loadFailureLine(
        new ConnectorCouldntList({ reason: "secret-missing", secret: "NOTES_TOKEN" }),
        "notes-mcp",
        desktop,
      );

      expect(refusalLineText(line.parts)).toBe(
        "Couldn't list the tools: notes-mcp needs the secret NOTES_TOKEN, which isn't set on this computer. Set it in a terminal, then try again:",
      );
      expect(line.command).toBe("halonic secret set NOTES_TOKEN");
      expect(line).toMatchObject({ button: "try-again", copyDetails: false });
    });

    it("names a refused secret when it is known, else says its secret", () => {
      const named = loadFailureLine(
        new ConnectorCouldntList({ reason: "secret-refused", secret: "NOTES_TOKEN" }),
        "notes-mcp",
        desktop,
      );
      expect(refusalLineText(named.parts)).toBe(
        "Couldn't list the tools: notes-mcp didn't accept the secret NOTES_TOKEN. Set it again in a terminal, then try again:",
      );
      expect(named.command).toBe("halonic secret set NOTES_TOKEN");

      const unnamed = loadFailureLine(
        new ConnectorCouldntList({ reason: "secret-refused" }),
        "notes-mcp",
        desktop,
      );
      expect(refusalLineText(unnamed.parts)).toBe(
        "Couldn't list the tools: notes-mcp didn't accept its secret. Set it again in a terminal, then try again.",
      );
      expect(unnamed.command).toBeUndefined();
    });

    it("says a program stopped, with Copy details", () => {
      const line = loadFailureLine(
        new ConnectorCouldntList({ reason: "stopped" }),
        "notes-mcp",
        desktop,
      );

      expect(refusalLineText(line.parts)).toBe(
        "Couldn't list the tools: notes-mcp stopped before it answered.",
      );
      expect(line).toMatchObject({ button: "try-again", copyDetails: true });
    });

    it("says the engine isn't answering, in the words for where Studio runs", () => {
      expect(textOf(new EngineNotAnswering())).toBe(
        "Couldn't list the tools: the engine isn't answering. It may still be starting.",
      );
      expect(textOf(new EngineNotAnswering(), engineWords.phone)).toBe(
        "Couldn't list the tools: Halonic on your computer isn't answering.",
      );
      expect(loadFailureLine(new EngineNotAnswering(), "notes-mcp", desktop).copyDetails).toBe(
        false,
      );
    });

    it("offers Review, not Try again, in a workspace that isn't trusted", () => {
      const line = loadFailureLine(new WorkspaceNotTrusted(), "notes-mcp", desktop);

      expect(refusalLineText(line.parts)).toBe(
        "Couldn't list the tools: this workspace isn't trusted yet, so nothing was started.",
      );
      expect(line).toMatchObject({ button: "review", copyDetails: false });
    });

    it("gives a kinded reason as it is, and Copy details for one Halonic can't explain", () => {
      expect(textOf(Object.assign(new Error("the server is busy"), { kind: "unavailable" }))).toBe(
        "Couldn't list the tools: the server is busy.",
      );

      const unexplained = loadFailureLine(new Error("ENOENT: .halonic/x"), "notes-mcp", desktop);
      expect(refusalLineText(unexplained.parts)).toBe(
        "Couldn't list the tools: Halonic ran into a problem it can't explain yet.",
      );
      expect(unexplained.copyDetails).toBe(true);
    });
  });
});
