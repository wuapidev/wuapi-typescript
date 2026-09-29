// Copied by wuapi-codegen from packages/sdk-codegen/templates/typescript/src/resources/base.ts. Do not edit here.

import { callOpts, type CallOptions, type HttpClient, type HttpMethod, type Query } from "../core.js";
import { Paginator, type ListParams, type Page } from "../pagination.js";

/** What a generated method sends besides its method and path. */
export interface RequestParts {
  query?: Query;
  body?: unknown;
  /** The operation accepts an idempotency key. */
  idempotent?: boolean;
}

/** Shared request helpers for every resource. */
export abstract class Resource {
  protected readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  protected _request<T>(
    method: HttpMethod,
    path: string,
    parts: RequestParts,
    options: CallOptions | undefined,
  ): Promise<T> {
    return this.http.request<T>({ method, path, ...parts, ...callOpts(options) });
  }

  /** A list endpoint as a Paginator. `query` maps the params to query-string values. */
  protected _list<T, P extends ListParams>(
    path: string,
    params: P,
    query: (p: P) => Query,
    options: CallOptions | undefined,
  ): Paginator<T, P> {
    return new Paginator<T, P>((p) => this._request<Page<T>>("GET", path, { query: query(p) }, options), params);
  }
}
