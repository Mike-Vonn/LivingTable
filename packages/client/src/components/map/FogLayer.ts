import { Graphics } from 'pixi.js';
import type { FogState, FogRegion } from '@livingtable/shared';

export class FogLayer {
  readonly graphics = new Graphics();
  private role: 'dm' | 'player' = 'player';
  private mapWidth = 0;
  private mapHeight = 0;
  private state: FogState = { enabled: false, regions: [] };

  setRole(role: 'dm' | 'player'): void {
    this.role = role;
    this.draw();
  }

  setMapSize(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
    this.draw();
  }

  update(state: FogState): void {
    this.state = state;
    this.draw();
  }

  addRegion(region: FogRegion): void {
    this.state.regions.push(region);
    this.draw();
  }

  removeRegion(regionId: string): void {
    this.state.regions = this.state.regions.filter((r) => r.id !== regionId);
    this.draw();
  }

  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled;
    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();

    if (!this.state.enabled || this.mapWidth === 0) return;

    const alpha = this.role === 'dm' ? 0.3 : 0.85;

    // Draw full fog coverage
    g.rect(0, 0, this.mapWidth, this.mapHeight);
    g.fill({ color: 0x000000, alpha });

    // Cut holes for revealed regions
    for (const region of this.state.regions) {
      if (!region.revealed || region.points.length < 3) continue;
      g.moveTo(region.points[0][0], region.points[0][1]);
      for (let i = 1; i < region.points.length; i++) {
        g.lineTo(region.points[i][0], region.points[i][1]);
      }
      g.closePath();
      g.cut();
    }
  }
}
