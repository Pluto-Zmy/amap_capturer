# 高德地图截图拼接 — 浏览器扩展

沿高德地图（amap.com）驾车路线自动截图并拼接为完整大地图，保存为 PNG 下载到本地。

## 功能

- **自动检测路线** — 在 amap.com 上设置起点、终点和途经点后，扩展自动获取路线数据
- **自定义参数** — 可调整地图缩放级别（3-18）、截图尺寸（宽×高）和采样率
- **自动沿路截图** — 一键开始，地图自动沿路线移动并截取视口截图，进度实时显示
- **三种拼接模式** — 自动分组（按像素预算）、全部拼接为一张、固定数量分组
- **本地下载** — 拼接后的大地图以 PNG 格式保存到本地

## 安装

1. 打开 Chrome/Edge，访问 `chrome://extensions/`
2. 开启右上角「**开发者模式**」
3. 点击「**加载已解压的扩展程序**」
4. 选择本目录（`bmap-extension/`）

## 使用

1. 打开 [amap.com](https://www.amap.com/)，使用驾车路线规划设置起点、终点和途经点
2. 扩展右侧面板自动检测路线，显示"路线已检测 ✓"
3. 调整参数：
   - **缩放级别** — 地图缩放（推荐 14）
   - **宽 / 高** — 截图尺寸（推荐 2000×1600）
   - **采样** — 每隔 N 个路线点截一张（推荐 10，越小截图越密）
4. **关闭高德页面左侧的路线详情面板**（避免遮挡截图）
5. 点击「**开始截图**」，地图自动沿路线移动截图
6. 完成后点击「**下载结果**」，拼接后的 PNG 大地图保存到本地

## 注意事项

- 截图前请关闭高德左侧路线详情面板，避免无关元素干扰
- 截图过程中勿手动拖动地图
- 如路线未自动检测到，请刷新页面后重试
- 所有截图和拼接在浏览器本地完成，不收集或上传任何数据

## 目录结构

```
bmap-extension/
├── manifest.json              # Chrome Extension MV3 声明
├── assets/icons/              # 扩展图标
├── content/                   # 内容脚本（注入 amap.com）
│   ├── bridge.js              # 隔离世界桥接（chrome API 代理）
│   ├── index.js               # 入口：串联截图→拼接→下载全流程
│   ├── panel.js               # 侧边栏 UI + 状态管理
│   ├── panel.css              # 侧边栏样式
│   ├── stitcher.js            # 拼接引擎（auto / all / group）
│   ├── map-controller.js      # 地图操控 + 路线采样
│   ├── canvas-capturer.js     # 视口截图 + 裁剪
│   └── route-reader.js        # 路线数据拦截提取
├── service/                   # Service Worker（MV3 后台）
│   └── background.js          # 下载 + 截图代理
└── tests/
    └── test.html              # 纯逻辑函数单元测试
```

## 技术栈

- Manifest V3
- Vanilla JavaScript（零外部依赖）
- OffscreenCanvas API（拼接）
- chrome.tabs.captureVisibleTab（截图）
- Amap JS API v2.0（地图操控）

## 发布

### Chrome Web Store
1. 注册 [Chrome 开发者账号](https://chrome.google.com/webstore/devconsole)（$5 USD）
2. 上传 `bmap-extension/` 打包的 `.zip`
3. 填写商店信息，提交审核

### Edge Add-ons
1. 注册 [Microsoft Partner Center](https://partner.microsoft.com/)（免费）
2. 进入「扩展」→「创建新扩展」
3. 上传 `bmap-extension/` 打包的 `.zip`
4. 填写商店信息和权限说明，提交认证

## License

MIT
