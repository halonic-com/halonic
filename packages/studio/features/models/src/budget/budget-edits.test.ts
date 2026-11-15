import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { editBudget } from "./budget-edits.ts";

const withBudget =
  "version: 1\nid: acme\nname: Acme\nbudget:\n  currency: USD\n  perRun: 5 # keep\n";

verifies("models.budget-settings", () => {
  describe("editBudget", () => {
    it("writes both amounts, reading , as the decimal separator", () => {
      const edited = editBudget("version: 1\nid: acme\nname: Acme\n", {
        perRun: "5",
        monthly: "50,50",
      });

      expect(edited).toEqual({
        ok: true,
        value: expect.stringContaining("perRun: 5"),
      });
      expect(edited.ok && edited.value).toContain("monthly: 50.5");
    });

    it("removes an amount whose field is empty and keeps the currency and comments", () => {
      const edited = editBudget(withBudget, { perRun: "", monthly: "20" });

      expect(edited.ok && edited.value).toBe(
        "version: 1\nid: acme\nname: Acme\nbudget:\n  currency: USD\n  monthly: 20\n",
      );
    });

    it("removes the budget when both fields are empty", () => {
      const edited = editBudget(withBudget, { perRun: " ", monthly: "" });

      expect(edited.ok && edited.value).not.toContain("perRun");
      expect(edited.ok && edited.value).toContain("currency: USD");
    });

    it("writes nothing for an amount that isn't above 0", () => {
      for (const typed of ["0", "abc", "1.000,50", "-3"]) {
        expect(editBudget(withBudget, { perRun: typed, monthly: "" }), typed).toEqual({
          ok: false,
          error: {
            field: "perRun",
            message: "Enter an amount above 0, like you'd write it on a receipt.",
          },
        });
      }
      expect(editBudget(withBudget, { perRun: "", monthly: "0" })).toMatchObject({
        ok: false,
        error: { field: "monthly" },
      });
    });
  });
});
