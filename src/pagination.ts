import type { ListParams, Page } from "./types.js";

export type PageFetcher<T, P extends ListParams> = (params: P) => Promise<Page<T>>;

/**
 * A list result. Iterate it with `for await` to walk every item across pages,
 * or call `page()` for a single page.
 *
 * ```ts
 * for await (const message of client.messages.list({ accountId })) { ... }
 * const { items, nextCursor } = await client.messages.list({ limit: 20 }).page();
 * ```
 */
export class Paginator<T, P extends ListParams = ListParams> implements AsyncIterable<T> {
  readonly #fetch: PageFetcher<T, P>;
  readonly #params: P;

  constructor(fetch: PageFetcher<T, P>, params: P) {
    this.#fetch = fetch;
    this.#params = params;
  }

  /** Fetch one page. Defaults to the cursor the list was created with. */
  page(cursor?: string): Promise<Page<T>> {
    const params = { ...this.#params };
    if (cursor !== undefined) params.cursor = cursor;
    return this.#fetch(params);
  }

  /** Iterate page by page. */
  async *pages(): AsyncGenerator<Page<T>, void, undefined> {
    let cursor: string | undefined = this.#params.cursor;
    for (;;) {
      const page = await this.page(cursor);
      yield page;
      if (!page.nextCursor) return;
      cursor = page.nextCursor;
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    for await (const page of this.pages()) {
      yield* page.items;
    }
  }

  /** Collect every item into an array. Stops after `max` items when given. */
  async toArray(max = Infinity): Promise<T[]> {
    const out: T[] = [];
    if (max <= 0) return out;
    for await (const item of this) {
      out.push(item);
      if (out.length >= max) break;
    }
    return out;
  }
}
