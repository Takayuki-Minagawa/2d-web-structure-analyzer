import { create } from 'zustand';

interface SelectionState {
  selectedNodeIds: Set<string>;
  selectedMemberIds: Set<string>;
  selectNode: (id: string, multi?: boolean) => void;
  selectMember: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  toggleNodeSelection: (id: string) => void;
  toggleMemberSelection: (id: string) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNodeIds: new Set(),
  selectedMemberIds: new Set(),

  selectNode: (id, multi = false) =>
    set((s) => {
      if (multi) {
        const next = new Set(s.selectedNodeIds);
        next.add(id);
        return { selectedNodeIds: next };
      }
      return { selectedNodeIds: new Set([id]), selectedMemberIds: new Set() };
    }),

  selectMember: (id, multi = false) =>
    set((s) => {
      if (multi) {
        const next = new Set(s.selectedMemberIds);
        next.add(id);
        return { selectedMemberIds: next };
      }
      return { selectedMemberIds: new Set([id]), selectedNodeIds: new Set() };
    }),

  clearSelection: () =>
    set({ selectedNodeIds: new Set(), selectedMemberIds: new Set() }),

  toggleNodeSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedNodeIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedNodeIds: next };
    }),

  toggleMemberSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedMemberIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedMemberIds: next };
    }),
}));
