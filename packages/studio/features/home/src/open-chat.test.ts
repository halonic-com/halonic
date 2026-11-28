import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { keptOpenChat } from "./open-chat.ts";

const triage = { id: "triage", title: "Triage" };
const digest = { id: "digest", title: "Digest" };

verifies("home.content-pane", () => {
  it("closes an open chat that left the list", () => {
    expect(keptOpenChat("triage", [triage, digest], [digest])).toBeUndefined();
  });

  it("keeps an open chat that is still listed", () => {
    expect(keptOpenChat("triage", [triage], [digest, triage])).toBe("triage");
  });

  it("keeps a new chat open before its first message lists it", () => {
    expect(keptOpenChat("new", [triage], [triage])).toBe("new");
    expect(keptOpenChat("new", undefined, [])).toBe("new");
  });

  it("keeps no chat open when none was", () => {
    expect(keptOpenChat(undefined, [triage], [])).toBeUndefined();
  });
});
