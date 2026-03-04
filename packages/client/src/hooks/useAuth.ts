import { useAuthStore } from '../state/authStore';

export function useAuth() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const currentCampaign = useAuthStore((s) => s.currentCampaign);
  const isLoading = useAuthStore((s) => s.isLoading);

  return {
    isLoggedIn: !!token,
    user,
    currentCampaign,
    role: currentCampaign?.role ?? null,
    isDM: currentCampaign?.role === 'dm',
    isLoading,
  };
}
