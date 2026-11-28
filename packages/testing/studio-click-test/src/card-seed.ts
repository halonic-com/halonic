import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type CardFixture, promptOn, type SeedFixture, type Surface } from "./card-fixtures.ts";
import { type Call, fieldOf, idOf, stringField } from "./paperclip-api.ts";

/**
 * Where one seeded copy lives: a card's task and its own id, or an approval's or a decision's
 * own id, which Paperclip reads on its own.
 */
export type CardRef =
  | { readonly issueId: string; readonly id: string }
  | { readonly record: "approval" | "decision"; readonly id: string };

/** A card kind's two copies, one per surface. */
export type SeededCard = Readonly<Record<Surface, CardRef>>;

/** A card as Paperclip has it: `pending` until answered, then its status and its `result`. */
export interface CardRecord {
  readonly status: string;
  readonly result: unknown;
}

/** What seeding a card needs: the company, the agent and its chat, and the file the agent reads. */
export interface CardSetup {
  readonly companyId: string;
  readonly agentId: string;
  readonly chatId: string;
  readonly cardsFile: string;
}

/** One write the agent makes in its run (`card-agent.ts`): a POST of `body` to `path`. */
export interface AgentPost {
  readonly path: string;
  readonly body: unknown;
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
  const messengerBody = await cardBody(call, setup.chatId, fixture, "Messenger");
  const key = keyOf(fixture, "Messenger");
  const chatCards = `/api/issues/${setup.chatId}/interactions`;
  const messenger = await askAgent(
    call,
    setup,
    { label: fixture.key, posts: [{ path: chatCards, body: messengerBody }] },
    async () => {
      const cards = await call("GET", chatCards);
      return Array.isArray(cards)
        ? cards.find((each) => fieldOf(each, "idempotencyKey") === key)
        : undefined;
    },
    wait,
  );
  return {
    Inbox: { issueId: idOf(task), id: idOf(inbox) },
    Messenger: { issueId: setup.chatId, id: idOf(messenger) },
  };
}

/**
 * Has the agent make `ask.posts` in a run: writes them to its cards file, wakes it with a message
 * on its chat, and waits until `found` gives what they made, which it returns. The file holds
 * only what is awaited and is emptied after: a later wake, such as step 10's message, posts
 * nothing, since Paperclip refuses a key it has from another run. Throws when it never came.
 */
export async function askAgent<T>(
  call: Call,
  setup: CardSetup,
  ask: { readonly label: string; readonly posts: readonly AgentPost[] },
  found: () => Promise<T | undefined>,
  wait: (milliseconds: number) => Promise<void>,
): Promise<T> {
  await writeFile(setup.cardsFile, JSON.stringify(ask.posts));
  try {
    for (let poll = 0; poll < agentPolls; poll += 1) {
      if (poll % wakeAgainAt === 0) {
        await call("POST", `/api/issues/${setup.chatId}/comments`, {
          body: `Click test: post the ${ask.label} card.`,
          clientRequestId: crypto.randomUUID(),
        });
      }
      const made = await found();
      if (made !== undefined) return made;
      await wait(pollMs);
    }
  } finally {
    await writeFile(setup.cardsFile, "[]");
  }
  throw new Error(`the agent never posted the ${ask.label} card on its chat`);
}

/** A copy's `interactions` body, with its document written and bound first when it has one. */
async function cardBody(
  call: Call,
  issueId: string,
  fixture: CardFixture,
  surface: Surface,
): Promise<Readonly<Record<string, unknown>>> {
  const prompt = promptOn(fixture, surface);
  const payload = fixture.payload(prompt);
  const title = fixture.promptAsTitle === true ? { title: prompt } : {};
  const body = { kind: fixture.kind, idempotencyKey: keyOf(fixture, surface), ...title };
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

/** A copy's idempotency key, so a later wake of the agent posts no second one. */
export function keyOf(fixture: SeedFixture, surface: Surface): string {
  return `click-test-${fixture.key}-${surface.toLowerCase()}`;
}

/** A seeded card on a task as Paperclip has it now. */
export async function readCard(
  call: Call,
  card: { readonly issueId: string; readonly id: string },
): Promise<CardRecord> {
  const cards = await call("GET", `/api/issues/${card.issueId}/interactions`);
  const record = Array.isArray(cards) ? cards.find((each) => idOf(each) === card.id) : undefined;
  if (record === undefined) throw new Error(`Paperclip has no card ${card.id}`);
  return { status: stringField(record, "status"), result: fieldOf(record, "result") };
}
