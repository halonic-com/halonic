// The Build chat's `read_docs` tool (`assistant.build.read-docs`): the model
// reads a public docs page, such as an API reference, while it writes an
// integration. It asks the person before the first fetch from each site in
// the chat, and logs every address it is given, refused ones included.

import type { ChatTool } from "@halonicjs/app";
import { type BuildChat, textArgument } from "../build-chat.ts";
import { type Fetched, fetchDocsPage } from "./docs-fetch.ts";
import type { DocsLogEntry, DocsOptions } from "./docs-sites.ts";
import { docsTexts } from "./docs-texts.ts";
import { checkDocsUrl, loggedUrl } from "./docs-url.ts";
import { pageText } from "./page-text.ts";

/** `read_docs`: reads one public docs page as text, once the person allows its site. */
export function readDocsTool(chat: BuildChat, docs: DocsOptions): ChatTool {
  return {
    definition: {
      name: "read_docs",
      description:
        "Reads one public docs page over https, such as a service's API reference, as text. The person allows each site once per chat. Addresses with a query (?…) are refused, and a redirect isn't followed.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The page's address, such as https://docs.example.com/api/auth.",
          },
        },
        required: ["url"],
      },
    },
    async call(toolCall, signal) {
      const raw = textArgument(toolCall.arguments, "url");
      const at = docs.now().toISOString();
      const log = (entry: Omit<DocsLogEntry, "at" | "url">, url = loggedUrl(raw)) =>
        docs.sites.log({ at, url, ...entry });
      if (!chat.options.isTrusted()) {
        await log({ outcome: "refused", bytes: 0 });
        return docsTexts.untrusted;
      }
      const checked = checkDocsUrl(raw);
      if ("refused" in checked) {
        await log({ outcome: "refused", bytes: 0 });
        return checked.refused;
      }
      const { url, host } = checked;
      switch (await docs.sites.answerFor(host)) {
        case "allowed":
          break;
        case "declined":
          await log({ outcome: "declined", bytes: 0 }, url);
          return docsTexts.declined(host);
        case "asked":
          await log({ outcome: "waiting", bytes: 0 }, url);
          return docsTexts.waiting(host);
        case undefined:
          await docs.sites.ask(host, toolCall.id);
          await log({ outcome: "waiting", bytes: 0 }, url);
          return docsTexts.waiting(host);
      }
      const fetched = await fetchDocsPage(docs, url, signal);
      await log(logged(fetched), url);
      return resultOf(fetched, url);
    },
  };
}

/** The log's line for a fetch: its status, bytes and where a `3xx` pointed, never the page. */
function logged(fetched: Fetched): Omit<DocsLogEntry, "at" | "url"> {
  switch (fetched.kind) {
    case "page":
      return { outcome: "read", status: fetched.status, bytes: fetched.bytes };
    case "moved":
      return { outcome: "moved", status: fetched.status, bytes: 0, location: fetched.location };
    case "status":
    case "not-text":
      return { outcome: "not-read", status: fetched.status, bytes: 0 };
    case "too-large":
    case "timeout":
    case "failed":
      return { outcome: "not-read", status: fetched.status, bytes: fetched.bytes };
  }
}

function resultOf(fetched: Fetched, url: string): string {
  switch (fetched.kind) {
    case "page":
      return pageText(url, fetched.type, fetched.text);
    case "moved":
      return docsTexts.moved(fetched.status, fetched.location);
    case "status":
      return docsTexts.status(fetched.status);
    case "not-text":
      return docsTexts.notText(fetched.type);
    case "too-large":
      return docsTexts.tooLarge;
    case "timeout":
      return docsTexts.timeout;
    case "failed":
      return docsTexts.failed;
  }
}
