export interface FogState {
  enabled: boolean;
  regions: FogRegion[];          // revealed regions (everything else is fogged)
}

export interface FogRegion {
  id: string;
  // Polygon defined as array of [x, y] points in map pixel coordinates
  points: [number, number][];
  revealed: boolean;             // true = players can see this area
}
