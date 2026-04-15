# Android APK 打包

本项目已接入 `Capacitor Android`，可将当前前端构建产物打包为本地可安装的 Android 应用。

## 当前行为

- Android 原生应用默认进入本地离线数据模式。
- 本地模式下，日记数据、公开设置和登录状态保存在设备本地，可在无网络环境下使用。
- 如需读取 Cloudflare Pages / Functions 的远程数据，可在应用内“设备与离线”卡片中切换到 `远程 Pages` 模式。
- 当前版本还没有自动双向同步；本地数据与远程数据是两套独立存储。后续如需同步，建议在现有模式切换基础上补充显式同步流程，而不是静默自动合并。

## 环境要求

- Node.js 与 npm
- Android Studio
- Android SDK
- Java 21 或 Android Studio 推荐版本

## 首次准备

```bash
npm install
npm run android:sync
```

如果仓库中还没有 Android 工程，可执行：

```bash
npx cap add android
```

## 调试与打包

同步 Web 资源到 Android 工程：

```bash
npm run android:sync
```

在 Android Studio 中打开工程：

```bash
npm run android:open
```

生成调试 APK：

```bash
npm run android:apk:debug
```

生成发布 APK：

```bash
npm run android:apk:release
```

默认输出位置通常为：

- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/apk/release/app-release.apk`

## 远程模式与 Pages 联动

- Web 端部署仍然使用 Cloudflare Pages / Functions / D1。
- Android 端切换到 `远程 Pages` 模式后，会直接访问线上 API。
- 如果后续要做本地与云端同步，建议新增：
  - 显式“上传本地到云端”
  - 显式“从云端拉取覆盖本地”
  - 冲突检测与时间戳策略

当前先保留“本地可离线使用”和“远程可连接 Pages”两条清晰路径，避免误同步导致数据覆盖。
