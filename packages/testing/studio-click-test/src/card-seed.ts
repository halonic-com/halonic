import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type CardFixture, promptOn, type Surface } from "./card-fixtures.ts";
import { type Call, fieldOf, idOf, stringField } from "./paperclip-api.ts";

/** Where one seeded copy of a card lives: its task and its own id. */
export interface CardRef {
  readonly issueId: string;
  readonly id: string;
}

/** A card kind's two copies, one per surface. */
export type SeededCard = Readonly<Record<Surface, CardRef>>;

/** A card as Paperclip has it: `pending` until answered, then its status and its `result`. */
export interface CardRecord {
  readonly status: string;
  readonly result: unknown;
}

/** What seeding a card needs: the company, the agent's chat, and the file its agent reads. */
export interface CardSetup {
  readonly companyId: string;
  readonly chatId: string;
  readonly cardsFile: string;
}

/** How long the agent gets to post a Messenger copy, and when it is woken a second time. */
const agentPolls = 45;
const wakeAgainAt = 20;
const pollMs = 2_000;

/**
 * The seeded agent's adapter config: Node runs `card-agent.ts`, which posts the cards in
 * `cardsFile` on its chat in the run a message starts (HAL-19002).
 */
export function cardAgentConfig(cardsFile: string): Readonly<Record<string, unknown>> {
  return {
    command: process.execPath,
    args: [fileURLToPath(new URL("./card-agent.ts", import.meta.url))],
    env: { CARDS_FILE: cardsFile },
  };
}

/**
 * Seeds `fixture`'s two copies: the Inbox's, by the board on a task of its own, and the
 * Messenger's, by the agent on its chat, which a message there wakes to post it. A card bound
 * to a document gets that document on its task first. Throws when the agent's copy never came.
 */
export async function seedCard(
  call: Call,
  setup: CardSetup,
  fixture: CardFixture,
  wait: (milliseconds: number) => Promise<void>,
): Promise<SeededCard> {
  const task = await call("POST", `/api/companies/${setup.companyId}/issues`, {
    title: `Acme: the ${fixture.key} card`,
  });
  const inboxBody = await cardBody(call, idOf(task), fixture, "Inbox");
  const inbox = await call("POST", `/api/issues/${idOf(task)}/interactions`, inboxBody);
  // The file holds only the card awaited: a later wake, such as step 10's message, posts nothing,
  // since Paperclip refuses a key it has from another run.
  const messengerBody = await cardBody(call, setup.chatId, fixture, "Messenger");
  await writeFile(
    setup.cardsFile,
    JSON.stringify([{ issueId: setup.chatId, body: messengerBody }]),
  );
  const messenger = await agentCard(call, setup.chatId, fixture, wait).finally(() =>
    writeFile(setup.cardsFile, "[]"),
  );
  return {
    Inbox: { issueId: idOf(task), id: idOf(inbox) },
    Messenger: { issueId: setup.chatId, id: messenger },
  };
}

/** A copy's `interactions` body, with its document written and bound first when it has one. */
async function cardBody(
  call: Call,
  issueId: string,
  fixture: CardFixture,
  surface: Surface,
): Promise<Readonly<Record<string, unknown>>> {
  const payload = fixture.payload(promptOn(fixture, surface));
  const body = { kind: fixture.kind, idempotencyKey: keyOf(fixture, surface) };
  if (fixture.document === undefined) return { ...body, payload };
  const { key, body: text } = fixture.document;
  const document = await call("PUT", `/api/issues/${issueId}/documents/${key}`, {
    title: "Plan",
    format: "markdown",
    body: text,
  });
  const revisionId = stringField(document, "latestRevisionId");
  return { ...body, payload: { ...payload, target: { type: "issue_document", key, revisionId } } };
}

/** Wakes the agent with a message on its chat and waits for its copy there; its id. */
async function agentCard(
  call: Call,
  chatId: string,
  fixture: CardFixture,
  wait: (milliseconds: number) => Promise<void>,
): Promise<string> {
  const key = keyOf(fixture, "Messenger");
  for (let poll = 0; poll < agentPolls; poll += 1) {
    if (poll % wakeAgainAt === 0) {
      await call("POST", `/api/issues/${chatId}/comments`, {
        body: `Click test: post the ${fixture.key} card.`,
        clientRequestId: crypto.randomUUID(),
      });
    }
    const cards = await call("GET", `/api/issues/${chatId}/interactions`);
    const card = Array.isArray(cards)
      ? cards.find((each) => fieldOf(each, "idempotencyKey") === key)
      : undefined;
    if (card !== undefined) return idOf(card);
    await wait(pollMs);
  }
  throw new Error(`the agent never posted the ${fixture.key} card on its chat`);
}

/** A copy's idempotency key, so a later wake of the agent posts no second one. */
function keyOf(fixture: CardFixture, surface: Surface): string {
  return `click-test-${fixture.key}-${surface.toLowerCase()}`;
}

/** A seeded copy as Paperclip has it now. */
export async function readCard(call: Call, card: CardRef): Promise<CardRecord> {
  const cards = await call("GET", `/api/issues/${card.issueId}/interactions`);
  const record = Array.isArray(cards) ? cards.find((each) => idOf(each) === card.id) : undefined;
  if (record === undefined) throw new Error(`Paperclip has no card ${card.id}`);
  return { status: stringField(record, "status"), result: fieldOf(record, "result") };
}
