// @vitest-environment jsdom

import type { RunEvent, RunSummary } from "@halonicjs/events";
import { DamagedRunLog, RunsList, type RunsSource } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { act, Suspense } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, renderSuspending, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { NeedsYouView } from "./needs-you-card.tsx";
import { useRunFacts } from "./use-run-facts.ts";
import { useStartInput } from "./use-start-input.ts";
import { button, openCard, press, reviewItem } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

const mail = "Hi, my order #1042 arrived damaged. Can I get a refund? — Sam (invented)";
const reply = "Sorry your order arrived damaged, Sam.\n\nAcme support";
const note = "Approving finishes the run. Nothing is sent.";
// Acme's `review` step as `support-reply.workflow.yaml` writes it.
const description = `Approve this reply?\n{{context.reply}}\n\n${note}`;

const review = waitingRun("r2", {
  waitingFor: { title: "Approve this reply?", body: `${reply}\n\n${note}` },
});

/** The log of `r2`: started with `mail`, one call to the test model. */
const log: RunEvent[] = [
  {
    type: "run.started",
    hubId: "acme",
    workflowId: "support-reply",
    input: { mail },
    kind: "run",
    definitionsVersion: "v1",
    runId: "r2",
    seq: 1,
    at: review.startedAt,
  },
  {
    type: "llm.request",
    agent: "writer",
    provider: "mock",
    model: "echo",
    messages: 2,
    runId: "r2",
    seq: 2,
    at: review.startedAt,
  },
];

/**
 * A Runs source with `r2` of Support reply, whose provider `mock` is the test model; `readLog`
 * reads its log, by default `log`.
 */
function runsSource(readLog: () => Promise<RunEvent[]> = async () => log): RunsSource {
  const summaries: readonly RunSummary[] = [review];
  return {
    list: async () => summaries.map((summary) => ({ summary })),
    log: readLog,
    workflow: () => ({
      name: "Support reply",
      stepDescription: (stateId) => (stateId === "review" ? description : undefined),
      startField: "mail",
    }),
    routine: () => undefined,
    runnableWorkflows: async () => [],
    providerKind: () => "local",
    isTestModel: (id) => id === "mock",
    currency: () => "EUR",
    monthlyBudget: () => undefined,
    subscribe: () => () => {},
  };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function draftBox(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>("[data-draft]");
}

verifies("inbox.wait-context", () => {
  describe("the card of Acme's review step", () => {
    it("says the workflow and model, quotes the email and keeps the caption out of the draft", async () => {
      const runs = new RunsList(runsSource());
      await runs.refresh();
      const inbox = new Inbox(fakeRuns([review]).runs);
      function Page() {
        return <InboxView inbox={inbox} runs={runs} runFacts={useRunFacts(runs)} />;
      }
      const root = render(<Page />);
      await settled();
      const row = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
      expect(row?.textContent).toContain("Support reply · Sample answers · run");
      await act(async () => row?.click());
      await settled();

      const card = root.querySelector("section");
      const title = card?.querySelector("h2");
      const meta = card?.querySelector("p");
      expect(meta?.textContent).toBe("Support reply · Sample answers");
      expect(title?.textContent).toBe("Approve this reply?");
      // The title takes focus, so it names the meta line for a screen reader to read with it.
      expect(title?.getAttribute("aria-describedby")).toBe(meta?.id);
      const quote = card?.querySelector("blockquote");
      const box = card === null || card === undefined ? null : draftBox(card);
      expect(quote?.textContent).toContain(mail);
      expect(box?.textContent).toContain("Sorry your order arrived damaged, Sam.");
      expect(box?.textContent).not.toContain(note);
      if (meta == null || title == null || quote == null || box === null) return;
      // In the card's order: the meta line, the title, the quote, then the draft.
      expect(meta.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(title.compareDocumentPosition(quote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(quote.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const caption = [...(card?.querySelectorAll("p") ?? [])].find(
        (line) => line.textContent === note,
      );
      expect(caption?.parentElement?.textContent).toContain("Approve");
    });

    it("keeps the caption out of the draft's box after Approve", async () => {
      const { root, later } = openCard({
        item: reviewItem({
          waitingFor: { title: "Approve this reply?", body: `${reply}\n\n${note}` },
        }),
        workflow: "Support reply",
        sample: true,
        quote: mail,
        description,
      });
      expect(draftBox(root)?.textContent).not.toContain(note);
      later(1);
      await press(button(root, "Approve"));

      expect(root.textContent).toContain("Approved by you at");
      expect(draftBox(root)?.textContent).toContain("Acme support");
      expect(draftBox(root)?.textContent).not.toContain(note);
      expect(root.querySelector("p")?.textContent).toBe("Support reply · Sample answers");
    });

    it("keeps the whole body in the box when the description fills nothing in", () => {
      const { root } = openCard({
        item: reviewItem({ waitingFor: { title: "Approve this reply?", body: note } }),
        description: `Approve this reply?\n${note}`,
      });
      expect(draftBox(root)?.textContent).toContain(note);
      expect(root.querySelector("blockquote")).toBeNull();
    });

    it("leaves the draft out of a box when the step's description isn't known", () => {
      // As in the served Studio for now: the closing words may be in the draft, so no box holds them.
      const { root } = openCard({
        item: reviewItem({
          waitingFor: { title: "Approve this reply?", body: `${reply}\n\n${note}` },
        }),
      });
      expect(draftBox(root)?.className).toBe("text-body");
      expect(root.querySelector("h2")?.hasAttribute("aria-describedby")).toBe(false);
      const lines = [...root.querySelectorAll("p")].map((line) => line.textContent);
      expect(lines).not.toContain(note);
    });

    it("marks a hidden character in the caption and gives it its own direction", () => {
      const hiddenNote = "Approving finishes the run.\u202E Nothing is sent.";
      const { root } = openCard({
        item: reviewItem({
          waitingFor: { title: "Approve this reply?", body: `${reply}\n\n${hiddenNote}` },
        }),
        description: `Approve this reply?\n{{context.reply}}\n\n${hiddenNote}`,
      });
      const caption = [...root.querySelectorAll("p")].find((line) =>
        line.textContent?.startsWith("Approving finishes the run."),
      );
      expect(caption?.textContent).toBe("Approving finishes the run.⟦U+202E⟧ Nothing is sent.");
      expect(caption?.getAttribute("dir")).toBe("auto");
    });
  });

  it("quotes the email from a damaged log, which still gives its start", async () => {
    const source = runsSource(async () => {
      throw new DamagedRunLog(3, log);
    });
    const item = reviewItem();
    function Quote() {
      return <p>{useStartInput(source, item, "mail")}</p>;
    }
    const root = render(<Quote />);
    await settled();
    expect(root.textContent).toBe(mail);
  });

  it("starts Needs you's row on Home with the same meta line", async () => {
    const runs = new RunsList(runsSource());
    await runs.refresh();
    const inbox = new Inbox(fakeRuns([review]).runs);
    await inbox.refresh();
    function Home() {
      const runFacts = useRunFacts(runs);
      return (
        <Suspense fallback={null}>
          <NeedsYouView inbox={inbox} runFacts={runFacts} />
        </Suspense>
      );
    }
    const root = await renderSuspending(<Home />);
    await settled();
    expect(root.textContent).toContain("Support reply · Sample answers · run");
  });
});
