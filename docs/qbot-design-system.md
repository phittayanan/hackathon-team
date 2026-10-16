# Q-Bot design system

The Q-Bot interface uses a soft lavender and white palette, translucent glass surfaces, generous spacing, and the native system typeface. Use these rules for new screens and controls so they feel like part of the same app.

## Color

| Token | Value | Use |
| --- | --- | --- |
| `--cream` | `#f5f2ff` | Soft lavender page surface |
| `--cream-2` | `#e9e3ff` | Deeper lavender surface |
| `--ink` | `#21183b` | Main text on light surfaces |
| `--ink-2` | `#6c6385` | Supporting text |
| `--accent` | `#7655aa` | Primary purple and focus states |
| `--accent-2` | `#c5b3e4` | Pale purple highlights and focus rings |
| `--ok` | `#23a26d` | Success state |
| `--bad` | `#d9534f` | Error state |

The app frame blends `#a58bc3`, `#8162a8`, and `#51337f`. Keep text contrast clear: use white on purple, and `--ink` on pale glass.

## Typography

- Use `--font` for body text and controls, and `--font-display` for headings. They prefer SF Pro on Apple devices and fall back to Segoe UI on Windows.
- Thai uses the device's Thai system fallback. Use regular weight (`400`) for Thai copy and controls. The Q-Bot wordmark may use bold (`700`).
- Keep the wordmark centered, large, and letter-spaced. Use short line lengths and left-aligned content within task screens.
- Suggested scale: display 42–58px, screen title 25–32px, body 15–16px, supporting text 12–14px.

## Layout and spacing

- The main experience is a portrait phone surface, 390px wide, with a 46px outer radius. On small screens it fills the viewport.
- Use a 4px spacing rhythm: 4, 8, 12, 16, 20, 24, and 32px.
- The home glass panel has a 32px radius and 12px side inset. Keep the wordmark above it, with the mascot centered and shortcuts at the bottom.
- Keep the three home shortcuts in two rows: two equal actions on top, one centered below. Preserve the 320px layout without horizontal scrolling.
- Task sheets and dialogs use 24–28px corners, 16–24px inner padding, and a clear title-to-content hierarchy.

## Glass surfaces

Use layered translucent fills instead of flat opaque cards. Blur the content behind the surface, add a light border, a bright inset highlight at the top, and a soft violet shadow. The shared CSS values are `--glass-surface`, `--glass-border`, and `--glass-shadow`.

```css
.glass-surface {
  border: 1px solid var(--glass-border);
  background: var(--glass-surface);
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(20px) saturate(130%);
  -webkit-backdrop-filter: blur(20px) saturate(130%);
}
```

Use a stronger violet gradient for primary actions and a pearl-white-to-lavender gradient for secondary actions. Keep glass text dark on bright glass and white on saturated purple.

## Components

- **Primary button:** purple glass gradient, white label, soft violet shadow, pill or 18px radius depending on context.
- **Secondary button:** pearl-to-lavender glass, dark plum label, thin white border. Shortcut buttons are pills at least 48px tall.
- **Text field:** translucent pearl fill, pill shape, 52px height, visible lavender focus ring.
- **Dialog:** pale lavender gradient glass, blurred dark-violet backdrop, 28px radius, scroll within the viewport when needed.
- **Cards:** translucent pearl/lavender fill, fine white border, 16–20px radius.
- **Language switch:** compact glass capsule; selected language uses a brighter pearl pill.
- **Focus:** visible 3px pale-purple outline with a 3px offset. Do not remove keyboard focus indication.

## Motion and states

- Use ease-out transitions around 180–250ms for hover, press, and focus feedback.
- Use 500–700ms for the home reveal. The home shortcuts and composer appear after the first greeting starts.
- Scene motion (`--grow`, `--fold` in `app.css`): a scene grows out of the mascot in about 520ms on an ease-out curve, and the home steps back (smaller, dimmer) behind it. Its blocks fade up one after another, only right after it opens. Scene to scene is a short crossfade with a small lift, not a full-screen slide. Folding back home is quicker, about 380ms.
- Keep the mascot at a stable size while voice text appears or disappears. Let the subtitle fade without changing the wordmark or mascot scale.
- Respect `prefers-reduced-motion`; remove decorative animation and transitions for users who request reduced motion.
- Use `:hover` for a small lift or brightness change and `:active` for a slight scale-down. Avoid large bounces.

## Accessibility and responsive behavior

- Keep tap targets at least 44px high; the primary home shortcuts are 48px high.
- Preserve text contrast, semantic buttons, labels, and visible focus rings.
- Let dialogs scroll within the viewport and keep the home controls usable at 320px wide.
- Never rely on color alone to distinguish success, warning, or error states.
