/**
 * A `window.matchMedia` for tests, which jsdom lacks: every query matches while the fake width is
 * below the query's own `(width < Npx)`, and `resize` tells the listeners, as a browser does.
 */
export class FakeMediaQueries {
  private width: number;
  private readonly listeners = new Set<() => void>();

  constructor(width: number) {
    this.width = width;
  }

  /** Puts this fake in place of `window.matchMedia`; returns a function that takes it out. */
  install(): () => void {
    const original = window.matchMedia;
    window.matchMedia = (query) => this.match(query);
    return () => {
      window.matchMedia = original;
    };
  }

  /** Changes the window's width and tells every listener. */
  resize(width: number): void {
    this.width = width;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private match(query: string): MediaQueryList {
    const below = Number(/\(width < (\d+)px\)/.exec(query)?.[1] ?? Number.NaN);
    const listeners = this.listeners;
    const media = { media: query, matches: this.width < below } as MediaQueryList;
    media.addEventListener = (_type: string, listener: unknown) => {
      listeners.add(listener as () => void);
    };
    media.removeEventListener = (_type: string, listener: unknown) => {
      listeners.delete(listener as () => void);
    };
    return media;
  }
}
