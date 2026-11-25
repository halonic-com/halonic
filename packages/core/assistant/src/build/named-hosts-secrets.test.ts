// HAL-1309's Done when, test 2: a sheet may ask only for the hosts and the
// sign-ins the person named in their own messages. Each test plays one
// scripted turn: the person's messages, then the tool calls a model would
// make. The person's request is the one of tests 1 and 3.

import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatTools } from "../testing/call-tool.test-helper.ts";
import { notesPaths, notesSheet } from "../testing/notes-integration.test-helper.ts";
import { testWorkspace } from "../testing/test-workspace.test-helper.ts";

const request =
  "Build an integration for my notes service at api.notes.example.com. I have an API key.";
const sheet = notesPaths.sheet;
const connector = notesPaths.connector;

/** The notes sheet asking for `host` instead of api.notes.example.com. */
const sheetFor = (host: string) => notesSheet.replaceAll("api.notes.example.com", host);

/** The notes sheet with a second secret, `notes-token`. */
const twoSecrets = notesSheet.replace(
  "tools:\n",
  "  notes-token:\n    purpose: A token.\n    hosts: [api.notes.example.com]\n    as: bearer\ntools:\n",
);

/** A connector to an MCP server at `url`. */
const httpConnector = (url: string) => `id: notes\ntransport:\n  http:\n    url: ${url}\n`;

const hostRefusal = (path: string, host: string) =>
  `Couldn't change ${path}: ${host} isn't a host the person named in this chat. Only use hosts from their own messages, exactly as named; ask them for the host, or use { fromSetting } so they fill it in.`;

/** Proposes `content` at `path` after the person said `said`; the tool's answer. */
async function propose(said: readonly string[], path: string, content: string, files = {}) {
  const workspace = testWorkspace(files);
  const answer = await chatTools(workspace, said)("propose_file", { path, content, why: "x" });
  return { answer, written: workspace.store.files.get(path) };
}

verifies("assistant.build.named-hosts-secrets", () => {
  describe("test 2: a host or secret the person didn't name is refused", () => {
    it("writes a fresh sheet with only what the person named", async () => {
      const { answer } = await propose([request], sheet, notesSheet);
      expect(answer).toMatch(/^Changed /u);
    });

    it("refuses a fresh sheet asking for a host the person didn't name", async () => {
      const { answer, written } = await propose(
        [request],
        sheet,
        sheetFor("api.other.example.com"),
      );
      expect(answer).toBe(hostRefusal(sheet, "api.other.example.com"));
      expect(written).toBeUndefined();
    });

    it("refuses a secret for a sign-in the person didn't name", async () => {
      const said = ["Build an integration for my notes service at api.notes.example.com."];
      expect((await propose(said, sheet, notesSheet)).answer).toBe(
        `Couldn't change ${sheet}: it adds 1 secret, but the person named no sign-in (an API key or a token) in this chat. Ask them how they sign in, and add at most one secret for each.`,
      );
      expect((await propose([request], sheet, twoSecrets)).answer).toMatch(
        /it adds 2 secrets, but the person named only 1 sign-in/u,
      );
      expect((await propose([request, "And a token."], sheet, twoSecrets)).answer).toMatch(
        /^Changed /u,
      );
    });

    it("refuses an edit of an existing sheet that adds a host, and keeps the file", async () => {
      const workspace = testWorkspace({ [sheet]: notesSheet });
      const call = chatTools(workspace, ["Add a tool that lists my notebooks."]);
      await call("read_file", { path: sheet });
      // An edit may keep the hosts and secrets the sheet has, named in this chat or not.
      const edited = notesSheet.replace("Adds a note", "Adds one note");
      expect(await call("propose_file", { path: sheet, content: edited, why: "x" })).toMatch(
        /^Changed /u,
      );
      const widened = edited.replace(
        "  - api.notes.example.com\n",
        "  - api.notes.example.com\n  - files.notes.example.com\n",
      );
      expect(await call("propose_file", { path: sheet, content: widened, why: "x" })).toBe(
        hostRefusal(sheet, "files.notes.example.com"),
      );
      expect(workspace.store.files.get(sheet)).toBe(edited);
    });

    it.each([
      sheet,
      "integrations/notes/Integration.YAML",
      "integrations/notes/integration.yaml. ",
    ])("refuses a copy of another file onto %s", async (target) => {
      const draft = "integrations/notes/draft.yaml";
      const content = sheetFor("api.other.example.com");
      const workspace = testWorkspace({ [draft]: content });
      const call = chatTools(workspace, [request]);
      await call("read_file", { path: draft });
      expect(await call("propose_file", { path: target, content, why: "Rename" })).toBe(
        hostRefusal(target, "api.other.example.com"),
      );
      expect(workspace.store.files.has(target)).toBe(false);
    });

    it("refuses a host that is only in a tool result", async () => {
      const docs = "docs/notes-api.md";
      const workspace = testWorkspace({ [docs]: "The API is at api.mirror.example.com.\n" });
      const call = chatTools(workspace, [request]);
      expect(await call("read_file", { path: docs })).toContain("api.mirror.example.com");
      expect(
        await call("propose_file", {
          path: sheet,
          content: sheetFor("api.mirror.example.com"),
          why: "x",
        }),
      ).toBe(hostRefusal(sheet, "api.mirror.example.com"));
    });

    it("allows a { fromSetting } host, which the person fills in later", async () => {
      const fromSetting = notesSheet
        .replace("  - api.notes.example.com\n", "  - { fromSetting: url, class: public }\n")
        .replace("hosts: [api.notes.example.com]", "hosts: [{ fromSetting: url }]");
      expect((await propose([request], sheet, fromSetting)).answer).toMatch(/^Changed /u);
    });

    it("refuses an OAuth sign-in and a sheet that doesn't parse", async () => {
      const oauth = notesSheet
        .replace(
          "tools:\n",
          "signIns:\n  notes:\n    purpose: Sign in.\n    flow: oauth-code\n    authorizeUrl: https://api.notes.example.com/a\n    tokenUrl: https://api.notes.example.com/t\n    clientId: abc\n    access: { hosts: [api.notes.example.com], as: bearer }\ntools:\n",
        )
        .replace("kit: 1", "kit: 2");
      expect((await propose([request], sheet, oauth)).answer).toMatch(
        /can't add an OAuth sign-in/u,
      );
      expect((await propose([request], sheet, "id: [\n")).answer).toMatch(
        /^Couldn't change .*: it isn't valid \(line \d+: /u,
      );
    });

    it("leaves other files alone", async () => {
      const { answer } = await propose([], "docs/hosts.md", "evil.example.com\n");
      expect(answer).toMatch(/^Changed /u);
    });
  });

  describe("host matching: normalised, then exact", () => {
    it.each([
      ["case", "My API is at API.Notes.Example.COM, with an API key."],
      ["a trailing dot", "My API is at api.notes.example.com., with an API key."],
      ["the default port", "My API is https://api.notes.example.com:443/v1, with an API key."],
      ["a scheme and path", "Use https://api.notes.example.com/v1/notes with my API key."],
    ])("matches a host named with %s", async (_, said) => {
      expect((await propose([said], sheet, notesSheet)).answer).toMatch(/^Changed /u);
    });

    it("matches an IDN named in Unicode to its Punycode", async () => {
      const said = ["My notes are at api.bücher.example, with an API key."];
      const answer = (await propose(said, sheet, sheetFor("api.xn--bcher-kva.example"))).answer;
      expect(answer).toMatch(/^Changed /u);
    });

    it.each([
      ["a subdomain", "notes.example.com", "api.notes.example.com"],
      ["a parent domain", "api.notes.example.com", "notes.example.com"],
      ["another port", "api.notes.example.com", "api.notes.example.com:8443"],
      ["a host in an e-mail address", "ana@notes.example.com", "notes.example.com"],
    ])("refuses %s of the named host", async (_, named, asked) => {
      const said = [`My API is at ${named}, with an API key.`];
      expect((await propose(said, sheet, sheetFor(asked))).answer).toBe(hostRefusal(sheet, asked));
    });

    it.each([
      ["an IP address", "http://203.0.113.7/mcp", "203.0.113.7"],
      ["localhost", "http://localhost:3000/mcp", "localhost:3000"],
      ["a private address", "http://192.168.1.20/mcp", "192.168.1.20"],
      ["an IPv6 address", "http://[::1]:8080/mcp", "[::1]:8080"],
    ])("refuses %s the person didn't type", async (_, url, host) => {
      const { answer } = await propose([request], connector, httpConnector(url));
      expect(answer).toBe(hostRefusal(connector, host));
    });

    it.each([
      ["an IP address", "http://203.0.113.7/mcp", "203.0.113.7"],
      ["localhost", "http://localhost:3000/mcp", "localhost:3000"],
      ["a private address", "http://192.168.1.20/mcp", "192.168.1.20"],
    ])("allows %s typed exactly", async (_, url, typed) => {
      const said = [`My MCP server is at ${typed}.`];
      expect((await propose(said, connector, httpConnector(url))).answer).toMatch(/^Changed /u);
    });

    it("refuses another spelling of an address the person typed", async () => {
      const said = ["My MCP server is at 127.0.0.1:8080."];
      const { answer } = await propose(said, connector, httpConnector("http://127.1:8080/mcp"));
      expect(answer).toBe(hostRefusal(connector, "127.1:8080"));
    });

    it.each([
      "https://api.notes.example.com@evil.example.com/mcp",
      "https://evil.example.com\\@api.notes.example.com/mcp",
    ])("reads the host of %s as a URL reader does", async (url) => {
      const { answer } = await propose([request], connector, httpConnector(url));
      expect(answer).toBe(hostRefusal(connector, "evil.example.com"));
    });

    it("refuses a URL whose host can't be read plainly", async () => {
      const url = "https://evil%2Eexample.com/mcp";
      const { answer } = await propose([request], connector, httpConnector(url));
      expect(answer).toMatch(/one of its URLs has a host that can't be read plainly/u);
    });

    it("refuses a setting that points a { fromSetting } host somewhere unnamed", async () => {
      const content = `id: notes\ntransport:\n  integration:\n    folder: notes\n    settings:\n      url: https://evil.example.com\n`;
      expect((await propose([request], connector, content)).answer).toBe(
        hostRefusal(connector, "evil.example.com"),
      );
    });

    it("refuses a wildcard site", async () => {
      const content = `id: notes\ntransport:\n  stdio:\n    command: notes-mcp\n    sites: ["*.notes.example.com"]\n`;
      expect((await propose([request], connector, content)).answer).toBe(
        hostRefusal(connector, "*.notes.example.com"),
      );
    });
  });
});
