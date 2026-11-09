import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fileKinds } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import {
  allowedSiteProblem,
  asciiAllowedSites,
  defaultWorkingFolder,
  PROTECTED_TOP_FOLDERS,
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
    it.each(["files/reports", "files/agents/writer", "out", "notes/2026"])("accepts %s", (path) => {
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
    ])("refuses %s (%s)", (path) => {
      expect(workingFolderProblem(path)).not.toBeNull();
    });

    it("protects the folder of every file kind", () => {
      const places: { folder: string }[] = Object.values(fileKinds).flatMap((kind) => [
        ...kind.places,
      ]);
      const tops = places
        .map((place) => place.folder.split("/")[0] ?? "")
        .filter((top) => top !== "");
      for (const top of tops) expect(PROTECTED_TOP_FOLDERS).toContain(top);
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
