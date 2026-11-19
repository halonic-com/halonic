import { describe, expect, it } from "vitest";
import { suggestedCommand } from "./suggested-command.ts";

describe("suggestedCommand", () => {
  it("writes the user's --dir as it is when it needs no quotes", () => {
    expect(suggestedCommand("validate", "./acme", "--all")).toBe(
      "halonic validate --dir ./acme --all",
    );
  });

  it("leaves --dir out when the user gave none", () => {
    expect(suggestedCommand("test", undefined, "--list")).toBe("halonic test --list");
  });

  it("quotes a --dir with a space, so the command can be pasted back", () => {
    expect(suggestedCommand("runs show", "../Documents/Acme sample", "1ac531")).toBe(
      'halonic runs show --dir "../Documents/Acme sample" 1ac531',
    );
  });
});
