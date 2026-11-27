import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { restoreWhenMayStart } from "./paperclip-restore.ts";

// Which keys go back, and to which workspace, is the shell's to decide; its
// tests are in Rust (`studio.src-tauri.paperclip-key-keep`, HAL-20278).
verifies("services.paperclip-restore", () => {
  describe("restoreWhenMayStart", () => {
    /**
     * A trust that a test sets, telling its listeners as a finished check does.
     * `mayStart` is the page's `mayStartNow`: trusted, or reaching only the test model.
     */
    function trustOf(mayStart: boolean) {
      const listeners = new Set<() => void>();
      return {
        mayStart,
        mayStartNow() {
          return this.mayStart;
        },
        subscribe(listener: () => void) {
          listeners.add(listener);
          return () => void listeners.delete(listener);
        },
        set(value: boolean) {
          this.mayStart = value;
          for (const listener of [...listeners]) listener();
        },
        listening: () => listeners.size,
      };
    }

    it("restores at once in a workspace that may start: trusted, or reaching only the test model", () => {
      const trust = trustOf(true);
      const restore = vi.fn(async () => {});
      restoreWhenMayStart(trust, restore);
      expect(restore).toHaveBeenCalledTimes(1);
      expect(trust.listening()).toBe(0);
    });

    it("restores only once, even when a later check says no and then yes again", () => {
      const trust = trustOf(true);
      const restore = vi.fn(async () => {});
      restoreWhenMayStart(trust, restore);
      trust.set(false);
      trust.set(true);
      expect(restore).toHaveBeenCalledTimes(1);
    });

    it("asks nothing while the workspace may not start, and restores once when it may", () => {
      const trust = trustOf(false);
      const restore = vi.fn(async () => {});
      restoreWhenMayStart(trust, restore);
      trust.set(false);
      expect(restore).not.toHaveBeenCalled();
      trust.set(true);
      trust.set(true);
      expect(restore).toHaveBeenCalledTimes(1);
      expect(trust.listening()).toBe(0);
    });

    it("stops waiting when told to", () => {
      const trust = trustOf(false);
      const restore = vi.fn(async () => {});
      restoreWhenMayStart(trust, restore)();
      trust.set(true);
      expect(restore).not.toHaveBeenCalled();
    });
  });
});
