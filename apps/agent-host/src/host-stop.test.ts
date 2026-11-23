import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type HostParts, stopHost } from "./host-stop.ts";

/** Every part of a host, each saying when it stopped. */
function recordingParts(stopped: string[]): HostParts {
  const step = (name: string) => async () => {
    stopped.push(name);
  };
  return {
    remote: { close: step("remote") },
    runs: { cancelAll: step("runs") },
    connectors: { closeAll: step("connectors") },
    plugins: { stop: step("plugins") },
    sessions: { closeAll: step("sessions") },
    programCopies: { close: step("program copies and their git") },
    bridges: { closeAll: step("bridges") },
    folders: { stop: step("harness folders and the proposals' git") },
  };
}

verifies("agent-host.program-copy-routes", () => {
  it("closes the connectors and sessions before it removes the program copies, and stops git after them", async () => {
    const stopped: string[] = [];
    await stopHost(recordingParts(stopped));
    expect(stopped).toEqual([
      "remote",
      "runs",
      "connectors",
      "plugins",
      "sessions",
      "program copies and their git",
      "bridges",
      "harness folders and the proposals' git",
    ]);
  });

  it("stops a host without a profile folder, which has no program copies or plugins", async () => {
    const stopped: string[] = [];
    await stopHost({ ...recordingParts(stopped), programCopies: undefined, plugins: undefined });
    expect(stopped).toEqual([
      "remote",
      "runs",
      "connectors",
      "sessions",
      "bridges",
      "harness folders and the proposals' git",
    ]);
  });
});
