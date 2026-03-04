import React, { useRef, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { MapRenderer } from './MapRenderer';
import { TokenLayer } from './TokenLayer';
import { FogLayer } from './FogLayer';
import { useGameStore } from '../../state/gameStore';
import { useAuth } from '../../hooks/useAuth';

interface MapCanvasProps {
  rendererRef: React.MutableRefObject<MapRenderer | null>;
  socket: Socket | null;
}

export function MapCanvas({ rendererRef, socket }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tokenLayerRef = useRef<TokenLayer | null>(null);
  const fogLayerRef = useRef<FogLayer | null>(null);
  const session = useGameStore((s) => s.session);
  const tokens = useGameStore((s) => s.session?.tokens ?? []);
  const fog = useGameStore((s) => s.session?.fog);
  const grid = useGameStore((s) => s.session?.map.grid);
  const { user, role } = useAuth();

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new MapRenderer();
    rendererRef.current = renderer;

    const tl = new TokenLayer(renderer.tokenLayer);
    tokenLayerRef.current = tl;

    const fl = new FogLayer();
    fogLayerRef.current = fl;

    renderer.init(containerRef.current).then(() => {
      // Add fog graphics to the fog layer container
      renderer.fogLayer.addChild(fl.graphics);

      // Set up token layer
      tl.setWorldContainer(renderer.app.stage.children[0] as any);
      if (user && role) {
        tl.setUser(user.id, role as 'dm' | 'player');
      }
      tl.setSocket(socket);

      // Set fog role
      fl.setRole((role as 'dm' | 'player') || 'player');

      // Load initial state
      if (session?.map.imageUrl) {
        renderer.loadMap(session.map.imageUrl, session.map.imageWidth, session.map.imageHeight).then(() => {
          fl.setMapSize(session.map.imageWidth, session.map.imageHeight);
        });
      }
      if (session?.map.grid) {
        renderer.updateGrid(session.map.grid);
        tl.updateGrid(session.map.grid);
      }
      if (session?.tokens) {
        tl.syncTokens(session.tokens);
      }
      if (session?.fog) {
        fl.update(session.fog);
      }
    });

    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      renderer.destroy();
      rendererRef.current = null;
      tokenLayerRef.current = null;
      fogLayerRef.current = null;
    };
  }, []);

  // Sync socket
  useEffect(() => {
    tokenLayerRef.current?.setSocket(socket);
  }, [socket]);

  // Sync tokens
  useEffect(() => {
    tokenLayerRef.current?.syncTokens(tokens);
  }, [tokens]);

  // Sync map image
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !session?.map.imageUrl) return;
    renderer.loadMap(session.map.imageUrl, session.map.imageWidth, session.map.imageHeight).then(() => {
      fogLayerRef.current?.setMapSize(session.map.imageWidth, session.map.imageHeight);
    });
  }, [session?.map.imageUrl]);

  // Sync grid
  useEffect(() => {
    if (!grid) return;
    rendererRef.current?.updateGrid(grid);
    tokenLayerRef.current?.updateGrid(grid);
  }, [grid]);

  // Sync fog
  useEffect(() => {
    if (!fog) return;
    fogLayerRef.current?.update(fog);
  }, [fog]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
