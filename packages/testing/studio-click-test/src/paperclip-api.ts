/** One request to the throwaway Paperclip, as its `local_trusted` board: the answer's JSON. */
export type Call = (method: string, path: string, body?: unknown) => Promise<unknown>;

/** Requests to the Paperclip at `target`; a refusal throws with its status and body. */
export function api(target: string): Call {
  const base = target.replace(/\/$/, "");
  return async (method, path, body) => {
    const init: RequestInit = { method, headers: { "content-type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const answer = await fetch(`${base}${path}`, init);
    if (!answer.ok) {
      throw new Error(`${method} ${path}: HTTP ${answer.status} ${await answer.text()}`);
    }
    return answer.json();
  };
}

/** A record's `id`. */
export function idOf(record: unknown): string {
  return stringField(record, "id");
}

/** A record's string field; any other value throws, naming the field. */
export function stringField(record: unknown, key: string): string {
  const value = fieldOf(record, key);
  if (typeof value !== "string") throw new Error(`the answer has no ${key}`);
  return value;
}

/** A record's field, or undefined for a value that isn't a record. */
export function fieldOf(record: unknown, key: string): unknown {
  return typeof record === "object" && record !== null ? Reflect.get(record, key) : undefined;
}
