// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChangesSource, Version } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const versions: Version[] = [3, 2, 1].map((n) => ({
  id: `v${n}`,
  name: `Version ${n}`,
  notes: "",
  author: "Sam Lee",
  at: Date.now() - 60_000 - (3 - n) * 1000,
  files: [],
}));

/** A folder with three versions, the newest of which the shared copy lacks when there is one. */
function threeVersions({ remote }: { readonly remote: boolean }) {
  const fake = fakeSource({ kind: "ready", changes: [] });
  fake.setHistory(versions);
  fake.setRemote(remote);
  if (remote) fake.setUnshared(1, ["v3"]);
  return fake;
}

async function openPage(
  fake: ReturnType<typeof fakeSource>,
  presentation: "phone" | "desktop",
  source: ChangesSource = fake.source,
) {
  const root = render(
    <PresentationProvider presentation={presentation}>
      <ChangesView list={new ChangesList(source)} />
    </PresentationProvider>,
  );
  await act(settle);
  return root;
}

function historyRow(root: HTMLElement, name: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((row) =>
    row.textContent?.includes(name),
  );
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
}

verifies("source-control.history-not-shared", () => {
  describe("History's shared marks", () => {
    it("on a phone marks a version the shared copy lacks and ends every row in a chevron", async () => {
      const root = await openPage(threeVersions({ remote: true }), "phone");
      expect(historyRow(root, "Version 3").textContent).toContain("Not shared yet");
      expect(historyRow(root, "Version 2").textContent).not.toContain("Not shared yet");
      expect(historyRow(root, "Version 1").textContent).not.toContain("Not shared yet");
      for (const name of ["Version 3", "Version 2", "Version 1"]) {
        expect(historyRow(root, name).querySelector('[data-part="row-chevron"]')).not.toBeNull();
      }
    });

    it("marks no version without a place to share to", async () => {
      const root = await openPage(threeVersions({ remote: false }), "phone");
      expect(root.textContent).not.toContain("Not shared yet");
    });

    it("marks no version when git can't say which the shared copy lacks", async () => {
      const fake = threeVersions({ remote: true });
      const failing: ChangesSource = {
        ...fake.source,
        listUnshared: async () => {
          throw new Error("git log failed");
        },
      };
      const root = await openPage(fake, "phone", failing);
      expect(root.textContent).not.toContain("Not shared yet");
    });

    it("leaves desktop rows as they were", async () => {
      const root = await openPage(threeVersions({ remote: true }), "desktop");
      expect(historyRow(root, "Version 3").textContent).not.toContain("Not shared yet");
      expect(root.querySelector('[data-part="row-chevron"]')).toBeNull();
    });
  });
});
