import { describe, expect, it } from "vitest";
import { globalOptionFlags, helpFlags, readGlobalOptions } from "./global-options.ts";

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
      options: { debug: true },
      args: ["run", "x"],
    });
    expect(readGlobalOptions(["run", "x", "--debug"])).toEqual({
      options: { debug: true },
      args: ["run", "x"],
    });
  });

  it("leaves the command line as it is without --debug", () => {
    expect(readGlobalOptions(["run", "x", "--loud"])).toEqual({
      options: { debug: false },
      args: ["run", "x", "--loud"],
    });
  });

  it("keeps --debug after -- as an argument", () => {
    expect(readGlobalOptions(["run", "--", "--debug"])).toEqual({
      options: { debug: false },
      args: ["run", "--", "--debug"],
    });
  });
});
