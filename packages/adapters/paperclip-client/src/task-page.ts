/**
 * A task's page in Paperclip: by its identifier, such as `/HAL/issues/HAL-42`,
 * when it has one, else by its ID.
 */
export function taskPageLink(origin: string, id: string, identifier: string | undefined): string {
  const match = identifier === undefined ? null : /^([A-Z][A-Z0-9]*)-\d+$/.exec(identifier);
  const path =
    match === null ? `/issues/${encodeURIComponent(id)}` : `/${match[1]}/issues/${identifier}`;
  return new URL(path, origin).href;
}
