/** Error thrown for any non-2xx API response, network failure or timeout. */
export class WuapiError extends Error {
  /** HTTP status. 0 for network errors and timeouts. */
  readonly status: number;
  /** Machine-readable code, e.g. `invalid_request`, `account_not_ready`. */
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  /** Value of the `x-request-id` response header, when present. */
  readonly requestId: string | undefined;
  /** Seconds from the `Retry-After` header, when present. */
  readonly retryAfter: number | undefined;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown> | undefined;
    requestId?: string | undefined;
    retryAfter?: number | undefined;
    cause?: unknown;
  }) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = "WuapiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
    this.retryAfter = init.retryAfter;
  }
}

/** Thrown by `verifyWebhook` when a signature is missing, malformed, wrong or stale. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}
