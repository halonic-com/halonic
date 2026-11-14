import type { RunEvent } from "@halonicjs/events";
import type { RunEventListener } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  endFrame,
  errorBody,
  fakeHost,
  loginResponse,
  runFrame,
  sseResponse,
} from "./fake-host.test-helper.ts";
import { createRemoteExecutor } from "./remote-executor.ts";

const baseUrl = "http://127.0.0.1:4173";

/** Records what a subscription tells its listener, and lets a test wait for the close. */
class Recorder implements RunEventListener {
  readonly seqs: number[] = [];
  closed = false;
  closeError: Error | undefined;
  readonly done: Promise<void>;
  #resolve: () => void = () => {};

  constructor() {
    this.done = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }
  onEvent(event: RunEvent): void {
    this.seqs.push(event.seq);
  }
  onClose(error?: Error): void {
    this.closed = true;
    this.closeError = error;
    this.#resolve();
  }
}

function make(host: ReturnType<typeof fakeHost>, extra: { password?: string } = {}) {
  const reported: unknown[] = [];
  const delays: number[] = [];
  const executor = createRemoteExecutor({
    baseUrl,
    fetch: host.fetch,
    reportError: (error) => reported.push(error),
    wait: async (ms) => {
      delays.push(ms);
    },
    ...extra,
  });
  return { executor, reported, delays };
}

verifies("executor-remote.stream", () => {
  describe("subscribe", () => {
    it("returns before it calls the listener, then delivers every event and a clean close", async () => {
      const host = fakeHost(() => sseResponse([runFrame(1), runFrame(2), runFrame(3), endFrame]));
      const { executor } = make(host);
      const recorder = new Recorder();

      executor.subscribe("run_1", 0, recorder);
      expect(recorder.seqs).toEqual([]);
      await recorder.done;

      expect(recorder.seqs).toEqual([1, 2, 3]);
      expect(recorder.closeError).toBeUndefined();
      expect(host.calls[0]?.path).toBe("/api/runs/run_1/events?after=0");
      expect(host.calls[0]?.headers.get("accept")).toBe("text/event-stream");
    });

    it("starts after the seq the caller names", async () => {
      const host = fakeHost(() => sseResponse([runFrame(3), endFrame]));
      const { executor } = make(host);
      const recorder = new Recorder();

      executor.subscribe("run_1", 2, recorder);
      await recorder.done;

      expect(host.calls[0]?.path).toBe("/api/runs/run_1/events?after=2");
      expect(recorder.seqs).toEqual([3]);
    });

    it("resumes after the last seq when the stream closes without end", async () => {
      const host = fakeHost((_call, number) =>
        number === 1
          ? sseResponse([runFrame(1), runFrame(2)])
          : sseResponse([runFrame(2), runFrame(3), endFrame]),
      );
      const { executor, delays } = make(host);
      const recorder = new Recorder();

      executor.subscribe("run_1", 0, recorder);
      await recorder.done;

      expect(host.calls.map((call) => call.path)).toEqual([
        "/api/runs/run_1/events?after=0",
        "/api/runs/run_1/events?after=2",
      ]);
      // A host that repeats event 2 doesn't make the listener see it twice.
      expect(recorder.seqs).toEqual([1, 2, 3]);
      expect(delays).toEqual([500]);
    });

    it("resumes when the connection drops in the middle of the body", async () => {
      const host = fakeHost((_call, number) =>
        number === 1
          ? sseResponse([runFrame(1), 'event: run\ndata: {"se'], true)
          : sseResponse([runFrame(2), endFrame]),
      );
      const { executor } = make(host);
      const recorder = new Recorder();

      executor.subscribe("run_1", 0, recorder);
      await recorder.done;

      expect(recorder.seqs).toEqual([1, 2]);
      expect(host.calls[1]?.path).toBe("/api/runs/run_1/events?after=1");
    });

    it("retries a host error, waiting longer each time up to the last wait", async () => {
      const host = fakeHost((_call, number) =>
        number <= 3 ? errorBody(503, "internal_error") : sseResponse([endFrame]),
      );
      const reported: unknown[] = [];
      const delays: number[] = [];
      const executor = createRemoteExecutor({
        baseUrl,
        fetch: host.fetch,
        reportError: (error) => reported.push(error),
        wait: async (ms) => {
          delays.push(ms);
        },
        retryDelaysMs: [10, 20],
      });
      const recorder = new Recorder();

      executor.subscribe("run_1", 0, recorder);
      await recorder.done;

      expect(delays).toEqual([10, 20, 20]);
      expect(recorder.closeError).toBeUndefined();
    });

    it("tells the connection it is lost on a break and connected when the stream is back", async () => {
      const states: string[] = [];
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const host = fakeHost((_call, number) =>
        number === 1 ? sseResponse([runFrame(1)]) : sseResponse([runFrame(2), endFrame]),
      );
      const reported: unknown[] = [];
      const executor = createRemoteExecutor({
        baseUrl,
        fetch: host.fetch,
        reportError: (error) => reported.push(error),
        wait: () => gate,
      });
      executor.connection?.onChange((state) => states.push(state));
      const recorder = new Recorder();

      executor.subscribe("run_1", 0, recorder);
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(executor.connection?.state).toBe("lost");
      release();
      await recorder.done;

      expect(states).toEqual(["lost", "connected"]);
      expect(executor.connection?.state).toBe("connected");
    });

    it("keeps a connection listener's failure from breaking the loop", async () => {
      const host = fakeHost((_call, number) =>
        number === 1 ? sseResponse([runFrame(1)]) : sseResponse([runFrame(2), endFrame]),
      );
      const { executor, reported } = make(host);
      executor.connection?.onChange(() => {
        throw new Error("faulty feature");
      });
      const recorder = new Recorder();

      executor.subscribe("run_1", 0, recorder);
      await recorder.done;

      expect(recorder.seqs).toEqual([1, 2]);
      expect(reported.map(String)).toContain("Error: faulty feature");
    });

    it("stops at an unknown run, with the host's error and no retry", async () => {
      const host = fakeHost(() => errorBody(404, "run_not_found"));
      const { executor, delays } = make(host);
      const recorder = new Recorder();

      executor.subscribe("run_9", 0, recorder);
      await recorder.done;

      expect(recorder.closeError).toMatchObject({ status: 404, code: "run_not_found" });
      expect(host.calls).toHaveLength(1);
      expect(delays).toEqual([]);
    });

    it.each([
      ["isn't JSON", "event: run\ndata: nope\n\n"],
      ["has no seq", 'event: run\ndata: {"type":"x"}\n\n'],
    ])("ends with an error for an event that %s, without retrying", async (_name, frame) => {
      const host = fakeHost(() => sseResponse([frame]));
      const { executor } = make(host);
      const recorder = new Recorder();

      executor.subscribe("run_1", 0, recorder);
      await recorder.done;

      expect(recorder.closeError?.name).toBe("RemoteProtocolError");
      expect(host.calls).toHaveLength(1);
    });

    it("ignores a message with another name", async () => {
      const host = fakeHost(() => sseResponse(["event: hello\ndata: {}\n\n", endFrame]));
      const { executor } = make(host);
      const recorder = new Recorder();

      executor.subscribe("run_1", 0, recorder);
      await recorder.done;

      expect(recorder.seqs).toEqual([]);
      expect(recorder.closeError).toBeUndefined();
    });

    it("reports a listener that throws and keeps delivering", async () => {
      const host = fakeHost(() => sseResponse([runFrame(1), runFrame(2), endFrame]));
      const { executor, reported } = make(host);
      const recorder = new Recorder();
      const seen: number[] = [];

      executor.subscribe("run_1", 0, {
        onEvent(event) {
          seen.push(event.seq);
          throw new Error("listener bug");
        },
        onClose: (error) => recorder.onClose(error),
      });
      await recorder.done;

      expect(seen).toEqual([1, 2]);
      expect(reported).toHaveLength(2);
    });

    it("never calls onClose and never asks again once the caller closes it", async () => {
      let finishWait: () => void = () => {};
      const host = fakeHost(() => sseResponse([runFrame(1)]));
      const executor = createRemoteExecutor({
        baseUrl,
        fetch: host.fetch,
        reportError: () => {},
        wait: (_ms, signal) =>
          new Promise<void>((resolve) => {
            finishWait = resolve;
            signal.addEventListener("abort", () => resolve());
          }),
      });
      const recorder = new Recorder();

      const subscription = executor.subscribe("run_1", 0, recorder);
      await new Promise((resolve) => setTimeout(resolve, 0));
      subscription.close();
      subscription.close();
      finishWait();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(host.calls).toHaveLength(1);
      expect(recorder.closed).toBe(false);
      expect(executor.connection?.state).toBe("connected");
    });

    it("signs in again when the session expires in the middle of a run", async () => {
      const host = fakeHost((call, number) => {
        if (call.path === "/api/login") return loginResponse("session-2");
        return number === 1
          ? errorBody(401, "not_signed_in")
          : sseResponse([runFrame(1), endFrame]);
      });
      const { executor } = make(host, { password: "pw" });
      const recorder = new Recorder();

      executor.subscribe("run_1", 0, recorder);
      await recorder.done;

      expect(recorder.seqs).toEqual([1]);
      expect(host.calls[2]?.headers.get("cookie")).toBe("halonic-session=session-2");
    });
  });
});
