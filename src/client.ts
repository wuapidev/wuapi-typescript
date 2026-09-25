import { callOpts, HttpClient, type ClientOptions } from "./core.js";
import { Accounts, ProxyLocations } from "./resources/accounts.js";
import { Channels } from "./resources/channels.js";
import { Chats, Labels } from "./resources/chats.js";
import { Bots, Contacts, Privacy, Profile } from "./resources/contacts.js";
import { Groups } from "./resources/groups.js";
import { Messages, Stories } from "./resources/messages.js";
import { Calls, Orders, StickerPacks } from "./resources/misc.js";
import { BrandingResource, Invitations, Projects, UsageResource, WebhookEndpoints } from "./resources/projects.js";
import type { AuthContext, CallOptions } from "./types.js";

export class Wuapi {
  readonly accounts: Accounts;
  readonly proxyLocations: ProxyLocations;
  readonly messages: Messages;
  readonly chats: Chats;
  readonly stories: Stories;
  readonly contacts: Contacts;
  readonly bots: Bots;
  readonly profile: Profile;
  readonly privacy: Privacy;
  readonly labels: Labels;
  readonly calls: Calls;
  readonly stickerPacks: StickerPacks;
  readonly orders: Orders;
  readonly groups: Groups;
  readonly channels: Channels;
  readonly webhookEndpoints: WebhookEndpoints;
  readonly projects: Projects;
  readonly invitations: Invitations;
  readonly branding: BrandingResource;
  readonly usage: UsageResource;
  readonly #http: HttpClient;

  constructor(options: ClientOptions = {}) {
    const http = options instanceof HttpClient ? options : new HttpClient(options);
    this.#http = http;
    this.accounts = new Accounts(http);
    this.proxyLocations = new ProxyLocations(http);
    this.messages = new Messages(http);
    this.chats = new Chats(http);
    this.stories = new Stories(http);
    this.contacts = new Contacts(http);
    this.bots = new Bots(http);
    this.profile = new Profile(http);
    this.privacy = new Privacy(http);
    this.labels = new Labels(http);
    this.calls = new Calls(http);
    this.stickerPacks = new StickerPacks(http);
    this.orders = new Orders(http);
    this.groups = new Groups(http);
    this.channels = new Channels(http);
    this.webhookEndpoints = new WebhookEndpoints(http);
    this.projects = new Projects(http);
    this.invitations = new Invitations(http);
    this.branding = new BrandingResource(http);
    this.usage = new UsageResource(http);
  }

  get baseUrl(): string {
    return this.#http.baseUrl;
  }

  /** The project this client is scoped to (`Wuapi-Project`), if any. */
  get project(): string | undefined {
    return this.#http.project;
  }

  /**
   * A client scoped to one project (its id or `ext:<externalId>`), sharing this
   * client's key and configuration. Every request carries `Wuapi-Project`.
   *
   * ```ts
   * const northwind = wuapi.withProject("ext:customer_8812");
   * await northwind.accounts.create({ proxyLocation: { country: "US", city: "newyorkcity" }, name: "Front desk" }); // lands in that project
   * ```
   */
  withProject(project: string): Wuapi {
    return new Wuapi(this.#http.withProject(project) as unknown as ClientOptions);
  }

  /** The organization, API key and project scope behind the current token. */
  me(options?: CallOptions): Promise<AuthContext> {
    return this.#http.request<AuthContext>({ method: "GET", path: "/v1/me", ...callOpts(options) });
  }
}
