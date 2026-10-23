#!/bin/sh
# 把 icon.svg / icon-maskable.svg 轉成手機桌面需要的 PNG（用 Chrome 無頭模式算圖）。
# 先執行 python3 design/mascot/build.py，再執行：sh design/icons/render.sh
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

render() { # 來源 尺寸 輸出
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size="$2,$2" --force-device-scale-factor=1 \
    --screenshot="$PWD/$3" "file://$PWD/$1" >/dev/null 2>&1
  echo "wrote $3"
}

# Chrome 視窗太小時畫面會錯，所以都先畫 512，再用 macOS 內建的 sips 縮小
render icon.svg 512 icon-512.png
render icon-maskable.svg 512 icon-maskable-512.png
sips -z 192 192 icon-512.png --out icon-192.png >/dev/null && echo "wrote icon-192.png"
sips -z 180 180 icon-512.png --out apple-touch-icon.png >/dev/null && echo "wrote apple-touch-icon.png"
