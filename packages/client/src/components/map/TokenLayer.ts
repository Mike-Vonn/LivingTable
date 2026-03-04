import { Container, Graphics, Text } from 'pixi.js';
import type { Token, GridConfig } from '@livingtable/shared';
import type { Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@livingtable/shared';

interface TokenSprite {
  container: Container;
  token: Token;
}

export class TokenLayer {
  readonly container: Container;
  private tokenSprites = new Map<string, TokenSprite>();
  private gridConfig: GridConfig | null = null;
  private socket: Socket | null = null;
  private userId: string | null = null;
  private role: 'dm' | 'player' | null = null;
  private worldContainer: Container | null = null;
  private onContextMenu: ((token: Token, screenX: number, screenY: number) => void) | null = null;

  constructor(parentContainer: Container) {
    this.container = parentContainer;
  }

  setSocket(socket: Socket | null): void {
    this.socket = socket;
  }

  setUser(userId: string, role: 'dm' | 'player'): void {
    this.userId = userId;
    this.role = role;
  }

  setWorldContainer(world: Container): void {
    this.worldContainer = world;
  }

  setContextMenuHandler(handler: (token: Token, screenX: number, screenY: number) => void): void {
    this.onContextMenu = handler;
  }

  updateGrid(config: GridConfig): void {
    this.gridConfig = config;
    // Reposition existing tokens
    for (const ts of this.tokenSprites.values()) {
      this.positionToken(ts);
    }
  }

  syncTokens(tokens: Token[]): void {
    const currentIds = new Set(tokens.map((t) => t.id));

    // Remove deleted tokens
    for (const [id, ts] of this.tokenSprites) {
      if (!currentIds.has(id)) {
        this.container.removeChild(ts.container);
        ts.container.destroy({ children: true });
        this.tokenSprites.delete(id);
      }
    }

    // Add/update tokens
    for (const token of tokens) {
      const existing = this.tokenSprites.get(token.id);
      if (existing) {
        existing.token = token;
        this.updateTokenVisual(existing);
        this.positionToken(existing);
      } else {
        this.addToken(token);
      }
    }
  }

  addToken(token: Token): void {
    // Visibility check for players
    if (this.role === 'player' && !token.visible) return;

    const c = new Container();
    c.eventMode = 'static';
    c.cursor = 'pointer';

    const ts: TokenSprite = { container: c, token };
    this.drawToken(ts);
    this.positionToken(ts);
    this.setupDrag(ts);

    this.container.addChild(c);
    this.tokenSprites.set(token.id, ts);
  }

  moveToken(tokenId: string, x: number, y: number): void {
    const ts = this.tokenSprites.get(tokenId);
    if (!ts) return;
    ts.token = { ...ts.token, x, y };
    this.positionToken(ts);
  }

  updateToken(token: Token): void {
    // Handle visibility for players
    if (this.role === 'player' && !token.visible) {
      this.removeToken(token.id);
      return;
    }

    const existing = this.tokenSprites.get(token.id);
    if (existing) {
      existing.token = token;
      this.updateTokenVisual(existing);
      this.positionToken(existing);
    } else {
      this.addToken(token);
    }
  }

  removeToken(tokenId: string): void {
    const ts = this.tokenSprites.get(tokenId);
    if (!ts) return;
    this.container.removeChild(ts.container);
    ts.container.destroy({ children: true });
    this.tokenSprites.delete(tokenId);
  }

  private positionToken(ts: TokenSprite): void {
    const cellSize = this.gridConfig?.cellSize ?? 70;
    ts.container.x = ts.token.x * cellSize;
    ts.container.y = ts.token.y * cellSize;
  }

  private drawToken(ts: TokenSprite): void {
    const cellSize = this.gridConfig?.cellSize ?? 70;
    const size = cellSize * ts.token.width;
    const radius = size / 2;

    // Circle
    const bg = new Graphics();
    const color = parseInt(ts.token.color.replace('#', ''), 16);
    bg.circle(radius, radius, radius - 2);
    bg.fill({ color, alpha: ts.token.visible || this.role === 'dm' ? 1 : 0.5 });
    bg.stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    ts.container.addChild(bg);

    // Label
    const label = new Text({
      text: ts.token.label || ts.token.name.slice(0, 2),
      style: { fontSize: Math.max(10, radius * 0.7), fill: 0xffffff, fontWeight: 'bold' },
    });
    label.anchor.set(0.5);
    label.x = radius;
    label.y = radius;
    ts.container.addChild(label);

    // HP bar
    if (ts.token.hp) {
      const barWidth = size - 8;
      const barHeight = 4;
      const hpRatio = ts.token.hp.current / ts.token.hp.max;
      const hpBar = new Graphics();
      hpBar.rect(4, size - 6, barWidth, barHeight);
      hpBar.fill({ color: 0x333333, alpha: 0.8 });
      hpBar.rect(4, size - 6, barWidth * Math.max(0, hpRatio), barHeight);
      hpBar.fill({ color: hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444 });
      ts.container.addChild(hpBar);
    }

    // DM invisible indicator
    if (!ts.token.visible && this.role === 'dm') {
      ts.container.alpha = 0.5;
    }
  }

  private updateTokenVisual(ts: TokenSprite): void {
    // Rebuild visual
    while (ts.container.children.length > 0) {
      ts.container.children[0].destroy({ children: true });
    }
    this.drawToken(ts);
  }

  private setupDrag(ts: TokenSprite): void {
    let dragging = false;
    let dragStart = { x: 0, y: 0 };

    ts.container.on('pointerdown', (e) => {
      if (e.button === 2) {
        // Right-click context menu
        if (this.onContextMenu) {
          this.onContextMenu(ts.token, e.globalX, e.globalY);
        }
        return;
      }
      if (e.button !== 0) return;

      // Permission check
      const canDrag = this.role === 'dm' || ts.token.controlledBy === this.userId;
      if (!canDrag) return;

      dragging = true;
      dragStart = { x: e.globalX, y: e.globalY };
      e.stopPropagation();
    });

    ts.container.on('globalpointermove', (e) => {
      if (!dragging || !this.worldContainer) return;
      const scale = this.worldContainer.scale.x;
      ts.container.x += (e.globalX - dragStart.x) / scale;
      ts.container.y += (e.globalY - dragStart.y) / scale;
      dragStart = { x: e.globalX, y: e.globalY };
    });

    ts.container.on('pointerup', () => {
      if (!dragging) return;
      dragging = false;

      const cellSize = this.gridConfig?.cellSize ?? 70;
      let x = ts.container.x / cellSize;
      let y = ts.container.y / cellSize;

      if (this.gridConfig?.snapToGrid) {
        x = Math.round(x);
        y = Math.round(y);
      }

      ts.token = { ...ts.token, x, y };
      this.positionToken(ts);

      if (this.socket) {
        this.socket.emit(SOCKET_EVENTS.TOKEN_MOVE, { tokenId: ts.token.id, x, y });
      }
    });

    ts.container.on('pointerupoutside', () => {
      if (dragging) {
        dragging = false;
        const cellSize = this.gridConfig?.cellSize ?? 70;
        let x = ts.container.x / cellSize;
        let y = ts.container.y / cellSize;
        if (this.gridConfig?.snapToGrid) { x = Math.round(x); y = Math.round(y); }
        ts.token = { ...ts.token, x, y };
        this.positionToken(ts);
        if (this.socket) {
          this.socket.emit(SOCKET_EVENTS.TOKEN_MOVE, { tokenId: ts.token.id, x, y });
        }
      }
    });
  }
}
