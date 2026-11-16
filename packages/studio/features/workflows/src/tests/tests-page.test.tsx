// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkflowsHost, WorkflowTests } from "../api.ts";
import { buttonNamed, memoryHost, show, unmount } from "../test-support.tsx";
import { TestsPage } from "./tests-page.tsx";

afterEach(unmount);

const ranAt = new Date(2026, 10, 9, 10, 42).toISOString();

const afterRun: WorkflowTests = {
  ranAt,
  cases: [
    { name: "invoice run", input: '{ "subject": "Invoice" }', result: { passed: true } },
    { name: "spam", input: "{}", result: { passed: true } },
    {
      name: "personal mail",
      input: '{ "subject": "Hi" }',
      endsIn: "archive",
      result: {
        passed: false,
        runId: "run-7",
        failure: 'Expected to end in "archive", ended in "reply".',
        expectedPath: ["read", "classify", "archive"],
        actualPath: ["read", "classify", "reply"],
      },
    },
  ],
};

const open = async (overrides: Partial<WorkflowsHost>, openRun?: (id: string) => void) => {
  const { host } = memoryHost([], [], [], [], overrides);
  const toasts = createToastStore();
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <TestsPage
        host={host}
        workflow={{ hubId: "acme", id: "reply" }}
        name="Support reply"
        openRun={openRun}
      />
    </ToastStoreProvider>,
  );
  return { page, toasts };
};

verifies("workflows.tests.page", () => {
  it("shows the summary, Run tests and a row for each test with the failed one's sentence", async () => {
    const { page } = await open(
      { tests: async () => afterRun, runTests: async () => afterRun },
      () => {},
    );

    expect(page.textContent).toContain("2 of 3 pass");
    expect(buttonNamed(page, "Run tests")).toBeDefined();
    const rows = [...page.querySelectorAll("li")].map((row) => row.textContent);
    expect(rows[2]).toContain('Expected to end in "archive", ended in "reply".');
    expect(rows[2]).toContain("Open run");
  });

  it("opens the failed test's run", async () => {
    const openRun = vi.fn();
    const { page } = await open({ tests: async () => afterRun }, openRun);
    await act(async () => buttonNamed(page, "Open run")?.click());

    expect(openRun).toHaveBeenCalledWith("run-7");
  });

  it("shows the running state with a busy button and a count that goes up", async () => {
    let report: (index: number, passed: boolean) => void = () => {};
    let finish: (tests: WorkflowTests) => void = () => {};
    const { page, toasts } = await open({
      tests: async () => afterRun,
      runTests: (_ref, onResult) => {
        report = onResult;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    await act(async () => buttonNamed(page, "Run tests")?.click());

    expect(page.textContent).toContain("0 of 3 done");
    const busy = page.querySelector("button[aria-busy=true]");
    expect(busy?.textContent).toContain("Running…");
    await act(async () => report(1, true));
    expect(page.textContent).toContain("1 of 3 done");
    expect(page.textContent).not.toContain("10:4");
    expect(page.querySelector("[role=status]")).toBeNull();

    await act(async () => finish(afterRun));
    expect(page.textContent).toContain("2 of 3 pass");
    expect(toasts.list()[0]?.title).toBe("1 of 3 tests failed");
  });

  it("shows only the Empty state when there are no tests", async () => {
    const { page } = await open({ tests: async () => ({ cases: [] }) });

    expect(page.textContent).toContain("No tests yet");
    expect(page.querySelector("strong")?.textContent).toBe("Save as test");
    expect(buttonNamed(page, "Run tests")).toBeUndefined();
  });

  it("says why the tests couldn't run, with Try again", async () => {
    const runTests = vi
      .fn()
      .mockRejectedValueOnce(new KindedError("unavailable", "The engine is stopped"))
      .mockResolvedValue(afterRun);
    const { page, toasts } = await open({ tests: async () => afterRun, runTests });
    await act(async () => buttonNamed(page, "Run tests")?.click());

    const toast = toasts.list()[0];
    expect(toast?.title).toBe("Couldn't run the tests: The engine is stopped.");
    expect(toast?.tone).toBe("danger");
    await act(async () => toast?.action?.onClick());
    expect(runTests).toHaveBeenCalledTimes(2);
  });

  it("has no Run tests when the app can't run them", async () => {
    const { page } = await open({ tests: async () => afterRun });

    expect(buttonNamed(page, "Run tests")).toBeUndefined();
  });

  it("docks a failed test's card with both paths and the sentence", async () => {
    const { page } = await open({ tests: async () => afterRun });
    await act(async () => buttonNamed(page, "personal mail")?.click());

    const card = page.querySelector("aside");
    expect(card?.textContent).toContain(
      'It went another way at step 3: "reply" instead of "archive".',
    );
    expect(card?.textContent).toContain("TEST");
    expect(card?.textContent).not.toContain("Name");
    expect(card?.querySelector("[role=alert]")).toBeNull();
    expect(card?.textContent).toContain('{ "subject": "Hi" }');
    expect(card?.textContent).toContain("archive");
    expect(card?.textContent).toContain("Expected");
    expect(card?.textContent).toContain("This run");
    expect(document.activeElement?.textContent).toBe("personal mail");

    await act(async () => {
      card?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(page.querySelector("aside")).toBeNull();
    expect(document.activeElement).toBe(buttonNamed(page, "personal mail"));
  });

  it("tells apart tests with the same name", async () => {
    const twins: WorkflowTests = {
      cases: [
        { name: "spam", input: "{}", result: { passed: true } },
        {
          name: "spam",
          input: '{ "n": 2 }',
          result: { passed: false, runId: "run-2", failure: "No." },
        },
      ],
    };
    const openRun = vi.fn();
    const { page } = await open({ tests: async () => twins }, openRun);

    const rows = page.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    await act(async () => rows[1]?.querySelector("button")?.click());
    expect(page.querySelector("aside")?.textContent).toContain('"n": 2');
    expect(rows[0]?.className).not.toContain("bg-accent-soft");
    await act(async () =>
      buttonNamed(page.querySelector("aside") as HTMLElement, "Open run")?.click(),
    );
    expect(openRun).toHaveBeenCalledWith("run-2");
  });

  it("says why the tests can't be read, and tries again", async () => {
    const tests = vi
      .fn()
      .mockRejectedValueOnce(new KindedError("unavailable", "The file is damaged"))
      .mockResolvedValue(afterRun);
    const { page } = await open({ tests });

    expect(page.textContent).toContain("Couldn't load Support reply's tests");
    expect(page.textContent).toContain("The file is damaged.");
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.textContent).toContain("2 of 3 pass");
  });

  it("shows a skeleton and its words while the tests load", async () => {
    const { page } = await open({ tests: () => new Promise(() => {}) });

    expect(page.querySelector("[role=status]")?.textContent).toContain(
      "Loading Support reply's tests",
    );
  });
});
