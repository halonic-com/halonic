import { describe, expect, it } from "vitest";
import { settleOnClose, settlePendingSaves } from "./pending-saves.ts";

describe("pending saves", () => {
  it("waits for a registered save and returns the save itself", async () => {
    let finished = false;
    const save = settleOnClose(
      new Promise<string>((resolve) =>
        setTimeout(() => {
          finished = true;
          resolve("ok");
        }, 5),
      ),
    );

    await settlePendingSaves();

    expect(finished).toBe(true);
    expect(await save).toBe("ok");
  });

  it("waits for a save registered while it waits, and not for a failing one's error", async () => {
    let late = false;
    const first = settleOnClose(Promise.reject(new Error("no")));
    first.catch(() => undefined);
    void settleOnClose(
      Promise.resolve().then(() => {
        void settleOnClose(
          new Promise<void>((resolve) => setTimeout(resolve, 5)).then(() => {
            late = true;
          }),
        );
      }),
    );

    await expect(settlePendingSaves()).resolves.toBeUndefined();

    expect(late).toBe(true);
  });

  it("returns at once when nothing is saving", async () => {
    await expect(settlePendingSaves()).resolves.toBeUndefined();
  });
});
