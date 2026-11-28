import {
  type ApprovalFixture,
  type DecisionFixture,
  promptOn,
  type Surface,
  surfaces,
} from "./card-fixtures.ts";
import { askAgent, type CardRecord, type CardSetup, keyOf, type SeededCard } from "./card-seed.ts";
import { type Call, fieldOf, idOf, stringField } from "./paperclip-api.ts";

// The approvals and decisions card steps seed (HAL-19002). Unlike a card, each lives on its own,
// not on a task, and Paperclip reads it by its id.

/**
 * Seeds `fixture`'s two copies as the board: the Inbox's asked by the board itself, the
 * Messenger's in the seeded agent's name, which Paperclip takes from the board as given.
 */
export async function seedApproval(
  call: Call,
  setup: CardSetup,
  fixture: ApprovalFixture,
): Promise<SeededCard> {
  const post = async (surface: Surface) => {
    const asker = surface === "Messenger" ? { requestedByAgentId: setup.agentId } : {};
    const approval = await call("POST", `/api/companies/${setup.companyId}/approvals`, {
      type: fixture.type,
      payload: fixture.payload(promptOn(fixture, surface)),
      ...asker,
    });
    return { record: "approval", id: idOf(approval) } as const;
  };
  return { Inbox: await post("Inbox"), Messenger: await post("Messenger") };
}

/**
 * Seeds `fixture`'s two copies through the seeded agent, in one run, since Paperclip takes a
 * decision only from an agent's run. Both come from the agent, so both show in its chat too;
 * each surface's step finds its own by its title.
 */
export async function seedDecision(
  call: Call,
  setup: CardSetup,
  fixture: DecisionFixture,
  wait: (milliseconds: number) => Promise<void>,
): Promise<SeededCard> {
  const path = `/api/companies/${setup.companyId}/decisions`;
  const posts = surfaces.map((surface) => ({
    path,
    body: {
      title: promptOn(fixture, surface),
      body: "",
      options: fixture.options.map((option) => ({ ...option, effects: [] })),
      idempotencyKey: keyOf(fixture, surface),
    },
  }));
  const titles = surfaces.map((surface) => promptOn(fixture, surface));
  const [inbox, messenger] = await askAgent(
    call,
    setup,
    { label: fixture.key, posts },
    async () => {
      const open = await call("GET", `${path}?status=open&originAgentId=${setup.agentId}`);
      const found = titles.map((title) =>
        Array.isArray(open) ? open.find((each) => fieldOf(each, "title") === title) : undefined,
      );
      return found.every((each) => each !== undefined) ? found : undefined;
    },
    wait,
  );
  return {
    Inbox: { record: "decision", id: idOf(inbox) },
    Messenger: { record: "decision", id: idOf(messenger) },
  };
}

/**
 * A seeded approval or decision as Paperclip has it now, in a card's terms: `pending` until
 * answered (an open decision too), and its answer as the `result`, an approval's note or the
 * decision's pick.
 */
export async function readRecord(
  call: Call,
  ref: { readonly record: "approval" | "decision"; readonly id: string },
): Promise<CardRecord> {
  if (ref.record === "approval") {
    const approval = await call("GET", `/api/approvals/${ref.id}`);
    return {
      status: stringField(approval, "status"),
      result: { decisionNote: fieldOf(approval, "decisionNote") },
    };
  }
  const decision = await call("GET", `/api/decisions/${ref.id}`);
  const status = stringField(decision, "status");
  return {
    status: status === "open" ? "pending" : status,
    result: { chosenOptionId: fieldOf(decision, "chosenOptionId") },
  };
}
