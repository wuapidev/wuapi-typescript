import { accountPath, enc } from "../core.js";
import type { Paginator } from "../pagination.js";
import type {
  BlockedContact,
  Bot,
  BusinessProfile,
  CallOptions,
  Contact,
  ContactCheck,
  ContactId,
  ContactLink,
  LinkResolveParams,
  ListParams,
  Picture,
  PictureInput,
  PrivacySettings,
  PrivacyUpdateParams,
  ProfileUpdateParams,
  ResolvedLink,
  StoryPrivacy,
} from "../types.js";
import { Resource } from "./base.js";

const contact = (accountId: string, contactId: ContactId, suffix: string) =>
  accountPath(accountId, `/contacts/${enc(contactId)}${suffix}`);

export class Contacts extends Resource {
  /** Which of these numbers (1 to 50, E.164 or digits) have WhatsApp. */
  check(accountId: string, phones: string[], options?: CallOptions): Promise<ContactCheck[]> {
    return this._items(accountPath(accountId, "/contacts/check"), { phones }, options);
  }

  /** About text, picture id, business name and device count of 1 to 50 contacts. */
  lookup(accountId: string, contactIds: ContactId[], options?: CallOptions): Promise<Contact[]> {
    return this._items(accountPath(accountId, "/contacts/lookup"), { contactIds }, options);
  }

  /** 404 `picture_not_found` when the contact has no picture this account can see. */
  getPicture(accountId: string, contactId: ContactId, params: { preview?: boolean } = {}, options?: CallOptions): Promise<Picture> {
    return this._get(contact(accountId, contactId, "/picture"), { preview: params.preview }, options);
  }

  /** 404 `business_profile_not_found` when the contact is not a WhatsApp Business account. */
  getBusinessProfile(accountId: string, contactId: ContactId, options?: CallOptions): Promise<BusinessProfile> {
    return this._get(contact(accountId, contactId, "/business-profile"), undefined, options);
  }

  /** Receive `contact.presence_updated` for this contact. */
  subscribePresence(accountId: string, contactId: ContactId, options?: CallOptions): Promise<void> {
    return this._post(contact(accountId, contactId, "/subscribe-presence"), undefined, options);
  }

  block(accountId: string, contactId: ContactId, options?: CallOptions): Promise<void> {
    return this._post(contact(accountId, contactId, "/block"), undefined, options);
  }

  unblock(accountId: string, contactId: ContactId, options?: CallOptions): Promise<void> {
    return this._post(contact(accountId, contactId, "/unblock"), undefined, options);
  }

  listBlocked(accountId: string, params: ListParams = {}, options?: CallOptions): Paginator<BlockedContact, ListParams> {
    return this._list(accountPath(accountId, "/blocklist"), params, undefined, options);
  }

  /** The account's own contact QR link. */
  getLink(accountId: string, options?: CallOptions): Promise<ContactLink> {
    return this._get(accountPath(accountId, "/contact-link"), undefined, options);
  }

  /** Revoke the contact link and return a new one. */
  resetLink(accountId: string, options?: CallOptions): Promise<ContactLink> {
    return this._post(accountPath(accountId, "/contact-link/reset"), undefined, options);
  }

  /** Who a contact QR link or a business message link points to. */
  resolveLink(accountId: string, params: LinkResolveParams, options?: CallOptions): Promise<ResolvedLink> {
    return this._post(accountPath(accountId, "/links/resolve"), params, options);
  }
}

export class Bots extends Resource {
  /** WhatsApp's AI bot directory as the account sees it. */
  list(accountId: string, params: ListParams = {}, options?: CallOptions): Paginator<Bot, ListParams> {
    return this._list(accountPath(accountId, "/bots"), params, undefined, options);
  }
}

export class Profile extends Resource {
  /** The linked number's About text and display name. */
  update(accountId: string, params: ProfileUpdateParams, options?: CallOptions): Promise<void> {
    return this._patch(accountPath(accountId, "/profile"), params, options);
  }

  /** JPEG, from an https URL or base64. */
  setPicture(accountId: string, picture: PictureInput, options?: CallOptions): Promise<Picture> {
    return this._put(accountPath(accountId, "/profile/picture"), picture, options);
  }

  deletePicture(accountId: string, options?: CallOptions): Promise<void> {
    return this._delete(accountPath(accountId, "/profile/picture"), undefined, options);
  }
}

export class Privacy extends Resource {
  get(accountId: string, options?: CallOptions): Promise<PrivacySettings> {
    return this._get(accountPath(accountId, "/privacy"), undefined, options);
  }

  /** Change one or more settings. Returns every setting after the change. */
  update(accountId: string, params: PrivacyUpdateParams, options?: CallOptions): Promise<PrivacySettings> {
    return this._patch(accountPath(accountId, "/privacy"), params, options);
  }

  /** Who sees the account's stories. */
  getStoryPrivacy(accountId: string, options?: CallOptions): Promise<StoryPrivacy> {
    return this._get(accountPath(accountId, "/privacy/stories"), undefined, options);
  }
}
