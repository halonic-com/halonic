import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fileKinds } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import {
  allowedSiteProblem,
  asciiAllowedSites,
  defaultWorkingFolder,
  foldName,
  PROTECTED_TOP_NAMES,
  workingFolderProblem,
} from "./sandbox-fields.ts";

const agent = (...lines: string[]) => yaml("id: writer", "name: Writer", ...lines);

verifies("format.agent-sandbox-fields", () => {
  it("leaves all three out of a minimal agent, so older files read as before", () => {
    const value = parsedValue("agent", agent());
    expect(value).not.toHaveProperty("harness");
    expect(value).not.toHaveProperty("workingFolder");
    expect(value).not.toHaveProperty("allowedSites");
  });

  it("reads a harness agent with its working folder and sites", () => {
    const value = parsedValue(
      "agent",
      agent(
        "harness: claude-code",
        "workingFolder: files/reports",
        "allowedSites: [api.example.com, '*.docs.example.com']",
      ),
    );
    expect(value.harness).toBe("claude-code");
    expect(value.workingFolder).toBe("files/reports");
    expect(value.allowedSites).toEqual(["api.example.com", "*.docs.example.com"]);
  });

  it("refuses a harness that isn't on the list", () => {
    expect(summary(problemsOf("agent", agent("harness: claude")))).toEqual([
      "harness invalid_value 3",
    ]);
  });

  it("refuses more than 50 sites", () => {
    const sites = Array.from({ length: 51 }, (_, index) => `s${index}.example.com`);
    expect(summary(problemsOf("agent", agent(`allowedSites: [${sites.join(", ")}]`)))).toEqual([
      "allowedSites too_big 3",
    ]);
  });

  it("gives the default working folder under files/agents", () => {
    expect(defaultWorkingFolder("writer")).toBe("files/agents/writer");
  });

  it("reports a bad working folder or site at its own path", () => {
    const text = agent("workingFolder: ../outside", "allowedSites: [api.example.com, '*']");
    expect(summary(problemsOf("agent", text))).toEqual([
      "workingFolder custom 3",
      "allowedSites.1 custom 4",
    ]);
  });
});

verifies("format.agent-sandbox-fields", () => {
  describe("working folder", () => {
    it.each([
      "files/reports",
      "files/agents/writer",
      "out",
      "notes/2026",
      "files/.gitkeep-dir",
      "files/models.yaml-notes",
      "Bücher/2026",
      "files/~draft",
      "files/.notes",
    ])("accepts %s", (path) => {
      expect(workingFolderProblem(path)).toBeNull();
    });

    it.each([
      ["/srv/out", "absolute"],
      ["C:/out", "a drive"],
      ["files\\out", "backslashes"],
      ["../outside", "leaves the workspace"],
      ["files/../../outside", "leaves the workspace in the middle"],
      ["files/./out", "a '.' part"],
      ["files//out", "an empty part"],
      ["", "empty"],
      [".git/hooks", "git's folder"],
      [".halonic/staging", "Halonic's folder"],
      ["agents", "the agents folder"],
      ["workflows/routines", "a kind's folder"],
      ["hubs/billing/files", "a hub"],
      ["library/skills/x", "the library"],
      [".GIT/hooks", "git's folder in capitals"],
      ["Agents", "the agents folder in capitals"],
      ["HUBS/x", "a hub in capitals"],
      ["ｈｕｂｓ/x", "a hub in fullwidth letters"],
      ["hubſ/x", "a hub spelled with a long s"],
      ["agents./x", "a trailing dot"],
      [".git./hooks", "git's folder with a trailing dot"],
      ["agents /x", "a trailing space"],
      ["files/out.", "a trailing dot further down"],
      ["files/out ", "a trailing space further down"],
      ["files/x:s", "an NTFS stream"],
      [".git::$INDEX_ALLOCATION/hooks", "git's folder as an NTFS stream"],
      ["GIT~1/hooks", "an 8.3 short name"],
      ["files/REPORT~2", "an 8.3 short name further down"],
      [".gitmodules", "a name starting with .git"],
      [".git-x/hooks", "a folder starting with .git"],
      [".g\u200Cit/hooks", "a zero-width code point"],
      ["files/\u00ADout", "a soft hyphen"],
      ["files\u0000/out", "NUL"],
      ["files/\nout", "a control character"],
      ["workspace.yaml", "the workspace file"],
      ["models.yaml", "the models file"],
      ["Deployments.YAML", "the deployments file in capitals"],
      ["hub.yaml", "the hub file"],
      [".claude", "Claude Code's folder"],
      [".claude/commands", "Claude Code's commands"],
      [".codex", "Codex's folder"],
      [".vscode", "the editor's tasks"],
      [".cursor/rules", "Cursor's folder"],
      [".github/workflows", "GitHub's workflows"],
      [".env", "a dotfile"],
      [".Claude", "a dot-folder in capitals"],
      ["．claude", "a dot-folder with a fullwidth dot"],
      ["ａｇｅｎｔｓ．/x", "a fullwidth name with a fullwidth trailing dot"],
      ["files/out．", "a fullwidth trailing dot further down"],
      ["files/out　", "an ideographic space at the end"],
      ["agents／x", "the agents folder with a fullwidth '/'"],
      ["files＼out", "a fullwidth backslash"],
      ["files/x：s", "a fullwidth ':'"],
      ["files/．．/..", "fullwidth dots that leave the workspace"],
      ["GIT～１/hooks", "a fullwidth 8.3 short name"],
    ])("refuses %s (%s)", (path) => {
      expect(workingFolderProblem(path)).not.toBeNull();
    });

    it("protects the folder of every file kind, and the file of a kind in the root", () => {
      const places: { folder: string; name: string }[] = Object.values(fileKinds).flatMap(
        (kind) => [...kind.places],
      );
      for (const place of places) {
        const top = place.folder === "" ? place.name : (place.folder.split("/")[0] ?? "");
        expect(PROTECTED_TOP_NAMES).toContain(top);
        expect(workingFolderProblem(top)).not.toBeNull();
      }
    });

    it("lists the protected names already folded, so the comparison can match", () => {
      for (const name of PROTECTED_TOP_NAMES) expect(foldName(name)).toBe(name);
    });
  });

  describe("allowed sites", () => {
    it.each([
      "api.example.com",
      "example.com",
      "*.example.com",
      "*.docs.example.com",
      "API.Example.COM",
      "bücher.example",
      "xn--bcher-kva.example",
    ])("accepts %s", (site) => {
      expect(allowedSiteProblem(site)).toBeNull();
    });

    it.each([
      ["*", "a bare wildcard"],
      ["*.com", "a wildcard over one label"],
      ["*.*.example.com", "two wildcards"],
      ["api.*.example.com", "a wildcard in the middle"],
      ["com", "a single label"],
      ["localhost", "localhost"],
      ["app.localhost", "a localhost name"],
      ["10.0.0.1", "an IPv4 address"],
      ["[::1]", "an IPv6 address"],
      ["::1", "an IPv6 address without brackets"],
      ["https://api.example.com", "a scheme"],
      ["api.example.com:8443", "a port"],
      ["api.example.com/v1", "a path"],
      ["user@api.example.com", "user info"],
      ["api .example.com", "a space"],
      ["-api.example.com", "a label starting with '-'"],
      ["api.example.com.", "a trailing dot"],
      [`${"a".repeat(64)}.example.com`, "a label over 63 characters"],
      [`${"abcdefghij.".repeat(25)}com`, "a name over 253 characters"],
      ["127.0x1", "a hex address"],
      ["127.0.0.0x1", "a hex address with four parts"],
      ["0x7f.0x1", "an all-hex address"],
      ["api.example.1com", "a last label starting with a digit"],
      ["１２７.０.０.１", "a fullwidth address"],
      ["ａｐｉ.example.com", "fullwidth letters"],
      ["api。example.com", "an ideographic dot"],
      ["api．example.com", "a fullwidth dot"],
      ["api\u200B.example.com", "a zero-width space"],
      ["ap\u00ADi.example.com", "a soft hyphen"],
      ["api\u0085.example.com", "a control character"],
      ["printer.local", "a .local name"],
      ["box.localdomain", "a .localdomain name"],
      ["db.internal", "a .internal name"],
      ["1.0.0.127.in-addr.arpa", "an .arpa name"],
      ["*.internal", "a wildcard over .internal"],
    ])("refuses %s (%s)", (site) => {
      expect(allowedSiteProblem(site)).not.toBeNull();
    });

    it("stores sites lowercase, in Punycode and each once", () => {
      expect(
        asciiAllowedSites([
          "API.Example.com",
          "bücher.example",
          "api.example.com",
          "*.Docs.example",
        ]),
      ).toEqual(["api.example.com", "xn--bcher-kva.example", "*.docs.example"]);
    });
  });
});
