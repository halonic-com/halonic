import type { Connector } from "@halonicjs/format";
import { describe, expect, it } from "vitest";
import { commandPaths } from "./command-paths.ts";

/** A stdio connector that starts `command`. */
function startsCommand(command: string): Connector {
  return { id: command, transport: { stdio: { command, args: [] } } } as unknown as Connector;
}

describe("commandPaths", () => {
  it("asks the finder once per command and keeps the paths it finds, by the command as written", async () => {
    const asked: string[] = [];
    const paths = await commandPaths(
      [startsCommand("mail"), startsCommand("mail"), startsCommand("absent")],
      async (command) => {
        asked.push(command);
        return command === "mail" ? "/bin/mail" : null;
      },
    );

    expect(paths).toEqual(new Map([["mail", "/bin/mail"]]));
    expect(asked).toEqual(["mail", "absent"]);
  });

  it("asks nothing for an HTTP connector", async () => {
    const http = { id: "web", transport: { http: { url: "https://example.com" } } };

    const paths = await commandPaths([http as unknown as Connector], async () => {
      throw new Error("The finder must not be asked.");
    });

    expect(paths).toEqual(new Map());
  });
});
