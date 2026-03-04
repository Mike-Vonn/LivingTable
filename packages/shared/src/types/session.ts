import { MapState } from './map.js';
import { Token } from './token.js';
import { FogState } from './fog.js';
import { InitiativeState } from './initiative.js';
import { DiceRoll } from './dice.js';

export interface SessionState {
  id: string;
  campaignId: string;            // which campaign this session belongs to
  name: string;
  map: MapState;
  tokens: Token[];
  fog: FogState;
  initiative: InitiativeState;
  diceHistory: DiceRoll[];       // last N rolls
  createdAt: string;             // ISO timestamp
  updatedAt: string;
}
