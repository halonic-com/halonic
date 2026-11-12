import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { closeAfterStop } from "./close-after-stop.ts";

/** An engine whose close ends after `closeMs`, or never with `"never"`, and what happened to it. */
function engineClosingIn(closeMs: number | "never", closeError?: Error) {
  const seen = { closed: false, abandoned: false };
  return {
    seen,
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (closeMs === "never") return;
        setTimeout(() => {
          seen.closed = true;
          if (closeError === undefined) resolve();
          else reject(closeError);
        }, closeMs);
      }),
    abandon: async () => {
      seen.abandoned = true;
    },
  };
}

function stopped(): AbortSignal {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
}

verifies("cli.local-engine-lock", () => {
  it("waits for the close as long as it takes while nothing stopped the command", async () => {
    const engine = engineClosingIn(50);
    let heard = false;

    await closeAfterStop(engine, new AbortController().signal, 1, () => {
      heard = true;
    });

    expect([engine.seen.closed, engine.seen.abandoned, heard]).toEqual([true, false, false]);
  });

  it("gives up on a close that hangs once the command was stopped, and frees the lock", async () => {
    const engine = engineClosingIn("never");
    let heard = false;

    await closeAfterStop(engine, stopped(), 20, () => {
      heard = true;
    });

    expect([engine.seen.abandoned, heard]).toEqual([true, true]);
  });

  it("starts the limit when the stop comes during the close", async () => {
    const engine = engineClosingIn("never");
    const stop = new AbortController();

    const closing = closeAfterStop(engine, stop.signal, 20, () => {});
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(engine.seen.abandoned).toBe(false);
    stop.abort();
    await closing;

    expect(engine.seen.abandoned).toBe(true);
  });

  it("keeps a close that ends within the limit, and its error", async () => {
    const quick = engineClosingIn(5);
    await closeAfterStop(quick, stopped(), 1_000, () => {});
    expect([quick.seen.closed, quick.seen.abandoned]).toEqual([true, false]);

    const failing = engineClosingIn(5, new Error("The scheduler couldn't close."));
    await expect(closeAfterStop(failing, stopped(), 1_000, () => {})).rejects.toThrow(
      "The scheduler couldn't close.",
    );
    expect(failing.seen.abandoned).toBe(false);
  });
});
