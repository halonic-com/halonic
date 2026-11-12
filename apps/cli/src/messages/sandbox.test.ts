import { sandboxUnavailableReasons } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Message } from "./define.ts";
import { plainText } from "./phrase.ts";
import { sandboxDocsLink, sandboxMessages } from "./sandbox.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("has a refused run's sandbox lines word for word, from cli-output 3.8", () => {
    expect(sandboxMessages.refusedFix("container").key).toBe("sandbox.refusedFix");
    expect(words(sandboxMessages.cantStart())).toBe("the sandbox can't start on this computer.");
    expect(words(sandboxMessages.refusedFix("bubblewrap-missing"))).toBe(
      "bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.",
    );
    expect(words(sandboxMessages.refusedFix("container"))).toBe(
      "Halonic is running inside a container, and the sandbox can't start there. Run halonic run on the computer itself, not in a container. halonic validate and halonic test work in a container.",
    );
  });
});

describe("the sandbox sentences", () => {
  it("has line 2 for every reason code, in the port's order", () => {
    expect(
      sandboxUnavailableReasons.map((code) => words(sandboxMessages.refusedFix(code))),
    ).toEqual([
      "The sandbox doesn't work on Windows in this version of Halonic. Use Halonic inside WSL 2 on this computer.",
      "Halonic is running inside a container, and the sandbox can't start there. Run halonic run on the computer itself, not in a container. halonic validate and halonic test work in a container.",
      "This version or edition of the operating system can't run the sandbox. Update it, or pick another sandbox in Halonic Studio, under Settings > Sandbox.",
      "A company policy on this computer blocks the sandbox. Ask whoever manages this computer to allow it, or pick another sandbox in Halonic Studio, under Settings > Sandbox.",
      "Hardware virtualisation is turned off on this computer. Turn it on in the computer's firmware settings (BIOS or UEFI). In a virtual machine, turn on nested virtualisation. Then run it again.",
      "WSL isn't installed, and the sandbox needs it. Install it with wsl --install --no-distribution in a terminal run as administrator, restart Windows, then run it again.",
      "Windows needs to restart to finish setting up WSL. Restart Windows, then run it again.",
      "WSL works, but Halonic's own Linux system for the sandbox isn't installed. Set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox, then run it again.",
      "Another program set up the sandbox on this computer, in a way Halonic can't use. Set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox, then run it again.",
      "The sandbox's one-time setup isn't done for this version of Halonic. Set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox, or finish this sandbox's setup there, then run it again.",
      "Ubuntu 24.04 blocks the user namespaces the sandbox needs. Allow them for bubblewrap with an AppArmor rule; the guide has the exact commands.",
      "bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.",
      "socat or ripgrep isn't installed. Install them, for example on Ubuntu or Debian with sudo apt install socat ripgrep, then run it again.",
      "ripgrep isn't installed. Install it, for example on macOS with brew install ripgrep, then run it again.",
      "The sandbox needs you to sign in to its service first. Sign in, for example with docker login for Docker Sandboxes, then run it again.",
      "Halonic can't tell what the sandbox is missing. See what the sandbox needs on this computer, then run it again.",
    ]);
  });

  it("words a code it doesn't know as other, never with the check's own sentence", () => {
    expect(words(sandboxMessages.refusedFix("seccomp-missing"))).toBe(
      words(sandboxMessages.refusedFix("other")),
    );
    expect(words(sandboxMessages.reason("seccomp-missing"))).toBe(
      "Halonic can't tell what the sandbox is missing.",
    );
  });

  it("has doctor's reason and fix for every reason code, in the port's order", () => {
    expect(
      sandboxUnavailableReasons.map((code) => [
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
        "Fix: run Halonic on the computer itself, not in a container. Then run halonic doctor again. halonic validate and halonic test work in a container.",
      ],
      [
        "This version or edition of the operating system can't run the sandbox.",
        "Fix: update the operating system, or pick another sandbox in Halonic Studio, under Settings > Sandbox. Then run halonic doctor again.",
      ],
      [
        "A company policy on this computer blocks the sandbox.",
        "Fix: ask whoever manages this computer to allow it, or pick another sandbox in Halonic Studio, under Settings > Sandbox. Then run halonic doctor again.",
      ],
      [
        "Hardware virtualisation is turned off on this computer.",
        "Fix: turn it on in the computer's firmware settings (BIOS or UEFI). In a virtual machine, turn on nested virtualisation. Then run halonic doctor again.",
      ],
      [
        "WSL isn't installed, and the sandbox needs it.",
        "Fix: install it with wsl --install --no-distribution in a terminal run as administrator, then restart Windows. Then run halonic doctor again.",
      ],
      [
        "Windows needs to restart to finish setting up WSL.",
        "Fix: restart Windows. Then run halonic doctor again.",
      ],
      [
        "WSL works, but Halonic's own Linux system for the sandbox isn't installed.",
        "Fix: set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox. Then run halonic doctor again.",
      ],
      [
        "Another program set up the sandbox on this computer, in a way Halonic can't use.",
        "Fix: set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox. Then run halonic doctor again.",
      ],
      [
        "The sandbox's one-time setup isn't done for this version of Halonic.",
        "Fix: set up the sandbox with WSL in Halonic Studio, under Settings > Sandbox, or finish this sandbox's setup there. Then run halonic doctor again.",
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
        "ripgrep isn't installed, and the sandbox needs it.",
        "Fix: install it, for example on macOS with brew install ripgrep. Then run halonic doctor again.",
      ],
      [
        "The sandbox needs you to sign in to its service first.",
        "Fix: sign in, for example with docker login for Docker Sandboxes. Then run halonic doctor again.",
      ],
      [
        "Halonic can't tell what the sandbox is missing.",
        "Fix: see what the sandbox needs on this computer. Then run halonic doctor again.",
      ],
    ]);
  });

  it("links each reason to its section of the sandbox guide, or to the guide itself", () => {
    expect(sandboxUnavailableReasons.map((code) => sandboxDocsLink(code))).toEqual([
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox#container",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox#apparmor",
      "https://docs.halonic.dev/sandbox#bubblewrap",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox",
      "https://docs.halonic.dev/sandbox",
    ]);
  });

  it("has runs send's ending and the pointer to doctor", () => {
    expect(words(sandboxMessages.nothingSent())).toBe("Nothing was sent.");
    expect(words(sandboxMessages.seeDoctor())).toBe("Run halonic doctor to see what's missing.");
  });
});
