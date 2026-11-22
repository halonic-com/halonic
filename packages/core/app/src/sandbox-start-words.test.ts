import { sandboxUnavailableReasons } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { sandboxStartWords } from "./sandbox-start-words.ts";

verifies("app.sandbox-start-words", () => {
  it("words bubblewrap-missing with a Callout fix that is the fix with a capital letter", () => {
    const words = sandboxStartWords("bubblewrap-missing");
    expect(words.reason).toBe("bubblewrap isn't installed, and the sandbox needs it.");
    expect(words.fix).toContain("sudo apt install bubblewrap");
    expect(words.calloutFix).toBe(
      "Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap.",
    );
    expect(words.phoneFix).toBe(`On the computer Halonic runs on: ${words.fix}`);
    expect(words.docsKey).toBe("security/sandbox/#bubblewrap");
    expect(words.docsName).toBe("How to install bubblewrap");
    expect(words.settingsFix).toBe(words.calloutFix);
  });

  it("names the thing in the can't-run Callout's fix where microcopy 23.3 words one", () => {
    expect(sandboxStartWords("bubblewrap-missing").cantRunFix).toBe(
      "Install bubblewrap, for example on Ubuntu or Debian with sudo apt install bubblewrap.",
    );
    expect(sandboxStartWords("user-namespaces-restricted").cantRunFix).toMatch(
      /^Allow user namespaces for bubblewrap/,
    );
    expect(sandboxStartWords("ripgrep-missing").cantRunFix).toBe(
      "Install ripgrep, for example on macOS with brew install ripgrep.",
    );
    expect(sandboxStartWords("restart-needed").cantRunFix).toBe(
      sandboxStartWords("restart-needed").calloutFix,
    );
  });

  it("never says it or them in the can't-run Callout's fix, on a computer or a phone", () => {
    for (const code of sandboxUnavailableReasons) {
      const { cantRunFix, cantRunPhoneFix } = sandboxStartWords(code);
      expect(cantRunFix, code).not.toMatch(/\b(it|them)\b/i);
      expect(cantRunPhoneFix, code).toBe(
        `On the computer Halonic runs on: ${cantRunFix.charAt(0).toLowerCase()}${cantRunFix.slice(1)}`,
      );
    }
  });

  it("gives the can't-run Callout's own fix on a phone, after where to do it", () => {
    expect(sandboxStartWords("bubblewrap-missing").cantRunPhoneFix).toBe(
      "On the computer Halonic runs on: install bubblewrap, for example on Ubuntu or Debian with sudo apt install bubblewrap.",
    );
  });

  it("has every part for every reason code, under a key of its own", () => {
    const keys = new Set<string>();
    for (const code of sandboxUnavailableReasons) {
      const words = sandboxStartWords(code);
      for (const part of [
        words.reason,
        words.fix,
        words.calloutFix,
        words.cantRunFix,
        words.phoneFix,
        words.cantRunPhoneFix,
        words.docsName,
      ]) {
        expect(part.length).toBeGreaterThan(0);
      }
      expect(words.docsKey.startsWith("security/sandbox/")).toBe(true);
      expect(words.key).toBe(`sandbox-start.${code}`);
      keys.add(words.key);
    }
    expect(keys.size).toBe(sandboxUnavailableReasons.length);
  });

  it("names the command each fix holds, word for word, so a screen can show it as code", () => {
    for (const code of sandboxUnavailableReasons) {
      const { command, fix, cantRunFix, phoneFix, cantRunPhoneFix } = sandboxStartWords(code);
      if (command === undefined) continue;
      for (const part of [fix, cantRunFix, phoneFix, cantRunPhoneFix]) {
        expect(part).toContain(command);
      }
    }
    expect(sandboxStartWords("bubblewrap-missing").command).toBe("sudo apt install bubblewrap");
    expect(sandboxStartWords("other").command).toBeUndefined();
  });

  it("reads a code from a newer version, or any text, as other", () => {
    for (const code of ["from-the-future", "", "constructor", "__proto__"]) {
      expect(sandboxStartWords(code)).toEqual(sandboxStartWords("other"));
    }
    expect(sandboxStartWords("from-the-future").key).toBe("sandbox-start.other");
  });

  it("points setup-needed to Settings, whose own button is the fix there", () => {
    const words = sandboxStartWords("setup-needed");
    expect(words.fix).toBe("open Settings and set up the sandbox there.");
    expect(words.calloutFix).toBe("Open Settings and set up the sandbox there.");
    expect(words.fix).not.toContain("WSL 2");
    expect(words.settingsFix).toBeNull();
  });

  it("gives distro-missing the CLI's WSL 2 fix everywhere, Settings too", () => {
    const words = sandboxStartWords("distro-missing");
    expect(words.fix).toBe("use Halonic inside WSL 2 on this computer.");
    expect(words.calloutFix).toBe("Use Halonic inside WSL 2 on this computer.");
    expect(words.fix).not.toContain("Settings");
    expect(words.settingsFix).toBe(words.calloutFix);
  });

  it("says to try again for runtime-missing, then to reinstall Halonic Studio, Settings with Check again", () => {
    const words = sandboxStartWords("runtime-missing");
    expect(words.calloutFix).toBe(
      "Try again, and Halonic finishes the setup as the sandbox starts. If it still doesn't finish, reinstall Halonic Studio.",
    );
    expect(words.cantRunFix).toBe(
      "Try again, and Halonic finishes setting up its own Linux system for the sandbox. If that setup still doesn't finish, reinstall Halonic Studio.",
    );
    expect(words.settingsFix).toBe(
      "Choose Check again, and Halonic finishes the setup. If it still doesn't finish, reinstall Halonic Studio.",
    );
    expect(words.fix).not.toContain("WSL 2");
  });

  it("says to remove the other program's setup for setup-conflict, then where to go on", () => {
    const words = sandboxStartWords("setup-conflict");
    expect(words.calloutFix).toBe(
      "Remove the other program's sandbox setup, then set up the sandbox in Settings.",
    );
    expect(words.cantRunFix).toBe(words.calloutFix);
    expect(words.settingsFix).toBe(
      "Remove the other program's sandbox setup, then choose Check again.",
    );
    expect(words.fix).not.toContain("WSL 2");
  });

  it("says the sandbox can't start on this version of Windows, names no version, and points to another sandbox in Settings", () => {
    const words = sandboxStartWords("windows");
    expect(words.reason).toBe("The sandbox can't start on this version of Windows.");
    expect(words.calloutFix).toBe("Pick another sandbox in Settings.");
    expect(words.fix).not.toContain("WSL 2");
  });

  it("names no sandbox service that Halonic doesn't have", () => {
    expect(sandboxStartWords("sign-in-needed").calloutFix).toBe(
      "Sign in to the sandbox's service.",
    );
  });

  it("links the docs page itself for a reason with no section of its own", () => {
    expect(sandboxStartWords("setup-needed").docsKey).toBe("security/sandbox/");
    expect(sandboxStartWords("not-supported").docsKey).toBe("security/sandbox/#wsl1");
  });

  it("says Studio can't start an agent set to this computer yet but halonic in a terminal can, not that something is missing", () => {
    const words = sandboxStartWords("not-offered");
    expect(words.key).toBe("sandbox-start.not-offered");
    expect(words.reason).toBe(
      "Studio can't start Claude Code or Codex agents outside the sandbox yet; halonic in a terminal on this computer can.",
    );
    expect(words.calloutFix).toBe("Set this agent back to In a sandbox on its Harness page.");
  });

  it("names the docs link after where it goes, and the general page for a reason without a guide", () => {
    expect(sandboxStartWords("not-supported").docsName).toBe("How to switch to WSL 2");
    expect(sandboxStartWords("other").docsName).toBe("What the sandbox needs");
    expect(sandboxStartWords("ripgrep-missing").docsName).toBe("What the sandbox needs");
  });
});
