#!/bin/bash
# package.sh — 打包浏览器扩展为 .zip 文件，可直接用于 Edge Add-ons / Chrome Web Store 提交
#
# 用法：
#   ./package.sh           # 自动递增 patch 版本号（0.1.1 → 0.1.2）并打包
#   ./package.sh 0.2.0     # 使用指定版本号，写入 manifest.json 并打包
#   ./package.sh --keep    # 使用当前版本号，不修改 manifest.json
#
# 输出：dist/amap-capturer-vX.Y.Z.zip

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

MANIFEST="$PROJECT_DIR/manifest.json"

# ---------------------------------------------------------------------------
# 版本号处理
# ---------------------------------------------------------------------------

# 从 manifest.json 读取当前版本
CURRENT_VERSION=$(grep '"version"' "$MANIFEST" | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

if [ -z "$CURRENT_VERSION" ]; then
  echo "❌ 无法从 manifest.json 读取版本号"
  exit 1
fi

# 解析用户参数
if [ $# -eq 0 ]; then
  # 无参数：自动递增 patch
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
  PATCH=$((PATCH + 1))
  NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
  echo "🔢 自动递增: ${CURRENT_VERSION} → ${NEW_VERSION}"
elif [ "$1" = "--keep" ]; then
  # --keep：保持不变
  NEW_VERSION="$CURRENT_VERSION"
  echo "🔒 保持当前版本: v${NEW_VERSION}"
else
  # 手动指定版本
  NEW_VERSION="$1"
  if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
    echo "🔢 指定版本: ${CURRENT_VERSION} → ${NEW_VERSION}"
  else
    echo "🔒 指定版本: v${NEW_VERSION}（无变化）"
  fi
fi

# 校验版本号格式
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "❌ 无效的版本号格式: $NEW_VERSION（应为 X.Y.Z）"
  exit 1
fi

# 更新 manifest.json 中的版本号
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$MANIFEST"
echo "✅ manifest.json version 已更新: $NEW_VERSION"
echo ""

# ---------------------------------------------------------------------------
# 打包
# ---------------------------------------------------------------------------

DIST_DIR="$PROJECT_DIR/dist"
ZIP_NAME="amap-capturer-v${NEW_VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# 必要文件清单：仅包含扩展运行时需要的文件
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

# 校验
MISSING=()
for f in "${FILES[@]}"; do
  if [ ! -f "$PROJECT_DIR/$f" ]; then
    MISSING+=("$f")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ 以下文件缺失："
  for f in "${MISSING[@]}"; do printf '   - %s\n' "$f"; done
  exit 1
fi
echo "📋 校验通过：${#FILES[@]} 个文件"

# 打包
echo ""
echo "🧹 正在打包..."
(
  cd "$PROJECT_DIR"
  zip -X "$ZIP_PATH" "${FILES[@]}" -x "*.DS_Store"
)

if [ -f "$ZIP_PATH" ]; then
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
  echo "💡 建议："
  echo "   git add manifest.json && git commit -m 'chore: bump version to v${NEW_VERSION}'"
  echo ""
else
  echo "❌ 打包失败"
  exit 1
fi
