# Daylock Mobile Design System

This document outlines the mobile app's design system, which matches the web app's warm, paper-like aesthetic.

## Design Philosophy

Daylock's design mimics a physical planning system with warm paper tones, clear hierarchy, and thoughtful use of color to indicate status and streams. The mobile app maintains this aesthetic for a cohesive cross-platform experience.

## Color Palette

### Core Colors
- **Ink** `#1a1f1c` - Primary text color (dark green-black)
- **Paper** `#f3f0e8` - Main background (warm off-white)
- **Paper-2** `#e8e4d9` - Secondary background for cards
- **Line** `#c9c3b4` - Borders and dividers (warm gray)
- **Muted** `#5c635c` - Secondary text (muted green-gray)

### Semantic Colors
- **Accent** `#2f6f4e` - Primary actions and highlights (forest green)
- **Accent Soft** `#d5e8dc` - Soft backgrounds for accented content

### Status Colors
- **Hard** `#b45309` - Hard/required tasks (amber)
- **Hard Soft** `#fde68a` - Background for hard tasks
- **Locked** `#1e3a5f` - Calendar/locked events (navy blue)
- **Locked Soft** `#dbe7f3` - Background for calendar events
- **Danger** `#9f1239` - Errors and warnings (crimson)
- **OK** `#166534` - Success and completed items (dark green)

### Stream Colors
Streams use custom colors defined by the user (e.g., Work, Health, Kids). Each task is color-coded with a 4px left border in its stream's color.

## Typography

### Font Families
- **Display Font**: Georgia (iOS) / Serif (Android) - Used for headers and titles
- **Body Font**: System default - Used for body text

### Text Styles
```
H1 (Page Title)
- Size: 32px
- Weight: Semibold (600)
- Font: Display (Georgia)
- Color: Ink

H2 (Section Title)
- Size: 20px
- Weight: Semibold (600)
- Font: Display (Georgia)
- Color: Ink

Body
- Size: 16px
- Weight: Regular (400)
- Color: Ink

Caption
- Size: 14px
- Weight: Regular (400)
- Color: Muted

Label (Metadata)
- Size: 12px
- Weight: Semibold (600)
- Color: Muted
- Transform: Uppercase
- Letter Spacing: 0.5px
```

## Layout Components

### Task Card
Cards use a left-border design language borrowed from the web app:

```
┌─────────────────────────────────┐
│[4px]                            │
│[BOX] ● Task Title               │
│      Small meta text            │
│                                 │
└─────────────────────────────────┘
```

**Anatomy:**
- 4px colored left border (stream color)
- Background: Paper-2 (`#e8e4d9`)
- 16px padding
- 2px border radius
- No shadow (matches web's flat design)

**Variants:**
1. **Default Task** - Paper-2 background, stream-colored border
2. **Calendar Event** - Locked-Soft background, Locked border
3. **Hard Task** - Hard-Soft background, Hard border
4. **Completed** - Accent-Soft background, OK border, 70% opacity

### Widget Layout

**Small Widget (iOS/Android)**
- 4-5 tasks maximum
- Minimal padding (12px)
- Shows: time, title, stream name

**Medium Widget (iOS/Android)**
- 5-6 tasks maximum
- Standard padding (16px)
- Shows: time, title, stream name, indicators

**Large Widget (iOS)**
- Up to 8 tasks
- Standard padding (16px)
- Shows full details

## Screen Layouts

### My Day Screen

```
┌─────────────────────────────────────┐
│ ← My Day                            │
│   Saturday, November 14             │
├─────────────────────────────────────┤
│                                     │
│ ┌─ Timeline ─────────────────────┐ │
│ │                                 │ │
│ │ [LOCKED] Calendar Event         │ │
│ │ [STREAM] Task 1                 │ │
│ │ [STREAM] Task 2                 │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ Completed (3) ────────────────┐ │
│ │                                 │ │
│ │ ✓ Finished task                 │ │
│ │ ✓ Another task                  │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### Setup Screen

```
┌─────────────────────────────────────┐
│                                     │
│          Daylock                    │
│    Connect to your instance         │
│                                     │
│  ┌─────────────────────────────┐  │
│  │ API URL                     │  │
│  └─────────────────────────────┘  │
│                                     │
│  ┌─────────────────────────────┐  │
│  │ API Key                     │  │
│  └─────────────────────────────┘  │
│                                     │
│  ┌─────────────────────────────┐  │
│  │        Connect             │  │
│  └─────────────────────────────┘  │
│                                     │
│   Get your API key from settings   │
│                                     │
└─────────────────────────────────────┘
```

## Spacing System

- **xs**: 4px - Tight spacing within components
- **sm**: 8px - Component internal spacing
- **md**: 12px - Small gaps between elements
- **lg**: 16px - Standard padding and gaps
- **xl**: 20px - Section spacing
- **xxl**: 24px - Large section separation

## Border Radius

- **sm**: 2px - Cards and buttons (subtle)
- **md**: 4px - Inputs and containers
- **lg**: 8px - Modals and panels
- **xl**: 12px - Large containers

## Interaction States

### Buttons
- **Default**: Ink background, Paper text
- **Hover**: 90% opacity (web)
- **Pressed**: 80% opacity
- **Disabled**: 50% opacity

### Cards
- **Default**: Paper-2 background
- **Pressed**: 95% opacity
- No hover state on mobile

### Inputs
- **Default**: Paper background, Line border
- **Focus**: Accent border
- **Error**: Danger border
- **Disabled**: 50% opacity

## Design Principles

1. **Warm & Tactile**: Use warm paper tones to evoke physical planning tools
2. **Clear Hierarchy**: Bold display font for headers, left-border cards for visual scanning
3. **Status Through Color**: Hard tasks (amber), locked events (navy), completed (green)
4. **Minimal Ornamentation**: Flat design, subtle borders, no heavy shadows
5. **Stream Identity**: Color-coded left borders for immediate stream recognition

## Platform-Specific Notes

### iOS
- Uses Georgia for display font (built-in serif)
- Widget corners automatically rounded by system
- Safe area insets handled by React Native

### Android
- Uses generic "serif" font family
- Widget corners specified in drawable
- Status bar color matches Paper background

## Figma Design File

A complete Figma design file with all screens, components, and the full design system is available for design handoff and developer reference. The file includes:

- **Design System Page**: All colors, typography, spacing tokens
- **Components Page**: Reusable UI components (cards, buttons, inputs)
- **Screens Page**: Complete mobile screens (My Day, Setup)
- **Widgets Page**: iOS and Android widget layouts in all sizes
- **Assets Page**: Icons and illustrations

The Figma file URL should be added here once created by the design team.

## Design Assets

### Required Assets
- App icon (1024x1024)
- Splash screen (1242x2436)
- Widget preview images
- Empty state illustrations

All assets should maintain the warm, paper-like aesthetic with the Daylock color palette.
