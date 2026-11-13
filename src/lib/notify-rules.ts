import { canManageCases, isListingTeam, isSupplyTeam } from './permissions';

/** Who should hear about what. Pure functions over plain data, so the rules can be unit-tested. */
export interface Person {
  id: string;
  team: string | null;
  role: 'SALES' | 'MANAGER' | 'ADMIN';
  active: boolean;
}

export interface CaseParties {
  reporterId: string | null;
  assigneeId: string | null;
  /** Everyone who has done something on the case (reported, posted, changed status, listed, added photos). */
  participantIds: string[];
  awaitingListing: boolean;
}

const unique = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((x): x is string => !!x))];
const activeIds = (people: Person[], keep: (p: Person) => boolean) => people.filter((p) => p.active && keep(p)).map((p) => p.id);

/** New case: the Supply team, plus the Listing team when the tile isn't in the item sheet. Never the reporter. */
export function newCaseRecipients(people: Person[], c: CaseParties): string[] {
  const ids = activeIds(people, (p) => isSupplyTeam(p.team) || (c.awaitingListing && isListingTeam(p.team)));
  return unique(ids).filter((id) => id !== c.reporterId);
}

/**
 * New message: everyone already involved in the case, except the sender. If nobody from the handling side
 * (Supply team / admins) is involved yet, the whole Supply team hears it, and the Listing team too while
 * the tile still needs listing, so a salesperson's first question never goes unseen.
 */
export function messageRecipients(people: Person[], c: CaseParties, senderId: string): string[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const involved = unique([c.reporterId, c.assigneeId, ...c.participantIds]);
  const handlerInvolved = involved.some((id) => {
    const p = byId.get(id);
    return p && id !== c.reporterId && canManageCases(p);
  });
  const listingInvolved = involved.some((id) => isListingTeam(byId.get(id)?.team));
  const extra = [
    ...(handlerInvolved ? [] : activeIds(people, (p) => isSupplyTeam(p.team))),
    ...(c.awaitingListing && !listingInvolved ? activeIds(people, (p) => isListingTeam(p.team)) : []),
  ];
  return unique([...involved, ...extra]).filter((id) => id !== senderId && byId.get(id)?.active !== false);
}

/** Status change or listing thumbs up: the reporter and whoever handles the case, except the person who did it. */
export function updateRecipients(people: Person[], c: CaseParties, actorId: string): string[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return unique([c.reporterId, c.assigneeId]).filter((id) => id !== actorId && byId.get(id)?.active !== false);
}
