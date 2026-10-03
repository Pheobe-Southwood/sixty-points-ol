import type { PersonalView } from '@sixty/engine';

export interface SeatInfo {
  readonly seat: number;
  readonly userId: number | null;
  readonly name: string | null;
  readonly online: boolean;
}

export interface TableView {
  readonly code: string;
  readonly seats: readonly SeatInfo[];
  readonly seatedCount: number;
  readonly ready: boolean;
}

export interface StreamPayload {
  readonly view: PersonalView | null;
  readonly table: TableView;
}
