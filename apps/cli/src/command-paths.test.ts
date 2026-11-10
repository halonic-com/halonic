import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { Connector } from "@halonicjs/format";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commandPaths } from "./command-paths.ts";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-command-paths-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** A program file named `name` in the folder `bin` under the test's folder. */
function program(bin: string, name: string): string {
  const dir = join(folder, bin);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, "");
  chmodSync(path, 0o755);
  return path;
}

/** A stdio connector that starts `command`. */
function startsCommand(command: string): Connector {
  return { id: command, transport: { stdio: { command, args: [] } } } as unknown as Connector;
}

describe("commandPaths", () => {
  it("finds each command in the first folder of PATH that has it", async () => {
    program("first", "mail");
    const later = program("second", "mail");
    const files = program("second", "files");
    const path = [join(folder, "missing"), join(folder, "second"), join(folder, "first")].join(
      delimiter,
    );

    const paths = await commandPaths([startsCommand("mail"), startsCommand("files")], {
      path,
      endings: [],
    });

    expect(paths).toEqual(
      new Map([
        ["mail", later],
        ["files", files],
      ]),
    );
  });

  it("keeps a command with a folder in it, or one it can't find, as written only", async () => {
    program("bin", "mail");

    const paths = await commandPaths([startsCommand("./bin/mail"), startsCommand("absent")], {
      path: join(folder, "bin"),
      endings: [],
    });

    expect(paths).toEqual(new Map());
  });

  it("skips a relative folder in PATH, which would mean the current folder", async () => {
    program("bin", "mail");

    const paths = await commandPaths([startsCommand("mail")], { path: "bin", endings: [] });

    expect(paths).toEqual(new Map());
  });

  it("tries Windows' endings, and never the bare name, when there are endings", async () => {
    program("bin", "npx");
    const cmd = program("bin", "npx.cmd");

    const paths = await commandPaths([startsCommand("npx"), startsCommand("npx.cmd")], {
      path: join(folder, "bin"),
      endings: [".EXE", ".CMD"],
    });

    expect(paths).toEqual(
      new Map([
        ["npx", cmd],
        ["npx.cmd", cmd],
      ]),
    );
  });

  it("finds nothing for an HTTP connector", async () => {
    const http = { id: "web", transport: { http: { url: "https://example.com" } } };

    expect(
      await commandPaths([http as unknown as Connector], { path: folder, endings: [] }),
    ).toEqual(new Map());
  });
});
