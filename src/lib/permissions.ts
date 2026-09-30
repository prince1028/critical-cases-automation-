import type { CaseStatus } from '@/db/schema';

interface Actor {
  role: 'SALES' | 'MANAGER' | 'ADMIN';
  team: string | null;
}

/** "Supply", "Supply Team", "supply chain"... any team name containing the word "supply". */
export function isSupplyTeam(team: string | null | undefined): boolean {
  return !!team && /\bsupply\b/i.test(team);
}

/** Who may change a case's status (start work, resolve, close, reopen): the Supply team and admins. */
export function canManageCases(user: Actor): boolean {
  return user.role === 'ADMIN' || isSupplyTeam(user.team);
}

/** Who may browse every case (not just their own). */
export function canSeeAllCases(user: Actor): boolean {
  return user.role === 'MANAGER' || canManageCases(user);
}

export type StatusAction = 'START' | 'RESOLVE' | 'CLOSE' | 'REOPEN';

export const STATUS_ACTIONS: Record<StatusAction, { to: CaseStatus; label: string; noteLabel: string; noteRequired: boolean }> = {
  START: { to: 'IN_PROGRESS', label: 'Start working', noteLabel: 'Note (optional)', noteRequired: false },
  RESOLVE: { to: 'RESOLVED', label: 'Resolve case', noteLabel: 'How was it resolved?', noteRequired: true },
  CLOSE: { to: 'CANCELLED', label: 'Close case', noteLabel: 'Why is it being closed without a resolution?', noteRequired: true },
  REOPEN: { to: 'IN_PROGRESS', label: 'Reopen case', noteLabel: 'Why is it being reopened?', noteRequired: true },
};

/** Allowed actions from each status. */
export function allowedActions(status: CaseStatus): StatusAction[] {
  switch (status) {
    case 'NEW':
      return ['START', 'RESOLVE', 'CLOSE'];
    case 'IN_PROGRESS':
      return ['RESOLVE', 'CLOSE'];
    case 'RESOLVED':
    case 'CANCELLED':
      return ['REOPEN'];
  }
}
