import {
  type ChoiceKey,
  choiceKey,
  type FirstRunKeyProvider,
  firstRunKeyProviders,
  type ModelChoice,
} from "@halonicjs/app";
import { isPlainObject } from "@halonicjs/std";

/** More than any real provider key; it keeps what a request can make the server hold bounded. */
const maxKeyLength = 1024;

/**
 * A model name as Ollama gives it, such as `llama3.2`, `qwen3:8b` or
 * `hf.co/acme/tiny-model:Q4_K_M`. It goes into the test request's body, never into an address.
 */
const modelNamePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

/** A test id as a host makes it: plain letters, digits and a few marks. */
const testIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

/** What `POST /api/model-choice/test` carries, once it is checked. */
export interface TestRequest {
  readonly choice: ModelChoice;
  /** The pasted key, hidden; `undefined` to test with the key saved on this computer. */
  readonly key: ChoiceKey | undefined;
}

/**
 * Parses a JSON object body. A bad body is never described: a parse error can quote the text it
 * choked on, and that text can be the key. So the cause is dropped and the caller gets `null`.
 */
function readObject(body: Uint8Array): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
  return isPlainObject(parsed) ? parsed : null;
}

/** One of the first run's key providers, by its exact id; `null` for anything else. */
export function readKeyProvider(text: string): FirstRunKeyProvider | null {
  return firstRunKeyProviders.find((provider) => provider === text) ?? null;
}

/**
 * The choice a body names, built anew from its two allowed shapes. Every other field, such as an
 * address, is dropped: the provider's address always comes from `choiceProvider`'s built-in table.
 */
function readChoice(value: unknown): ModelChoice | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const { kind, provider, model } = value;
  if (kind === "key" && typeof provider === "string") {
    const known = readKeyProvider(provider);
    return known === null ? null : { kind: "key", provider: known };
  }
  if (kind === "local" && typeof model === "string" && modelNamePattern.test(model)) {
    return { kind: "local", model };
  }
  return null;
}

/** Reads `{"choice": …}`, the body of `line-facts`. */
export function readChoiceRequest(body: Uint8Array): ModelChoice | null {
  const parsed = readObject(body);
  return parsed === null ? null : readChoice(parsed["choice"]);
}

/**
 * Reads `{"choice": …, "key"?: "<text>"}`, the body of `test`. A key comes only with a key
 * choice. It is wrapped at once, so no log line or JSON made from it shows it.
 */
export function readTestRequest(body: Uint8Array): TestRequest | null {
  const parsed = readObject(body);
  const choice = parsed === null ? null : readChoice(parsed["choice"]);
  if (parsed === null || choice === null) {
    return null;
  }
  const { key } = parsed;
  if (key === undefined) {
    return { choice, key: undefined };
  }
  if (choice.kind !== "key" || typeof key !== "string" || key.length > maxKeyLength) {
    return null;
  }
  return { choice, key: choiceKey(key) };
}

/** Reads `{"testId": "<id>"}`, the body of `continue`. A shown fingerprint, if sent, is ignored. */
export function readContinueRequest(body: Uint8Array): string | null {
  const parsed = readObject(body);
  const testId = parsed?.["testId"];
  return readTestId(typeof testId === "string" ? testId : "");
}

/** A test id from a path segment or a body; `null` when it can't be one. */
export function readTestId(text: string): string | null {
  return testIdPattern.test(text) ? text : null;
}
