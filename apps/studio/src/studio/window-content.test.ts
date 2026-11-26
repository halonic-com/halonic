import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  maxWindowContentBytes,
  parseWindowContent,
  readWindowContent,
  WindowContentKeeper,
} from "./window-content.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("studio.window-content", () => {
  describe("parseWindowContent", () => {
    it("reads the workspace, chat and item it keeps", () => {
      const raw = '{"workspace":"/work/acme","chat":"chat-1","item":"run:7"}';

      expect(parseWindowContent(raw)).toEqual({
        workspace: "/work/acme",
        chat: "chat-1",
        item: "run:7",
      });
    });

    it.each([
      ["nothing kept", null],
      ["not a string", { workspace: "/work/acme" }],
      ["not JSON", "workspace=/work/acme"],
      ["an array", '["/work/acme"]'],
      ["a string", '"/work/acme"'],
      ["a field of another type", '{"workspace":7}'],
      ["another field", '{"workspace":"/work/acme","token":"x"}'],
      [
        "over the limit",
        JSON.stringify({ workspace: `/work/${"a".repeat(maxWindowContentBytes)}` }),
      ],
    ])("reads %s as nothing", (_, raw) => {
      expect(parseWindowContent(raw)).toEqual({});
    });

    it("counts the limit in bytes, not characters", () => {
      const raw = JSON.stringify({ workspace: `/work/${"é".repeat(1_100)}` });

      expect(raw.length).toBeLessThan(maxWindowContentBytes);
      expect(parseWindowContent(raw)).toEqual({});
    });
  });

  describe("readWindowContent", () => {
    it("asks the shell for this window's content", async () => {
      const invoke = vi.fn(async () => '{"workspace":"/work/acme"}');

      expect(await readWindowContent({ invoke })).toEqual({ workspace: "/work/acme" });
      expect(invoke.mock.calls).toEqual([["window_content_get"]]);
    });

    it("reads a refusal as nothing and says why in the console", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(
        await readWindowContent({ invoke: async () => Promise.reject("not_an_app_window") }),
      ).toEqual({});
      expect(error).toHaveBeenCalledWith(expect.any(String), "not_an_app_window");
    });
  });

  describe("WindowContentKeeper", () => {
    it("keeps each change one call at a time, the next only after the last answered", async () => {
      const answers: (() => void)[] = [];
      const invoke = vi.fn(
        (_command: string, _args?: Record<string, unknown>) =>
          new Promise<unknown>((resolve) => answers.push(() => resolve(null))),
      );
      const keeper = new WindowContentKeeper({ invoke });

      const first = keeper.keep({ workspace: "/work/acme" });
      const second = keeper.keep({ workspace: "/work/beta" });
      await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
      answers[0]?.();
      await first;
      await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
      answers[1]?.();
      await second;

      expect(invoke.mock.calls).toEqual([
        ["window_content_set", { content: '{"workspace":"/work/acme"}' }],
        ["window_content_set", { content: '{"workspace":"/work/beta"}' }],
      ]);
    });

    it("doesn't send the same content twice, and keeps null for nothing", async () => {
      const invoke = vi.fn(async () => null);
      const keeper = new WindowContentKeeper({ invoke });

      await keeper.keep({ workspace: "/work/acme" });
      await keeper.keep({ workspace: "/work/acme" });
      await keeper.keep({});

      expect(invoke.mock.calls).toEqual([
        ["window_content_set", { content: '{"workspace":"/work/acme"}' }],
        ["window_content_set", { content: null }],
      ]);
    });

    it("keeps null, never cut short, for content over the limit", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const invoke = vi.fn(async () => null);
      const keeper = new WindowContentKeeper({ invoke });

      await keeper.keep({ workspace: `/work/${"a".repeat(maxWindowContentBytes)}` });

      expect(invoke.mock.calls).toEqual([["window_content_set", { content: null }]]);
    });

    it("says a refusal in the console and sends the same content again next time", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const invoke = vi.fn(async () => Promise.reject("too_long"));
      const keeper = new WindowContentKeeper({ invoke });

      await keeper.keep({ workspace: "/work/acme" });
      await keeper.keep({ workspace: "/work/acme" });

      expect(error).toHaveBeenCalledWith(expect.any(String), "too_long");
      expect(invoke).toHaveBeenCalledTimes(2);
    });
  });
});
