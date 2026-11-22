import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup, weeklyFile } from "./workspace-routines.test-helper.ts";

/** Acme's `weekly-report`, started by mail that `connector` watches instead of by the clock. */
const mailFile = (connector: string): string =>
  weeklyFile.replace(
    '  schedule: "0 9 * * 1"\n  timezone: Europe/Amsterdam',
    `  mail:\n    connector: ${connector}\n    every: 5m`,
  );

/** A connector that isn't Google, so it has no inbox. */
const trackerFile =
  "name: Tracker\ntransport:\n  http:\n    url: https://tracker.example.com/mcp\n";

const routinePath = "hubs/acme/workflows/routines/weekly-report.routine.yaml";

verifies("studio.workspace-routines", () => {
  it("says a row's error as a sentence, with a capital letter and a full stop (C591)", async () => {
    const { host } = setup({}, [], {
      [routinePath]: weeklyFile.replace("agent: analyst", "agent: nobody"),
    });

    const [listed] = await host.list();

    expect(listed?.problems).toEqual([
      "Weekly report: nobody isn't in this workspace. Pick another agent for run.agent.",
    ]);
  });

  it("names the mailbox to pick when a mail trigger's connector is gone (C591)", async () => {
    const { host } = setup({}, [], { [routinePath]: mailFile("inbox") });

    const [listed] = await host.list();

    expect(listed?.problems).toEqual([
      "inbox isn't in this workspace. Pick another mailbox under When.",
    ]);
  });

  it("names the mailbox to pick when a mail trigger's connector isn't Google (C591)", async () => {
    const { host } = setup({}, [], {
      [routinePath]: mailFile("mail"),
      "hubs/acme/library/connectors/mail.connector.yaml": trackerFile,
    });

    const [listed] = await host.list();

    expect(listed?.problems).toEqual([
      "mail isn't a Google connector, so it has no inbox to watch. Pick another mailbox under When.",
    ]);
  });

  it("says the row's sentence on the routine's page too (HAL-15300)", async () => {
    const { host } = setup({}, [], { [routinePath]: mailFile("inbox") });

    const view = await host.read({ hubId: "acme", id: "weekly-report" });

    expect(view.problems).toEqual([
      "inbox isn't in this workspace. Pick another mailbox under When.",
    ]);
  });
});
