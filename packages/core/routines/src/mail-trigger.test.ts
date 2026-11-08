import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MAIL_OVERLAP_MS, mailCheckDue, mailQuery } from "./mail-trigger.ts";

const at = (iso: string) => new Date(iso);
const mail = { mail: { connector: "gmail", query: "from:boss", every: "15m" } };

verifies("routines.mail-check", () => {
  // New: the old tests never covered the mail helpers.
  it("is due when the mailbox was never checked", () => {
    expect(mailCheckDue(mail, null, at("2026-11-03T10:00:00Z"))).toBe(true);
  });

  it("is due once a full interval has passed, not before", () => {
    const last = at("2026-11-03T10:00:00Z");
    expect(mailCheckDue(mail, last, at("2026-11-03T10:14:59Z"))).toBe(false);
    expect(mailCheckDue(mail, last, at("2026-11-03T10:15:00Z"))).toBe(true);
  });

  it("is never due for a trigger that isn't mail", () => {
    expect(mailCheckDue({ every: "1m" }, null, at("2026-11-03T10:00:00Z"))).toBe(false);
  });

  it("asks for mail after the last check, less the overlap, in whole seconds", () => {
    const since = at("2026-11-03T10:00:00.900Z");
    const seconds = Math.floor((since.getTime() - MAIL_OVERLAP_MS) / 1000);
    expect(mailQuery(mail, since)).toBe(`from:boss after:${seconds}`);
    expect(seconds).toBe(Date.UTC(2026, 10, 3, 9, 50, 0) / 1000);
  });

  it("refuses to make a query for a trigger that isn't mail", () => {
    expect(() => mailQuery({ manual: true }, at("2026-11-03T10:00:00Z"))).toThrow(
      "not a mail trigger",
    );
  });
});
