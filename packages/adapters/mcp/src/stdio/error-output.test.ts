import { SecretScrubber } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  afterLostLineRemoved,
  cleanErrorOutput,
  type ErrorOutputLine,
  ErrorOutputTail,
  keyLineRemoved,
  longLineRemoved,
  type PersonalDetails,
} from "./error-output.ts";

const personal: PersonalDetails = { homeFolder: "/acme/home/acme-user", userName: "acme-user" };

function scrubberFor(...secrets: string[]): SecretScrubber {
  const scrubber = new SecretScrubber();
  for (const secret of secrets) scrubber.remember(secret);
  return scrubber;
}

/** Lines as the tail keeps them, none of them cut. */
function whole(...texts: string[]): ErrorOutputLine[] {
  return texts.map((text) => ({ text, cut: false, afterLostText: false }));
}

/** A standard error stream that writes `text` and ends. */
async function* streamOf(text: string): AsyncGenerator<Uint8Array> {
  yield new TextEncoder().encode(text);
}

verifies("mcp.stdio-restart", () => {
  describe("cleaning a program's error output", () => {
    it("removes a secret it was given, even one split over two lines", () => {
      const lines = whole("token first", "half second-half rejected");
      const cleaned = cleanErrorOutput(lines, scrubberFor("first\nhalf"), personal);
      // The line break was part of the secret, so it goes with it.
      expect(cleaned).toEqual(["token [secret removed] second-half rejected"]);
    });

    it("removes the home folder, the user name as a whole word and e-mail addresses", () => {
      const lines = whole(
        "open /acme/home/acme-user/.mail/inbox.db: denied",
        "signed in as Acme-User <ops@acme.example.com>, not acme-users",
      );
      expect(cleanErrorOutput(lines, scrubberFor(), personal)).toEqual([
        "open ~/.mail/inbox.db: denied",
        "signed in as [user] <[e-mail removed]>, not acme-users",
      ]);
    });

    it("keeps a package version and drops a whole line holding something shaped like a key", () => {
      const lines = whole("@acme/mail-mcp@2.3.1 started", `use ghp_${"Zz9".repeat(8)} next time`);
      expect(cleanErrorOutput(lines, scrubberFor(), personal)).toEqual([
        "@acme/mail-mcp@2.3.1 started",
        keyLineRemoved,
      ]);
    });

    it("changes nothing when it knows no home folder or user name", () => {
      const none: PersonalDetails = { homeFolder: undefined, userName: undefined };
      expect(cleanErrorOutput(whole("out of memory"), scrubberFor(), none)).toEqual([
        "out of memory",
      ]);
    });

    it("drops a whole line the tail cut, so the start of a secret cut in two isn't shown", async () => {
      const token = "acme-notes-token-0001";
      const tail = new ErrorOutputTail(
        streamOf(`started\n${"x".repeat(290)}${token} rejected\n${" ".repeat(400)}\n`),
      );
      const lines = await tail.linesOnceRead(1000);
      expect(lines).toEqual([
        { text: "started", cut: false, afterLostText: false },
        { text: `${"x".repeat(290)}${token.slice(0, 10)}`, cut: true, afterLostText: false },
      ]);
      expect(cleanErrorOutput(lines, scrubberFor(token), personal)).toEqual([
        "started",
        longLineRemoved,
      ]);
    });

    it("drops the line after a cut one, so the end of a secret with a line break isn't shown", async () => {
      const key = "acme-key-start\nacme-key-end";
      const tail = new ErrorOutputTail(
        // The blank line between them doesn't make the line after it safe to show.
        streamOf(`${"x".repeat(290)}PEM: ${key} unreadable\n\ndone\n`),
      );
      const lines = await tail.linesOnceRead(1000);
      expect(lines.map((line) => line.afterLostText)).toEqual([false, true, false]);
      expect(cleanErrorOutput(lines, scrubberFor(key), personal)).toEqual([
        longLineRemoved,
        afterLostLineRemoved,
        "done",
      ]);
    });

    it("drops the first line it kept once older lines were dropped, as it can end a secret", async () => {
      const key = "acme-key-start\nacme-key-end";
      const older = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`);
      const tail = new ErrorOutputTail(
        streamOf(`PEM: ${key} unreadable\n${older.join("\n")}\nstill waiting`),
        { maxLines: 10, maxLineLength: 300 },
      );
      const lines = await tail.linesOnceRead(1000);
      // With the last line, not yet ended, that is 11 lines: the first, "PEM: acme-key-start", goes.
      expect(lines[0]).toEqual({
        text: "acme-key-end unreadable",
        cut: false,
        afterLostText: true,
      });
      const cleaned = cleanErrorOutput(lines, scrubberFor(key), personal);
      expect(cleaned).toEqual([afterLostLineRemoved, ...older, "still waiting"]);
      expect(cleaned.join("\n")).not.toContain("acme-key-end");
    });

    it("keeps every line when it dropped none", async () => {
      const tail = new ErrorOutputTail(streamOf("one\ntwo\n"), { maxLines: 2, maxLineLength: 300 });
      expect(cleanErrorOutput(await tail.linesOnceRead(1000), scrubberFor(), personal)).toEqual([
        "one",
        "two",
      ]);
    });

    it("drops the first line it kept once it dropped a line it had stored", async () => {
      const tail = new ErrorOutputTail(streamOf("one\ntwo\nthree\n"), {
        maxLines: 2,
        maxLineLength: 300,
      });
      expect(cleanErrorOutput(await tail.linesOnceRead(1000), scrubberFor(), personal)).toEqual([
        afterLostLineRemoved,
        "three",
      ]);
    });
  });
});
