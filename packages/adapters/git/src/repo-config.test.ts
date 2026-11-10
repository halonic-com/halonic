import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  blankFilters,
  checkRefusedKeys,
  filterNames,
  hasCommandEntry,
  type ListedConfig,
  neutralisePrograms,
  parseConfigListing,
} from "./repo-config.ts";
import { gitlinks } from "./repository.ts";

// Ported from the desktop's `git-guard` (`src/repo_config_tests.rs`), less
// the user-config cases: this adapter reads no user config at all.

function entry(scope: string, key: string, value = ""): ListedConfig {
  return { scope, key, value };
}

verifies("git.repo-config", () => {
  describe("the repository's config", () => {
    it("reads scopes, keys and values, a value with newlines and a key with none", () => {
      const listing = Buffer.from(
        "local\0core.bare\nfalse\0command\0alias.x\nline one\nline two\0local\0flag\0",
      );
      expect(parseConfigListing(listing)).toEqual([
        entry("local", "core.bare", "false"),
        entry("command", "alias.x", "line one\nline two"),
        entry("local", "flag", ""),
      ]);
    });

    it("blanks only the repository's filters, whatever their name", () => {
      const names = filterNames([
        entry("local", "filter.x.clean", "planted"),
        entry("worktree", "filter.a.b=c.smudge", "planted"),
        entry("local", "filter.x.smudge", "planted"),
        entry("command", "filter.ours.clean", ""),
      ]);
      expect(names).toEqual(["x", "a.b=c"]);
      expect(blankFilters(["x"])).toEqual([
        ["filter.x.clean", ""],
        ["filter.x.smudge", ""],
        ["filter.x.process", ""],
        ["filter.x.required", "false"],
      ]);
    });

    it("sends the repository's program keys back to git's defaults, whatever their case", () => {
      const overrides = neutralisePrograms([
        entry("local", "core.sshcommand", "planted"),
        entry("worktree", "gpg.program", "planted"),
        entry("local", "gpg.ssh.defaultkeycommand", "planted"),
      ]);
      expect(overrides).toEqual([
        ["core.sshCommand", "ssh"],
        ["gpg.program", "gpg"],
        ["gpg.ssh.defaultKeyCommand", ""],
      ]);
    });

    it("makes the repository's merge drivers report a conflict", () => {
      const overrides = neutralisePrograms([
        entry("local", "merge.Planted.driver", "planted %A"),
        entry("local", "merge.Planted.name", "planted"),
      ]);
      expect(overrides).toEqual([["merge.Planted.driver", "exit 1"]]);
    });

    it("leaves a clean repository as it is", () => {
      const entries = [entry("local", "core.bare", "false"), entry("local", "user.name", "Acme")];
      expect(neutralisePrograms(entries)).toEqual([]);
      expect(filterNames(entries)).toEqual([]);
      expect(() => checkRefusedKeys(entries)).not.toThrow();
    });

    it("refuses merge options from the repository only", () => {
      expect(() => checkRefusedKeys([entry("local", "branch.main.mergeoptions", "-F x")])).toThrow(
        "branch.main.mergeoptions",
      );
      expect(() => checkRefusedKeys([entry("worktree", "branch.a.b.mergeOptions", "")])).toThrow();
      expect(() =>
        checkRefusedKeys([entry("command", "branch.main.mergeoptions", "")]),
      ).not.toThrow();
    });

    it("refuses includes from the repository, whatever their case", () => {
      for (const key of [
        "include.path",
        "includeIf.onbranch:main.path",
        "includeif.gitdir:/acme/.path",
      ]) {
        expect(() => checkRefusedKeys([entry("local", key, "planted")]), key).toThrow(key);
        expect(() => checkRefusedKeys([entry("command", key, "")]), key).not.toThrow();
      }
    });

    it("sees whether git took the adapter's own config", () => {
      expect(hasCommandEntry([entry("command", "core.hookspath", "/x")], "core.hooksPath")).toBe(
        true,
      );
      expect(hasCommandEntry([entry("local", "core.hookspath", "/x")], "core.hooksPath")).toBe(
        false,
      );
    });
  });

  describe("gitlinks in the index", () => {
    it("finds the repositories nested as gitlinks, a path with a tab among them", () => {
      const listing =
        "100644 1111 0\tnotes.md\x00160000 2222 0\tvendor/acme\x00160000 3333 0\twith\ttab\0";
      expect(gitlinks(Buffer.from(listing))).toEqual(["vendor/acme", "with\ttab"]);
    });
  });
});
