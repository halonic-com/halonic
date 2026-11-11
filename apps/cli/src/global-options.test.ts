import { describe, expect, it } from "vitest";
import {
  type GlobalOptions,
  globalOptionFlags,
  helpFlags,
  readGlobalOptions,
} from "./global-options.ts";

/** No global option given. */
const none: GlobalOptions = {
  json: false,
  noColor: false,
  verbose: false,
  debug: false,
  help: false,
  version: false,
};

describe("globalOptionFlags", () => {
  it("lists only options the CLI reads, so the help never names one that does nothing", () => {
    for (const flag of globalOptionFlags) {
      const takenOut = readGlobalOptions([flag]).args.length === 0;
      expect(takenOut || helpFlags.has(flag), flag).toBe(true);
    }
  });
});

describe("readGlobalOptions", () => {
  it("takes --debug out wherever it stands", () => {
    expect(readGlobalOptions(["--debug", "run", "x"])).toEqual({
      options: { ...none, debug: true },
      args: ["run", "x"],
    });
    expect(readGlobalOptions(["run", "x", "--debug"])).toEqual({
      options: { ...none, debug: true },
      args: ["run", "x"],
    });
  });

  it("reads --json, --no-color, --verbose and both spellings of --help the same way", () => {
    expect(readGlobalOptions(["--json", "test", "--no-color", "x", "--verbose"])).toEqual({
      options: { ...none, json: true, noColor: true, verbose: true },
      args: ["test", "x"],
    });
    expect(readGlobalOptions(["test", "-h"]).options.help).toBe(true);
    expect(readGlobalOptions(["--help"]).options.help).toBe(true);
  });

  it("takes --version out wherever it stands", () => {
    expect(readGlobalOptions(["test", "--version"])).toEqual({
      options: { ...none, version: true },
      args: ["test"],
    });
  });

  it("leaves the command line as it is without a global option", () => {
    expect(readGlobalOptions(["run", "x", "--loud"])).toEqual({
      options: none,
      args: ["run", "x", "--loud"],
    });
  });

  it("keeps every global option after -- as an argument", () => {
    expect(readGlobalOptions(["run", "--json", "--", "--debug", "-h"])).toEqual({
      options: { ...none, json: true },
      args: ["run", "--", "--debug", "-h"],
    });
  });
});
