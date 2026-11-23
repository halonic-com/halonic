import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatTools } from "../testing/call-tool.test-helper.ts";
import { testWorkspace } from "../testing/test-workspace.test-helper.ts";

/** One path for each name, ending or folder the rule refuses. */
const refused = [
  ".npmrc",
  ".yarnrc.yml",
  ".netrc",
  "_netrc",
  ".pypirc",
  ".git-credentials",
  ".pgpass",
  "keys/id_rsa",
  "keys/id_dsa",
  "keys/id_ecdsa",
  "keys/id_ed25519",
  "keys/id_ecdsa_sk",
  "keys/id_ed25519_sk",
  "certs/server.pem",
  "certs/server.key",
  "certs/client.p12",
  "certs/client.pfx",
  ".aws/credentials",
  ".docker/config.json",
  ".kube/config",
  ".ssh/config",
  ".gnupg/pubring.kbx",
];

/** The same files, spelled as Windows or macOS would still open them. */
const respelled = [
  "hubs/sales/.NPMRC.",
  "Keys/ID_ED25519 ",
  "certs/Server.PEM",
  ".AWS/Credentials",
];

const cantRead = (path: string) => `Couldn't read ${path}: it can't be read.`;
const cantWrite = (path: string) => `Couldn't change ${path}: it can't be written to.`;

verifies("assistant.build.no-credential-files", () => {
  describe("read_file, in a trusted workspace", () => {
    it.each([...refused, ...respelled])("refuses %s", async (path) => {
      const call = chatTools(testWorkspace({ [path]: "token\n" }));
      expect(await call("read_file", { path })).toBe(cantRead(path));
    });

    it("reads a public key and a file whose name only mentions keys", async () => {
      const files = { "keys/id_ed25519.pub": "ssh-ed25519 AAAA\n", "docs/keys.md": "# Keys\n" };
      const call = chatTools(testWorkspace(files));
      for (const [path, text] of Object.entries(files)) {
        expect(await call("read_file", { path })).toBe(text);
      }
    });
  });

  describe("list_files, in a trusted workspace", () => {
    it("leaves out every credential file", async () => {
      const files = Object.fromEntries(refused.map((path) => [path, "token\n"]));
      const call = chatTools(testWorkspace({ ...files, "package.json": "{}\n" }));
      expect(await call("list_files")).toBe("package.json");
    });

    it("refuses to list .ssh/ and .gnupg/", async () => {
      const call = chatTools(testWorkspace({ ".ssh/config": "Host x\n" }));
      for (const under of [".ssh", "home/.Ssh", ".gnupg"]) {
        expect(await call("list_files", { under })).toBe(cantRead(under));
      }
    });
  });

  describe("propose_file and propose_delete, in a trusted workspace", () => {
    it.each(refused)("refuses to write %s and writes nothing", async (path) => {
      const workspace = testWorkspace({});
      const call = chatTools(workspace);
      expect(await call("propose_file", { path, content: "token\n", why: "x" })).toBe(
        cantWrite(path),
      );
      expect(workspace.store.files.has(path)).toBe(false);
      expect(await workspace.review.itemsWithChangesToReview()).toEqual([]);
    });

    it("refuses to delete one", async () => {
      const workspace = testWorkspace({ ".npmrc": "token\n" });
      expect(await chatTools(workspace)("propose_delete", { path: ".npmrc", why: "x" })).toBe(
        cantWrite(".npmrc"),
      );
      expect(workspace.store.files.get(".npmrc")).toBe("token\n");
    });
  });
});
