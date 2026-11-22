import { runFailureOf } from "@halonicjs/app/run-failure";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { runFailedLines } from "./messages/run-failures.ts";
import { failedWith } from "./test/run-failure-fixtures.ts";

// A secrets file the person's user account can't read, which the secrets file
// store refuses with this cause, gets the fix `halonic secret list` gives (HAL-15693).

const run = { title: "Support reply", step: "Draft a reply", runId: "01JD8Q" };

function linesFor(file: string, fix: string): [string, string | undefined] {
  const failure = runFailureOf(
    {
      ...failedWith("error"),
      cause: { kind: "denied" as const, code: "secrets.file-unreadable", detail: { file, fix } },
    },
    undefined,
  );
  if (failure === undefined) throw new Error("expected a failure");
  const { message, fix: fixLine } = runFailedLines(run, failure);
  return [plainText(message.phrase), fixLine === undefined ? undefined : plainText(fixLine.phrase)];
}

verifies("cli.run-secrets-unreadable", () => {
  const file = "/profile/secrets/secrets.json";

  it("names the file and chmod 600 for the person's own file, with no report link", () => {
    expect(linesFor(file, "chmod")).toEqual([
      `Support reply failed in the step Draft a reply: the secrets file ${file} can't be read by your user account.`,
      `Run chmod 600 ${file}, then run again.`,
    ]);
  });

  it("says sudo chown first for a file another user owns, with a macOS path quoted", () => {
    const macFile = "/srv/sam/Library/Application Support/halonic/secrets/secrets.json";
    expect(linesFor(macFile, "chown")[1]).toBe(
      `It belongs to another user: run sudo chown "$(id -un)" "${macFile}", then chmod 600 "${macFile}", then run again.`,
    );
  });

  it("names the file's Properties on Windows", () => {
    expect(linesFor(file, "properties")[1]).toBe(
      "Give your user account access to it in the file's Properties, under Security, then run again.",
    );
  });
});
