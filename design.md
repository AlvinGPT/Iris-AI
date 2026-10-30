# IRIS AI — 4-Theme Design System Specification

## 1. Independent Style & Color Mode Matrix

IRIS AI provides two independent visual dimensions stored separately in `localStorage`:
- **Style Mode (`iris_style_mode_v2`)**: `'minimal'` | `'vivid'`
- **Color Mode (`iris_color_mode_v2`)**: `'light'` | `'dark'`

These combine on `document.documentElement` (`<html>`) and `document.body` (`<body>`) to produce four distinct, production-verified combinations:

| Style Mode | Color Mode | Root Classes Applied | Visual Aesthetic |
| :--- | :--- | :--- | :--- |
| **Minimal** | **Light** | `.theme-minimal .light` (`data-theme="minimal-light"`) | Soft teal/aqua/off-white gradient (`#AEE2E5` → `#C6ECEF` → `#F4EFF2` → `#F3DEE4`), translucent frosted glass cards, thin `1px` borders, `EB Garamond` + `DM Sans`, white pill buttons |
| **Minimal** | **Dark** | `.theme-minimal .dark` (`data-theme="minimal-dark"`) | Nocturnal abyssal-teal gradient (`#061315` → `#0A1D20` → `#121E24` → `#1E171D`), smoked-glass cards (`backdrop-filter: blur(22px)`), luminous `1px` borders (`rgba(255,255,255,0.12)`), bioluminescent aqua (`#32D4CA`) & pill buttons |
| **Vivid** | **Light** | `.theme-vivid .light` (`data-theme="vivid-light"`) | Warm Cream canvas (`#FFF8ED`), solid opaque color-blocked cards (`#FF851B`, `#25D6C1`, `#C77DFF`, `#FFD84D`, `#55C7F2`), `2px solid #000000` outlines, hard-offset shadows (`4px 4px 0px #000000`) |
| **Vivid** | **Dark** | `.theme-vivid .dark` (`data-theme="vivid-dark"`) | Pure Nocturnal Black canvas (`#050505`), solid near-black cards (`#111111`), crisp `2px solid #FFFFFF` outlines, hard-offset white shadows (`4px 4px 0px #FFFFFF`), Electric Blue (`#398BFF`) & Vibrant Orange (`#FF851B`) accents |

---

## 2. Minimal Dark Specification (`minimal-dark`)
- **Canvas Gradient**: `linear-gradient(180deg, #061315 0%, #0A1D20 38%, #121E24 74%, #1E171D 100%)`
- **Primary Glass Card Surface**: `linear-gradient(135deg, rgba(16, 40, 44, 0.72) 0%, rgba(10, 26, 29, 0.56) 100%)` with `backdrop-filter: blur(22px) saturate(140%)`
- **Card Border & Shadow**: `1px solid rgba(255, 255, 255, 0.12)` with `0 24px 60px -12px rgba(0, 0, 0, 0.65), inset 0 1px 0 0 rgba(255, 255, 255, 0.14)`
- **Typography**: `EB Garamond` serif headings (`#ECF7F7`), `DM Sans` UI & telemetry (`#A6C4C7` secondary, `#688B8E` muted)
- **Brand Accents**: Bioluminescent Aqua (`#32D4CA`), Deep Clinical Teal (`#14969C`), Warm Coral-Amber (`#E07A5F`)

---

## 3. Vivid Dark Specification (`vivid-dark`)
- **Canvas Background**: Pure Nocturnal Black (`#050505`)
- **Card Surface**: Solid Opaque Near-Black (`#111111`) — zero transparency, zero blur
- **Card Outlines & Shadows**: `2px solid #FFFFFF` with `4px 4px 0px #FFFFFF` hard-offset shadow
- **Typography**: `Cormorant Garamond` bold display headings + `DM Sans` bold UI text (`#FFFFFF`)
- **Strict Dual-Accent System**:
  - **Electric Blue (`#398BFF`)**: Active states, primary actions, telemetry highlights, and informational badges
  - **Vibrant Orange (`#FF851B`)**: Eye-strain warnings, proximity alerts, and low-blink notifications
