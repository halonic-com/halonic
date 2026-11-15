// Whether a run's instructions are the ones a person trusted
// (`app.instruction-trust`): the same set, or the person is asked again and
// told what changed.

import type { InstructionChanges, InstructionPin } from "@halonicjs/ports";

/** Whether the run may start with its instructions, or a person must trust them first. */
export type InstructionTrust =
  | { readonly kind: "trusted" }
  | { readonly kind: "ask"; readonly changes: InstructionChanges };

/**
 * Whether `current` is what a person trusted. With no trusted pin, or any
 * difference, they are asked, and the answer says what changed.
 *
 * @example
 * instructionTrust(null, pin); // { kind: "ask", changes: { added: ["AGENTS.md"], … } }
 */
export function instructionTrust(
  trusted: InstructionPin | null,
  current: InstructionPin,
): InstructionTrust {
  if (trusted !== null && trusted.digest === current.digest) return { kind: "trusted" };
  return { kind: "ask", changes: instructionChanges(trusted, current) };
}

/**
 * How `current` differs from `trusted`; with nothing trusted, every file is added.
 *
 * @example
 * instructionChanges(null, pin); // { added: ["AGENTS.md"], removed: [], changed: [] }
 */
export function instructionChanges(
  trusted: InstructionPin | null,
  current: InstructionPin,
): InstructionChanges {
  const before = trusted?.files ?? {};
  const names = (pin: Readonly<Record<string, string>>) => Object.keys(pin);
  // `hasOwn`, because a file may be named `constructor` or `toString`.
  const had = (name: string) => Object.hasOwn(before, name);
  const has = (name: string) => Object.hasOwn(current.files, name);
  return {
    added: names(current.files).filter((name) => !had(name)),
    removed: names(before).filter((name) => !has(name)),
    changed: names(current.files).filter(
      (name) => had(name) && before[name] !== current.files[name],
    ),
  };
}
