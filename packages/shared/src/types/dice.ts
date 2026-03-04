export interface DiceRoll {
  id: string;
  rollerId: string;              // user ID of the roller
  rollerName: string;            // display name
  expression: string;            // "2d6+3", "1d20", "4d6kh3"
  results: number[];             // individual die results
  modifier: number;
  total: number;
  timestamp: number;
  isPrivate: boolean;            // DM-only roll (whisper)
}
