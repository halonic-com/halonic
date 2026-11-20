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

  it("has every part for every reason code, under a key of its own", () => {
    const keys = new Set<string>();
    for (const code of sandboxUnavailableReasons) {
      const words = sandboxStartWords(code);
      for (const part of [
        words.reason,
        words.fix,
        words.calloutFix,
        words.phoneFix,
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

  it("reads a code from a newer version, or any text, as other", () => {
    for (const code of ["from-the-future", "", "constructor", "__proto__"]) {
      expect(sandboxStartWords(code)).toEqual(sandboxStartWords("other"));
    }
    expect(sandboxStartWords("from-the-future").key).toBe("sandbox-start.other");
  });

  it("points the fixes the CLI words as WSL 2 to Settings", () => {
    for (const code of ["windows", "distro-missing", "setup-conflict", "setup-needed"]) {
      const words = sandboxStartWords(code);
      expect(words.fix).toBe("open Settings and set up the sandbox there.");
      expect(words.calloutFix).toBe("Open Settings and set up the sandbox there.");
      expect(words.fix).not.toContain("WSL 2");
      expect(words.settingsFix).toBeNull();
    }
  });

  it("links the docs page itself for a reason with no section of its own", () => {
    expect(sandboxStartWords("setup-needed").docsKey).toBe("security/sandbox/");
    expect(sandboxStartWords("not-supported").docsKey).toBe("security/sandbox/#wsl1");
  });

  it("names the docs link after where it goes, and the general page for a reason without a guide", () => {
    expect(sandboxStartWords("not-supported").docsName).toBe("How to switch to WSL 2");
    expect(sandboxStartWords("other").docsName).toBe("What the sandbox needs");
    expect(sandboxStartWords("ripgrep-missing").docsName).toBe("What the sandbox needs");
  });
});
