import { globalShortcut } from 'electron';

export function createHotkeyService() {
  return {
    register(shortcut: string, handler: () => void | Promise<void>) {
      globalShortcut.unregisterAll();
      const success = globalShortcut.register(shortcut, () => {
        void handler();
      });

      if (!success) {
        throw new Error(`Unable to register global shortcut: ${shortcut}`);
      }
    },
    unregisterAll() {
      globalShortcut.unregisterAll();
    },
    defaultShortcut: 'CommandOrControl+Shift+2',
  };
}
