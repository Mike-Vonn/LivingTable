import { Graphics } from 'pixi.js';
import type { GridConfig } from '@livingtable/shared';

export class GridOverlay {
  readonly graphics = new Graphics();
  private config: GridConfig | null = null;
  private mapWidth = 0;
  private mapHeight = 0;

  update(config: GridConfig, mapWidth: number, mapHeight: number): void {
    this.config = config;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();

    if (!this.config || !this.config.visible || this.config.type === 'none') return;
    if (this.mapWidth === 0 || this.mapHeight === 0) return;

    const { cellSize, offsetX, offsetY, color, opacity } = this.config;
    const c = parseInt(color.replace('#', ''), 16);

    if (this.config.type === 'square') {
      this.drawSquareGrid(g, c, opacity, cellSize, offsetX, offsetY);
    } else if (this.config.type === 'hex-h' || this.config.type === 'hex-v') {
      // Hex grid — simplified flat-top hex
      this.drawSquareGrid(g, c, opacity, cellSize, offsetX, offsetY); // fallback for now
    }
  }

  private drawSquareGrid(
    g: Graphics, color: number, opacity: number,
    cellSize: number, offsetX: number, offsetY: number,
  ): void {
    g.setStrokeStyle({ width: 1, color, alpha: opacity });

    // Vertical lines
    for (let x = offsetX; x <= this.mapWidth; x += cellSize) {
      g.moveTo(x, 0);
      g.lineTo(x, this.mapHeight);
    }
    // Negative offset vertical lines
    for (let x = offsetX - cellSize; x >= 0; x -= cellSize) {
      g.moveTo(x, 0);
      g.lineTo(x, this.mapHeight);
    }

    // Horizontal lines
    for (let y = offsetY; y <= this.mapHeight; y += cellSize) {
      g.moveTo(0, y);
      g.lineTo(this.mapWidth, y);
    }
    // Negative offset horizontal lines
    for (let y = offsetY - cellSize; y >= 0; y -= cellSize) {
      g.moveTo(0, y);
      g.lineTo(this.mapWidth, y);
    }

    g.stroke();
  }
}
