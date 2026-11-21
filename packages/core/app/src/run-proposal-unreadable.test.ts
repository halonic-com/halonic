// A run with history off copies every saved file, also those in folders
// loading leaves out, such as `node_modules`. One the account may not read
// says so as loading does, never as an error Halonic can't explain
// (HAL-15274, from C554).

import { type Digest, UnreadableWorkspaceFolderError } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { CopyProposalTexts } from "./run-proposal-copy-texts.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestRunCopies } from "./testing/test-run-copies.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** A workspace whose listing or one file fails as a folder store's does. */
class FailingStore extends TestDefinitionStore {
  listError: unknown = null;
  readError: { path: string; error: unknown } | null = null;

  override async list(...args: Parameters<TestDefinitionStore["list"]>): Promise<string[]> {
    if (this.listError !== null) {
      throw this.listError;
    }
    return super.list(...args);
  }

  override async read(path: string): Promise<string | null> {
    if (this.readError?.path === path) {
      throw this.readError.error;
    }
    return super.read(path);
  }
}

/** An error as Node gives it for a file the account may not read. */
function deniedError(): Error {
  return Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
}

/** Opens a run's copy of the workspace and gives the error it fails with. */
async function openingError(workspace: FailingStore, copies = new TestRunCopies(digest)) {
  const texts = new CopyProposalTexts(copies, workspace, digest);
  return texts.open("01JD8Q").then(
    () => {
      throw new Error("The copy was made.");
    },
    (error: unknown) => error,
  );
}

verifies("app.run-proposal-unreadable", () => {
  describe("a run's copy of a workspace it can't read all of", () => {
    it("names a folder it can't list as loading does, and leaves no copy", async () => {
      const workspace = new FailingStore({ "README.md": "# Acme\n" });
      const cause = new UnreadableWorkspaceFolderError(
        "node_modules/pkg/locked",
        "The workspace folder node_modules/pkg/locked can't be read.",
      );
      workspace.listError = cause;
      const copies = new TestRunCopies(digest);

      const error = await openingError(workspace, copies);

      expect(error).toBeInstanceOf(KindedError);
      expect(error).toMatchObject({
        kind: "invalid_input",
        message: "the workspace folder node_modules/pkg/locked can't be read.",
        fix: "Check the folder's permissions, or move it out of the workspace.",
        cause,
      });
      expect(copies.copies.size).toBe(0);
    });

    it("names a file it can't read as loading does, and leaves no copy", async () => {
      const workspace = new FailingStore({ "README.md": "# Acme\n", "scratch/notes.md": "x\n" });
      const cause = deniedError();
      workspace.readError = { path: "scratch/notes.md", error: cause };
      const copies = new TestRunCopies(digest);

      const error = await openingError(workspace, copies);

      expect(error).toMatchObject({
        kind: "invalid_input",
        message: "the workspace file scratch/notes.md can't be read.",
        fix: "Check the file's permissions, or move it out of the workspace.",
        cause,
      });
      expect(copies.copies.size).toBe(0);
    });

    it("passes on any other error from the listing as it is", async () => {
      const workspace = new FailingStore();
      const cause = new Error("disk gone");
      workspace.listError = cause;

      expect(await openingError(workspace)).toBe(cause);
    });
  });
});
