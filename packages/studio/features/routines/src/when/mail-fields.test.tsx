// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
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
  it("writes the first Google connector with the default search and interval when New mail is picked", async () => {
    const { page, saved } = await card({ kind: "manual" });
    await choose(page.querySelector("select") as HTMLSelectElement, "mail");
    expect(saved[0]?.trigger).toEqual(mail);
  });

  it("writes nothing and says to add a Google connector when there is none", async () => {
    const { page, saved } = await card({ kind: "manual" }, []);
    await choose(page.querySelector("select") as HTMLSelectElement, "mail");
    expect(saved).toEqual([]);
    expect(page.textContent).toContain(
      "Add a Google connector first: a mail trigger watches its Gmail inbox.",
    );
  });

  it("offers Add a Google connector under the error, and only where New connector can open", async () => {
    const addConnector = vi.fn();
    const host = {
      mailboxes: async () => [],
      nextTimes: async () => ({ times: [], atNextCheck: false }),
      save: async () => {},
    } as unknown as RoutinesHost;
    const manual = routineWith({ kind: "manual" });
    const withLink = await show(
      <WhenCard host={host} routine={manual} announce={() => {}} addConnector={addConnector} />,
    );
    expect(withLink.textContent).not.toContain("Add a Google connector");
    await choose(withLink.querySelector("select") as HTMLSelectElement, "mail");
    const link = [...withLink.querySelectorAll("button")].find(
      (button) => button.textContent === "Add a Google connector",
    );
    await act(async () => link?.click());
    expect(addConnector).toHaveBeenCalledOnce();
    const without = await card({ kind: "manual" }, []);
    await choose(without.page.querySelector("select") as HTMLSelectElement, "mail");
    expect(without.page.querySelectorAll("button")).toHaveLength(0);
  });

  it("says it is still reading while the connectors are read, and drops that once they arrive", async () => {
    let arrive: (found: readonly RoutineMailbox[]) => void = () => {};
    const saved: RoutineChanges[] = [];
    const host = {
      mailboxes: () => new Promise<readonly RoutineMailbox[]>((resolve) => (arrive = resolve)),
      nextTimes: async () => ({ times: [], atNextCheck: false }),
      save: async (_ref: unknown, changes: RoutineChanges) => {
        saved.push(changes);
      },
    } as unknown as RoutinesHost;
    const page = await show(
      <WhenCard host={host} routine={routineWith({ kind: "manual" })} announce={() => {}} />,
    );
    await choose(page.querySelector("select") as HTMLSelectElement, "mail");
    expect(saved).toEqual([]);
    expect(page.textContent).toContain("Still reading the Google connectors.");
    expect(page.textContent).not.toContain("Add a Google connector first");
    await act(async () => arrive([acme]));
    expect(page.textContent).not.toContain("Still reading");
    expect(page.textContent).not.toContain("Add a Google connector first");
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
