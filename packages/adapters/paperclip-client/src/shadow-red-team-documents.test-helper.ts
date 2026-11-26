import assert from "node:assert/strict";
import { company } from "./acme-data.test-helper.ts";
import {
  expectCard,
  expectStop,
  type RedTeamRow,
  shadowRun,
} from "./shadow-red-team.test-helper.ts";
import {
  admin,
  agentA,
  b0,
  cardReasons,
  cleanApproval,
  first,
  hour,
  neverListId,
  neverListText,
  otherCompany,
  revision,
  runReasons,
  setRevisions,
  stopId,
  t0,
  type World,
} from "./shadow-world.test-helper.ts";

// Part A of HAL-19463, rows A20 to A34: the never-list document, the stop document and the clock.
// Julian's proposed codes map to the merged ones: `never_list.wrong_author` is
// `never_list.not_owner_latest`, `never_list.not_pinned` is `never_list.wrong_document`,
// `stop.on` is `stop.stopped` (an owner's) or `stop.not_owner_latest` (anyone else's), and
// `stop.wrong_author` is `stop.not_owner_latest`.

const at = (hours: number) => new Date(t0.getTime() + hours * hour);

/** The never-list's only revision says `text`, written by the owner. */
const neverList = (text: string) => (world: World) =>
  setRevisions(world.neverList, [revision(neverListId, 1, text)]);

/** The stop document gains a revision saying `body`, by `by`. */
function writeStop(world: World, body: string, by: { user?: string; agent?: string } = {}) {
  const next = world.stop.revisions.length + 1;
  setRevisions(world.stop, [
    ...world.stop.revisions,
    revision(stopId, next, body, { at: world.serverTime ?? t0, ...by }),
  ]);
}

/** Every one of `arranges` stops the poll with `reason`. */
async function eachStop(reason: string, ...arranges: ((world: World) => void)[]) {
  for (const arrange of arranges) await expectStop(arrange, reason);
}

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/** The owner's keyword `drill-loosen` at `listedAt`, removed by the owner at `removedAt`. */
function loosen(world: World, listedAt: Date, removedAt: Date) {
  setRevisions(world.neverList, [
    revision(neverListId, 1, neverListText(["drill-loosen"]), { at: listedAt }),
    revision(neverListId, 2, neverListText(), { at: removedAt }),
  ]);
  first(world).record["payload"] = { title: "Run drill-loosen now" };
}

export const documentRows: RedTeamRow[] = [
  {
    id: "A20",
    change: "a typo in a value, an unknown target type or path class, a hold on an unknown type",
    check: () =>
      eachStop(
        "never_list.unknown_value",
        ...[
          "  - kind: approval_type\n    value: hire_agnet\n",
          "  - kind: target_type\n    value: paperclip_restart\n",
          "  - kind: path_class\n    value: everything_else\n",
        ].map((entry) => neverList(neverListText().replace(" []\n", `\n${entry}`))),
        neverList(neverListText([], "holds:\n  - name: H\n    covers:\n      - grant_admin\n")),
      ),
  },
  {
    id: "A21",
    change: "an unknown entry kind, or a top-level field that claims authority",
    async check() {
      await expectStop(
        neverList(neverListText().replace(" []\n", "\n  - kind: approval_typ\n    value: x\n")),
        "never_list.unknown_kind",
      );
      await expectStop(
        neverList(`${neverListText()}updatedBy: ${admin}\n`),
        "never_list.unknown_field",
      );
    },
  },
  {
    id: "A22",
    change: "YAML tricks: a key twice, an anchor and alias, a tag, two documents",
    check: () =>
      eachStop(
        "never_list.unparsable",
        neverList(`${neverListText(["a"])}entries: []\n`),
        neverList(`version: 2\nworkspaceId: &w ${company}\nentries: []\nconnectorUserId: *w\n`),
        neverList(`version: !!int 2\nworkspaceId: ${company}\nentries: []\n`),
        neverList(`${neverListText()}---\n${neverListText()}`),
      ),
  },
  {
    id: "A23",
    change: "over 64,000 characters, or another company's workspaceId",
    async check() {
      await expectStop(neverList(neverListText(["k".repeat(64_001)])), "never_list.too_large");
      await expectStop(
        neverList(neverListText().replace(company, otherCompany)),
        "never_list.wrong_workspace",
      );
    },
  },
  {
    id: "A24",
    change: "unlocked, or the newest revision is an agent's or a board user's who isn't an owner",
    async check() {
      await expectStop((world) => {
        world.neverList.document["lockedAt"] = null;
      }, "never_list.unlocked");
      for (const by of [{ agent: agentA }, { user: admin }]) {
        await expectStop((world) => {
          setRevisions(world.neverList, [
            ...world.neverList.revisions,
            revision(neverListId, 2, neverListText(), { at: t0, ...by }),
          ]);
        }, "never_list.not_owner_latest");
      }
    },
  },
  {
    id: "A25",
    change: "a decoy list elsewhere; the pinned list gone; the pinned id moved to another issue",
    async check() {
      // Studio reads the pinned issue only, so a decoy elsewhere is never asked for.
      await expectCard((world) => {
        neverList(neverListText(["drill-pinned-only"]))(world);
        first(world).record["payload"] = { title: "drill-pinned-only" };
      }, "never_list.keyword");
      await expectStop((world) => {
        world.overrides.set(
          `GET /api/issues/${String(world.neverList.document["issueId"])}/documents/never-list`,
          notFound,
        );
      }, "read.status");
      await expectStop((world) => {
        world.neverList.document["issueId"] = "i0000000-0000-4000-8000-0000000000d9";
      }, "never_list.wrong_document");
    },
  },
  {
    id: "A26",
    change:
      "an agent's unlocked edit drops a keyword, and the owner saves the same text 23 h later",
    async check() {
      const arrange = (world: World) => {
        setRevisions(world.neverList, [
          revision(neverListId, 1, neverListText(["drill-loosen"]), { at: at(-26) }),
          revision(neverListId, 2, neverListText(), { at: at(-25), agent: agentA }),
          revision(neverListId, 3, neverListText(), { at: at(-2) }),
        ]);
        first(world).record["payload"] = { title: "drill-loosen" };
      };
      await expectCard(arrange, "never_list.keyword");
      await expectCard((world) => {
        arrange(world);
        world.serverTime = at(22.01);
        world.laptopTime = at(22.01);
      }, "card.untyped");
    },
  },
  {
    id: "A27",
    change: "the document drops the seed entry hire_agent; checked at once and 25 hours later",
    async check() {
      for (const time of [t0, at(25)]) {
        await expectCard((world) => {
          first(world).record["type"] = "hire_agent";
          world.serverTime = time;
          world.laptopTime = time;
        }, "never_list.entry");
      }
    },
  },
  {
    id: "A28",
    change: "the stop document is unlocked, and the owner's stop: false is its newest revision",
    check: () =>
      expectCard((world) => {
        world.stop.document["lockedAt"] = null;
      }, "card.untyped"),
  },
  {
    id: "A29",
    change: "an agent writes stop: true between two polls",
    async check() {
      const world = b0();
      const run = await shadowRun(world, {
        polls: 2,
        between: (poll) => poll === 1 && writeStop(world, "stop: true\n", { agent: agentA }),
      });
      assert.deepEqual(cardReasons(run.store), ["card.untyped"]);
      assert.deepEqual(runReasons(run.store), ["run.started", "poll.ran", "stop.not_owner_latest"]);
    },
  },
  {
    id: "A30",
    change: "after A29, an agent or a non-owner board user writes stop: false",
    async check() {
      for (const by of [{ agent: agentA }, { user: admin }]) {
        await expectStop((world) => {
          writeStop(world, "stop: true\n", { agent: agentA });
          writeStop(world, "stop: false\n", by);
        }, "stop.not_owner_latest");
      }
    },
  },
  {
    id: "A31",
    change: "the stop document is gone, unreadable, a string, YAML 1.1 no, extra fields",
    async check() {
      await expectStop((world) => {
        world.overrides.set(
          `GET /api/issues/${String(world.stop.document["issueId"])}/documents/auto-approve-stop`,
          notFound,
        );
      }, "read.status");
      await eachStop(
        "stop.unreadable",
        ...[
          "stop: [\n",
          'stop: "false"\n',
          "stop: no\n",
          `stop: false\nworkspaceId: ${otherCompany}\n`,
        ].map((body) => (world: World) => writeStop(world, body)),
      );
      await expectStop((world) => {
        world.stop.document["issueId"] = "i0000000-0000-4000-8000-0000000000d9";
      }, "stop.wrong_document");
    },
  },
  {
    id: "A32",
    change: "stop: true lands half-way through a poll",
    async check() {
      const world = b0();
      const second = cleanApproval("p0000000-0000-4000-8000-0000000000c2");
      world.approvals.push(second);
      const firstIssues = `GET /api/approvals/${String(first(world).record["id"])}/issues`;
      world.overrides.set(firstIssues, () => {
        writeStop(world, "stop: true\n");
        return Response.json(first(world).issues);
      });
      const run = await shadowRun(world);
      assert.deepEqual(cardReasons(run.store), ["card.untyped"]);
      assert.deepEqual(runReasons(run.store), ["run.started", "stop.stopped"]);
    },
  },
  {
    id: "A33",
    change: "the laptop says T + 24:01 while the server says T + 23:59, then T + 24:00:01",
    async check() {
      const removedAt = at(-24);
      await expectCard((world) => {
        loosen(world, at(-48), removedAt);
        world.serverTime = at(-1 / 60);
        world.laptopTime = at(1 / 60);
      }, "never_list.keyword");
      await expectCard((world) => {
        loosen(world, at(-48), removedAt);
        world.serverTime = at(1 / 3600);
        world.laptopTime = at(1 / 3600);
      }, "card.untyped");
    },
  },
  {
    id: "A34",
    change: "the laptop clock over 2 minutes off, either way; no or a broken Date header",
    async check() {
      await eachStop(
        "clock.skew",
        (world) => {
          world.laptopTime = at(3 / 60);
        },
        (world) => {
          world.laptopTime = at(-3 / 60);
        },
      );
      await eachStop(
        "read.no_server_time",
        (world) => {
          world.serverTime = undefined;
        },
        (world) => {
          world.serverTime = undefined;
          const path = `GET /api/issues/${String(world.stop.document["issueId"])}/documents/auto-approve-stop/revisions`;
          world.overrides.set(path, () =>
            Response.json(world.stop.revisions, { headers: { date: "the day after tomorrow" } }),
          );
        },
      );
    },
  },
];
