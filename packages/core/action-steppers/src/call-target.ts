import type { ActionRisk } from "@halonicjs/ports";
import { assert } from "@halonicjs/std";

// The characters `has_hidden_characters` in the shell's `action-send` crate refuses: Rust's `is_control` is `Cc`.
const hiddenCharacter = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const placeholderName = /^[A-Za-z][A-Za-z0-9_]*$/;

function assertText(text: string, template: string, where: string): void {
  assert(
    !text.includes("}") && !hiddenCharacter.test(text),
    `${where}: the target \`${template}\` has a stray \`}\` or a hidden character`,
  );
}

/**
 * Checks a target template as the shell's `parse_target` (`action-send`'s
 * `target.rs`) reads it, with the same wording: text with `{name}` parts, each
 * one of the route's placeholders, at least one of them, and no stray `}` or
 * hidden character.
 */
function assertTarget(
  template: string,
  placeholders: Readonly<Record<string, string>>,
  where: string,
): void {
  let rest = template;
  let named = false;
  while (rest !== "") {
    const start = rest.indexOf("{");
    if (start === -1) {
      assertText(rest, template, where);
      break;
    }
    assertText(rest.slice(0, start), template, where);
    const after = rest.slice(start + 1);
    const end = after.indexOf("}");
    assert(end !== -1, `${where}: the target \`${template}\` has an unclosed \`{\``);
    const name = after.slice(0, end);
    assert(
      placeholderName.test(name) && Object.hasOwn(placeholders, name),
      `${where}: \`{${name}}\` in the target \`${template}\` isn't one of the route's placeholders`,
    );
    named = true;
    rest = after.slice(end + 1);
  }
  assert(named, `${where}: the target \`${template}\` names no placeholder`);
}

/**
 * A call route's target, as the shell's route list takes it: an
 * `irreversible` call must have one and no other call may.
 *
 * @throws Error when the risk and the target don't fit together, or the
 *   template isn't one the shell's `parse_target` reads
 */
export function callTargetOf(
  target: string | undefined,
  risk: ActionRisk,
  placeholders: Readonly<Record<string, string>>,
  where: string,
): string | undefined {
  if (risk !== "irreversible") {
    assert(target === undefined, `${where}: only an irreversible call has a target`);
    return undefined;
  }
  assert(target !== undefined, `${where}: an irreversible call needs a target`);
  assertTarget(target, placeholders, where);
  return target;
}
