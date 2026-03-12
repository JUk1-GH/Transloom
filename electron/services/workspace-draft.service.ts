import type { WorkspaceDraftState } from '@/domain/capture/types';

export function createWorkspaceDraftService() {
  let currentDraft: WorkspaceDraftState | null = null;

  return {
    getDraft() {
      return currentDraft;
    },
    setDraft(draft: WorkspaceDraftState) {
      currentDraft = draft;
      return currentDraft;
    },
  };
}
