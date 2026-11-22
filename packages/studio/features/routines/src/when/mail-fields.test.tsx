// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type {
  RoutineChanges,
  RoutineMailbox,
  RoutinesHost,
  RoutineTrigger,
  RoutineView,
} from "../api.ts";
import { show, typeInto, unmount } from "../test-support.tsx";
import { WhenCard } from "./when-card.tsx";

afterEach(unmount);

const acme: RoutineMailbox = {
  connector: "acme-gmail",
  name: "Acme Gmail",
  account: "me@example.com",
};

function routineWith(trigger: RoutineTrigger): RoutineView {
  return {
    hubId: "acme",
    id: "daily",
    name: "Daily",
    enabled: true,
    trigger,
    triggerSentence: "Weekdays at 07:30",
    summary: "Weekdays at 07:30 → Briefing",
    targetName: "Briefing",
    target: { kind: "workflow", hubId: "acme", id: "briefing", input: "{}" },
    targetState: "ready",
    overlap: "skip",
    catchUp: "last",
    file: "hubs/acme/workflows/routines/daily.routine.yaml",
    everLive: true,
    changesNotLive: false,
    problems: [],
  };
}

async function card(trigger: RoutineTrigger, mailboxes: readonly RoutineMailbox[] = [acme]) {
  const saved: RoutineChanges[] = [];
  const host = {
    mailboxes: async () => mailboxes,
    nextTimes: async () => ({ times: [], atNextCheck: false }),
    save: async (_ref: unknown, changes: RoutineChanges) => {
      saved.push(changes);
    },
  } as unknown as RoutinesHost;
  const page = await show(
    <WhenCard host={host} routine={routineWith(trigger)} announce={() => {}} />,
  );
  return { page, saved };
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const mail: RoutineTrigger = {
  kind: "mail",
  connector: "acme-gmail",
  query: "in:inbox",
  every: "2m",
};

verifies("routines.when.mail-fields", () => {
  it("doesn't offer New mail to a routine that isn't on it", async () => {
    const { page } = await card({ kind: "manual" });
    const select = page.querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual([
      "manual",
      "schedule",
      "every",
      "signal",
    ]);
    expect(page.textContent).not.toContain("New mail");
  });

  it("shows New mail, its fields and the not-checked line on a routine already on it", async () => {
    const { page } = await card(mail);
    const [picker, mailbox] = [...page.querySelectorAll("select")] as HTMLSelectElement[];
    expect(picker?.value).toBe("mail");
    expect(picker?.selectedOptions[0]?.text).toBe("New mail");
    expect(mailbox?.value).toBe("acme-gmail");
    expect(page.textContent).toContain(
      "Halonic doesn't check mail yet, so this routine starts only with Run now.",
    );
  });

  it("writes another kind's default when one is picked on a mail routine", async () => {
    const { page, saved } = await card(mail);
    const picker = page.querySelector("select") as HTMLSelectElement;
    await choose(picker, "mail");
    expect(saved).toEqual([]);
    await choose(picker, "every");
    expect(saved[0]?.trigger).toEqual({ kind: "every", interval: "1h" });
  });

  it("has no Add a Google connector, even with no Google connector to watch", async () => {
    const { page } = await card({ ...mail, connector: "gone" }, []);
    const mailbox = page.querySelectorAll("select")[1] as HTMLSelectElement;
    expect(mailbox.value).toBe("gone");
    expect(page.textContent).not.toContain("Add a Google connector");
    expect(page.querySelectorAll("button")).toHaveLength(0);
  });

  it("lists the mailboxes with their accounts, and keeps a connector the workspace doesn't offer", async () => {
    const { page } = await card(mail);
    const mailbox = page.querySelectorAll("select")[1] as HTMLSelectElement;
    expect([...mailbox.options].map((option) => option.text)).toEqual([
      "Acme Gmail (me@example.com)",
    ]);
    const other = await card({ ...mail, connector: "gone" }, []);
    const orphan = other.page.querySelectorAll("select")[1] as HTMLSelectElement;
    expect(orphan.value).toBe("gone");
  });

  it("writes the search and the interval, and keeps the rest", async () => {
    const { page, saved } = await card(mail);
    expect(page.textContent).toContain("Gmail search, for example in:inbox -from:me");
    await typeInto(
      page.querySelector("input[type=text], input:not([type])") as HTMLInputElement,
      "in:inbox -from:me",
    );
    expect(saved[0]?.trigger).toEqual({ ...mail, query: "in:inbox -from:me" });
    await typeInto(page.querySelector("input[type=number]") as HTMLInputElement, "15");
    expect(saved[1]?.trigger).toEqual({ ...mail, every: "15m" });
  });

  it("writes nothing for an empty search and says why", async () => {
    const { page, saved } = await card(mail);
    await typeInto(
      page.querySelector("input[type=text], input:not([type])") as HTMLInputElement,
      "",
    );
    expect(saved).toEqual([]);
    expect(page.textContent).toContain("Give the search something to look for.");
  });
});
