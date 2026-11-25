import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { approvalOf } from "./approval.ts";
import { ago, enqueued, headOf, pass, pull, said, snapshot } from "./merge-control.test-helper.ts";
import type { PullText } from "./snapshot.ts";

const head = headOf(1);
const h7 = head.slice(0, 7);

function approved(texts: readonly PullText[], patchIds: Record<string, string | null> = {}) {
  return approvalOf(pull(1, { texts }), "halonic-dev", patchIds).approval?.ok === true;
}

verifies("paperclip.merge-control-signed-approval", () => {
  test("signed approval on any comment line", () => {
    // Julian's six cases (HAL-17946).
    const restated = said(
      `Julian: changes requested on head \`${h7}\`\n\n(was: Julian: approved on head \`${h7}\`)`,
    );
    expect(approved([restated])).toBe(false);
    expect(enqueued(pass(snapshot({ pulls: [pull(1, { texts: [restated] })] })))).toEqual([]);

    const fenced = said(`Julian: pasted log\n\`\`\`\nJulian: approved on head \`${h7}\`\n\`\`\``);
    const indented = said(`Julian: pasted log\n\n    Julian: approved on head \`${h7}\``);
    expect(approved([fenced])).toBe(false);
    expect(approved([indented])).toBe(false);

    // Notes above the signed line don't hide it (#5758, HAL-17927); the head check still holds.
    const notes = said(
      `Rebased on main.\nOne wording note left.\nJulian: approved on head \`${h7}\``,
    );
    expect(approved([notes])).toBe(true);
    const staleNotes = said(
      `Rebased on main.\nOne wording note left.\nJulian: approved on head \`${headOf(1, 1).slice(0, 7)}\``,
    );
    expect(approved([staleNotes])).toBe(false);

    const later = said(
      `Julian: checked the follow-up\n\n[nit] one wording note\nJulian: approved on head \`${h7}\``,
    );
    expect(approved([later])).toBe(true);

    const quoted = said(`> Julian: approved on head \`${h7}\``);
    expect(approved([quoted])).toBe(false);

    const other = said(`Julian: approved on head \`${headOf(1, 1).slice(0, 7)}\``);
    expect(approved([other])).toBe(false);
  });

  test("two approval lines in one comment are ambiguous and don't count", () => {
    const twice = said(`Liam: approved on head \`${h7}\`\nLiam: re-approved on head \`${h7}\``);
    expect(approved([twice])).toBe(false);
    const again = said(`Liam: re-approved on head \`${h7}\` (rebase only)`, 10);
    expect(approved([said("Liam: looking", 40), again])).toBe(true);
    expect(approved([said(`Liam: approved on head ${h7}`, 5, { at: ago(5) })])).toBe(true);
  });
});
