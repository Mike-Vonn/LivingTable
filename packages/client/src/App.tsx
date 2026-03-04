import React, { useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { LoginPage } from './components/auth/LoginPage';
import { CampaignSelect } from './components/auth/CampaignSelect';
import { MapCanvas } from './components/map/MapCanvas';
import { MapUpload } from './components/dm/MapUpload';
import { InitiativeTracker } from './components/initiative/InitiativeTracker';
import { DiceRoller } from './components/dice/DiceRoller';
import { FogTools } from './components/fog/FogTools';
import { useGameStore } from './state/gameStore';
import { useAuthStore } from './state/authStore';
import type { MapRenderer } from './components/map/MapRenderer';
import type { Socket } from 'socket.io-client';

function GameView() {
  const socket = useSocket();
  const session = useGameStore((s) => s.session);
  const connectedPlayers = useGameStore((s) => s.connectedPlayers);
  const { currentCampaign, isDM, user } = useAuth();
  const selectCampaign = useAuthStore((s) => s.selectCampaign);
  const logout = useAuthStore((s) => s.logout);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [sidebarTab, setSidebarTab] = React.useState<'initiative' | 'dice' | 'dm'>('initiative');

  if (!session) {
    return (
      <div style={styles.loading}>
        <p>Connecting to campaign...</p>
      </div>
    );
  }

  return (
    <div style={styles.game}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <span style={styles.campaignName}>{currentCampaign?.campaignName}</span>
        <span style={{ ...styles.roleBadge, background: isDM ? '#e94560' : '#0f3460' }}>
          {isDM ? 'DM' : 'Player'}
        </span>
        <span style={styles.players}>{connectedPlayers.length} online</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={styles.navBtn} onClick={() => selectCampaign(null)}>Campaigns</button>
          <button style={styles.navBtn} onClick={logout}>Logout</button>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.main}>
        {/* Map area */}
        <div style={styles.mapArea}>
          <MapCanvas rendererRef={rendererRef} socket={socket} />
        </div>

        {/* Sidebar */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarTabs}>
            <button
              style={{ ...styles.sidebarTab, ...(sidebarTab === 'initiative' ? styles.activeTab : {}) }}
              onClick={() => setSidebarTab('initiative')}
            >
              Initiative
            </button>
            <button
              style={{ ...styles.sidebarTab, ...(sidebarTab === 'dice' ? styles.activeTab : {}) }}
              onClick={() => setSidebarTab('dice')}
            >
              Dice
            </button>
            {isDM && (
              <button
                style={{ ...styles.sidebarTab, ...(sidebarTab === 'dm' ? styles.activeTab : {}) }}
                onClick={() => setSidebarTab('dm')}
              >
                DM
              </button>
            )}
          </div>

          <div style={styles.sidebarContent}>
            {sidebarTab === 'initiative' && <InitiativeTracker socket={socket} />}
            {sidebarTab === 'dice' && <DiceRoller socket={socket} />}
            {sidebarTab === 'dm' && isDM && (
              <div>
                <MapUpload socket={socket} />
                <FogTools socket={socket} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const { isLoggedIn, currentCampaign } = useAuth();

  if (!isLoggedIn) return <LoginPage />;
  if (!currentCampaign) return <CampaignSelect />;
  return <GameView />;
}

const styles: Record<string, React.CSSProperties> = {
  loading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', background: '#1a1a2e', color: '#888', fontFamily: 'system-ui, sans-serif',
  },
  game: {
    display: 'flex', flexDirection: 'column' as const, height: '100vh',
    background: '#1a1a2e', color: '#eee', fontFamily: 'system-ui, sans-serif',
  },
  topBar: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
    background: '#16213e', borderBottom: '1px solid #333', flexShrink: 0,
  },
  campaignName: { fontWeight: 'bold', fontSize: 16 },
  roleBadge: {
    fontSize: 11, padding: '2px 8px', borderRadius: 4, color: '#fff', fontWeight: 'bold',
  },
  players: { fontSize: 12, color: '#888' },
  navBtn: {
    background: 'transparent', border: '1px solid #444', color: '#aaa',
    padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
  main: {
    display: 'flex', flex: 1, overflow: 'hidden',
  },
  mapArea: {
    flex: 1, overflow: 'hidden', position: 'relative' as const,
  },
  sidebar: {
    width: 280, background: '#16213e', borderLeft: '1px solid #333',
    display: 'flex', flexDirection: 'column' as const, flexShrink: 0,
  },
  sidebarTabs: {
    display: 'flex', borderBottom: '1px solid #333',
  },
  sidebarTab: {
    flex: 1, padding: '8px', border: 'none', background: 'transparent',
    color: '#888', cursor: 'pointer', fontSize: 12, textAlign: 'center' as const,
  },
  activeTab: { color: '#e94560', borderBottom: '2px solid #e94560' },
  sidebarContent: {
    flex: 1, overflowY: 'auto' as const,
  },
};
