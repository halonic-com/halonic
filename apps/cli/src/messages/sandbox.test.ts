import { sandboxUnavailableReasons } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Message } from "./define.ts";
import { plainText } from "./phrase.ts";
import { sandboxMessages } from "./sandbox.ts";

const words = (message: Message) => plainText(message.phrase);

/** The codes the CLI words itself, in the port's order. */
const worded = [
  "windows",
  "container",
  "user-namespaces-restricted",
  "bubblewrap-missing",
  "linux-tools-missing",
  "other",
] as const;

verifies("cli.messages", () => {
  it("has a refused run's sandbox lines word for word, from cli-output 3.8", () => {
    expect(sandboxMessages.refusedFix("container").key).toBe("sandbox.refusedFix");
    expect(words(sandboxMessages.cantStart())).toBe("the sandbox can't start on this computer.");
    expect(words(sandboxMessages.refusedFix("bubblewrap-missing"))).toBe(
      "bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.",
    );
    expect(words(sandboxMessages.refusedFix("container"))).toBe(
      "Halonic is running inside a container, and the sandbox can't start there. Run halonic run on the runner or computer itself, not in a container. halonic validate and halonic test work in a container.",
    );
  });
});

describe("the sandbox sentences", () => {
  it("has line 2 for every reason it words", () => {
    expect(worded.map((code) => words(sandboxMessages.refusedFix(code)))).toEqual([
      "The sandbox doesn't work on Windows in this version of Halonic. Use Halonic inside WSL 2 on this computer.",
      "Halonic is running inside a container, and the sandbox can't start there. Run halonic run on the runner or computer itself, not in a container. halonic validate and halonic test work in a container.",
      "Ubuntu 24.04 blocks the user namespaces the sandbox needs. Allow them for bubblewrap with an AppArmor rule; the guide has the exact commands.",
      "bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.",
      "socat or ripgrep isn't installed. Install them, for example on Ubuntu or Debian with sudo apt install socat ripgrep, then run it again.",
      "Halonic can't tell what the sandbox is missing. See what the sandbox needs on this computer, then run it again.",
    ]);
  });

  it("words version 6's codes as other until the sandbox design words them", () => {
    const unworded = sandboxUnavailableReasons.filter(
      (code) => !(worded as readonly string[]).includes(code),
    );
    expect(unworded).toHaveLength(9);
    for (const code of unworded) {
      expect([
        words(sandboxMessages.refusedFix(code)),
        words(sandboxMessages.reason(code)),
        words(sandboxMessages.doctorFix(code)),
      ]).toEqual([
        words(sandboxMessages.refusedFix("other")),
        words(sandboxMessages.reason("other")),
        words(sandboxMessages.doctorFix("other")),
      ]);
    }
  });

  it("words a code it doesn't know as other, never with the check's own sentence", () => {
    expect(words(sandboxMessages.refusedFix("seccomp-missing"))).toBe(
      words(sandboxMessages.refusedFix("other")),
    );
    expect(words(sandboxMessages.reason("seccomp-missing"))).toBe(
      "Halonic can't tell what the sandbox is missing.",
    );
  });

  it("has doctor's reason and fix for every reason it words", () => {
    expect(
      worded.map((code) => [
        words(sandboxMessages.reason(code)),
        words(sandboxMessages.doctorFix(code)),
      ]),
    ).toEqual([
      [
        "The sandbox doesn't work on Windows in this version of Halonic.",
        "Fix: use Halonic inside WSL 2 on this computer. Then run halonic doctor again.",
      ],
      [
        "Halonic is running inside a container, and the sandbox can't start there.",
        "Fix: run Halonic on the runner or computer itself, not in a container. Then run halonic doctor again. halonic validate and halonic test work in a container.",
      ],
      [
        "Ubuntu 24.04 blocks the user namespaces the sandbox needs.",
        "Fix: allow them for bubblewrap with an AppArmor rule. The guide has the exact commands. Then run halonic doctor again.",
      ],
      [
        "bubblewrap isn't installed, and the sandbox needs it.",
        "Fix: install it, for example on Ubuntu or Debian with sudo apt install bubblewrap. Then run halonic doctor again.",
      ],
      [
        "socat or ripgrep isn't installed, and the sandbox needs both.",
        "Fix: install them, for example on Ubuntu or Debian with sudo apt install socat ripgrep. Then run halonic doctor again.",
      ],
      [
        "Halonic can't tell what the sandbox is missing.",
        "Fix: see what the sandbox needs on this computer. Then run halonic doctor again.",
      ],
    ]);
  });

  it("has runs send's ending and the pointer to doctor", () => {
    expect(words(sandboxMessages.nothingSent())).toBe("Nothing was sent.");
    expect(words(sandboxMessages.seeDoctor())).toBe("Run halonic doctor to see what's missing.");
  });
});
