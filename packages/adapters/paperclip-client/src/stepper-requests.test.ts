import type { ActionResultAnswer, InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmCard, plainTask } from "./acme-data.test-helper.ts";
import { cardId, connect, FakePaperclip, type Network } from "./fake-paperclip.test-helper.ts";
import type { PaperclipReader } from "./reader.ts";
import { findRequest, fitsBody, paperclipRequests } from "./requests.ts";
import {
  connectWithSteppers,
  newer,
  pinned,
  requestDocument,
  resultRevision,
  serveStepper,
  stepperCard,
  stepperCardRecord,
  stepperCatalog,
  stepperPaths,
} from "./stepper-fixtures.test-helper.ts";
import { PaperclipSteppers } from "./steppers.ts";

let paperclip: FakePaperclip;
const network: Network = { offline: false };

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
});

const client = () => connectWithSteppers(paperclip, network);
const stepperItem = (items: readonly InboxItem[]) =>
  items.find((item) => item.id === cardId(plainTask, stepperCard));
/** The `body` field a write sent, such as a document's or a comment's text. */
const bodyText = (request: { body: unknown } | undefined): unknown =>
  (request?.body as { body?: unknown } | undefined)?.body;
const reasonOf = async () =>
  stepperItem(await client().listInboxItems())
    ?.question.split("\n\n")
    .at(-1);

verifies("paperclip-client.stepper-requests", () => {
  describe("a card pinned to a stepper request", () => {
    it("is an action item with the request's touches, the card's text as the reason and Bo as the requester", async () => {
      serveStepper(paperclip);
      const item = stepperItem(await client().listInboxItems());

      expect(item?.options).toEqual([]);
      expect(item?.question).toBe(
        "The release needs the deploy region and key.\n\n1. Open the variables page.",
      );
      expect(item?.from).toEqual({ kind: "agent", agent: expect.any(String), name: "Bo" });
      expect(item?.stepper).toEqual({
        format: "halonic.stepper-request/1",
        document: JSON.stringify(requestDocument),
        revision: pinned,
        touches: [
          {
            block: 1,
            risk: "routine",
            targets: [{ service: "github", kind: "repository", name: "acme/app" }],
          },
          {
            block: 2,
            risk: "admin",
            targets: [{ service: "github", kind: "repository", name: "acme/app" }],
          },
          {
            block: 3,
            risk: "admin",
            targets: [expect.objectContaining({ service: "github" })],
          },
        ],
        changed: false,
      });
    });

    it("says the request changed when the document has a newer revision, so Studio won't run it", async () => {
      serveStepper(paperclip, { latest: newer });
      const item = stepperItem(await client().listInboxItems());
      expect(item?.stepper?.changed).toBe(true);
    });

    it("reads the latest revision again on every list, since a document change doesn't touch the task", async () => {
      serveStepper(paperclip);
      const messaging = client();
      expect(stepperItem(await messaging.listInboxItems())?.stepper?.changed).toBe(false);
      paperclip.on("GET", stepperPaths.latest, { body: { latestRevisionId: newer } });
      expect(stepperItem(await messaging.listInboxItems())?.stepper?.changed).toBe(true);
    });
  });

  describe("a card whose request can't be read stays a normal card that says why", () => {
    it("for a document over 16 KB", async () => {
      const big = JSON.stringify({ ...requestDocument, reason: "x".repeat(20 * 1024) });
      serveStepper(paperclip, { body: big });
      const item = stepperItem(await client().listInboxItems());
      expect(item?.stepper).toBeUndefined();
      expect(item?.options.map((option) => option.id)).toEqual(["accept", "reject"]);
      expect(await reasonOf()).toBe(
        "This card has a stepper Halonic can't read: the request is over 16 KB",
      );
    });

    it("for a step type Halonic doesn't have", async () => {
      const unknown = {
        ...requestDocument,
        blocks: [{ kind: "step", ref: "github.delete-repo@1" }],
      };
      serveStepper(paperclip, { body: JSON.stringify(unknown) });
      expect(await reasonOf()).toBe(
        "This card has a stepper Halonic can't read: block 1: `github.delete-repo@1` isn't a reviewed step type",
      );
    });

    it("for a field not on the format's list, which never reaches the Inbox", async () => {
      const extra = { ...requestDocument, script: "curl https://acme.example" };
      serveStepper(paperclip, { body: JSON.stringify(extra) });
      const items = await client().listInboxItems();
      expect(items.filter((item) => item.stepper !== undefined)).toEqual([]);
      expect(await reasonOf()).toMatch(/^This card has a stepper Halonic can't read: .*script/);
    });
  });

  it("never serves a stepper on an item that already names an action, and reads no document", async () => {
    const send = vi.fn();
    const steppers = new PaperclipSteppers({ send } as unknown as PaperclipReader, stepperCatalog);
    const item: InboxItem = {
      id: "item-1",
      source: "paperclip",
      from: { kind: "agent", agent: "agent-1", name: "Bo" },
      question: "Set the region.",
      options: [],
      action: {
        definition: "github.set-variable",
        version: 1,
        parameters: {},
        expires: "2026-11-25T13:00:00.000Z",
      },
      attachments: [],
      createdAt: "2026-11-24T13:00:00.000Z",
      state: { kind: "open" },
    };
    const served = await steppers.serve(plainTask, stepperCardRecord(), item);
    expect(served.stepper).toBeUndefined();
    expect(served.question.split("\n\n").at(-1)).toBe(
      "This card has a stepper Halonic can't read: the card already names an action",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("leaves every card as it was without a catalog, and reads no document", async () => {
    serveStepper(paperclip);
    const item = stepperItem(await connect(paperclip, network).listInboxItems());
    expect(item?.stepper).toBeUndefined();
    expect(item?.options.map((option) => option.id)).toEqual(["accept", "reject"]);
    expect(paperclip.seen.some((request) => request.path.includes("/documents/"))).toBe(false);
  });

  describe("the result", () => {
    const answer: ActionResultAnswer = {
      kind: "action-result",
      outcome: "succeeded",
      steps: [
        {
          step: 1,
          outcome: "succeeded",
          kept: { name: "REGION", page: "https://github.com/acme/app" },
        },
        // Kept fields on a secret step never reach the document, whatever they hold.
        { step: 2, outcome: "succeeded", kept: { value: "made-up-secret-value" } },
        { step: 3, outcome: "succeeded", byHand: true },
      ],
    };
    const writes = () => paperclip.seen.filter((request) => request.method !== "GET");

    function serveWrites(): void {
      serveStepper(paperclip)
        .on("PUT", stepperPaths.result, { status: 201, body: { latestRevisionId: resultRevision } })
        .on("POST", `/api/issues/${plainTask}/comments`, { status: 201, body: { id: "m9" } })
        .on("POST", `/api/issues/${plainTask}/interactions/${stepperCard}/accept`, {
          body: { resolvedAt: "2026-11-24T10:10:05.000Z" },
        });
    }

    it('writes stepper-result, posts one comment and accepts the card, with only "set on" for the secret', async () => {
      serveWrites();
      const result = await client().answer(cardId(plainTask, stepperCard), answer);

      expect(result).toEqual({ outcome: "answered", answeredAt: "2026-11-24T10:10:05.000Z" });
      expect(writes().map((request) => `${request.method} ${request.path}`)).toEqual([
        `PUT ${stepperPaths.result}`,
        `POST /api/issues/${plainTask}/comments`,
        `POST /api/issues/${plainTask}/interactions/${stepperCard}/accept`,
      ]);
      const [put, comment] = writes();
      const document = bodyText(put);
      expect(put?.body).toMatchObject({
        title: "Stepper result",
        format: "markdown",
        baseRevisionId: null,
      });
      expect(document).toContain(`revision \`${pinned}\``);
      expect(document).toContain(
        "| 2 | `github.set-secret@1` | set on 24 Nov 2026 | 2026-11-24 10:10 UTC |",
      );
      expect(document).not.toContain("made-up-secret-value");
      expect(document).toContain(
        "| 3 | page `https://github.com/acme/app/settings/variables/actions` | done by hand |",
      );
      expect(document).toContain(
        "done: name: `REGION`, page: [https://github.com/acme/app](https://github.com/acme/app)",
      );
      expect(bodyText(comment)).toBe(
        "The stepper succeeded in Halonic: 3 of 3 blocks done, 1 by hand. The document `stepper-result` on this task has each block's result.",
      );
    });

    it("updates an earlier result over the revision Paperclip names in its conflict", async () => {
      serveWrites();
      let puts = 0;
      paperclip.on("PUT", stepperPaths.result, () => {
        puts += 1;
        return puts === 1
          ? {
              status: 409,
              body: {
                error: "needs baseRevisionId",
                details: { currentRevisionId: resultRevision },
              },
            }
          : { body: { latestRevisionId: newer } };
      });
      await client().answer(cardId(plainTask, stepperCard), answer);
      const bases = writes()
        .filter((request) => request.method === "PUT")
        .map((request) => (request.body as { baseRevisionId: unknown }).baseRevisionId);
      expect(bases).toEqual([null, resultRevision]);
    });

    it("rejects the card with the outcome when the stepper didn't succeed", async () => {
      serveWrites();
      paperclip.on("POST", `/api/issues/${plainTask}/interactions/${stepperCard}/reject`, {
        body: {},
      });
      const declined: ActionResultAnswer = {
        kind: "action-result",
        outcome: "declined",
        steps: [],
      };
      await client().answer(cardId(plainTask, stepperCard), declined);
      expect(writes().at(-1)?.body).toEqual({
        reason: "The stepper declined in Halonic; see the document stepper-result.",
      });
    });

    it("refuses with bad-answer, writing nothing: an option to a stepper item, a result to a plain card or past the last block", async () => {
      serveWrites();
      const messaging = client();
      const pastLast = { ...answer, steps: [{ step: 4, outcome: "skipped" as const }] };

      for (const [item, wrong] of [
        [cardId(plainTask, stepperCard), { kind: "option", option: "accept" }],
        [cardId(plainTask, confirmCard), answer],
        [cardId(plainTask, stepperCard), pastLast],
      ] as const) {
        expect(await messaging.answer(item, wrong)).toEqual({
          outcome: "refused",
          reason: "bad-answer",
        });
      }
      expect(writes()).toEqual([]);
    });
  });

  describe("the request list", () => {
    it("gained three rows, each narrowed to its one document key", () => {
      expect({
        readStepperRequest: paperclipRequests.readStepperRequest,
        latestStepperRequest: paperclipRequests.latestStepperRequest,
        writeStepperResult: paperclipRequests.writeStepperResult,
      }).toEqual({
        readStepperRequest: {
          method: "GET",
          path: "/api/issues/:task/documents/stepper-request/revisions/:revision",
        },
        latestStepperRequest: {
          method: "GET",
          path: "/api/issues/:task/documents/stepper-request",
        },
        writeStepperResult: {
          method: "PUT",
          path: "/api/issues/:task/documents/stepper-result",
          body: {
            fields: ["title", "format", "body", "baseRevisionId"],
            pinned: { title: "Stepper result", format: "markdown" },
            nullable: ["baseRevisionId"],
          },
        },
      });
    });

    it("refuses to read or write any other document key, plan included", () => {
      const documents = `/api/issues/${plainTask}/documents`;
      for (const key of ["plan", "stepper-result", "spec"]) {
        expect(findRequest("GET", `${documents}/${key}`), key).toBeUndefined();
        expect(findRequest("GET", `${documents}/${key}/revisions/${pinned}`), key).toBeUndefined();
      }
      for (const key of ["plan", "stepper-request"]) {
        expect(findRequest("PUT", `${documents}/${key}`), key).toBeUndefined();
      }
      expect(findRequest("GET", documents)).toBeUndefined();
      expect(findRequest("DELETE", `${documents}/stepper-result`)).toBeUndefined();
      expect(
        findRequest("GET", `${documents}/stepper-request/revisions/not-a-revision`),
      ).toBeUndefined();
    });

    it("sends the result only as a Markdown document of its own title", () => {
      const body = {
        title: "Stepper result",
        format: "markdown",
        body: "# Result",
        baseRevisionId: null,
      };
      expect(fitsBody("writeStepperResult", body)).toBe(true);
      expect(fitsBody("writeStepperResult", { ...body, baseRevisionId: pinned })).toBe(true);
      expect(fitsBody("writeStepperResult", { ...body, title: "Plan" })).toBe(false);
      expect(fitsBody("writeStepperResult", { ...body, format: "html" })).toBe(false);
      expect(fitsBody("writeStepperResult", { ...body, key: "plan" })).toBe(false);
      expect(fitsBody("writeStepperResult", { ...body, body: null })).toBe(false);
    });

    it("matches every request a stepper list and answer make", async () => {
      serveStepper(paperclip)
        .on("PUT", stepperPaths.result, { body: {} })
        .on("POST", `/api/issues/${plainTask}/comments`, { body: {} })
        .on("POST", `/api/issues/${plainTask}/interactions/${stepperCard}/reject`, { body: {} });
      const messaging = client();
      await messaging.listInboxItems();
      await messaging.answer(cardId(plainTask, stepperCard), {
        kind: "action-result",
        outcome: "expired",
        steps: [],
      });
      for (const request of paperclip.seen) {
        expect(
          findRequest(request.method, request.path),
          `${request.method} ${request.path}`,
        ).toBeDefined();
      }
    });
  });
});
