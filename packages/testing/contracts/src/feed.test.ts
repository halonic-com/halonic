import { expect, it } from "vitest";
import { Feed } from "./feed.ts";

it("return() settles a next() that is already waiting (HAL-17754)", async () => {
  const feed = new Feed<string>(() => undefined);
  const pending = feed.next();

  await feed.return();

  await expect(pending).resolves.toEqual({ done: true, value: undefined });
});

it("return() tells the owner the reader left", async () => {
  const left: Feed<string>[] = [];
  const feed = new Feed<string>((leaving) => left.push(leaving));

  await feed.return();

  expect(left).toEqual([feed]);
});
