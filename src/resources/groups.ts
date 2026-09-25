import { accountPath, enc } from "../core.js";
import type { Paginator } from "../pagination.js";
import type {
  CallOptions,
  CommunityParticipant,
  ContactId,
  Group,
  GroupCreateParams,
  GroupInviteLink,
  GroupJoin,
  GroupJoinRequest,
  GroupUpdateParams,
  ListParams,
  ParticipantResult,
  Picture,
  PictureInput,
  Subgroup,
} from "../types.js";
import { Resource } from "./base.js";

const groups = (accountId: string, suffix = "") => accountPath(accountId, `/groups${suffix}`);
const group = (accountId: string, groupId: string, suffix = "") => groups(accountId, `/${enc(groupId)}${suffix}`);

export class Groups extends Resource {
  /** Every group of the account, read live from WhatsApp. */
  list(accountId: string, params: ListParams = {}, options?: CallOptions): Paginator<Group, ListParams> {
    return this._list(groups(accountId), params, undefined, options);
  }

  /** Create a group, or a community with `community: true` (participants optional then). */
  create(accountId: string, params: GroupCreateParams, options?: CallOptions): Promise<Group> {
    return this._post(groups(accountId), params, options);
  }

  get(accountId: string, groupId: string, options?: CallOptions): Promise<Group> {
    return this._get(group(accountId, groupId), undefined, options);
  }

  update(accountId: string, groupId: string, params: GroupUpdateParams, options?: CallOptions): Promise<Group> {
    return this._patch(group(accountId, groupId), params, options);
  }

  leave(accountId: string, groupId: string, options?: CallOptions): Promise<void> {
    return this._post(group(accountId, groupId, "/leave"), undefined, options);
  }

  addParticipants(accountId: string, groupId: string, contactIds: ContactId[], options?: CallOptions): Promise<ParticipantResult[]> {
    return this._items(group(accountId, groupId, "/participants/add"), { contactIds }, options);
  }

  removeParticipants(accountId: string, groupId: string, contactIds: ContactId[], options?: CallOptions): Promise<ParticipantResult[]> {
    return this._items(group(accountId, groupId, "/participants/remove"), { contactIds }, options);
  }

  promoteParticipants(accountId: string, groupId: string, contactIds: ContactId[], options?: CallOptions): Promise<ParticipantResult[]> {
    return this._items(group(accountId, groupId, "/participants/promote"), { contactIds }, options);
  }

  demoteParticipants(accountId: string, groupId: string, contactIds: ContactId[], options?: CallOptions): Promise<ParticipantResult[]> {
    return this._items(group(accountId, groupId, "/participants/demote"), { contactIds }, options);
  }

  getInviteLink(accountId: string, groupId: string, options?: CallOptions): Promise<GroupInviteLink> {
    return this._get(group(accountId, groupId, "/invite-link"), undefined, options);
  }

  /** Revoke the invite link and return a new one. */
  resetInviteLink(accountId: string, groupId: string, options?: CallOptions): Promise<GroupInviteLink> {
    return this._post(group(accountId, groupId, "/invite-link/reset"), undefined, options);
  }

  /** Join by invite code or full `https://chat.whatsapp.com/…` link. */
  join(accountId: string, code: string, options?: CallOptions): Promise<GroupJoin> {
    return this._post(groups(accountId, "/join"), { code }, options);
  }

  /** The group behind an invite code, without joining. */
  getInvite(accountId: string, code: string, options?: CallOptions): Promise<Group> {
    return this._get(groups(accountId, `/invites/${enc(code)}`), undefined, options);
  }

  /** JPEG. Admins only. */
  setPicture(accountId: string, groupId: string, picture: PictureInput, options?: CallOptions): Promise<Picture> {
    return this._put(group(accountId, groupId, "/picture"), picture, options);
  }

  deletePicture(accountId: string, groupId: string, options?: CallOptions): Promise<void> {
    return this._delete(group(accountId, groupId, "/picture"), undefined, options);
  }

  listJoinRequests(accountId: string, groupId: string, params: ListParams = {}, options?: CallOptions): Paginator<GroupJoinRequest, ListParams> {
    return this._list(group(accountId, groupId, "/join-requests"), params, undefined, options);
  }

  approveJoinRequests(accountId: string, groupId: string, contactIds: ContactId[], options?: CallOptions): Promise<ParticipantResult[]> {
    return this._items(group(accountId, groupId, "/join-requests/approve"), { contactIds }, options);
  }

  rejectJoinRequests(accountId: string, groupId: string, contactIds: ContactId[], options?: CallOptions): Promise<ParticipantResult[]> {
    return this._items(group(accountId, groupId, "/join-requests/reject"), { contactIds }, options);
  }

  /** The groups linked to a community. */
  listSubgroups(accountId: string, communityId: string, params: ListParams = {}, options?: CallOptions): Paginator<Subgroup, ListParams> {
    return this._list(group(accountId, communityId, "/subgroups"), params, undefined, options);
  }

  linkSubgroup(accountId: string, communityId: string, groupId: string, options?: CallOptions): Promise<void> {
    return this._post(group(accountId, communityId, "/subgroups"), { groupId }, options);
  }

  unlinkSubgroup(accountId: string, communityId: string, subgroupId: string, options?: CallOptions): Promise<void> {
    return this._delete(group(accountId, communityId, `/subgroups/${enc(subgroupId)}`), undefined, options);
  }

  /** Members across a community's linked groups. */
  listCommunityParticipants(
    accountId: string,
    communityId: string,
    params: ListParams = {},
    options?: CallOptions,
  ): Paginator<CommunityParticipant, ListParams> {
    return this._list(group(accountId, communityId, "/community-participants"), params, undefined, options);
  }
}
