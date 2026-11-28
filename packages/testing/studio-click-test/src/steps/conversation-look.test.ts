import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { drawComposer, drawStyles, fakeStudio } from "../fake-studio.test-helper.ts";
import {
  chatHeaderLook,
  composerBoxOf,
  composerLook,
  ownBubbleLook,
  ownBubbleWith,
} from "./conversation-look.ts";

const header = "//header[.//h2]";
const textarea = "//textarea[@aria-label='Message Acme Clicky']";
const composer = { textarea, box: composerBoxOf(textarea) };
const message = "Click test: hello";
const bubble = ownBubbleWith(message);

/** The person's bubble as the kit draws it, with a filled background. */
const drawnBubble = { "border-top-left-radius": "7.5px", "background-color": "rgb(219, 231, 254)" };

verifies("studio-click-test.conversation-look", () => {
  describe("the chat header", () => {
    it("passes at 64px with no line under it", async () => {
      const studio = fakeStudio();
      drawStyles(studio, header, { height: "64px", "border-bottom-width": "0px" });
      await expect(chatHeaderLook(studio.context, header)).resolves.toEqual({ passed: true });
    });

    it("fails as CONVERSATION_LOOK naming each value that differs", async () => {
      const studio = fakeStudio();
      drawStyles(studio, header, { height: "56px", "border-bottom-width": "1px" });
      await expect(chatHeaderLook(studio.context, header)).resolves.toEqual({
        passed: false,
        code: "CONVERSATION_LOOK",
        note: "The chat header: height 56px, not 64px; border-bottom-width 1px, not 0px.",
      });
    });

    it("fails as NO_CONVERSATION_PART when there's no header", async () => {
      await expect(chatHeaderLook(fakeStudio().context, header)).resolves.toEqual({
        passed: false,
        code: "NO_CONVERSATION_PART",
        note: "The chat header isn't on screen.",
      });
    });
  });

  describe("the message box", () => {
    it("passes with 26px corners and 52px least height", async () => {
      const studio = fakeStudio();
      drawComposer(studio, composer);
      await expect(composerLook(studio.context, textarea)).resolves.toEqual({ passed: true });
    });

    it("fails as CONVERSATION_LOOK when it's shorter than 52px", async () => {
      const studio = fakeStudio();
      drawComposer(studio, composer, { "min-height": "40px" });
      await expect(composerLook(studio.context, textarea)).resolves.toEqual({
        passed: false,
        code: "CONVERSATION_LOOK",
        note: "The message box: min-height 40px, not 52px.",
      });
    });

    it("fails as CONVERSATION_LOOK, not as missing, when the box lost its kit class", async () => {
      const studio = fakeStudio();
      studio.elements.set(textarea, 1);
      await expect(composerLook(studio.context, textarea)).resolves.toEqual({
        passed: false,
        code: "CONVERSATION_LOOK",
        note: "The message box is on screen, but not in the kit's rounded-composer box.",
      });
    });

    it("fails as NO_CONVERSATION_PART when there's no message box", async () => {
      await expect(composerLook(fakeStudio().context, textarea)).resolves.toEqual({
        passed: false,
        code: "NO_CONVERSATION_PART",
        note: "The message box isn't on screen.",
      });
    });
  });

  describe("the person's bubble", () => {
    it("passes filled with 7.5px corners", async () => {
      const studio = fakeStudio();
      drawStyles(studio, bubble, drawnBubble);
      await expect(ownBubbleLook(studio.context, message)).resolves.toEqual({ passed: true });
    });

    it("fails as CONVERSATION_LOOK with the old 6px corners", async () => {
      const studio = fakeStudio();
      drawStyles(studio, bubble, { ...drawnBubble, "border-top-left-radius": "6px" });
      await expect(ownBubbleLook(studio.context, message)).resolves.toEqual({
        passed: false,
        code: "CONVERSATION_LOOK",
        note: "Your message's bubble: border-top-left-radius 6px, not 7.5px.",
      });
    });

    it("fails as BUBBLE_LOOK when it has no fill", async () => {
      const studio = fakeStudio();
      drawStyles(studio, bubble, { ...drawnBubble, "background-color": "rgba(0, 0, 0, 0)" });
      await expect(ownBubbleLook(studio.context, message)).resolves.toEqual({
        passed: false,
        code: "BUBBLE_LOOK",
        note: "Your message's bubble has no fill.",
      });
    });

    it("fails as NO_CONVERSATION_PART when the message shows in no bubble", async () => {
      await expect(ownBubbleLook(fakeStudio().context, message)).resolves.toEqual({
        passed: false,
        code: "NO_CONVERSATION_PART",
        note: "Your message's bubble isn't on screen.",
      });
    });
  });
});
