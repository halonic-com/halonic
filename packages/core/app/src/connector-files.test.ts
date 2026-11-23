import type { Connector } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import { bytesToHex, encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { connectorFiles, unreadableConnectorFile } from "./connector-files.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** The test reader's folder, the workspace's location here. */
const root = "/profile/plugins";

function program(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}) {
  const stdio = { command: "node", args, ...options };
  return { version: 1, id: "files", transport: { stdio }, tools: { approve: [] } } as Connector;
}

async function hashOf(text: string): Promise<string> {
  return `sha256:${bytesToHex(await digest.sha256(encodeUtf8(text)))}`;
}

async function filesOf(connector: Connector, workspace: TestFolderReader) {
  return (await connectorFiles([connector], workspace, digest)).get(connector.id);
}

verifies("workspace.trust-connector-files", () => {
  describe("connectorFiles", () => {
    it("hashes the script a connector starts, by its workspace-relative path", async () => {
      const workspace = new TestFolderReader().putFiles({ "tools/server.js": "serve()" });

      expect(await filesOf(program(["./tools/server.js"]), workspace)).toEqual({
        "tools/server.js": await hashOf("serve()"),
      });
    });

    it("gives one entry for the same file written relative, from another cwd or absolute", async () => {
      const workspace = new TestFolderReader().putFiles({ "tools/server.js": "serve()" });
      const expected = { "tools/server.js": await hashOf("serve()") };

      expect(await filesOf(program(["tools/server.js"]), workspace)).toEqual(expected);
      expect(await filesOf(program(["./server.js"], { cwd: "tools" }), workspace)).toEqual(
        expected,
      );
      expect(await filesOf(program(["server.js"], { cwd: "tools/../tools/" }), workspace)).toEqual(
        expected,
      );
      expect(await filesOf(program([`${root}/tools/server.js`]), workspace)).toEqual(expected);
      expect(
        await filesOf(program(["../tools/server.js"], { cwd: `${root}/lib` }), workspace),
      ).toEqual(expected);
    });

    it("adds the endings Node and Python add to a script or module", async () => {
      const workspace = new TestFolderReader().putFiles({
        "tools/server.js": "serve()",
        "tools/mail.py": "send()",
      });

      expect(await filesOf(program(["tools/server"]), workspace)).toEqual({
        "tools/server.js": await hashOf("serve()"),
      });
      expect(await filesOf(program(["-m", "tools.mail"]), workspace)).toEqual({
        "tools/mail.py": await hashOf("send()"),
      });
    });

    it("hashes a file an argument or env value names", async () => {
      const workspace = new TestFolderReader().putFiles({ "tools/mail.json": "{}" });
      const expected = { "tools/mail.json": await hashOf("{}") };

      expect(await filesOf(program(["--config=tools/mail.json"]), workspace)).toEqual(expected);
      expect(
        await filesOf(program([], { env: { MAIL_CONFIG: "./tools/mail.json" } }), workspace),
      ).toEqual(expected);
    });

    it("leaves out paths outside the workspace, folders, private paths and missing files", async () => {
      const workspace = new TestFolderReader().putFiles({
        ".env": "TOKEN=1",
        "tools/lib/a.js": "a()",
      });
      const connector = program([
        "../outside.js",
        "/etc/hosts",
        "tools/../../escape.js",
        "--env-file=.env",
        "tools/lib",
        ".",
        "tools/missing.js",
      ]);

      expect(await filesOf(connector, workspace)).toBeUndefined();
      expect(
        await filesOf(program(["server.js"], { cwd: "/opt/acme" }), workspace),
      ).toBeUndefined();
    });

    it("marks a link or special file instead of hashing it", async () => {
      const workspace = new TestFolderReader().putLink("tools/server.js").putSpecial("tools/pipe");

      expect(await filesOf(program(["tools/server.js", "tools/pipe"]), workspace)).toEqual({
        "tools/pipe": unreadableConnectorFile,
        "tools/server.js": unreadableConnectorFile,
      });
    });

    it("reads only stdio connectors", async () => {
      const workspace = new TestFolderReader().putFiles({ "tools/server.js": "serve()" });
      const http = {
        version: 1,
        id: "web",
        transport: { http: { url: "https://mcp.acme.test/tools/server.js", headers: {} } },
        tools: { approve: [] },
      } as Connector;

      expect(await connectorFiles([http], workspace, digest)).toEqual(new Map());
    });
  });
});
