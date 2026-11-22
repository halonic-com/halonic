import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { connectorProgramCommand } from "./connector-program-command.ts";

/** A Windows drive, apart from the path, so no line reads as a path on one machine. */
const drive = "D:";

verifies("studio.workspace-listed-tools", () => {
  describe("connectorProgramCommand", () => {
    it("starts in the workspace folder, with each word quoted when it needs it", () => {
      expect(
        connectorProgramCommand("/acme/Acme sample", {
          command: "node",
          args: ["server.js", "--name", "My notes"],
        }),
      ).toBe('cd "/acme/Acme sample" && node server.js --name "My notes"');
    });

    it("starts in the connector's cwd, read from the workspace folder", () => {
      expect(
        connectorProgramCommand("/acme/", { command: "./run.sh", args: [], cwd: "./tools/notes/" }),
      ).toBe("cd /acme/tools/notes && ./run.sh");
    });

    it("keeps an absolute cwd as it is", () => {
      expect(connectorProgramCommand("/acme", { command: "sh", args: [], cwd: "/opt/notes" })).toBe(
        "cd /opt/notes && sh",
      );
    });

    it("gives no line for a Windows folder", () => {
      expect(
        connectorProgramCommand(`${drive}\\Acme`, { command: "npx", args: [] }),
      ).toBeUndefined();
    });
  });
});
