import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import type { Studio } from "../studio.ts";
import { type HomeCardContribution, type HomeSection, homeSectionTitles } from "./home.ts";

const load = async () => ({ Card: () => "card" });

function card(id: HomeSection): HomeCardContribution {
  return { id, view: "Card", load };
}

function feature(id: string, register: (studio: Studio) => void) {
  return defineFeature({ id, title: id, register });
}

verifies("shell.home-sections", () => {
  it("lists Home's cards in its fixed order, whatever order features register in", () => {
    const shell = createShell({
      features: [
        feature("runs", (studio) => studio.home.addCard(card("recent-runs"))),
        feature("inbox", (studio) => studio.home.addCard(card("needs-you"))),
        feature("setup", (studio) => studio.home.addCard(card("setup"))),
      ],
    });
    const cards = shell.contributions.home.cards();
    expect(cards.map((entry) => homeSectionTitles[entry.id])).toEqual([
      "Get set up",
      "Needs you",
      "Recent runs",
    ]);
    expect(cards.map((entry) => entry.featureId)).toEqual(["setup", "inbox", "runs"]);
  });

  it("leaves out a section whose feature hasn't added its card", () => {
    const shell = createShell({
      features: [feature("runs", (studio) => studio.home.addCard(card("recent-runs")))],
    });
    expect(shell.contributions.home.cards().map((entry) => entry.id)).toEqual(["recent-runs"]);
    expect(createShell({ features: [] }).contributions.home.cards()).toEqual([]);
  });

  it("refuses a section that isn't one of Home's", () => {
    const create = () =>
      createShell({
        features: [
          feature("news", (studio) =>
            studio.home.addCard({ ...card("setup"), id: "news" as HomeSection }),
          ),
        ],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(
      /home.addCard: the feature "news" adds the section "news".*setup, needs-you, recent-runs/,
    );
  });

  it("refuses the same section from two features", () => {
    const create = () =>
      createShell({
        features: [
          feature("inbox", (studio) => studio.home.addCard(card("needs-you"))),
          feature("approvals", (studio) => studio.home.addCard(card("needs-you"))),
        ],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(
      'home.addCard: the section "needs-you" is added by both "inbox" and "approvals". Each section of Home belongs to one feature.',
    );
  });

  it("refuses a card after register returned", () => {
    let later: Studio | undefined;
    createShell({ features: [feature("inbox", (studio) => (later = studio))] });
    expect(() => later?.home.addCard(card("needs-you"))).toThrow(
      /"inbox" called home.addCard after register returned/,
    );
  });
});
