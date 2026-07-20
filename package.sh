#!/bin/bash
# package.sh — 打包浏览器扩展为 .zip 文件，可直接用于 Edge Add-ons / Chrome Web Store 提交
#
# 用法：
#   chmod +x package.sh
#   ./package.sh          # 打包当前版本
#   ./package.sh 0.1.2    # 指定版本号（覆盖 manifest.json 中的 version）
#
# 输出：dist/amap-capturer-vX.Y.Z.zip

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# 读取 manifest.json 中的版本号
VERSION="${1:-$(node -e "process.stdout.write(require('./manifest.json').version)" 2>/dev/null || grep '"version"' manifest.json | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')}"

DIST_DIR="$PROJECT_DIR/dist"
ZIP_NAME="amap-capturer-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

# 清理旧的构建产物
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "📦 打包版本: v${VERSION}"
echo ""

# ---------------------------------------------------------------------------
# 必要文件清单：仅包含扩展运行时需要的文件
# ---------------------------------------------------------------------------
FILES=(
  "manifest.json"
  "content/bridge.js"
  "content/canvas-capturer.js"
  "content/index.js"
  "content/map-controller.js"
  "content/panel.css"
  "content/panel.js"
  "content/route-reader.js"
  "content/stitcher.js"
  "service/background.js"
  "assets/icons/icon16.png"
  "assets/icons/icon48.png"
  "assets/icons/icon128.png"
)

# 校验所有文件存在
MISSING=()
for f in "${FILES[@]}"; do
  if [ ! -f "$PROJECT_DIR/$f" ]; then
    MISSING+=("$f")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ 以下文件缺失，请检查："
  for f in "${MISSING[@]}"; do
    echo "   - $f"
  done
  exit 1
fi

echo "✅ 校验通过：${#FILES[@]} 个文件"

# 排除 macOS 垃圾文件
echo ""
echo "🧹 正在打包..."

# 使用 zip 命令，保持目录结构
# -j 会 flatten 路径，所以不用 -j，直接用 -r 并排除不需要的文件
# 由于文件列表已知且精确，直接逐个添加即可保留目录结构
(
  cd "$PROJECT_DIR"
  # macOS zip 使用 -X 去除扩展属性，-x 排除 .DS_Store
  zip -X "$ZIP_PATH" "${FILES[@]}" -x "*.DS_Store"
)

if [ $? -eq 0 ] && [ -f "$ZIP_PATH" ]; then
  SIZE=$(du -h "$ZIP_PATH" | cut -f1)
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ 打包完成"
  echo "   文件: $ZIP_NAME"
  echo "   大小: $SIZE"
  echo "   路径: $ZIP_PATH"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📋 上传指引："
  echo "   Edge Add-ons: https://partner.microsoft.com/ → 扩展 → 创建新扩展"
  echo "   Chrome Web Store: https://chrome.google.com/webstore/devconsole"
  echo ""
else
  echo "❌ 打包失败"
  exit 1
fi
