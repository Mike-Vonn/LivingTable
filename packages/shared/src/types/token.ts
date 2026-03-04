export interface Token {
  id: string;
  name: string;
  type: 'pc' | 'npc' | 'monster' | 'object';
  x: number;                    // grid position (column)
  y: number;                    // grid position (row)
  width: number;                // grid cells wide (default 1)
  height: number;               // grid cells tall (default 1)
  imageUrl: string | null;      // token image URL, null = colored circle
  color: string;                // fallback color if no image: hex string
  label: string;                // short label displayed on token
  visible: boolean;             // DM can toggle; hidden tokens not shown to players
  conditions: string[];         // status conditions displayed as icons
  hp?: { current: number; max: number };
  initiative?: number;
  notes: string;                // DM notes
  controlledBy: 'dm' | string;  // 'dm' or user ID who can move this token
}
