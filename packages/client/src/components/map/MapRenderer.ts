import { Application, Container, Sprite, Assets } from 'pixi.js';
import type { GridConfig } from '@livingtable/shared';
import { GridOverlay } from './GridOverlay';

export class MapRenderer {
  app: Application;
  private world: Container;
  private mapSprite: Sprite | null = null;
  private gridOverlay: GridOverlay;
  tokenLayer: Container;
  fogLayer: Container;

  private isPanning = false;
  private lastPointer = { x: 0, y: 0 };
  private spaceDown = false;
  private mapWidth = 0;
  private mapHeight = 0;

  constructor() {
    this.app = new Application();
    this.world = new Container();
    this.gridOverlay = new GridOverlay();
    this.tokenLayer = new Container();
    this.fogLayer = new Container();
  }

  async init(container: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: container,
      background: 0x111122,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    container.appendChild(this.app.canvas);

    this.app.stage.addChild(this.world);

    // Layer order: map → grid → tokens → fog
    this.world.addChild(this.gridOverlay.graphics);
    this.world.addChild(this.tokenLayer);
    this.world.addChild(this.fogLayer);

    this.setupInteraction(container);
  }

  private setupInteraction(container: HTMLElement): void {
    const canvas = this.app.canvas;

    // Zoom
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(5, this.world.scale.x * scaleFactor));

      // Zoom toward cursor
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldPosX = (mouseX - this.world.x) / this.world.scale.x;
      const worldPosY = (mouseY - this.world.y) / this.world.scale.y;

      this.world.scale.set(newScale);
      this.world.x = mouseX - worldPosX * newScale;
      this.world.y = mouseY - worldPosY * newScale;
    }, { passive: false });

    // Pan with middle mouse or space+left click
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
        this.isPanning = true;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.isPanning) {
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        this.world.x += dx;
        this.world.y += dy;
        this.lastPointer = { x: e.clientX, y: e.clientY };
      }
    });

    canvas.addEventListener('pointerup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        canvas.style.cursor = this.spaceDown ? 'grab' : 'default';
      }
    });

    // Space key for pan mode
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        this.spaceDown = true;
        canvas.style.cursor = 'grab';
      }
    });
    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        if (!this.isPanning) canvas.style.cursor = 'default';
      }
    });
  }

  async loadMap(url: string, width: number, height: number): Promise<void> {
    if (this.mapSprite) {
      this.world.removeChild(this.mapSprite);
      this.mapSprite.destroy();
    }

    const texture = await Assets.load(url);
    this.mapSprite = new Sprite(texture);
    this.mapSprite.width = width;
    this.mapSprite.height = height;
    this.mapWidth = width;
    this.mapHeight = height;

    // Insert at bottom of world (index 0)
    this.world.addChildAt(this.mapSprite, 0);
  }

  updateGrid(config: GridConfig): void {
    this.gridOverlay.update(config, this.mapWidth, this.mapHeight);
  }

  resize(): void {
    this.app.resize();
  }

  getWorldTransform() {
    return {
      x: this.world.x,
      y: this.world.y,
      scale: this.world.scale.x,
    };
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;
    return {
      x: (canvasX - this.world.x) / this.world.scale.x,
      y: (canvasY - this.world.y) / this.world.scale.y,
    };
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
