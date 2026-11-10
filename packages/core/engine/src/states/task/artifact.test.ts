import type { WorkflowState } from "@halonicjs/format";
import type { BlobRef, BlobStore } from "@halonicjs/ports";
import { bytesToHex, decodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { keepDefinitions } from "../../kernel/kept-definitions.ts";
import {
  answer,
  KernelRuns,
  play,
  replyWorkflow,
  startInput,
} from "../../kernel/kernel-test-kit.test-helper.ts";
import { step } from "../../kernel/step.ts";

/** {@link replyWorkflow} whose `draft` state saves its answer as `note`. */
function savingWorkflow(note: WorkflowState["artifact"]) {
  const draft = { ...replyWorkflow.states["draft"], artifact: note } as WorkflowState;
  return { ...replyWorkflow, states: { ...replyWorkflow.states, draft } };
}

const noteMd = { name: "note.md", mediaType: "text/markdown" };

/** A blob store that hashes with SHA-256, as the real ones do, so a hash can be compared with a recorded log. */
class HashingBlobs implements BlobStore {
  readonly blobs = new Map<string, Uint8Array>();
  puts = 0;

  async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    this.puts += 1;
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(data));
    const hash = bytesToHex(new Uint8Array(digest));
    this.blobs.set(hash, data);
    return { hash, size: data.length, mediaType };
  }

  async get(hash: string): Promise<Uint8Array | null> {
    return this.blobs.get(hash) ?? null;
  }
}

/** A blob store that keeps definitions but can't store anything else, like a full disk. */
class FullBlobs extends HashingBlobs {
  full = false;

  override async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    if (this.full) throw new Error("No space left on the disk.");
    return super.put(data, mediaType);
  }
}

async function kernel(blobs: HashingBlobs, note: WorkflowState["artifact"]) {
  const runs = new KernelRuns();
  const version = await keepDefinitions(blobs, { workflow: savingWorkflow(note) });
  const ports = { runs, blobs };
  await step(ports, "r-acme", startInput(version));
  return { ports, runs };
}

verifies("engine.artifact-created", () => {
  describe("decide", () => {
    it("asks to save the answer right after it goes into the context", () => {
      const { decisions } = play(savingWorkflow(noteMd), [
        startInput("sha-1"),
        answer("call-1", "Paid Acme Paper."),
      ]);
      expect(decisions[1]?.events.slice(0, 4)).toEqual([
        { type: "agent.finished", state: "draft", agent: "writer", output: "Paid Acme Paper." },
        { type: "context.updated", key: "reply", value: "Paid Acme Paper." },
        {
          type: "save-artifact",
          state: "draft",
          name: "note.md",
          mediaType: "text/markdown",
          text: "Paid Acme Paper.",
        },
        { type: "transition", from: "draft", to: "sent", event: "done" },
      ]);
    });

    it("saves an answer that isn't text as JSON with two spaces", () => {
      const fields = { name: "fields.json", mediaType: "application/json" };
      const { decisions } = play(savingWorkflow(fields), [
        startInput("sha-1"),
        answer("call-1", { vendor: "Acme Paper", amount: 120 }),
      ]);
      expect(decisions[1]?.events[2]).toMatchObject({
        type: "save-artifact",
        text: '{\n  "vendor": "Acme Paper",\n  "amount": 120\n}',
      });
    });

    it("saves nothing for a state without artifact", () => {
      const { log } = play(replyWorkflow, [startInput("sha-1"), answer("call-1", "Thanks!")]);
      expect(log.map((event) => event.type)).not.toContain("artifact.created");
    });

    it("fails the run on a media type the blob store would refuse, and saves nothing", () => {
      const withCharset = { name: "note.md", mediaType: "text/markdown; charset=utf-8" };
      const { decisions, run } = play(savingWorkflow(withCharset), [
        startInput("sha-1"),
        answer("call-1", "Paid Acme Paper."),
      ]);
      const events = decisions[1]?.events ?? [];
      expect(events.map((event) => event.type)).toEqual([
        "agent.finished",
        "context.updated",
        "run.failed",
      ]);
      expect(events[2]).toMatchObject({
        state: "draft",
        error:
          'State "draft" saves "note.md" as "text/markdown; charset=utf-8", which isn\'t a ' +
          "type/subtype media type without parameters, such as text/markdown.",
      });
      expect(run?.status).toBe("failed");
    });
  });

  describe("step", () => {
    it("logs artifact.created with the blob the old engine's log names", async () => {
      const blobs = new HashingBlobs();
      const { ports, runs } = await kernel(blobs, noteMd);

      await step(ports, "r-acme", answer("call-1", "Paid Acme Paper."));

      const events = await runs.events("r-acme");
      const created = events.find((event) => event.type === "artifact.created");
      // The base fixture's recorded run log (invoice, seq 47) has these values.
      expect(created).toMatchObject({
        type: "artifact.created",
        state: "draft",
        name: "note.md",
        hash: "df8fe32c3f04d5bb78733ea40a0bda3cc1c621a37141aa4c0aad555e475c9ef4",
        mediaType: "text/markdown",
        size: 16,
      });
      expect(created).not.toHaveProperty("text");
      const stored = blobs.blobs.get(created?.type === "artifact.created" ? created.hash : "");
      expect(stored && decodeUtf8(stored)).toBe("Paid Acme Paper.");
      expect(events.map((event) => event.type).slice(-5)).toEqual([
        "context.updated",
        "artifact.created",
        "transition",
        "state.entered",
        "run.completed",
      ]);
    });

    it("appends none of the step's events when the file can't be stored", async () => {
      const blobs = new FullBlobs();
      const { ports, runs } = await kernel(blobs, noteMd);
      const before = await runs.events("r-acme");
      blobs.full = true;

      await expect(step(ports, "r-acme", answer("call-1", "Paid Acme Paper."))).rejects.toThrow(
        "No space left on the disk.",
      );

      expect(await runs.events("r-acme")).toEqual(before);
    });
  });
});
