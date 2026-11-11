import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { tauriChannelIpc, tauriIpc } from "./tauri-ipc.ts";

verifies("services.tauri-ipc", () => {
  describe("tauriIpc", () => {
    it("finds nothing on a page outside the shell", () => {
      expect(tauriIpc({})).toBeUndefined();
    });

    it("finds the shell's invoke and calls through it", async () => {
      const calls: unknown[] = [];
      const page = {
        __TAURI_INTERNALS__: {
          invoke: async (command: string, args?: Record<string, unknown>) => {
            calls.push([command, args]);
            return "answer";
          },
        },
      };

      const ipc = tauriIpc(page);

      expect(await ipc?.invoke("secret_get", { name: "openai" })).toBe("answer");
      expect(calls).toEqual([["secret_get", { name: "openai" }]]);
    });

    it.each([
      ["without invoke", {}],
      ["whose invoke isn't a function", { invoke: "secret_get" }],
      ["that isn't an object", null],
    ])("throws, naming the lookup, for internals %s", (_, internals) => {
      expect(() => tauriIpc({ __TAURI_INTERNALS__: internals })).toThrow(/tauriIpc/);
    });
  });

  describe("tauriChannelIpc", () => {
    const functions = {
      invoke: async () => null,
      transformCallback: () => 7,
      unregisterCallback: () => {},
    };

    it("finds nothing on a page outside the shell", () => {
      expect(tauriChannelIpc({})).toBeUndefined();
    });

    it("finds the shell's invoke with its callback table", () => {
      expect(tauriChannelIpc({ __TAURI_INTERNALS__: functions })?.transformCallback(() => {})).toBe(
        7,
      );
    });

    it("throws, naming the lookup and the function, for internals without unregisterCallback", () => {
      const { unregisterCallback: _, ...internals } = functions;
      expect(() => tauriChannelIpc({ __TAURI_INTERNALS__: internals })).toThrow(
        /no unregisterCallback function.*tauriChannelIpc/,
      );
    });
  });
});
