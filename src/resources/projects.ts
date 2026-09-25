import { enc, type HttpClient } from "../core.js";
import type { Paginator } from "../pagination.js";
import type {
  ApiKey,
  ApiKeyCreateParams,
  Branding,
  BrandingUpdateParams,
  CallOptions,
  Invitation,
  InvitationCreateParams,
  InvitationListParams,
  ListParams,
  MonthParams,
  Project,
  ProjectCreateParams,
  ProjectListFilter,
  ProjectListParams,
  ProjectUpdateParams,
  ProjectUsage,
  Usage,
  UsageReport,
  WebhookEndpoint,
  WebhookEndpointCreateParams,
  WebhookEndpointUpdateParams,
} from "../types.js";
import { Resource } from "./base.js";

const project = (projectId: string, suffix = "") => `/v1/projects/${enc(projectId)}${suffix}`;

/** A project's API keys. Organization keys only. */
export class ProjectApiKeys extends Resource {
  list(projectId: string, params: ListParams = {}, options?: CallOptions): Paginator<ApiKey, ListParams> {
    return this._list(project(projectId, "/api-keys"), params, undefined, options);
  }

  /** A key that reaches only this project. `key` is returned only here. */
  create(projectId: string, params: ApiKeyCreateParams, options?: CallOptions): Promise<ApiKey> {
    return this._post(project(projectId, "/api-keys"), params, options);
  }

  revoke(projectId: string, apiKeyId: string, options?: CallOptions): Promise<void> {
    return this._delete(project(projectId, `/api-keys/${enc(apiKeyId)}`), undefined, options);
  }
}

/**
 * Projects isolate a platform's customers: each has its own accounts, keys,
 * webhook endpoints and usage. Organization keys only. `projectId` accepts
 * `ext:<externalId>`.
 */
export class Projects extends Resource {
  readonly apiKeys: ProjectApiKeys;

  constructor(http: HttpClient) {
    super(http);
    this.apiKeys = new ProjectApiKeys(http);
  }

  list(params: ProjectListFilter = {}, options?: CallOptions): Paginator<Project, ProjectListFilter> {
    return this._list("/v1/projects", params, (p) => ({ externalId: p.externalId, status: p.status }), options);
  }

  /** Fires `project.created`. 409 `already_exists` on a duplicate `externalId`. */
  create(params: ProjectCreateParams, options?: CallOptions): Promise<Project> {
    return this._post("/v1/projects", params, options);
  }

  get(projectId: string, options?: CallOptions): Promise<Project> {
    return this._get(project(projectId), undefined, options);
  }

  /** Rename, relabel, change the limit, or suspend (`status: "suspended"`) and resume. */
  update(projectId: string, params: ProjectUpdateParams, options?: CallOptions): Promise<Project> {
    return this._patch(project(projectId), params, options);
  }

  /** The project is gone at once; its accounts are logged out in the background, then `project.deleted` fires. */
  delete(projectId: string, options?: CallOptions): Promise<void> {
    return this._delete(project(projectId), undefined, options);
  }

  getUsage(projectId: string, params: MonthParams = {}, options?: CallOptions): Promise<ProjectUsage> {
    return this._get(project(projectId, "/usage"), { month: params.month }, options);
  }
}

export class Invitations extends Resource {
  /**
   * A branded page (`url`) where someone else links their own WhatsApp into
   * your project. `url` is returned only here and by `resend`.
   */
  create(params: InvitationCreateParams = {}, options?: CallOptions): Promise<Invitation> {
    return this._post("/v1/invitations", params, options);
  }

  list(params: InvitationListParams = {}, options?: CallOptions): Paginator<Invitation, InvitationListParams> {
    return this._list("/v1/invitations", params, (p) => ({ status: p.status, projectId: p.projectId }), options);
  }

  get(invitationId: string, options?: CallOptions): Promise<Invitation> {
    return this._get(`/v1/invitations/${enc(invitationId)}`, undefined, options);
  }

  /** The link stops working. 409 `already_completed` if completed. */
  cancel(invitationId: string, options?: CallOptions): Promise<Invitation> {
    return this._post(`/v1/invitations/${enc(invitationId)}/cancel`, undefined, options);
  }

  /** New token and `url` (the old one stops working), new expiry, email sent again. */
  resend(invitationId: string, options?: CallOptions): Promise<Invitation> {
    return this._post(`/v1/invitations/${enc(invitationId)}/resend`, undefined, options);
  }
}

export class WebhookEndpoints extends Resource {
  list(params: ProjectListParams = {}, options?: CallOptions): Paginator<WebhookEndpoint, ProjectListParams> {
    return this._list("/v1/webhook-endpoints", params, (p) => ({ projectId: p.projectId }), options);
  }

  /** `secret` is returned only here and by `rotateSecret`. */
  create(params: WebhookEndpointCreateParams, options?: CallOptions): Promise<WebhookEndpoint> {
    return this._post("/v1/webhook-endpoints", params, options);
  }

  get(webhookEndpointId: string, options?: CallOptions): Promise<WebhookEndpoint> {
    return this._get(`/v1/webhook-endpoints/${enc(webhookEndpointId)}`, undefined, options);
  }

  update(webhookEndpointId: string, params: WebhookEndpointUpdateParams, options?: CallOptions): Promise<WebhookEndpoint> {
    return this._patch(`/v1/webhook-endpoints/${enc(webhookEndpointId)}`, params, options);
  }

  delete(webhookEndpointId: string, options?: CallOptions): Promise<void> {
    return this._delete(`/v1/webhook-endpoints/${enc(webhookEndpointId)}`, undefined, options);
  }

  /** New signing secret; the old one stops working at once. */
  rotateSecret(webhookEndpointId: string, options?: CallOptions): Promise<WebhookEndpoint> {
    return this._post(`/v1/webhook-endpoints/${enc(webhookEndpointId)}/rotate-secret`, undefined, options);
  }
}

/** What the invitation page and email show. Organization keys only. */
export class BrandingResource extends Resource {
  get(options?: CallOptions): Promise<Branding> {
    return this._get("/v1/branding", undefined, options);
  }

  update(params: BrandingUpdateParams, options?: CallOptions): Promise<Branding> {
    return this._patch("/v1/branding", params, options);
  }
}

/** Billable usage. Organization keys only. */
export class UsageResource extends Resource {
  /** The current calendar month (UTC). */
  get(options?: CallOptions): Promise<Usage> {
    return this._get("/v1/usage", undefined, options);
  }

  /** The rebilling export: one line per project, plus unassigned resources and totals. */
  byProject(params: MonthParams = {}, options?: CallOptions): Promise<UsageReport> {
    return this._get("/v1/usage/by-project", { month: params.month }, options);
  }
}
