import {
  gatewayMaxMessageBytes,
  gatewayMaxMessagingIdLength,
  gatewayMaxSearchLength,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fitPage, type GatewayPage } from "./fit-page.ts";
import { parseGatewayClientMessage } from "./message-parser.ts";

const encoder = new TextEncoder();

function parse(value: unknown) {
  return parseGatewayClientMessage({ binary: false, bytes: encoder.encode(JSON.stringify(value)) });
}

const answer = {
  type: "msg-answer",
  id: "a1",
  item: "item-7",
  answer: { kind: "option", option: "approve" },
  confirmed: true,
};

const valid = [
  { type: "msg-read", id: "r1", what: "inbox" },
  { type: "msg-read", id: "r2", what: "conversations", cursor: "page-2" },
  { type: "msg-read", id: "r3", what: "messages", conversation: "c1" },
  { type: "msg-read", id: "r4", what: "messages", conversation: "c1", before: "m-40" },
  { type: "msg-search", id: "s1", text: "deploy" },
  answer,
  { ...answer, answer: { kind: "option", option: "deny", note: "not today" } },
  { ...answer, answer: { kind: "reply", text: "Use the staging bucket." } },
  { type: "msg-send", id: "m1", conversation: "c1", body: "Ship it" },
  { type: "msg-send", id: "m2", conversation: "c1", body: "Ship it", to: ["agent-b"] },
  { type: "msg-watch", id: "w1" },
  { type: "msg-unwatch", id: "w2" },
  { type: "team-read", id: "t1", what: "seats" },
  { type: "team-read", id: "t2", what: "spend", range: "week" },
  { type: "team-read", id: "t3", what: "pull-request", pullRequest: "pr-6160" },
];

verifies("ports.remote-gateway-protocol", () => {
  describe("parseGatewayClientMessage, message version 4", () => {
    it("accepts each Inbox, Messenger and team status message with exactly its keys", () => {
      for (const message of valid) {
        expect(parse(message)).toEqual({ ok: true, message });
      }
    });

    it("refuses an extra key, a missing key or an unknown type as malformed", () => {
      const bad = [
        ...valid.map((message) => ({ ...message, extra: 1 })),
        { type: "msg-read", id: "r", what: "messages" },
        { type: "msg-read", id: "r", what: "inbox", before: "m-1" },
        { type: "msg-read", id: "r", what: "secrets" },
        { type: "team-read", id: "t", what: "seats", range: "week" },
        { type: "team-read", id: "t", what: "agent-spend" },
        { type: "team-read", id: "t", what: "pull-request" },
        { type: "msg-start-channel", id: "x" },
        { type: "msg-join", id: "x", channel: "c1" },
        { type: "team-agent-spend", id: "x" },
      ];
      for (const message of bad) {
        expect(parse(message)).toEqual({ ok: false, code: "malformed" });
      }
    });

    it("refuses an answer that isn't confirmed, or isn't exactly an option or a reply", () => {
      const bad = [
        { ...answer, confirmed: false },
        { ...answer, confirmed: "true" },
        { type: "msg-answer", id: "a", item: "i", answer: answer.answer },
        { ...answer, answer: { kind: "action-result", result: {} } },
        { ...answer, answer: { kind: "option", option: "approve", type: "x" } },
        { ...answer, answer: { kind: "reply" } },
        { ...answer, answer: [] },
      ];
      for (const message of bad) {
        expect(parse(message)).toEqual({ ok: false, code: "malformed" });
      }
    });

    it("caps search text, message bodies and addressees", () => {
      const search = (text: string) => parse({ type: "msg-search", id: "s", text });
      expect(search("x".repeat(gatewayMaxSearchLength))).toMatchObject({ ok: true });
      expect(search("x".repeat(gatewayMaxSearchLength + 1))).toMatchObject({ ok: false });
      expect(search("")).toMatchObject({ ok: false });
      const send = (extra: object) =>
        parse({ type: "msg-send", id: "m", conversation: "c", body: "hi", ...extra });
      expect(send({ body: "x".repeat(10_001) })).toMatchObject({ ok: false });
      expect(send({ to: ["a", "a"] })).toMatchObject({ ok: false });
      expect(send({ to: Array.from({ length: 9 }, (_, index) => `a${index}`) })).toMatchObject({
        ok: false,
      });
      expect(send({ to: ["@everyone"] })).toMatchObject({ ok: false });
    });

    it("accepts the messaging ids providers make, with `:`, `%` and `.`", () => {
      const item = "paperclip:acme:card:3f2b9c1e-task:7a1d0e5b-card";
      const pullRequest = "paperclip:acme:pull:acme%2Fapp:11";
      const conversation = "paperclip:acme:channel:release.notes";
      const messages = [
        { ...answer, item },
        { type: "team-read", id: "t", what: "pull-request", pullRequest },
        { type: "msg-read", id: "r", what: "messages", conversation },
        { type: "msg-send", id: "m", conversation, body: "hi", to: ["paperclip:acme:agent:ada"] },
      ];
      for (const message of messages) {
        expect(parse(message)).toEqual({ ok: true, message });
      }
    });

    it("accepts a provider's page cursor with `:` back, since `fitPage` hands it on as `more`", () => {
      const cursor = "paperclip:acme:page:2";
      const messages = [
        { type: "msg-read", id: "r", what: "inbox", cursor },
        { type: "msg-read", id: "r", what: "messages", conversation: "c1", before: cursor },
      ];
      for (const message of messages) {
        expect(parse(message)).toEqual({ ok: true, message });
      }
      for (const bad of ["", "a b", "a/b"]) {
        expect(parse({ type: "msg-read", id: "r", what: "inbox", cursor: bad })).toMatchObject({
          ok: false,
        });
      }
    });

    it("keeps request ids strict and caps messaging ids at their own length", () => {
      expect(parse({ ...answer, id: "a:1" })).toEqual({ ok: false, code: "malformed" });
      const item = (length: number) => parse({ ...answer, item: "i".repeat(length) });
      expect(item(gatewayMaxMessagingIdLength)).toMatchObject({ ok: true });
      expect(item(gatewayMaxMessagingIdLength + 1)).toMatchObject({ ok: false });
      for (const bad of ["", "a b", "a/b", "a@b", "a\nb"]) {
        expect(parse({ ...answer, item: bad })).toEqual({ ok: false, code: "malformed" });
      }
    });
  });

  describe("fitPage", () => {
    const item = { id: "c", title: "x".repeat(1_000) };
    const page = (count: number): GatewayPage => ({
      type: "msg-data",
      replyTo: "r1",
      what: "conversations",
      items: Array.from({ length: count }, () => item),
    });

    it("sends a page that fits whole, without more", () => {
      expect(JSON.parse(fitPage(page(3), () => "unused") ?? "")).toEqual(page(3));
    });

    it("splits an oversized page and says where to read on with more", () => {
      const json = fitPage(page(200), (index) => `page-${index}`) ?? "";
      const sent = JSON.parse(json) as GatewayPage;
      expect(encoder.encode(json).byteLength).toBeLessThanOrEqual(gatewayMaxMessageBytes);
      expect(sent.items.length).toBeGreaterThan(0);
      expect(sent.items.length).toBeLessThan(200);
      expect(sent.more).toBe(`page-${sent.items.length}`);
      const oneMore = { ...sent, items: page(sent.items.length + 1).items };
      expect(encoder.encode(JSON.stringify(oneMore)).byteLength).toBeGreaterThan(
        gatewayMaxMessageBytes,
      );
    });

    it("gives up when not even one item fits", () => {
      const huge = { ...page(1), items: [{ title: "x".repeat(gatewayMaxMessageBytes) }] };
      expect(fitPage(huge, () => "next")).toBeUndefined();
    });
  });
});
