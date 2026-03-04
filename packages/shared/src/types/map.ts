export interface MapState {
  imageUrl: string | null;       // URL to the map image (relative path)
  imageWidth: number;            // natural pixel width of map image
  imageHeight: number;           // natural pixel height of map image
  grid: GridConfig;
}

export interface GridConfig {
  type: 'square' | 'hex-h' | 'hex-v' | 'none';
  cellSize: number;              // pixels per grid cell
  offsetX: number;               // pixel offset to align grid with map
  offsetY: number;
  visible: boolean;              // show/hide grid lines
  snapToGrid: boolean;           // tokens snap to grid positions
  color: string;                 // grid line color
  opacity: number;               // grid line opacity 0-1
}

export interface Viewport {
  x: number;                     // pan offset X
  y: number;                     // pan offset Y
  scale: number;                 // zoom level
}
