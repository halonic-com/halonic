import { describe, expect, it } from "vitest";
import { toolFoldersInProfile } from "./tool-folders.ts";

const home = "C:\\Users\\Ada"; // leak-guard: allow absolute-path made-up Windows paths for the test
const writable = [`${home}\\work`, `${home}\\tmp\\run`];

function folders(path: string, denied: string[] = []): string[] {
  return toolFoldersInProfile(path, home, denied, writable);
}

describe("toolFoldersInProfile", () => {
  it("keeps folders strictly below the profile", () => {
    expect(folders(`${home}\\.nvm\\v22;${home}\\AppData\\Roaming\\npm`)).toEqual([
      `${home}\\.nvm\\v22`,
      `${home}\\AppData\\Roaming\\npm`,
    ]);
  });

  it("drops folders outside the profile", () => {
    expect(folders("C:\\Windows\\System32;C:\\Users\\Bob\\bin;C:\\Users\\Ada2\\bin")).toEqual([]); // leak-guard: allow absolute-path made-up Windows paths for the test
  });

  it("never takes the profile itself, or a folder above it", () => {
    expect(folders(`${home};${home};C:\\Users;C:\\`)).toEqual([]); // leak-guard: allow absolute-path made-up Windows paths for the test
  });

  it("never takes AppData or its Roaming or Local as a whole", () => {
    expect(
      folders(
        `${home}\\AppData;${home}\\AppData;${home}\\appdata\\roaming;${home}\\AppData\\Local\\`,
      ),
    ).toEqual([]);
  });

  it("drops relative, drive-relative, rooted and UNC entries", () => {
    expect(folders("bin;.\\bin;..\\bin;C:bin;\\Users\\Ada\\bin;\\\\host\\share\\bin")).toEqual([]);
  });

  it("resolves dot segments before it looks", () => {
    expect(folders(`${home}\\tools\\..\\..\\Bob\\bin;${home}\\tools\\..`)).toEqual([]);
    expect(folders(`${home}\\a\\..\\tools`)).toEqual([`${home}\\tools`]);
  });

  it("drops folders on, above and inside a denied path", () => {
    const denied = [`${home}\\.ssh`, `${home}\\AppData\\Roaming\\Halonic`];
    expect(
      folders(
        [
          `${home}\\.ssh`,
          `${home}\\.ssh\\bin`,
          `${home}\\AppData\\Roaming\\Halonic\\bin`,
          `${home}\\AppData\\Roaming`,
          `${home}\\AppData\\Roaming\\npm`,
        ].join(";"),
        denied,
      ),
    ).toEqual([`${home}\\AppData\\Roaming\\npm`]);
  });

  it("drops folders on, above and inside a folder the program writes", () => {
    expect(folders(`${home}\\work;${home}\\work\\bin;${home}\\tmp;${home}\\tmp\\run\\x`)).toEqual(
      [],
    );
  });

  it("does not take a sibling whose name starts like a denied one", () => {
    expect(folders(`${home}\\.ssh-tools`, [`${home}\\.ssh`])).toEqual([`${home}\\.ssh-tools`]);
  });

  it("reads names without regard to case and lists each folder once", () => {
    expect(folders(`${home.toUpperCase()}\\Tools;${home}\\tools;"${home}\\TOOLS"`)).toEqual([
      `${home.toUpperCase()}\\Tools`,
    ]);
  });

  it("returns nothing without a PATH", () => {
    expect(toolFoldersInProfile(undefined, home, [], writable)).toEqual([]);
  });
});
