import { expect, it } from "vitest";
import type { MakeVcs, VcsHarness } from "./vcs-harness.ts";
import { stagedDiffs, stateOf } from "./vcs-helpers.ts";
import {
  linePatch,
  unsafePatches,
  unsafePathPatches,
  unsupportedPatches,
} from "./vcs-patch-inputs.ts";
import { privateWorkspaceFiles } from "./vcs-version-inputs.ts";

/**
 * The patch part of the {@link Vcs} safety contract for port version 2: a
 * patch is applied whole or not at all, never reaches a path the port
 * refuses, and is only ever plain text edits, adds and deletes.
 */
export function vcsPatchSafetyCases(make: MakeVcs): void {
  it("refuses a patch that doesn't apply cleanly, and changes no file and not the index", async () => {
    const harness = await patchWorkspace(make);
    await harness.files.write("c.yaml", "1\n");
    const before = await stateOf(harness);
    const staged = await stagedDiffs(harness, ["a.yaml", "b.yaml", "c.yaml"]);

    // The first part applies on its own; the second no longer matches `b.yaml`.
    const patch = linePatch("a.yaml", "1", "2") + linePatch("b.yaml", "staged", "x");
    await expectStale(harness.vcs.applyPatch(patch, { reverse: false }));
    // Reversed: the first part undoes `c.yaml`'s "0" to "1"; `a.yaml` was never changed to "2".
    const never = linePatch("c.yaml", "0", "1") + linePatch("a.yaml", "1", "2");
    await expectStale(harness.vcs.applyPatch(never, { reverse: true }));
    // Unreadable, so it would never apply: a caller's mistake, not a stale patch.
    await expect(harness.vcs.applyPatch("not a patch\n", { reverse: false })).rejects.toThrow(
      RangeError,
    );

    expect(await stateOf(harness)).toEqual(before);
    expect(await stagedDiffs(harness, ["a.yaml", "b.yaml", "c.yaml"])).toEqual(staged);
  });

  it.each(unsafePatches)("refuses a patch that %s, and changes nothing", async (_kind, patch) => {
    await expectRefused(await patchWorkspace(make), patch);
  });

  it.each(unsafePathPatches)(
    "refuses a patch that %s, and changes nothing",
    async (_kind, patch) => {
      await expectRefused(await patchWorkspace(make), patch);
    },
  );

  it.each(unsupportedPatches)(
    "refuses a patch that %s, on safe paths too, and changes nothing",
    async (_kind, patch) => {
      await expectRefused(await patchWorkspace(make), patch);
    },
  );
}

/** A workspace with a staged and an unstaged change, and private entries, for the patch cases. */
async function patchWorkspace(make: MakeVcs): Promise<VcsHarness> {
  const harness = await make.repo({ "a.yaml": "1\n", "b.yaml": "1\n", ...privateWorkspaceFiles });
  await harness.files.write("b.yaml", "staged\n");
  await harness.vcs.stage(["b.yaml"]);
  await harness.files.write("b.yaml", "on disk\n");
  return harness;
}

/**
 * Expects the error for a patch that is fine but no longer applies: the
 * Studio offers to refresh it, so it is not the `RangeError` of a patch that
 * would never apply.
 */
async function expectStale(applying: Promise<void>): Promise<void> {
  const error = await applying.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(RangeError);
  expect((error as Error).message).toMatch(/no longer matches/);
}

/** Applies `patch` both ways, expects a `RangeError` each time, and checks nothing changed. */
async function expectRefused(harness: VcsHarness, patch: string): Promise<void> {
  const before = await stateOf(harness);
  const staged = await stagedDiffs(harness, ["a.yaml", "b.yaml"]);
  await expect(harness.vcs.applyPatch(patch, { reverse: false })).rejects.toThrow(RangeError);
  await expect(harness.vcs.applyPatch(patch, { reverse: true })).rejects.toThrow(RangeError);
  expect(await stateOf(harness)).toEqual(before);
  expect(await stagedDiffs(harness, ["a.yaml", "b.yaml"])).toEqual(staged);
  for (const [path, content] of Object.entries(privateWorkspaceFiles)) {
    expect(await harness.readPrivate(path), path).toBe(content);
  }
  expect(await harness.readPrivate(".env.example")).toBeNull();
}
