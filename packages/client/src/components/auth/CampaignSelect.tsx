import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../state/authStore';
import { api } from '../../utils/api';
import type { CampaignMembership, Campaign } from '@livingtable/shared';

export function CampaignSelect() {
  const campaigns = useAuthStore((s) => s.campaigns);
  const fetchCampaigns = useAuthStore((s) => s.fetchCampaigns);
  const selectCampaign = useAuthStore((s) => s.selectCampaign);
  const createCampaign = useAuthStore((s) => s.createCampaign);
  const joinCampaign = useAuthStore((s) => s.joinCampaign);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [viewingCode, setViewingCode] = useState<Record<string, string>>({});

  useEffect(() => { fetchCampaigns(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const campaign = await createCampaign(newName);
      setCreatedCode(campaign.inviteCode);
      setNewName('');
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await joinCampaign(inviteCode);
      setInviteCode('');
      setShowJoin(false);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h2 style={styles.title}>Campaigns</h2>
          <div>
            <span style={styles.user}>{user?.displayName}</span>
            <button style={styles.logoutBtn} onClick={logout}>Logout</button>
          </div>
        </div>

        {campaigns.length > 0 && (
          <div style={styles.list}>
            {campaigns.map((c) => (
              <div key={c.campaignId} style={styles.campaignRow}>
                <button style={styles.campaignBtn} onClick={() => selectCampaign(c)}>
                  <span>{c.campaignName}</span>
                  <span style={{ ...styles.badge, background: c.role === 'dm' ? '#e94560' : '#0f3460' }}>
                    {c.role.toUpperCase()}
                  </span>
                </button>
                {c.role === 'dm' && (
                  viewingCode[c.campaignId] ? (
                    <div style={styles.inlineCode}>
                      <strong style={styles.code}>{viewingCode[c.campaignId]}</strong>
                      <button style={styles.copyBtn} onClick={() => navigator.clipboard.writeText(viewingCode[c.campaignId])}>
                        Copy
                      </button>
                    </div>
                  ) : (
                    <button
                      style={styles.inviteBtn}
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const camp = await api.get<Campaign>(`/api/campaigns/${c.campaignId}`);
                          setViewingCode((prev) => ({ ...prev, [c.campaignId]: camp.inviteCode }));
                        } catch { /* ignore */ }
                      }}
                    >
                      Invite Code
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}

        {campaigns.length === 0 && !showCreate && !showJoin && (
          <p style={styles.empty}>No campaigns yet. Create or join one below.</p>
        )}

        <div style={styles.actions}>
          <button style={styles.actionBtn} onClick={() => { setShowCreate(!showCreate); setShowJoin(false); setCreatedCode(''); }}>
            {showCreate ? 'Cancel' : 'Create Campaign'}
          </button>
          <button style={styles.actionBtn} onClick={() => { setShowJoin(!showJoin); setShowCreate(false); setCreatedCode(''); }}>
            {showJoin ? 'Cancel' : 'Join Campaign'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} style={styles.form}>
            <input
              style={styles.input}
              placeholder="Campaign Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <button style={styles.submitBtn} type="submit">Create</button>
          </form>
        )}

        {createdCode && (
          <div style={styles.codeBox}>
            Campaign created! Invite code: <strong style={styles.code}>{createdCode}</strong>
            <button style={styles.copyBtn} onClick={() => navigator.clipboard.writeText(createdCode)}>
              Copy
            </button>
          </div>
        )}

        {showJoin && (
          <form onSubmit={handleJoin} style={styles.form}>
            <input
              style={styles.input}
              placeholder="Invite Code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              maxLength={6}
              required
            />
            <button style={styles.submitBtn} type="submit">Join</button>
          </form>
        )}

        {error && <div style={styles.error}>{error}</div>}
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
    background: '#16213e', borderRadius: 12, padding: 32, width: 420,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { margin: 0, fontSize: 22, color: '#e94560' },
  user: { fontSize: 13, color: '#888', marginRight: 8 },
  logoutBtn: {
    background: 'transparent', border: '1px solid #555', color: '#aaa',
    padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 16 },
  campaignRow: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  inviteBtn: {
    background: 'transparent', border: '1px solid #444', color: '#888',
    padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, alignSelf: 'flex-start' as const,
  },
  inlineCode: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
    background: '#1a1a2e', borderRadius: 4, alignSelf: 'flex-start' as const,
  },
  campaignBtn: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 16px', background: '#1a1a2e', border: '1px solid #333',
    borderRadius: 8, color: '#eee', cursor: 'pointer', fontSize: 15, textAlign: 'left' as const,
  },
  badge: {
    fontSize: 11, padding: '2px 8px', borderRadius: 4, color: '#fff', fontWeight: 'bold',
  },
  empty: { color: '#666', textAlign: 'center' as const, fontSize: 14, margin: '16px 0' },
  actions: { display: 'flex', gap: 8, marginBottom: 12 },
  actionBtn: {
    flex: 1, padding: '10px', background: '#0f3460', border: 'none',
    color: '#ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13,
  },
  form: { display: 'flex', gap: 8, marginTop: 8 },
  input: {
    flex: 1, padding: '10px 12px', borderRadius: 6, border: '1px solid #333',
    background: '#1a1a2e', color: '#eee', fontSize: 14, outline: 'none',
  },
  submitBtn: {
    padding: '10px 20px', background: '#e94560', border: 'none',
    color: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold',
  },
  codeBox: {
    background: '#1a1a2e', padding: '12px', borderRadius: 6, marginTop: 8,
    fontSize: 13, textAlign: 'center' as const,
  },
  code: { color: '#e94560', fontSize: 18, letterSpacing: 3 },
  copyBtn: {
    marginLeft: 8, background: '#0f3460', border: 'none', color: '#ddd',
    padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
  error: { color: '#ff6b6b', fontSize: 13, textAlign: 'center' as const, marginTop: 8 },
};
