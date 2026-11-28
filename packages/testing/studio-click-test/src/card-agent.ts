// The seeded agent's command on the throwaway Paperclip (HAL-19002). A message on its chat wakes
// it, and in that run it makes every post in CARDS_FILE, a card on the chat or a decision, as the
// agent: Paperclip takes an agent's card or decision only from one of its runs, and the Messenger
// shows only the chat agent's own cards. The seed writes the file before it wakes the agent, and empties it once the card
// came. A card Paperclip refuses goes to the run log, and the step that waits for it says it
// never came; the run still ends well, since an agent whose run failed wakes no more, which
// would fail every later card step too.
import { readFile } from "node:fs/promises";

const { CARDS_FILE, PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_RUN_ID } = process.env;
if (
  CARDS_FILE === undefined ||
  PAPERCLIP_API_URL === undefined ||
  PAPERCLIP_API_KEY === undefined ||
  PAPERCLIP_RUN_ID === undefined
) {
  throw new Error("card-agent runs only as the seeded agent, in a Paperclip run.");
}

/**
 * What the seed asked for so far (`AgentPost` in `card-seed.ts`): each a POST of `body` to `path`,
 * a card on the chat or a decision.
 */
const posts: { path: string; body: unknown }[] = JSON.parse(await readFile(CARDS_FILE, "utf8"));
for (const post of posts) {
  const answer = await fetch(`${PAPERCLIP_API_URL.replace(/\/$/, "")}${post.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${PAPERCLIP_API_KEY}`,
      "x-paperclip-run-id": PAPERCLIP_RUN_ID,
    },
    body: JSON.stringify(post.body),
  });
  if (!answer.ok) console.error(`card refused: HTTP ${answer.status} ${await answer.text()}`);
}
