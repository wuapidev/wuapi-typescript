import { callOpts, type HttpClient, type Query } from "../core.js";
import { Paginator } from "../pagination.js";
import type { CallOptions, ListParams, Page } from "../types.js";

/** Shared request helpers for every resource. */
export abstract class Resource {
  protected readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  protected _get<T>(path: string, query?: Query, options?: CallOptions): Promise<T> {
    return this.http.request<T>({ method: "GET", path, query, ...callOpts(options) });
  }

  protected _post<T>(path: string, body?: unknown, options?: CallOptions): Promise<T> {
    return this.http.request<T>({ method: "POST", path, body, ...callOpts(options) });
  }

  protected _put<T>(path: string, body?: unknown, options?: CallOptions): Promise<T> {
    return this.http.request<T>({ method: "PUT", path, body, ...callOpts(options) });
  }

  protected _patch<T>(path: string, body?: unknown, options?: CallOptions): Promise<T> {
    return this.http.request<T>({ method: "PATCH", path, body, ...callOpts(options) });
  }

  protected async _delete(path: string, query?: Query, options?: CallOptions): Promise<void> {
    await this.http.request<void>({ method: "DELETE", path, query, ...callOpts(options) });
  }

  /** A list endpoint as a Paginator. `query` maps the params to query-string values. */
  protected _list<T, P extends ListParams>(
    path: string,
    params: P,
    query: (p: P) => Query = () => ({}),
    options?: CallOptions,
  ): Paginator<T, P> {
    return new Paginator<T, P>(
      (p) => this._get<Page<T>>(path, { ...query(p), limit: p.limit, cursor: p.cursor }, options),
      params,
    );
  }

  /** A batch POST that answers a list: its items. */
  protected async _items<T>(path: string, body: unknown, options?: CallOptions): Promise<T[]> {
    const res = await this._post<Page<T>>(path, body, options);
    return res.items;
  }
}
