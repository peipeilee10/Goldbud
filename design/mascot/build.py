"""產生水豚吉祥物四種狀態的 SVG。

修改顏色或造型時改這個檔案，再執行：
    python3 design/mascot/build.py
"""

from pathlib import Path

OUT = Path(__file__).parent

C = {
    "line": "#6B4A2F",    # 外框（深咖啡）
    "body": "#D9A86F",    # 身體
    "snout": "#A87A50",   # 鼻子區塊
    "ear": "#C08A55",     # 耳朵內側、身體紋路
    "blush": "#F2A7A3",   # 腮紅
    "yuzu": "#F5A040",
    "yuzu_hi": "#FBC77E",
    "leaf": "#5A9A5E",
    "water": "#BFE2EA",
    "water_line": "#8CC3D1",
    "sweat": "#9FD3E6",
}

# 蠟筆質感：線條輕微抖動 + 顆粒
FILTER = """
  <filter id="crayon" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="wobble"/>
    <feDisplacementMap in="SourceGraphic" in2="wobble" scale="2.5" xChannelSelector="R" yChannelSelector="G" result="drawn"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="8" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.6 0 0 0 1.3" result="grainAlpha"/>
    <feComposite in="drawn" in2="grainAlpha" operator="in"/>
  </filter>"""

STROKE = f'stroke="{C["line"]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"'

BODY_PATH = "M40 168 C30 126 38 74 100 66 C162 74 170 126 160 168 C140 175 60 175 40 168 Z"


def ears():
    return f"""
    <circle cx="64" cy="76" r="13" fill="{C['body']}" {STROKE}/>
    <circle cx="136" cy="76" r="13" fill="{C['body']}" {STROKE}/>"""


def body():
    return f"""
    <path d="{BODY_PATH}" fill="{C['body']}" {STROKE}/>
    <path d="M60 74 L64 78 M140 74 L136 78" stroke="{C['ear']}" stroke-width="4" stroke-linecap="round"/>
    <path d="M146 112 l1 6 M149 126 l1 6 M151 140 l1 6 M144 132 l1 5" stroke="{C['ear']}" stroke-width="3" stroke-linecap="round"/>"""


def face(eyes):
    return f"""
    <rect x="82" y="96" width="36" height="36" rx="15" fill="{C['snout']}"/>
    <path d="M93 106 L100 113 L107 106 M100 113 L100 122" fill="none" stroke="{C['line']}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="68" cy="116" rx="9" ry="6" fill="{C['blush']}"/>
    <ellipse cx="132" cy="116" rx="9" ry="6" fill="{C['blush']}"/>
    <path d="M65 116 l2 -2 M70 116 l2 -2 M129 116 l2 -2 M134 116 l2 -2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
    {eyes}"""


def feet():
    return f"""
    <ellipse cx="72" cy="168" rx="13" ry="10" fill="{C['body']}" {STROKE}/>
    <ellipse cx="128" cy="168" rx="13" ry="10" fill="{C['body']}" {STROKE}/>"""


EYES_OPEN = f"""<circle cx="78" cy="101" r="4.2" fill="{C['line']}"/>
    <circle cx="122" cy="101" r="4.2" fill="{C['line']}"/>"""

# 閉眼（睡覺）：向下彎的弧線
EYES_SLEEP = f"""<path d="M72 100 Q78 105 84 100 M116 100 Q122 105 128 100" fill="none" stroke="{C['line']}" stroke-width="3.2" stroke-linecap="round"/>"""

# 瞇眼（享受）：向上彎的弧線
EYES_HAPPY = f"""<path d="M72 103 Q78 97 84 103 M116 103 Q122 97 128 103" fill="none" stroke="{C['line']}" stroke-width="3.2" stroke-linecap="round"/>"""


# 慌張（超支）：睜大的眼睛＋小小張開的嘴
EYES_PANIC = f"""<circle cx="78" cy="100" r="6" fill="#fff" stroke="{C['line']}" stroke-width="2.4"/>
    <circle cx="122" cy="100" r="6" fill="#fff" stroke="{C['line']}" stroke-width="2.4"/>
    <circle cx="78" cy="101" r="2.4" fill="{C['line']}"/>
    <circle cx="122" cy="101" r="2.4" fill="{C['line']}"/>
    <ellipse cx="100" cy="127" rx="3" ry="3.6" fill="{C['line']}"/>"""


def yuzu(cx=100, cy=56):
    return f"""
    <circle cx="{cx}" cy="{cy}" r="15" fill="{C['yuzu']}" stroke="{C['line']}" stroke-width="4"/>
    <ellipse cx="{cx - 5}" cy="{cy - 5}" rx="4" ry="2.5" fill="{C['yuzu_hi']}" transform="rotate(-30 {cx - 5} {cy - 5})"/>
    <path d="M{cx} {cy - 15} l0 -4" stroke="{C['line']}" stroke-width="3" stroke-linecap="round"/>
    <path d="M{cx + 2} {cy - 18} C{cx + 6} {cy - 28} {cx + 18} {cy - 27} {cx + 20} {cy - 22} C{cx + 14} {cy - 15} {cx + 6} {cy - 15} {cx + 2} {cy - 18} Z" fill="{C['leaf']}"/>"""


def onsen():
    return f"""
    <path d="M14 146 Q35 138 57 146 T100 146 T143 146 T186 146 C190 176 160 192 100 192 C40 192 10 176 14 146 Z" fill="{C['water']}" opacity=".95"/>
    <path d="M14 146 Q35 138 57 146 T100 146 T143 146 T186 146" fill="none" stroke="{C['water_line']}" stroke-width="3" stroke-linecap="round"/>
    <path d="M34 128 q-5 -7 0 -14 q5 -7 0 -14 M168 126 q-5 -7 0 -14 q5 -7 0 -14" fill="none" stroke="{C['water_line']}" stroke-width="3" stroke-linecap="round" opacity=".7"/>"""


def zzz():
    return f"""
    <text x="150" y="58" font-family="Arial Rounded MT Bold, sans-serif" font-size="16" font-weight="700" fill="{C['line']}" opacity=".75">z</text>
    <text x="162" y="42" font-family="Arial Rounded MT Bold, sans-serif" font-size="12" font-weight="700" fill="{C['line']}" opacity=".55">z</text>"""


def sweat():
    return f"""
    <path d="M150 64 C144 74 142 80 146 85 C150 89 157 86 157 80 C157 75 153 70 150 64 Z" fill="{C['sweat']}" stroke="{C['water_line']}" stroke-width="2.5" stroke-linejoin="round"/>"""


def sweat_both():
    """兩邊都冒汗，再加三條慌張的短線"""
    return sweat() + f"""
    <path d="M50 64 C56 74 58 80 54 85 C50 89 43 86 43 80 C43 75 47 70 50 64 Z" fill="{C['sweat']}" stroke="{C['water_line']}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M100 40 l0 -10 M84 44 l-5 -8 M116 44 l5 -8" stroke="{C['line']}" stroke-width="3" stroke-linecap="round"/>"""


def svg(title, *parts):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="{title}">
  <defs>{FILTER}
  </defs>
  <g filter="url(#crayon)">{''.join(parts)}
  </g>
</svg>
"""


STATES = {
    # 尚未填收入
    "sleep": svg("水豚在睡覺", ears(), body(), face(EYES_SLEEP), feet(), zzz()),
    # 已分配 < 100%
    "calm": svg("水豚平靜坐著", ears(), body(), face(EYES_OPEN), feet()),
    # 已分配 = 100%
    "done": svg("水豚頂著柚子泡溫泉", ears(), body(), face(EYES_HAPPY), yuzu(), onsen()),
    # 已分配 > 100%；記帳「花太快」
    "sweat": svg("水豚冒汗", ears(), body(), face(EYES_OPEN), feet(), sweat()),
    # 記帳超支
    "panic": svg("水豚很慌張", ears(), body(), face(EYES_PANIC), feet(), sweat_both()),
}


def icon(scale):
    """App 圖示：奶油色滿版背景＋頂柚子的水豚。手機系統會自己裁成圓角。"""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <defs>{FILTER}
  </defs>
  <rect width="200" height="200" fill="#F6EBDD"/>
  <g transform="translate(100 100) scale({scale}) translate(-100 -104)">
    <g filter="url(#crayon)">{ears()}{body()}{face(EYES_OPEN)}{feet()}{yuzu()}
    </g>
  </g>
</svg>
"""


ICONS = {
    "icon": icon(0.82),
    # Android 會把圖示裁成各種形狀，主體要縮在中間 80% 的安全範圍內
    "icon-maskable": icon(0.62),
}

if __name__ == "__main__":
    for name, content in STATES.items():
        (OUT / f"capybara-{name}.svg").write_text(content, encoding="utf-8")
        print(f"wrote capybara-{name}.svg")

    icons = OUT.parent / "icons"
    icons.mkdir(exist_ok=True)
    for name, content in ICONS.items():
        (icons / f"{name}.svg").write_text(content, encoding="utf-8")
        print(f"wrote icons/{name}.svg")
