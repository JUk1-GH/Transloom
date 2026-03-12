import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const READ_SELECTED_TEXT_SCRIPT = `
set previousClipboard to the clipboard
try
  tell application "System Events"
    keystroke "c" using command down
  end tell
  delay 0.15
  set selectedText to the clipboard as text
  set the clipboard to previousClipboard
  return selectedText
on error errMsg
  set the clipboard to previousClipboard
  error errMsg
end try
`;

export function createSelectedTextService() {
  return {
    async readSelectedText() {
      if (process.platform !== 'darwin') {
        throw new Error('当前平台暂不支持读取系统选中文本。');
      }

      const { stdout } = await execFileAsync('osascript', ['-e', READ_SELECTED_TEXT_SCRIPT]);
      const text = stdout.trim();

      if (!text) {
        throw new Error('未读取到选中文本。请先在任意应用中选中文本，再触发快捷键。');
      }

      return text;
    },
  };
}
