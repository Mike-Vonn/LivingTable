import React, { useState } from 'react';
import type { Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { InitiativeEntry } from '@livingtable/shared';
import { useGameStore } from '../../state/gameStore';
import { useAuth } from '../../hooks/useAuth';
import { v4 as uuidv4 } from 'uuid';

// We'll generate IDs client-side; need uuid
function genId() {
  return Math.random().toString(36).slice(2, 10);
}

interface Props {
  socket: Socket | null;
}

export function InitiativeTracker({ socket }: Props) {
  const { isDM } = useAuth();
  const initiative = useGameStore((s) => s.session?.initiative);
  const [newName, setNewName] = useState('');
  const [newInit, setNewInit] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  if (!initiative) return null;

  const handleAdd = () => {
    if (!socket || !newName) return;
    const entry: InitiativeEntry = {
      id: genId(),
      name: newName,
      initiative: parseInt(newInit) || 0,
      isActive: false,
      isNPC: isDM,
    };
    socket.emit(SOCKET_EVENTS.INIT_ADD, entry);
    setNewName('');
    setNewInit('');
    setShowAdd(false);
  };

  const handleNext = () => socket?.emit(SOCKET_EVENTS.INIT_NEXT);
  const handleSort = () => socket?.emit(SOCKET_EVENTS.INIT_SORT);
  const handleClear = () => socket?.emit(SOCKET_EVENTS.INIT_CLEAR);
  const handleToggle = () => socket?.emit(SOCKET_EVENTS.INIT_TOGGLE, { active: !initiative.active });
  const handleRemove = (id: string) => socket?.emit(SOCKET_EVENTS.INIT_REMOVE, { entryId: id });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.heading}>Initiative</h4>
        {initiative.active && <span style={styles.round}>Round {initiative.round}</span>}
      </div>

      {initiative.entries.length > 0 && (
        <div style={styles.list}>
          {initiative.entries.map((entry, i) => (
            <div
              key={entry.id}
              style={{
                ...styles.entry,
                ...(i === initiative.currentIndex && initiative.active ? styles.activeEntry : {}),
              }}
            >
              <span style={styles.initVal}>{entry.initiative}</span>
              <span style={styles.entryName}>{entry.name}</span>
              {entry.hp && (
                <span style={styles.hp}>{entry.hp.current}/{entry.hp.max}</span>
              )}
              {isDM && (
                <button style={styles.removeBtn} onClick={() => handleRemove(entry.id)}>x</button>
              )}
            </div>
          ))}
        </div>
      )}

      {isDM && (
        <div style={styles.controls}>
          {initiative.active && (
            <button style={styles.btn} onClick={handleNext}>Next Turn</button>
          )}
          <button style={styles.btn} onClick={handleToggle}>
            {initiative.active ? 'Stop' : 'Start'}
          </button>
          <button style={styles.btn} onClick={handleSort}>Sort</button>
          <button style={styles.btn} onClick={handleClear}>Clear</button>
          <button style={styles.btn} onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add'}
          </button>
        </div>
      )}

      {showAdd && (
        <div style={styles.addForm}>
          <input
            style={styles.input}
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            style={{ ...styles.input, width: 50 }}
            type="number"
            placeholder="Init"
            value={newInit}
            onChange={(e) => setNewInit(e.target.value)}
          />
          <button style={styles.addBtn} onClick={handleAdd}>Add</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 8 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  heading: { margin: '0 0 8px', color: '#e94560', fontSize: 14 },
  round: { fontSize: 12, color: '#888' },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 2, marginBottom: 8 },
  entry: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
    background: '#1a1a2e', borderRadius: 4, fontSize: 13,
  },
  activeEntry: { background: '#0f3460', border: '1px solid #e94560' },
  initVal: { fontWeight: 'bold', width: 24, textAlign: 'center' as const, color: '#e94560' },
  entryName: { flex: 1 },
  hp: { fontSize: 11, color: '#888' },
  removeBtn: {
    background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 12,
  },
  controls: { display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 8 },
  btn: {
    padding: '4px 8px', background: '#0f3460', border: 'none',
    color: '#ddd', borderRadius: 4, cursor: 'pointer', fontSize: 11,
  },
  addForm: { display: 'flex', gap: 4 },
  input: {
    flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #333',
    background: '#1a1a2e', color: '#eee', fontSize: 12, outline: 'none',
  },
  addBtn: {
    padding: '6px 12px', background: '#e94560', border: 'none',
    color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
};
