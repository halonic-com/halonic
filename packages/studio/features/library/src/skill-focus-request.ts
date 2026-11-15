import type { SkillRef } from "./skill-host.ts";

/**
 * A request to put the cursor in a skill's Instructions, made after **Create** in New skill. The
 * page opens after the request, so the request waits until that skill's page takes it.
 */
let pending: string | undefined;

function keyOf({ hub, id }: SkillRef): string {
  return `${hub ?? ""}/${id}`;
}

/** Asks the page of `skill` to focus Instructions when it is drawn. */
export function requestSkillInstructionsFocus(skill: SkillRef): void {
  pending = keyOf(skill);
}

/** Whether `skill`'s page is the one asked to focus Instructions; asking once is answered once. */
export function takeSkillInstructionsFocus(skill: SkillRef): boolean {
  if (pending !== keyOf(skill)) return false;
  pending = undefined;
  return true;
}
