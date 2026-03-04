export interface InitiativeEntry {
  id: string;                    // matches a token ID
  name: string;
  initiative: number;
  isActive: boolean;             // whose turn it is
  isNPC: boolean;                // DM-controlled
  hp?: { current: number; max: number };
}

export interface InitiativeState {
  entries: InitiativeEntry[];
  round: number;
  active: boolean;               // is initiative tracking active
  currentIndex: number;          // index into sorted entries array
}
