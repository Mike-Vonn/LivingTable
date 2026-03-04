import React, { useState } from 'react';
import { useAuthStore } from '../../state/authStore';

export function LoginPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'login') {
      await login(username, password);
    } else {
      await register(username, password, displayName || username, inviteCode || undefined);
    }
  };

  const switchTab = (t: 'login' | 'register') => {
    setTab(t);
    clearError();
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>LivingTable</h1>
        <p style={styles.subtitle}>Virtual Tabletop</p>

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'login' ? styles.activeTab : {}) }}
            onClick={() => switchTab('login')}
          >
            Login
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'register' ? styles.activeTab : {}) }}
            onClick={() => switchTab('register')}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {tab === 'register' && (
            <>
              <input
                style={styles.input}
                placeholder="Display Name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Invite Code (optional)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
            </>
          )}
          {error && <div style={styles.error}>{error}</div>}
          <button style={styles.button} type="submit" disabled={isLoading}>
            {isLoading ? '...' : tab === 'login' ? 'Login' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: '#1a1a2e', color: '#eee', fontFamily: 'system-ui, sans-serif',
  },
  card: {
    background: '#16213e', borderRadius: 12, padding: 40, width: 360,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  title: { margin: 0, fontSize: 28, textAlign: 'center' as const, color: '#e94560' },
  subtitle: { margin: '4px 0 24px', textAlign: 'center' as const, color: '#888', fontSize: 14 },
  tabs: { display: 'flex', gap: 0, marginBottom: 20 },
  tab: {
    flex: 1, padding: '10px', border: 'none', background: '#0f3460', color: '#aaa',
    cursor: 'pointer', fontSize: 14, transition: 'all 0.2s',
  },
  activeTab: { background: '#e94560', color: '#fff' },
  form: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  input: {
    padding: '10px 12px', borderRadius: 6, border: '1px solid #333', background: '#1a1a2e',
    color: '#eee', fontSize: 14, outline: 'none',
  },
  button: {
    padding: '12px', borderRadius: 6, border: 'none', background: '#e94560',
    color: '#fff', fontSize: 16, cursor: 'pointer', fontWeight: 'bold',
  },
  error: { color: '#ff6b6b', fontSize: 13, textAlign: 'center' as const },
};
