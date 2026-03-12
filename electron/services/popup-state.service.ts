import type { PopupTranslationState } from '@/domain/capture/types';

export function createPopupStateService() {
  let currentState: PopupTranslationState | null = null;

  return {
    getState() {
      return currentState;
    },
    setState(state: PopupTranslationState) {
      currentState = state;
      return currentState;
    },
    clearState() {
      currentState = null;
    },
  };
}
