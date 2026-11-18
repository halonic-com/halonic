// @vitest-environment jsdom
import {
  type ExternalAddress,
  OpenExternalProvider,
  PresentationProvider,
} from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { failureWords } from "../failure-words.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const enableUrl = "https://console.cloud.google.com/apis/library/gmail.googleapis.com";

function failed(cause: Record<string, unknown> | undefined, reason = "unknown") {
  return summaryWith({
    id: "run_a_7k2m9p",
    status: "failed",
    reason: reason as never,
    state: "draft",
    error: "Gmail API has not been used in project 123 before",
    ...(cause === undefined ? {} : { cause: cause as never }),
  });
}

const apiOff = (detail: Record<string, string>) => ({
  kind: "denied",
  code: "google.api-disabled",
  detail,
});

async function open(run: ReturnType<typeof failed>, phone = false) {
  const opened: ExternalAddress[] = [];
  const log = logOf(run.id, [[0, entered("draft")]]).map((event) =>
    event.type === "run.started" ? { ...event, input: { message: "Hi" } } : event,
  );
  const list = new RunsList(fakeSource([run], { [run.id]: log }).source);
  const root = render(
    <OpenExternalProvider
      openExternal={async (address) => {
        opened.push(address);
      }}
    >
      <PresentationProvider presentation={phone ? "phone" : "desktop"}>
        <RunView
          list={list}
          runId={run.id}
          now={() => mondayMorning}
          openRun={() => undefined}
          runStart={{ startRun: async () => ({ runId: "run_next" }) }}
        />
      </PresentationProvider>
    </OpenExternalProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { root, opened };
}

const banner = (container: Element) => container.querySelector('section[aria-label="Run failed"]');
const buttons = (container: Element) =>
  [...(banner(container)?.querySelectorAll("button") ?? [])].map((button) => button.textContent);

verifies("runs.run-view.api-off", () => {
  const full = apiOff({ api: "gmail.googleapis.com", project: "halonic-x", enableUrl });

  it("says which API is off and where, with Switch it on before Run again (A1)", async () => {
    const { root } = await open(failed(full));
    const section = banner(root);
    expect(section?.textContent).toContain(
      "The Gmail API is off in project halonic-x, so this step didn't run.",
    );
    expect(buttons(root)).toEqual(["Switch it on ↗. Opens Google Cloud", "Run again"]);
    expect(section?.textContent?.match(/halonic-x/g)).toHaveLength(1);
  });

  it("opens the address through the host, and says where it goes in its tooltip and name (A2)", async () => {
    const { root, opened } = await open(failed(full));
    const button = banner(root)?.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toContain(failureWords.opensGoogleCloud);
    await act(async () => button.click());
    expect(opened).toEqual([enableUrl]);
  });

  it("names Google Drive for the Drive API", async () => {
    const { root } = await open(
      failed(apiOff({ api: "drive.googleapis.com", project: "p-1", enableUrl })),
    );
    expect(banner(root)?.textContent).toContain("The Google Drive API is off in project p-1");
  });

  it("shows no button for an address that isn't a Google console address, and never opens one (A3)", async () => {
    for (const bad of [
      "http://console.cloud.google.com/x",
      "https://console.cloud.google.com.evil.example/x",
      undefined,
    ]) {
      const detail = { api: "gmail.googleapis.com", project: "halonic-x" };
      const { root, opened } = await open(
        failed(apiOff(bad === undefined ? detail : { ...detail, enableUrl: bad })),
      );
      expect(banner(root)?.textContent).toContain("The Gmail API is off in project halonic-x");
      expect(buttons(root)).toEqual(["Run again"]);
      expect(opened).toEqual([]);
      unmountAll();
    }
  });

  it("names no project when the cause gives none (A4)", async () => {
    const { root } = await open(failed(apiOff({ api: "gmail.googleapis.com", enableUrl })));
    const text = banner(root)?.textContent ?? "";
    expect(text).toContain("The Gmail API is off in your Google project, so this step didn't run.");
    expect(text).not.toMatch(/undefined|project \./);
    expect(buttons(root)).toEqual(["Switch it on ↗. Opens Google Cloud", "Run again"]);
  });

  it("keeps the ordinary banner for a reason that mentions the API but has no typed cause (A5)", async () => {
    const { root } = await open(failed(undefined));
    const text = banner(root)?.textContent ?? "";
    expect(text).not.toContain("API is off");
    expect(buttons(root)).not.toContain("Switch it on ↗. Opens Google Cloud");
  });

  it("says to switch it on at the computer on a phone, with no button for it (A9)", async () => {
    const { root } = await open(failed(full), true);
    const text = banner(root)?.textContent ?? "";
    expect(text).toContain("The Gmail API is off in project halonic-x, so this step didn't run.");
    expect(text).toContain("Fix this on your computer: switch on the Gmail API in Google Cloud.");
    expect(buttons(root)).toEqual(["Run again"]);
  });

  it("uses none of the words a person shouldn't read (Mara's fix 5)", async () => {
    const { root } = await open(failed(full));
    const read = banner(root)?.textContent ?? "";
    expect(read).not.toBe("");
    for (const word of ["probably", "token", "refresh", "invalid_grant", "invalid_client", "403"]) {
      expect(read).not.toContain(word);
    }
  });
});
