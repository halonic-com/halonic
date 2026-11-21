import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { EngineNotAnswering } from "../engine/engine-not-answering.ts";
import { engineWords } from "../engine/engine-words.ts";
import { detailsOf, ErrorWithDetails } from "./copy-details-words.ts";
import { startFailureOf } from "./start-failure.ts";

const desktop = engineWords["desktop-app"].notAnswering;

verifies("shell.start-failure", () => {
  describe("startFailureOf", () => {
    it("says the engine isn't answering in the words for where Studio runs, with Try again", () => {
      expect(startFailureOf(new EngineNotAnswering(), desktop)).toEqual({
        reason: "the engine isn't answering. It may still be starting.",
        fix: undefined,
        command: undefined,
        tryAgain: true,
        copyDetails: false,
      });
      expect(startFailureOf(new EngineNotAnswering(), engineWords.served.notAnswering).reason).toBe(
        "Halonic on the server isn't answering.",
      );
    });

    it("gives a failure it can't explain the generic sentence and Copy details, not Try again", () => {
      const failure = startFailureOf(new TypeError("steps is undefined"), desktop);
      expect(failure).toEqual({
        reason: "Halonic ran into a problem it can't explain yet.",
        fix: undefined,
        command: undefined,
        tryAgain: false,
        copyDetails: true,
      });
      expect(startFailureOf(new KindedError("unavailable", " "), desktop).reason).toBe(
        "Halonic ran into a problem it can't explain yet.",
      );
    });

    it("lower-cases a common first word after the colon and keeps a name's capital", () => {
      const common = new KindedError("invalid_input", "The input isn't valid JSON");
      expect(startFailureOf(common, desktop).reason).toBe("the input isn't valid JSON.");
      const named = new KindedError("unavailable", "Ollama didn't answer.");
      expect(startFailureOf(named, desktop)).toMatchObject({
        reason: "Ollama didn't answer.",
        tryAgain: true,
        copyDetails: false,
      });
    });

    it("shows a conflict's next step with Try again", () => {
      const held = new KindedError(
        "conflict",
        "Acme is already running in another Halonic on this computer.",
        { fix: "Stop that one, then try again." },
      );
      expect(startFailureOf(held, desktop)).toEqual({
        reason: "Acme is already running in another Halonic on this computer.",
        fix: "Stop that one, then try again.",
        command: undefined,
        tryAgain: true,
        copyDetails: false,
      });
    });

    it("shows a refusal's next step and command without Try again", () => {
      const refusal = Object.assign(
        new KindedError("unavailable", "Reporter uses a connector, which Studio can't start yet.", {
          fix: "To start it, run this in a terminal:",
        }),
        { command: "halonic run reply" },
      );
      expect(startFailureOf(refusal, desktop)).toEqual({
        reason: "Reporter uses a connector, which Studio can't start yet.",
        fix: "To start it, run this in a terminal:",
        command: "halonic run reply",
        tryAgain: false,
        copyDetails: false,
      });
    });

    it("offers Copy details next to Try again for a reason that replaces raw text", () => {
      const raw = "Permission denied (os error 13)";
      const error = new ErrorWithDetails(
        "unavailable",
        "Halonic can't write to its data folder.",
        raw,
      );
      expect(startFailureOf(error, desktop)).toMatchObject({
        reason: "Halonic can't write to its data folder.",
        tryAgain: true,
        copyDetails: true,
      });
      expect(detailsOf("Couldn't start the run", error)).toContain(raw);
    });
  });
});
