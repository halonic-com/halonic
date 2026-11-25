// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filesFeature } from "../feature.ts";
import { fileItem } from "../file-item.ts";
import type { FileReview, FileReviewDecision, FileReviewHost } from "../file-review.ts";
import { type FilesHost, FilesHostService } from "../files-host.ts";
import { forgetOpenedEditors, openedEditors as opened } from "../test-support/code-editor.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { FileView } from "./file-view.tsx";

// The real editor is tested in its own package; here a stand-in records how it was opened.
vi.mock("@halonicjs/studio-code-editor", () => import("../test-support/code-editor.ts"));

afterEach(() => {
  unmountAll();
  forgetOpenedEditors();
});

const path = "models.yaml";

const files = {
  list: async () => ({ paths: [], marks: new Map() }),
  subscribe: () => () => undefined,
  read: async () => "aliases:\n  fast: small\n",
  edit: () => {},
  problems: async () => [],
  yamlSyntaxLine: async () => null,
  outside: () => new Map(),
} as unknown as FilesHost;

const twoParts: FileReview = {
  path,
  created: false,
  seen: "seen-1",
  parts: [
    { line: 2, added: 1, removed: ["  fast: tiny"] },
    { line: 5, added: 2, removed: [] },
  ],
};

/** The same file read again after its first part was decided. */
const onePart: FileReview = {
  ...twoParts,
  seen: "seen-2",
  parts: [twoParts.parts[1] ?? { line: 5, added: 2, removed: [] }],
};

/** A review host with `review`, whose decisions answer `decision`. */
function reviewHostOf(review: FileReview | null, decision: FileReviewDecision) {
  return {
    changesIn: vi.fn(async () => review),
    accept: vi.fn(async () => decision),
    reject: vi.fn(async () => decision),
    subscribe: () => () => undefined,
  } satisfies FileReviewHost;
}

function show(review: FileReviewHost | undefined) {
  const toasts = createToastStore();
  const context = {
    services: limitedLookup(filesFeature, {
      get: (key) => (key === FilesHostService ? files : review),
      find: (key) => (key === FilesHostService ? files : review),
    }),
    announcer: { announce: () => {} },
  } as unknown as WorkspaceContext;
  const page = render(
    <ToastStoreProvider store={toasts}>
      <FileView item={fileItem(path)} context={context} Sections={() => null} />
    </ToastStoreProvider>,
  );
  return { page, toasts };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function buttonNamed(page: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find((button) => button.textContent === name);
}

describe("the assistant's changes to review in a file's tab", () => {
  verifies("files.ui.file-review", () => {
    it("marks the parts in the editor and shows the bar with Accept file and Reject file", async () => {
      const { page } = show(reviewHostOf(twoParts, { status: "stale" }));
      await settle();

      expect(opened.at(-1)?.reviewParts).toEqual(
        twoParts.parts.map((part) => ({ ...part, deletesFile: false })),
      );
      expect(page.textContent).toContain("The assistant changed 2 things here");
      expect(buttonNamed(page, "Accept file")).toBeDefined();
      expect(buttonNamed(page, "Reject file")).toBeDefined();

      await act(async () => buttonNamed(page, "Next")?.click());
      expect(opened.at(-1)?.goneToParts).toEqual([1]);
    });

    it("rejects one part with a toast whose Undo puts it back", async () => {
      const undo = vi.fn(async () => "done" as const);
      const host = reviewHostOf(twoParts, { status: "done", undo });
      const { toasts } = show(host);
      await settle();

      await act(async () => opened.at(-1)?.options.review?.onDecide(0, "reject"));
      expect(host.reject).toHaveBeenCalledWith({ kind: "part", review: twoParts, part: 0 });
      const [toast] = toasts.list();
      expect(toast?.title).toBe("Rejected 1 change in models.yaml");
      await act(async () => toast?.action?.onClick());
      expect(undo).toHaveBeenCalledOnce();
    });

    it("accepts the whole file from the bar", async () => {
      const host = reviewHostOf(twoParts, { status: "done", undo: async () => "done" });
      const { page, toasts } = show(host);
      await settle();

      await act(async () => buttonNamed(page, "Accept file")?.click());
      expect(host.accept).toHaveBeenCalledWith({ kind: "file", path });
      expect(toasts.list()[0]?.title).toBe("Accepted 2 changes in models.yaml");
    });

    it("offers Compare in place of the decisions when the file changed outside Halonic", async () => {
      const { page, toasts } = show(reviewHostOf(twoParts, { status: "held" }));
      await settle();

      await act(async () => buttonNamed(page, "Accept file")?.click());
      expect(page.textContent).toContain("Changed outside Halonic");
      expect(buttonNamed(page, "Compare")).toBeDefined();
      expect(buttonNamed(page, "Accept file")).toBeUndefined();
      expect(toasts.list()).toEqual([]);
    });

    it("reads the parts again quietly when they were out of date", async () => {
      const host = reviewHostOf(twoParts, { status: "stale" });
      const { toasts } = show(host);
      await settle();

      await act(async () => opened.at(-1)?.options.review?.onDecide(1, "accept"));
      await settle();
      expect(host.changesIn).toHaveBeenCalledTimes(2);
      expect(toasts.list()).toEqual([]);
    });

    it("keeps the newest parts when an older read answers after a newer one", async () => {
      const slow = Promise.withResolvers<FileReview | null>();
      const answers = [Promise.resolve(twoParts), slow.promise, Promise.resolve(onePart)];
      const wakes: (() => void)[] = [];
      const host = {
        ...reviewHostOf(twoParts, { status: "stale" }),
        changesIn: vi.fn(() => answers.shift() ?? Promise.resolve(onePart)),
        subscribe: (_path: string, wake: () => void) => {
          wakes.push(wake);
          return () => undefined;
        },
      } satisfies FileReviewHost;
      show(host);
      await settle();

      // A wake starts a slow read, then a stale decision reads again and answers first.
      act(() => wakes.at(-1)?.());
      await act(async () => opened.at(-1)?.options.review?.onDecide(1, "accept"));
      await settle();
      expect(opened.at(-1)?.reviewParts).toHaveLength(1);

      await act(async () => slow.resolve(twoParts));
      await settle();
      expect(opened.at(-1)?.reviewParts).toHaveLength(1);
    });

    it("keeps the newest parts when two wakes answer out of order", async () => {
      const slow = Promise.withResolvers<FileReview | null>();
      const answers = [Promise.resolve(twoParts), slow.promise, Promise.resolve(onePart)];
      let wake = () => {};
      const host = {
        ...reviewHostOf(twoParts, { status: "stale" }),
        changesIn: vi.fn(() => answers.shift() ?? Promise.resolve(onePart)),
        subscribe: (_path: string, listener: () => void) => {
          wake = listener;
          return () => undefined;
        },
      } satisfies FileReviewHost;
      show(host);
      await settle();

      act(() => wake());
      act(() => wake());
      await settle();
      await act(async () => slow.resolve(twoParts));
      await settle();
      expect(opened.at(-1)?.reviewParts).toHaveLength(1);
    });

    it("says Reject and delete file for a file the assistant created", async () => {
      const created: FileReview = {
        ...twoParts,
        created: true,
        parts: [{ line: 1, added: 3, removed: [] }],
      };
      const { page } = show(reviewHostOf(created, { status: "stale" }));
      await settle();

      expect(buttonNamed(page, "Reject and delete file")).toBeDefined();
      expect(opened.at(-1)?.reviewParts[0]?.deletesFile).toBe(true);
    });

    it("shows neither marks nor bar without the review service", async () => {
      const { page } = show(undefined);
      await settle();

      expect(opened.at(-1)?.options.review).toBeUndefined();
      expect(page.textContent).not.toContain("The assistant changed");
    });
  });
});

describe("the focus after a decision in a file's tab", () => {
  verifies("files.ui.file-review-focus", () => {
    it("goes to the part now in the decided one's place, then to the h1", async () => {
      const answers: (FileReview | null)[] = [twoParts, onePart, null];
      const host = {
        ...reviewHostOf(twoParts, { status: "done", undo: async () => "done" }),
        changesIn: vi.fn(async () => (answers.length > 1 ? answers.shift() : answers[0]) ?? null),
      } satisfies FileReviewHost;
      const { page } = show(host);
      await settle();

      await act(async () => opened.at(-1)?.options.review?.onDecide(0, "accept"));
      await settle();
      expect(opened.at(-1)?.goneToParts).toEqual([0]);

      await act(async () => buttonNamed(page, "Accept file")?.click());
      await settle();
      expect(document.activeElement?.tagName).toBe("H1");
      expect(document.activeElement?.textContent).toBe(path);
    });
  });
});
