import { act } from "react";

/** A `ResizeObserver` for jsdom, which has none: `resize` reports a new width to every target. */
export class FakeResizeObserver {
  static readonly observers = new Set<FakeResizeObserver>();
  static width = 1600;
  /** Off for a browser that reports a little after the page is drawn. */
  static reportsOnObserve = true;

  private readonly targets = new Set<Element>();
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  /** Puts it in place of the browser's, every target `width` wide; the returned function undoes it. */
  static install(width = 1600): () => void {
    FakeResizeObserver.width = width;
    FakeResizeObserver.reportsOnObserve = true;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    return () => {
      FakeResizeObserver.observers.clear();
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    };
  }

  static resize(width: number): void {
    FakeResizeObserver.width = width;
    act(() => {
      for (const observer of FakeResizeObserver.observers) {
        observer.report();
      }
    });
  }

  observe(target: Element): void {
    this.targets.add(target);
    FakeResizeObserver.observers.add(this);
    if (FakeResizeObserver.reportsOnObserve) {
      this.report();
    }
  }

  disconnect(): void {
    FakeResizeObserver.observers.delete(this);
  }

  unobserve(): void {}

  private report(): void {
    const entries = [...this.targets].map(
      (target) =>
        ({ target, contentRect: { width: FakeResizeObserver.width } }) as ResizeObserverEntry,
    );
    this.callback(entries, this as unknown as ResizeObserver);
  }
}
