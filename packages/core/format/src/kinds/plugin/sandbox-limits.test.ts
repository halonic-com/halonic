// What a plugin may point its code at: the files in its folder and the sites
// its local tools reach. Both feed the sandbox for code Halonic doesn't
// trust, so they take the agent file's working-folder and allowed-site rules.
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import { networkSiteProblem, pluginPathProblem } from "./schema.ts";

const head = ["id: weather", "version: 1.0.0", "sdk: 1", "name: Weather"];

/** A plugin with one local tool whose `network` is `sites`, on line 9. */
const network = (sites: string) =>
  yaml(
    ...head,
    "localTools:",
    "  - id: radar",
    "    start: { script: { program: node, path: radar.js } }",
    "    tools: [{ name: radar-image, description: A radar image., risk: read, untrusted: false }]",
    `    network: ${sites}`,
  );

verifies("format.plugin-file", () => {
  describe("a path in the plugin folder", () => {
    it.each([
      "backend/index.js",
      "tools/radar.js",
      "run.py",
      "tools/.hidden/run.js",
      "tools/~draft.js",
    ])("accepts %s", (path) => {
      expect(pluginPathProblem(path)).toBeNull();
    });

    it.each([
      ["/bin/sh", "absolute"],
      ["C:/run.js", "a drive"],
      [String.raw`tools\run.js`, "backslashes"],
      ["../run.js", "leaves the folder"],
      ["tools/../../run.js", "leaves the folder in the middle"],
      ["./run.js", "a '.' part"],
      ["tools//run.js", "an empty part"],
      ["", "empty"],
      ["run.js.", "a trailing dot"],
      ["run.js ", "a trailing space"],
      ["tools./run.js", "a trailing dot on a folder"],
      ["TOOLS~1/run.js", "an 8.3 short name"],
      ["run.js::$DATA", "an NTFS stream"],
      ["tools/r\u200Bun.js", "a zero-width code point"],
      ["tools/\u00ADrun.js", "a soft hyphen"],
      ["tools\u0000/run.js", "NUL"],
      ["tools/\nrun.js", "a control character"],
      ["．．／run.js", "fullwidth dots and '/' that leave the folder"],
      ["ｔｏｏｌｓ．/run.js", "a fullwidth name with a fullwidth trailing dot"],
      ["run.js　", "an ideographic space at the end"],
      ["tools＼run.js", "a fullwidth backslash"],
      ["run.js：stream", "a fullwidth ':'"],
      ["ＣＯＭ～１/run.js", "a fullwidth 8.3 short name"],
    ])("refuses %s (%s)", (path) => {
      expect(pluginPathProblem(path)).not.toBeNull();
    });

    it.each([
      "../backend.js",
      "backend/index.js.",
      "BACKEN~1/index.js",
      "．．／backend.js",
      "backend/index.js．",
    ])("refuses the backend entry '%s'", (entry) => {
      const text = yaml(...head, "backend:", `  entry: '${entry}'`, "  hosts: []");
      expect(summary(problemsOf("plugin", text))).toEqual(["backend.entry custom 6"]);
    });
  });

  describe("a local tool's network", () => {
    it.each(["api.example.com", "example.com", "*.example.com", "xn--bcher-kva.example"])(
      "accepts %s",
      (site) => {
        expect(networkSiteProblem(site)).toBeNull();
      },
    );

    it.each([
      ["metadata.google.internal", "a cloud metadata name"],
      ["printer.local", "a .local name"],
      ["foo.localhost", "a localhost name"],
      ["x.in-addr.arpa", "an .arpa name"],
      ["box.localdomain", "a .localdomain name"],
      ["localhost", "localhost"],
      ["10.0.0.1", "an IPv4 address"],
      ["127.0x1", "a hex address"],
      ["[::1]", "an IPv6 address"],
      ["api.example.com:8443", "a port"],
      ["https://api.example.com", "a scheme"],
      ["*", "a bare wildcard"],
      ["*.com", "a wildcard over one label"],
      ["api\u200B.example.com", "a zero-width space"],
      ["ａｐｉ.example.com", "fullwidth letters"],
      ["API.Example.com", "capitals, which a secret's host wouldn't match"],
      ["bücher.example", "Unicode, which a secret's host wouldn't match"],
    ])("refuses %s (%s)", (site) => {
      expect(networkSiteProblem(site)).not.toBeNull();
    });

    it("names the form to write instead of capitals or Unicode", () => {
      expect(networkSiteProblem("bücher.example")).toBe(
        "Write the host name as 'xn--bcher-kva.example'",
      );
    });

    it("refuses a refused name at its place in the list", () => {
      const problems = problemsOf("plugin", network("[api.example.com, metadata.google.internal]"));
      expect(summary(problems)).toEqual(["localTools.0.network.1 custom 9"]);
    });

    it("takes up to 50 sites, as an agent's allowed sites", () => {
      const sites = (count: number) =>
        `[${Array.from({ length: count }, (_, index) => `s${index}.example.com`).join(", ")}]`;
      expect(parsedValue("plugin", network(sites(50))).localTools?.[0]?.network).toHaveLength(50);
      expect(summary(problemsOf("plugin", network(sites(51))))).toEqual([
        "localTools.0.network too_big 9",
      ]);
    });
  });
});
