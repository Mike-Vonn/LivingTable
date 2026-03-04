import React, { useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { GridConfig } from '@livingtable/shared';
import { useGameStore } from '../../state/gameStore';
import { useAuthStore } from '../../state/authStore';

interface MapUploadProps {
  socket: Socket | null;
}

export function MapUpload({ socket }: MapUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const campaign = useAuthStore((s) => s.currentCampaign);
  const grid = useGameStore((s) => s.session?.map.grid);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket || !campaign) return;

    const formData = new FormData();
    formData.append('map', file);
    formData.append('campaignId', campaign.campaignId);

    const token = localStorage.getItem('lt_token');
    const res = await fetch('/api/upload/map', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!res.ok) return;
    const { url } = await res.json();

    // Get image dimensions
    const img = new Image();
    img.onload = () => {
      socket.emit(SOCKET_EVENTS.MAP_LOAD, {
        imageUrl: url,
        imageWidth: img.naturalWidth,
        imageHeight: img.naturalHeight,
      });
    };
    img.src = url;
  };

  const handleGridChange = (key: keyof GridConfig, value: unknown) => {
    if (!socket || !grid) return;
    socket.emit(SOCKET_EVENTS.MAP_GRID_UPDATE, { [key]: value });
  };

  return (
    <div style={styles.container}>
      <h4 style={styles.heading}>Map</h4>

      <button style={styles.uploadBtn} onClick={() => fileRef.current?.click()}>
        Upload Map Image
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={handleUpload}
      />

      {grid && (
        <div style={styles.gridControls}>
          <label style={styles.label}>
            Cell Size: {grid.cellSize}px
            <input
              type="range" min={20} max={200} value={grid.cellSize}
              onChange={(e) => handleGridChange('cellSize', parseInt(e.target.value))}
              style={styles.range}
            />
          </label>
          <label style={styles.label}>
            Offset X: {grid.offsetX}
            <input
              type="range" min={-100} max={100} value={grid.offsetX}
              onChange={(e) => handleGridChange('offsetX', parseInt(e.target.value))}
              style={styles.range}
            />
          </label>
          <label style={styles.label}>
            Offset Y: {grid.offsetY}
            <input
              type="range" min={-100} max={100} value={grid.offsetY}
              onChange={(e) => handleGridChange('offsetY', parseInt(e.target.value))}
              style={styles.range}
            />
          </label>
          <label style={styles.label}>
            <input
              type="checkbox" checked={grid.visible}
              onChange={(e) => handleGridChange('visible', e.target.checked)}
            />
            {' '}Show Grid
          </label>
          <label style={styles.label}>
            <input
              type="checkbox" checked={grid.snapToGrid}
              onChange={(e) => handleGridChange('snapToGrid', e.target.checked)}
            />
            {' '}Snap to Grid
          </label>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 8 },
  heading: { margin: '0 0 8px', color: '#e94560', fontSize: 14 },
  uploadBtn: {
    width: '100%', padding: '8px', background: '#0f3460', border: 'none',
    color: '#ddd', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginBottom: 8,
  },
  gridControls: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  label: { fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 },
  range: { flex: 1 },
};
