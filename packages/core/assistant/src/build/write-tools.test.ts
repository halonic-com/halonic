import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatTools } from "../testing/call-tool.test-helper.ts";
import { testWorkspace } from "../testing/test-workspace.test-helper.ts";

const tone = "skills/tone/SKILL.md";
const triage = "hubs/sales/workflows/triage.workflow.yaml";
const old = "hubs/sales/agents/old.agent.yaml";
const toReview =
  "The person reviews the change and accepts or rejects it; until then it's marked as yours to review.";
const changedSinceRead =
  "The file changed since you read it. Read it again, then make your change.";

verifies("assistant.build.proposals-change-nothing", () => {
  it("writes a new file at once, as a change to review of this chat's card", async () => {
    const workspace = testWorkspace({});
    const call = chatTools(workspace);
    expect(
      await call("propose_file", { path: tone, content: "# Tone\n", why: "A tone skill" }),
    ).toBe(`Changed ${tone}. ${toReview}`);
    expect(workspace.store.files.get(tone)).toBe("# Tone\n");
    expect(await workspace.review.itemsWithChangesToReview()).toEqual([
      { path: tone, card: { chatId: "c1", cardId: "call-1" } },
    ]);
  });

  it("moves a file it read to the trash, as a change to review", async () => {
    const workspace = testWorkspace({ [old]: "id: old\nname: Old\n" });
    const call = chatTools(workspace);
    await call("read_file", { path: old });
    expect(await call("propose_delete", { path: old, why: "Not used" })).toBe(
      `Deleted ${old}. ${toReview}`,
    );
    expect(workspace.store.files.has(old)).toBe(false);
    expect(await workspace.review.itemsWithChangesToReview()).toHaveLength(1);
  });

  it("says a file to delete doesn't exist, and writes nothing", async () => {
    const workspace = testWorkspace({});
    expect(await chatTools(workspace)("propose_delete", { path: old, why: "Not used" })).toBe(
      `Error: ${old} does not exist`,
    );
    expect(await workspace.review.itemsWithChangesToReview()).toEqual([]);
  });

  it("writes nothing when the person typed in the file since the model read it", async () => {
    const workspace = testWorkspace({ [triage]: "id: triage\n" });
    const call = chatTools(workspace);
    await call("read_file", { path: triage });
    workspace.store.files.set(triage, "id: triage\nname: Triage\n");
    expect(await call("propose_file", { path: triage, content: "id: t\n", why: "x" })).toBe(
      changedSinceRead,
    );
    expect(await call("propose_delete", { path: triage, why: "x" })).toBe(changedSinceRead);
    expect(workspace.store.files.get(triage)).toBe("id: triage\nname: Triage\n");
  });

  it("asks the model to read a file it never read before it changes it", async () => {
    const workspace = testWorkspace({ [triage]: "id: triage\n" });
    const call = chatTools(workspace);
    expect(await call("propose_file", { path: triage, content: "id: t\n", why: "x" })).toBe(
      `Read ${triage} first, then make your change.`,
    );
    expect(await call("propose_delete", { path: triage, why: "x" })).toBe(
      `Read ${triage} first, then make your change.`,
    );
    expect(workspace.store.files.get(triage)).toBe("id: triage\n");
  });

  it("says a file it read and someone deleted since doesn't exist", async () => {
    const workspace = testWorkspace({ [old]: "id: old\nname: Old\n" });
    const call = chatTools(workspace);
    await call("read_file", { path: old });
    workspace.store.files.delete(old);
    expect(await call("propose_delete", { path: old, why: "x" })).toBe(
      `Error: ${old} does not exist`,
    );
  });

  it("asks for a read again when a file it knew as missing exists now", async () => {
    const workspace = testWorkspace({});
    const call = chatTools(workspace);
    await call("read_file", { path: old });
    workspace.store.files.set(old, "id: old\n");
    expect(await call("propose_delete", { path: old, why: "x" })).toBe(changedSinceRead);
    expect(workspace.store.files.get(old)).toBe("id: old\n");
  });

  it("leaves a file that changed outside Halonic for Compare", async () => {
    const workspace = testWorkspace({});
    const call = chatTools(workspace);
    await call("propose_file", { path: tone, content: "# Tone\n", why: "x" });
    workspace.store.files.set(tone, "# Tone from outside\n");
    await call("read_file", { path: tone });
    expect(await call("propose_file", { path: tone, content: "# Tone 2\n", why: "x" })).toBe(
      `${tone} changed outside Halonic and waits for the person to compare it. Change it again once they have.`,
    );
    expect(workspace.store.files.get(tone)).toBe("# Tone from outside\n");
  });

  it("gives the model an error for a missing path, and passes on a failing disk", async () => {
    const workspace = testWorkspace({});
    const call = chatTools(workspace);
    await expect(call("propose_file", { content: "x", why: "x" })).rejects.toThrow(
      '"path" must be a text.',
    );
    workspace.store.read = () => Promise.reject(new Error("The disk is gone."));
    await expect(call("propose_file", { path: tone, content: "x", why: "x" })).rejects.toThrow(
      "The disk is gone.",
    );
  });

  it("writes on from what it wrote itself, without reading again", async () => {
    const workspace = testWorkspace({});
    const call = chatTools(workspace);
    await call("propose_file", { path: tone, content: "# Tone\n", why: "x" });
    expect(await call("propose_file", { path: tone, content: "# Tone 2\n", why: "y" })).toBe(
      `Changed ${tone}. ${toReview}`,
    );
  });
});

verifies("app.assistant-untrusted-items-only", () => {
  // Julian's B1 test through the tools (HAL-16788): the review service
  // refuses, and the tool gives the model the requirement's words.
  const untrusted = "Not trusted yet: only Halonic items can be changed.";
  const files = { "package.json": "{}\n", "agents/clerk.agent.yaml": "id: clerk\nname: Clerk\n" };

  describe("in an untrusted workspace", () => {
    it.each([".envrc", "package.json"])("propose_file to %s writes nothing", async (path) => {
      const workspace = testWorkspace(files, false);
      const call = chatTools(workspace);
      expect(await call("propose_file", { path, content: "planted\n", why: "x" })).toBe(untrusted);
      expect(workspace.store.files.get(path)).toBe(path === ".envrc" ? undefined : "{}\n");
      expect(await workspace.review.itemsWithChangesToReview()).toEqual([]);
    });

    it("propose_delete of package.json deletes nothing", async () => {
      const workspace = testWorkspace(files, false);
      const call = chatTools(workspace);
      expect(await call("propose_delete", { path: "package.json", why: "x" })).toBe(untrusted);
      expect(workspace.store.files.get("package.json")).toBe("{}\n");
      expect(await workspace.review.itemsWithChangesToReview()).toEqual([]);
    });

    it("refuses a file read while trusted once trust is gone", async () => {
      const workspace = testWorkspace(files, true);
      const call = chatTools(workspace);
      await call("read_file", { path: "package.json" });
      workspace.trust.trusted = false;
      expect(await call("propose_file", { path: "package.json", content: "x", why: "x" })).toBe(
        untrusted,
      );
      expect(workspace.store.files.get("package.json")).toBe("{}\n");
    });
  });
});

verifies("app.assistant-no-git-or-halonic", () => {
  it.each([".git/hooks/pre-commit", ".halonic/review/files/a.json", "../outside.txt"])(
    "propose_file to %s writes nothing",
    async (path) => {
      const workspace = testWorkspace({});
      expect(
        await chatTools(workspace)("propose_file", { path, content: "planted\n", why: "x" }),
      ).toBe(`Couldn't change ${path}: it can't be written to.`);
      expect(workspace.store.files.size).toBe(0);
    },
  );

  it("refuses a write through a symbolic link", async () => {
    const workspace = testWorkspace({});
    workspace.store.links.add("skills");
    expect(
      await chatTools(workspace)("propose_file", { path: tone, content: "planted\n", why: "x" }),
    ).toBe(`Couldn't change ${tone}: it can't be written to.`);
    expect(workspace.store.files.size).toBe(0);
  });

  it("refuses a write or delete through a link made after the model read the path", async () => {
    const workspace = testWorkspace({});
    const call = chatTools(workspace);
    await call("read_file", { path: tone });
    workspace.store.links.add("skills");
    const refusal = `Couldn't change ${tone}: it can't be written to.`;
    expect(await call("propose_file", { path: tone, content: "planted\n", why: "x" })).toBe(
      refusal,
    );
    expect(await call("propose_delete", { path: tone, why: "x" })).toBe(refusal);
    expect(workspace.store.files.size).toBe(0);
  });
});
