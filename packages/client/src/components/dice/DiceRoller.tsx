import React, { useState } from 'react';
import type { Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { DiceRoll } from '@livingtable/shared';
import { useGameStore } from '../../state/gameStore';
import { useAuth } from '../../hooks/useAuth';
import { parseDiceExpression, rollDice } from '../../utils/dice';

interface Props {
  socket: Socket | null;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function DiceRoller({ socket }: Props) {
  const { isDM, user } = useAuth();
  const diceHistory = useGameStore((s) => s.session?.diceHistory ?? []);
  const [expression, setExpression] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const doRoll = (expr: string) => {
    if (!socket || !user) return;
    const parsed = parseDiceExpression(expr);
    if (!parsed) return;
    const { results, total } = rollDice(parsed);

    const roll: DiceRoll = {
      id: genId(),
      rollerId: user.id,
      rollerName: user.displayName,
      expression: expr,
      results,
      modifier: parsed.modifier,
      total,
      timestamp: Date.now(),
      isPrivate,
    };
    socket.emit(SOCKET_EVENTS.DICE_ROLL, roll);
    setExpression('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (expression.trim()) doRoll(expression.trim());
  };

  const quickDice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

  return (
    <div style={styles.container}>
      <h4 style={styles.heading}>Dice Roller</h4>

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          style={styles.input}
          placeholder="2d6+3, 1d20, 4d6kh3..."
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
        />
        <button style={styles.rollBtn} type="submit">Roll</button>
      </form>

      <div style={styles.quickBar}>
        {quickDice.map((d) => (
          <button key={d} style={styles.quickBtn} onClick={() => doRoll(`1${d}`)}>
            {d}
          </button>
        ))}
      </div>

      {isDM && (
        <label style={styles.privateLabel}>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          {' '}Private Roll
        </label>
      )}

      <div style={styles.history}>
        {[...diceHistory].reverse().slice(0, 30).map((roll) => (
          <div key={roll.id} style={{ ...styles.roll, ...(roll.isPrivate ? styles.privateRoll : {}) }}>
            <span style={styles.rollerName}>{roll.rollerName}</span>
            <span style={styles.expr}>{roll.expression}</span>
            <span style={styles.results}>[{roll.results.join(', ')}]</span>
            <span style={styles.total}>{roll.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 8, display: 'flex', flexDirection: 'column' as const, height: '100%' },
  heading: { margin: '0 0 8px', color: '#e94560', fontSize: 14 },
  form: { display: 'flex', gap: 4, marginBottom: 8 },
  input: {
    flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #333',
    background: '#1a1a2e', color: '#eee', fontSize: 13, outline: 'none',
  },
  rollBtn: {
    padding: '6px 16px', background: '#e94560', border: 'none',
    color: '#fff', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold',
  },
  quickBar: { display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 8 },
  quickBtn: {
    padding: '4px 8px', background: '#0f3460', border: 'none',
    color: '#ddd', borderRadius: 4, cursor: 'pointer', fontSize: 11,
  },
  privateLabel: { fontSize: 12, color: '#888', marginBottom: 8 },
  history: { flex: 1, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 2 },
  roll: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
    background: '#1a1a2e', borderRadius: 4, fontSize: 12,
  },
  privateRoll: { borderLeft: '2px solid #e94560' },
  rollerName: { fontWeight: 'bold', color: '#888', minWidth: 60 },
  expr: { color: '#aaa' },
  results: { color: '#666', fontSize: 11 },
  total: { fontWeight: 'bold', color: '#e94560', marginLeft: 'auto' },
};
