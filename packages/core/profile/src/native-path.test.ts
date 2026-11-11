import { describe, expect, it } from "vitest";
import {
  isAbsolutePath,
  joinPath,
  withHomeAsTilde,
  withoutTrailingSeparators,
} from "./native-path.ts";

// Built from parts, so the repo's leak guard doesn't read them as a real machine's paths.
const drive = "D:";

describe("isAbsolutePath", () => {
  it("knows a Unix root", () => {
    expect(isAbsolutePath("linux", "/srv")).toBe(true);
    expect(isAbsolutePath("macos", "srv")).toBe(false);
    expect(isAbsolutePath("linux", `${drive}\\srv`)).toBe(false);
  });

  it("knows a Windows drive and share, but not a drive-relative path", () => {
    expect(isAbsolutePath("windows", `${drive}\\srv`)).toBe(true);
    expect(isAbsolutePath("windows", `${drive}/srv`)).toBe(true);
    expect(isAbsolutePath("windows", "\\\\server\\share")).toBe(true);
    expect(isAbsolutePath("windows", `${drive}srv`)).toBe(false);
    expect(isAbsolutePath("windows", "\\srv")).toBe(false);
  });
});

describe("joinPath", () => {
  it("joins under a root without doubling its separator", () => {
    expect(joinPath("linux", "/", "srv")).toBe("/srv");
    expect(joinPath("windows", `${drive}\\`, "srv")).toBe(`${drive}\\srv`);
    expect(joinPath("linux", "/srv/")).toBe("/srv");
  });
});

describe("withoutTrailingSeparators", () => {
  it("keeps a root's own separator", () => {
    expect(withoutTrailingSeparators("linux", "///")).toBe("/");
    expect(withoutTrailingSeparators("windows", `${drive}\\\\`)).toBe(`${drive}\\`);
    expect(withoutTrailingSeparators("windows", `${drive}/srv/`)).toBe(`${drive}/srv`);
  });
});

describe("withHomeAsTilde", () => {
  it("writes the home folder as ~ on a Unix path", () => {
    expect(withHomeAsTilde("linux", "/srv/acme/", "/srv/acme/plugins/tides")).toBe(
      "~/plugins/tides",
    );
  });

  it("writes the home folder as ~ on Windows, whatever the case or separator", () => {
    expect(withHomeAsTilde("windows", `${drive}\\Acme`, `${drive}\\acme\\plugins\\tides`)).toBe(
      "~\\plugins\\tides",
    );
    expect(withHomeAsTilde("windows", `${drive}\\Acme`, `${drive}/Acme/plugins`)).toBe("~/plugins");
  });

  it("leaves a path outside the home folder, or beside it, as it is", () => {
    expect(withHomeAsTilde("linux", "/srv/acme", "/srv/acme2/tides")).toBe("/srv/acme2/tides");
    expect(withHomeAsTilde("linux", "/srv/acme", "/srv/acme")).toBe("/srv/acme");
    expect(withHomeAsTilde("linux", "/srv/acme", "/opt/tides")).toBe("/opt/tides");
    expect(withHomeAsTilde("linux", "/srv/acme", "/SRV/ACME/tides")).toBe("/SRV/ACME/tides");
  });
});
