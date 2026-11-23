import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { choiceCommitMessage, saveChoiceFiles } from "./choice-files.ts";

/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

const author = { name: "Acme", email: "acme@example.com" };

let root: string;
let runner: GitRunner;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "acme-choice-"));
  runner = await GitRunner.create({ git: await testGit() });
});

afterEach(async () => {
  await runner.close();
  await rm(root, { recursive: true, force: true });
});

describe("saving a served window's model choice in a git repository", () => {
  verifies("cli.commands.serve.choice-commit", () => {
    it(
      "leaves another staged file staged and out of the commit",
      async () => {
        const vcs = new GitVcs(root, { runner, author });
        await vcs.init();
        await writeFile(join(root, "workspace.yaml"), "id: acme\nname: Acme\n");
        await writeFile(join(root, "models.yaml"), "aliases:\n  default: mock/echo\n");
        await writeFile(join(root, "notes.md"), "Acme notes\n");
        await vcs.stage(["workspace.yaml", "models.yaml", "notes.md"]);
        await vcs.commit("Start");
        await writeFile(join(root, "notes.md"), "Acme notes, edited\n");
        await vcs.stage(["notes.md"]);

        await saveChoiceFiles(
          {
            store: new FolderDefinitionStore(root),
            root,
            openHistory: async () => ({ vcs, close: async () => undefined }),
          },
          {
            "models.yaml": "aliases:\n  default: anthropic/claude-haiku\n",
            "providers/anthropic.yaml": "id: anthropic\ntype: anthropic\nsecret: anthropic-key\n",
          },
        );

        const [last] = await vcs.log(1);
        expect(last?.message).toBe(choiceCommitMessage);
        expect(await vcs.readAt(last?.hash ?? "", "providers/anthropic.yaml")).not.toBeNull();
        expect(await vcs.readAt(last?.hash ?? "", "notes.md")).toBe("Acme notes\n");
        expect((await vcs.status()).changes).toEqual([
          expect.objectContaining({ path: "notes.md", status: "modified", staged: true }),
        ]);
      },
      gitTimeout,
    );
  });
});
