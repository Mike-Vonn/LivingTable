import { GridConfig } from '../types/map.js';

export const DEFAULT_GRID: GridConfig = {
  type: 'square',
  cellSize: 70,
  offsetX: 0,
  offsetY: 0,
  visible: true,
  snapToGrid: true,
  color: '#000000',
  opacity: 0.2,
};
