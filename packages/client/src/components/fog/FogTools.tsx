import React, { useState } from 'react';
import type { Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { FogRegion } from '@livingtable/shared';
import { useGameStore } from '../../state/gameStore';
import { useAuth } from '../../hooks/useAuth';

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

interface Props {
  socket: Socket | null;
}

export function FogTools({ socket }: Props) {
  const { isDM } = useAuth();
  const fogEnabled = useGameStore((s) => s.session?.fog.enabled ?? false);
  const fogRegions = useGameStore((s) => s.session?.fog.regions ?? []);

  if (!isDM) return null;

  const toggleFog = () => {
    socket?.emit(SOCKET_EVENTS.FOG_TOGGLE, { enabled: !fogEnabled });
  };

  const revealRect = () => {
    // Simple preset rectangle reveal for quick use
    const region: FogRegion = {
      id: genId(),
      points: [[0, 0], [500, 0], [500, 500], [0, 500]],
      revealed: true,
    };
    socket?.emit(SOCKET_EVENTS.FOG_REVEAL, region);
  };

  const hideRegion = (regionId: string) => {
    socket?.emit(SOCKET_EVENTS.FOG_HIDE, { regionId });
  };

  return (
    <div style={styles.container}>
      <h4 style={styles.heading}>Fog of War</h4>

      <div style={styles.controls}>
        <button style={styles.btn} onClick={toggleFog}>
          {fogEnabled ? 'Disable Fog' : 'Enable Fog'}
        </button>
        <button style={styles.btn} onClick={revealRect}>
          Reveal Area
        </button>
      </div>

      {fogRegions.length > 0 && (
        <div style={styles.regionList}>
          <span style={styles.subheading}>{fogRegions.length} revealed region(s)</span>
          {fogRegions.map((r) => (
            <div key={r.id} style={styles.region}>
              <span style={styles.regionId}>Region {r.id.slice(0, 4)}</span>
              <button style={styles.hideBtn} onClick={() => hideRegion(r.id)}>Hide</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 8 },
  heading: { margin: '0 0 8px', color: '#e94560', fontSize: 14 },
  controls: { display: 'flex', gap: 4, marginBottom: 8 },
  btn: {
    flex: 1, padding: '6px 8px', background: '#0f3460', border: 'none',
    color: '#ddd', borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
  regionList: { fontSize: 12 },
  subheading: { color: '#888', fontSize: 11 },
  region: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '4px 0',
  },
  regionId: { color: '#aaa' },
  hideBtn: {
    background: 'none', border: '1px solid #555', color: '#aaa',
    padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
  },
};
