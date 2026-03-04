import { create } from 'zustand';

export type Tool = 'select' | 'pan' | 'fog-reveal' | 'fog-hide' | 'measure';

interface UIState {
  activeTool: Tool;
  sidebarOpen: boolean;
  sidebarTab: 'initiative' | 'dice' | 'players' | 'settings';
  showGrid: boolean;

  setActiveTool: (tool: Tool) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: UIState['sidebarTab']) => void;
  toggleGrid: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  sidebarOpen: true,
  sidebarTab: 'initiative',
  showGrid: true,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
}));
