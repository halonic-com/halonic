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
    });

    it("names a secret that isn't set, with no command, which couldn't set it for Studio", () => {
      const line = loadFailureLine(
        new ConnectorCouldntList({ reason: "secret-missing", secret: "NOTES_TOKEN" }),
        "notes-mcp",
        desktop,
      );

      expect(refusalLineText(line.parts)).toBe(
        "Couldn't list the tools: notes-mcp needs the secret NOTES_TOKEN, which isn't set for Studio. Studio can't set a connector's secrets yet.",
      );
      expect(line).toMatchObject({ button: "try-again", copyDetails: false });
    });

    it("names a connector's one refused secret, with no command", () => {
      const line = loadFailureLine(
        new ConnectorCouldntList({ reason: "secret-refused", secrets: ["NOTES_TOKEN"] }),
        "notes-mcp",
        desktop,
      );

      expect(refusalLineText(line.parts)).toBe(
        "Couldn't list the tools: notes-mcp didn't accept the secret NOTES_TOKEN. Studio can't set a connector's secrets yet.",
      );
      expect(line).toMatchObject({ button: "try-again", copyDetails: false });
    });

    it("names all of a connector's secrets when it can't tell which was refused", () => {
      const refusedOneOf = (secrets: readonly string[]) =>
        loadFailureLine(
          new ConnectorCouldntList({ reason: "secret-refused", secrets }),
          "notes-mcp",
          desktop,
        );

      const two = refusedOneOf(["NOTES_TOKEN", "NOTES_SPACE"]);
      expect(refusalLineText(two.parts)).toBe(
        "Couldn't list the tools: notes-mcp didn't accept one of its secrets, NOTES_TOKEN or NOTES_SPACE. Studio can't set a connector's secrets yet.",
      );
      expect(two).toMatchObject({ button: "try-again", copyDetails: false });

      expect(refusalLineText(refusedOneOf(["A", "B", "C"]).parts)).toContain(
        "didn't accept one of its secrets, A, B or C.",
      );
    });

    it("says the server asked for a secret the connector doesn't send, with Copy details", () => {
      const line = loadFailureLine(
        new ConnectorCouldntList({ reason: "secret-refused", secrets: [] }),
        "notes-mcp",
        desktop,
      );

      expect(refusalLineText(line.parts)).toBe(
        "Couldn't list the tools: the server for notes-mcp asked for a secret, and notes-mcp doesn't send one.",
      );
      expect(line).toMatchObject({ button: "try-again", copyDetails: true });
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
