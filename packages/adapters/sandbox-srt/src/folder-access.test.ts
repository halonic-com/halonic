import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseFolderAccess, whyNotPrivateTo } from "./folder-access.ts";

const sid = "S-1-5-21-1-2-3-1001";

verifies("sandbox-srt.runner-temp-folder", () => {
  it("reads the owner, the inheritance and each entry of an access list", () => {
    const access = parseFolderAccess(
      `owner ${sid}\r\nprotected True\r\nrule ${sid} Allow False FullControl\r\nrule S-1-5-18 Deny True Modify, Synchronize\r\n`,
    );
    expect(access).toEqual({
      owner: sid,
      protectedFromParent: true,
      rules: [
        { sid, allow: true, inherited: false, rights: "FullControl" },
        { sid: "S-1-5-18", allow: false, inherited: true, rights: "Modify, Synchronize" },
      ],
    });
    expect(whyNotPrivateTo(access, sid)).toBe("its access list is not exactly one entry");
  });

  it("is private to a user who owns it, with one full-control entry that is not inherited", () => {
    const access = parseFolderAccess(
      `owner ${sid}\nprotected True\nrule ${sid} Allow False FullControl\n`,
    );
    expect(whyNotPrivateTo(access, sid)).toBeUndefined();
  });

  it("refuses output it does not know, instead of guessing", () => {
    expect(() => parseFolderAccess(`owner ${sid}\nprotected True\nsurprise\n`)).toThrow(
      "unexpected line",
    );
    expect(() => parseFolderAccess(`protected True\n`)).toThrow("no owner");
    expect(() => parseFolderAccess("")).toThrow("no owner");
  });
});
