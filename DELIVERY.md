# Transloom Delivery

## 产物位置
- 安装包目录：`release/`
- 应用目录产物：`release/mac-arm64/Transloom.app`（或 electron-builder 当前输出的 mac 目录）
- 磁盘镜像：`release/*.dmg`

## 安装未签名应用
1. 打开 `release/*.dmg`
2. 将 `Transloom.app` 拖到 `Applications`
3. 首次打开若被拦截：前往 `系统设置 -> 隐私与安全性`，点击“仍要打开”

## 首次权限
- 截图翻译需要 macOS `Screen Recording` 权限
- 若系统提示截图或辅助功能相关权限，请按提示允许后重新打开应用

## 使用说明
1. 先在设置页保存 `Base URL / Model / API Key`
2. 点击“测试连接”确认是否进入 `Real` 模式
3. 若未配置真实密钥，应用会自动进入 `Mock` 模式，但文本翻译、截图翻译、历史、术语表仍可继续使用
4. 截图翻译默认通过全局快捷键触发，首次请在设置页确认快捷键

## 已知限制
- 当前版本只支持 macOS
- 当前版本为本地单机版，不包含登录、计费、云同步
- 若真实 provider 或 OCR 不可用，会自动回退到 `Mock` 模式
