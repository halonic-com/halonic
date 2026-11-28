import { writeFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import type { SeedFixture } from "./card-fixtures.ts";
import {
  type CardRecord,
  type CardRef,
  type CardSetup,
  cardAgentConfig,
  readCard,
  type SeededCard,
  seedCard,
} from "./card-seed.ts";
import { api, type Call, idOf, stringField } from "./paperclip-api.ts";
import { readRecord, seedApproval, seedDecision } from "./record-seed.ts";

/** The names the seed gives the throwaway Paperclip's records, which the steps look for. */
export const seedNames = {
  company: "Acme Click Test",
  agent: "Acme Clicky",
  task: "Acme: answer the click test",
  card: "Acme click-test card",
  cardType: "approve_ceo_strategy",
} as const;

/** The seeded records' ids. */
export interface Seeded {
  readonly companyId: string;
  readonly approvalId: string;
  /** The seeded agent, whose chat the Messenger's copies are in. */
  readonly agentId: string;
  readonly chatId: string;
  /** The file the seeded agent reads the cards it posts on its chat from (`card-agent.ts`). */
  readonly cardsFile: string;
}

/** What the steps read back from the throwaway Paperclip, past Studio, to check a click landed. */
export interface TestPaperclip {
  readonly seeded: Seeded;
  /** The seeded card's status, such as `pending` or `approved`. */
  approvalStatus(): Promise<string>;
  /** The bodies of the comments on the seeded chat. */
  chatComments(): Promise<readonly string[]>;
  /** Whether the key Studio signed in with still works; undefined when Studio sent none. */
  studioKeyWorks(): Promise<boolean | undefined>;
  /** Seeds a card kind's Inbox and Messenger copies (HAL-19002): a card, approval or decision. */
  seedCard(fixture: SeedFixture): Promise<SeededCard>;
  /** One seeded copy as Paperclip has it now. */
  card(ref: CardRef): Promise<CardRecord>;
}

/**
 * Seeds the throwaway Paperclip at `target` (loopback, `local_trusted`, so no
 * key) with a company, a task, a board card on that task and a chat with an
 * agent. Agent Chat is an experimental setting, so the seed turns it on. The agent's command
 * posts the cards the card steps ask for in `cardsFile`, none yet.
 */
export async function seedPaperclip(target: string, cardsFile: string): Promise<Seeded> {
  await writeFile(cardsFile, "[]");
  const call = api(target);
  await call("PATCH", "/api/instance/settings/experimental", { enableAgentChat: true });
  const company = await call("POST", "/api/companies", { name: seedNames.company });
  const companyId = idOf(company);
  const companyPath = `/api/companies/${companyId}`;
  await call("PATCH", companyPath, { requireBoardApprovalForNewAgents: false });
  // A message wakes the agent, and its command posts only the cards a card step asked for.
  const agent = await call("POST", `${companyPath}/agents`, {
    name: seedNames.agent,
    adapterType: "process",
    adapterConfig: cardAgentConfig(cardsFile),
  });
  const task = await call("POST", `${companyPath}/issues`, { title: seedNames.task });
  const approval = await call("POST", `${companyPath}/approvals`, {
    type: seedNames.cardType,
    payload: { title: seedNames.card, plan: seedNames.card },
    issueIds: [idOf(task)],
  });
  const chat = await call("POST", `${companyPath}/chats/${idOf(agent)}`);
  return {
    companyId,
    approvalId: idOf(approval),
    agentId: idOf(agent),
    chatId: idOf(chat),
    cardsFile,
  };
}

/** The checks on the seeded records, with the key Studio last sent through the proxy. */
export function testPaperclip(
  target: string,
  seeded: Seeded,
  studioKey: () => string | undefined,
): TestPaperclip {
  const call = api(target);
  return {
    seeded,
    approvalStatus: async () => {
      const approval = await call("GET", `/api/approvals/${seeded.approvalId}`);
      return stringField(approval, "status");
    },
    chatComments: async () => {
      const comments = await call("GET", `/api/issues/${seeded.chatId}/comments`);
      return Array.isArray(comments) ? comments.map((comment) => stringField(comment, "body")) : [];
    },
    studioKeyWorks: async () => {
      const key = studioKey();
      if (key === undefined) return undefined;
      const answer = await fetch(`${target.replace(/\/$/, "")}/api/cli-auth/me`, {
        headers: { authorization: `Bearer ${key}` },
      });
      if (answer.status === 401) return false;
      if (!answer.ok) throw new Error(`GET /api/cli-auth/me: HTTP ${answer.status}`);
      // The test Paperclip is `local_trusted`: a loopback call whose key it doesn't accept still
      // answers 200, as the implicit local board. Only `board_key` says the key itself worked.
      return stringField(await answer.json(), "source") === "board_key";
    },
    seedCard: (fixture) => seedAny(call, seeded, fixture),
    card: (ref) => ("record" in ref ? readRecord(call, ref) : readCard(call, ref)),
  };
}

/** Seeds `fixture` the way its record needs: a card on a task, an approval or a decision. */
function seedAny(call: Call, setup: CardSetup, fixture: SeedFixture): Promise<SeededCard> {
  const pause = (milliseconds: number) => wait(milliseconds);
  if (fixture.record === "approval") return seedApproval(call, setup, fixture);
  if (fixture.record === "decision") return seedDecision(call, setup, fixture, pause);
  return seedCard(call, setup, fixture, pause);
}
