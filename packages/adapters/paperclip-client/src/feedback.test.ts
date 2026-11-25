import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { acmeData, agentAda, company, testKey, websiteProject } from "./acme-data.test-helper.ts";
import { FakePaperclip, type SeenRequest } from "./fake-paperclip.test-helper.ts";
import { type FeedbackTaskInput, findByName, PaperclipFeedback } from "./feedback.ts";
import { findRequest, paperclipRequests } from "./requests.ts";
import { PaperclipClientError, PaperclipTransport } from "./transport.ts";

const madeTask = "i0000000-0000-4000-8000-000000000077";
const tasksPath = `/api/companies/${company}/issues`;
const attachmentsPath = `/api/companies/${company}/issues/${madeTask}/attachments`;

/** A tiny made-up PNG: the signature and a few bytes after it. */
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const feedback: FeedbackTaskInput = {
  title: "The Runs list jumps",
  description: "The Runs list jumps when a run ends.",
  project: "website",
  assignee: "Ada",
  screenshot: { fileName: "feedback-2026-11-25T18-04-05.png", contentType: "image/png" },
};

let paperclip: FakePaperclip;
/** The files the fake task holds, by name. */
let attached: string[];
/** When set, the next request reaches the fake but its reply is lost. */
let loseNextReply: boolean;

beforeEach(() => {
  attached = [];
  loseNextReply = false;
  const keys = new Set<string>();
  const data = acmeData();
  paperclip = new FakePaperclip()
    .on("GET", `/api/companies/${company}/projects`, { body: data.projects })
    .on("GET", `/api/companies/${company}/agents`, { body: data.agents })
    // Like Paperclip: 201 for a new key, 200 with the same task when the key repeats.
    .on("POST", tasksPath, ({ body }) => {
      const key = (body as { idempotencyKey: string }).idempotencyKey;
      const status = keys.has(key) ? 200 : 201;
      keys.add(key);
      return { status, body: { id: madeTask, identifier: "ACME-42", companyId: company } };
    })
    .on("GET", `/api/issues/${madeTask}/attachments`, () => ({
      body: attached.map((name) => ({ id: `att-${name}`, originalFilename: name })),
    }))
    .on("POST", attachmentsPath, ({ body }) => {
      const file = (body as FormData).get("file");
      if (file instanceof File) attached.push(file.name);
      return { status: 201, body: { id: "att-1" } };
    });
});

const sender = () =>
  new PaperclipFeedback({
    address: paperclip.address,
    key: testKey,
    company,
    fetch: async (input, init) => {
      const answer = await paperclip.fetch(input, init);
      if (loseNextReply) {
        loseNextReply = false;
        throw new TypeError("fetch failed");
      }
      return answer;
    },
  });

const creates = () =>
  paperclip.seen.filter((each) => each.method === "POST" && each.path === tasksPath);
const uploads = () => paperclip.seen.filter((each) => each.path === attachmentsPath);

verifies("paperclip-client.feedback-tasks", () => {
  describe("the feedback rows", () => {
    it("are a task create pinned to its fields, an attachment list and a PNG upload", () => {
      expect(paperclipRequests.createFeedbackTask.body).toEqual({
        fields: [
          "title",
          "description",
          "projectId",
          "assigneeAgentId",
          "status",
          "idempotencyKey",
        ],
        status: "todo",
      });
      expect(findRequest("GET", `/api/issues/${madeTask}/attachments`)).toBe("listTaskAttachments");
      expect(findRequest("POST", attachmentsPath)).toBe("attachScreenshot");
      expect(findRequest("DELETE", `/api/attachments/att-1`)).toBeUndefined();
    });
  });

  describe("sending feedback", () => {
    it("creates one task with the project, the assignee, status todo and an idempotency key", async () => {
      const outcome = await sender().send("f1", feedback, png);
      expect(outcome).toEqual({
        kind: "sent",
        taskId: madeTask,
        taskUrl: "https://paperclip.acme.test/ACME/issues/ACME-42",
      });
      expect(creates().map((each) => each.body)).toEqual([
        {
          title: feedback.title,
          description: feedback.description,
          projectId: websiteProject,
          assigneeAgentId: agentAda,
          status: "todo",
          idempotencyKey: "halonic-feedback:f1",
        },
      ]);
    });

    it("uploads the PNG as one file part of type image/png", async () => {
      await sender().send("f1", feedback, png);
      const [upload] = uploads();
      const form = upload?.body as FormData;
      expect([...form.keys()]).toEqual(["file"]);
      const file = form.get("file") as File;
      expect(file.name).toBe(feedback.screenshot?.fileName);
      expect(file.type).toBe("image/png");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
      expect(upload?.headers.get("authorization")).toBe(`Bearer ${testKey}`);
    });

    it("after a lost reply, sends the same key, gets the same task and uploads nothing twice", async () => {
      const client = sender();
      // The upload reaches Paperclip, but its reply is lost: the send reads as offline.
      paperclip.on("POST", attachmentsPath, ({ body }) => {
        loseNextReply = true;
        attached.push(((body as FormData).get("file") as File).name);
        return { status: 201, body: { id: "att-1" } };
      });
      expect(await client.send("f1", feedback, png)).toEqual({ kind: "offline" });
      expect((await client.send("f1", feedback, png)).kind).toBe("sent");
      const keys = creates().map(
        (each) => (each.body as { idempotencyKey: string }).idempotencyKey,
      );
      expect(keys).toEqual(["halonic-feedback:f1", "halonic-feedback:f1"]);
      expect(uploads()).toHaveLength(1);
      expect(attached).toEqual([feedback.screenshot?.fileName]);
    });

    it("sends no upload for feedback without a screenshot", async () => {
      const outcome = await sender().send("f2", { ...feedback, screenshot: null }, null);
      expect(outcome.kind).toBe("sent");
      expect(paperclip.seen.some((each) => each.path.endsWith("/attachments"))).toBe(false);
    });

    it("refuses, creating nothing, when the project or the agent isn't there", async () => {
      expect(await sender().send("f3", { ...feedback, project: "Moon base" }, png)).toEqual({
        kind: "refused",
        reason: "Paperclip has no project called “Moon base”.",
      });
      expect(await sender().send("f3", { ...feedback, assignee: "Zed" }, png)).toEqual({
        kind: "refused",
        reason: "Paperclip has no agent called “Zed”.",
      });
      expect(await sender().send("../x", feedback, png)).toMatchObject({ kind: "refused" });
      expect(creates()).toEqual([]);
    });

    it("answers offline, not-connected, or refused with Paperclip's reason", async () => {
      const failing = (status: number, error?: string) =>
        new PaperclipFeedback({
          address: paperclip.address,
          key: testKey,
          company,
          fetch: async (input, init) => {
            const request = new Request(input, init);
            if (request.method === "POST") {
              return Response.json(error === undefined ? {} : { error }, { status });
            }
            return paperclip.fetch(request);
          },
        });
      expect(await failing(401).send("f4", feedback, png)).toEqual({ kind: "not-connected" });
      expect(await failing(422, "Project is archived").send("f4", feedback, png)).toEqual({
        kind: "refused",
        reason: "Project is archived",
      });
      const offline = new PaperclipFeedback({
        address: paperclip.address,
        key: testKey,
        company,
        fetch: () => Promise.reject(new TypeError("fetch failed")),
      });
      expect(await offline.send("f4", feedback, png)).toEqual({ kind: "offline" });
    });
  });

  describe("the upload row", () => {
    const transport = () =>
      new PaperclipTransport({ address: paperclip.address, key: testKey, fetch: paperclip.fetch });
    const path = { company, task: madeTask };
    const file = { fileName: "shot.png", contentType: "image/png", bytes: png };

    it("refuses a file that isn't a PNG, a bad name, a JSON body, or a file on another row", async () => {
      const refusals = [
        transport().send("attachScreenshot", {
          path,
          upload: { ...file, bytes: new Uint8Array([1, 2]) },
        }),
        transport().send("attachScreenshot", {
          path,
          upload: { ...file, contentType: "text/html" },
        }),
        transport().send("attachScreenshot", {
          path,
          upload: { ...file, fileName: "../shot.png" },
        }),
        transport().send("attachScreenshot", { path, upload: file, body: { note: "x" } }),
        transport().send("attachScreenshot", { path }),
        transport().send("listTaskAttachments", { path: { task: madeTask }, upload: file }),
      ];
      for (const refusal of refusals) {
        await expect(refusal).rejects.toBeInstanceOf(PaperclipClientError);
      }
      expect(paperclip.seen).toEqual([]);
    });

    it("refuses a file larger than 10 MB", async () => {
      const large = new Uint8Array(10 * 1024 * 1024 + 1);
      large.set(png);
      await expect(
        transport().send("attachScreenshot", { path, upload: { ...file, bytes: large } }),
      ).rejects.toBeInstanceOf(PaperclipClientError);
      expect(paperclip.seen).toEqual<SeenRequest[]>([]);
    });
  });

  describe("finding a project or agent by name", () => {
    const projects = [
      { id: "p1", name: "Halonic apps (desktop and mobile)" },
      { id: "p2", name: "Website" },
      { id: "p3", name: "Website archive" },
    ];

    it("takes an ID, a name ignoring case, or the one name that starts with it", () => {
      expect(findByName(projects, "p2")).toBe("p2");
      expect(findByName(projects, "WEBSITE")).toBe("p2");
      expect(findByName(projects, "Halonic apps")).toBe("p1");
      expect(
        findByName([...projects, { id: "p4", name: "Halonic apps (old)" }], "Halonic apps"),
      ).toBe(undefined);
      expect(findByName(projects, "")).toBeUndefined();
    });
  });
});
