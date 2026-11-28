# Daylock Mobile - Design Preview

## Visual Design Overview

The mobile app matches Daylock's warm, paper-like aesthetic with careful attention to typography, color, and layout.

## My Day Screen Mockup

```
╔═══════════════════════════════════════╗
║  ← My Day                             ║  ← Paper (#f3f0e8) bg
║    Saturday, November 14              ║  ← Muted (#5c635c) text
║                                       ║
╟───────────────────────────────────────╢  ← Line (#c9c3b4) border
║                                       ║
║  Timeline                             ║  ← Ink (#1a1f1c) serif header
║                                       ║
║  ┌─┬─────────────────────────────┐   ║
║  │L│ Calendar · locked           │   ║  L = Locked (#1e3a5f) border
║  │O│ Team standup                │   ║  BG: Locked-soft (#dbe7f3)
║  │C│ 9:00 AM - 9:30 AM           │   ║
║  └─┴─────────────────────────────┘   ║
║                                       ║
║  ┌─┬─────────────────────────────┐   ║
║  │W│ WORK · HABIT · SOFT         │   ║  W = Work stream color
║  │O│ Daily review                │   ║  BG: Accent-soft (#d5e8dc)
║  │R│ Today                       │   ║
║  └─┴─────────────────────────────┘   ║
║                                       ║
║  ┌─┬─────────────────────────────┐   ║
║  │H│ HEALTH                      │   ║  H = Health stream color
║  │E│ Gym session                 │   ║  BG: Paper-2 (#e8e4d9)
║  │A│ 30 min                      │   ║
║  └─┴─────────────────────────────┘   ║
║                                       ║
║  ┌─┬─────────────────────────────┐   ║
║  │K│ KIDS · HARD                 │   ║  K = Kids stream color
║  │I│ Pick up from school         │   ║  BG: Hard-soft (#fde68a)
║  │D│ 3:00 PM - 3:30 PM           │   ║  Border: Hard (#b45309)
║  └─┴─────────────────────────────┘   ║
║                                       ║
║  Completed (3)                        ║  ← Ink serif header
║                                       ║
║  ┌─┬─────────────────────────────┐   ║
║  │✓│ ✓ Morning meditation        │   ║  ✓ = OK (#166534) border
║  │ │ HEALTH · 6:30 AM            │   ║  BG: Accent-soft, 70% opacity
║  └─┴─────────────────────────────┘   ║
║                                       ║
║  ┌─┬─────────────────────────────┐   ║
║  │✓│ ✓ Respond to emails         │   ║
║  │ │ WORK · 8:15 AM              │   ║
║  └─┴─────────────────────────────┘   ║
║                                       ║
╚═══════════════════════════════════════╝
```

## Widget Mockup (Medium Size)

```
┌─────────────────────────────────────┐
│ My Day             10:24 AM         │ ← Ink serif header, muted time
│                                     │   BG: Paper (#f3f0e8)
│ ┌─┬───────────────────────────┐   │
│ │L│ Team standup              │   │ ← 4px Locked border
│ │ │ 9:00 AM · Work            │   │   BG: Paper-2
│ └─┴───────────────────────────┘   │
│                                     │
│ ┌─┬───────────────────────────┐   │
│ │W│ Daily review              │   │ ← 4px Work stream border
│ │ │ Work                      │   │
│ └─┴───────────────────────────┘   │
│                                     │
│ ┌─┬───────────────────────────┐   │
│ │H│ Gym session               │   │ ← 4px Health stream border
│ │ │ 30 min · Health           │   │
│ └─┴───────────────────────────┘   │
│                                     │
│ ┌─┬───────────────────────────┐   │
│ │K│ Pick up from school       │   │ ← 4px Kids stream border
│ │ │ 3:00 PM · Kids            │   │   Hard task (amber bg)
│ └─┴───────────────────────────┘   │
│                                     │
│ ┌─┬───────────────────────────┐   │
│ │P│ Prep dinner               │   │ ← 4px Personal stream border
│ │ │ Personal                  │   │
│ └─┴───────────────────────────┘   │
└─────────────────────────────────────┘
```

## Setup Screen Mockup

```
╔═══════════════════════════════════════╗
║                                       ║
║           Daylock                     ║ ← Ink serif, 32px
║     Connect to your instance          ║ ← Muted, 16px
║                                       ║
║  ┌─────────────────────────────────┐ ║
║  │ API URL                         │ ║ ← Paper bg, Line border
║  │ https://your-daylock.com        │ ║
║  └─────────────────────────────────┘ ║
║                                       ║
║  ┌─────────────────────────────────┐ ║
║  │ API Key                         │ ║
║  │ ●●●●●●●●●●●●●●●●●●●●●●         │ ║
║  └─────────────────────────────────┘ ║
║                                       ║
║  ┌─────────────────────────────────┐ ║
║  │          Connect                │ ║ ← Ink bg, Paper text
║  └─────────────────────────────────┘ ║
║                                       ║
║   Get your API key from settings     ║ ← Muted caption
║                                       ║
╚═══════════════════════════════════════╝
```

## Color Legend

### Background Colors
- **Paper** `#f3f0e8` - Main background (warm off-white)
- **Paper-2** `#e8e4d9` - Card background (slightly darker warm)
- **Accent-soft** `#d5e8dc` - Habit/accent backgrounds (soft green)
- **Hard-soft** `#fde68a` - Hard task backgrounds (soft amber)
- **Locked-soft** `#dbe7f3` - Calendar backgrounds (soft blue)

### Border Colors (4px left border on cards)
- **Stream Colors** - Custom per stream (Work, Health, Kids, etc.)
- **Locked** `#1e3a5f` - Calendar events (navy blue)
- **Hard** `#b45309` - Hard/required tasks (amber)
- **OK** `#166534` - Completed items (dark green)
- **Line** `#c9c3b4` - Default/neutral borders

### Text Colors
- **Ink** `#1a1f1c` - Primary text
- **Muted** `#5c635c` - Secondary text, metadata
- **Accent** `#2f6f4e` - Links and primary actions

## Typography Samples

```
My Day                    ← H1: 32px semibold, Georgia/serif, Ink
Saturday, November 14     ← Subtitle: 16px regular, Muted

Timeline                  ← H2: 20px semibold, Georgia/serif, Ink

WORK · HABIT · SOFT       ← Label: 12px semibold uppercase, Muted
Daily review              ← Body: 16px semibold, Ink
Today                     ← Caption: 14px regular, Muted
```

## Design Characteristics

1. **Warm & Tactile**
   - Paper tones (#f3f0e8, #e8e4d9) evoke physical planning
   - Subtle, warm color palette throughout
   - No harsh whites or blacks

2. **Clear Hierarchy**
   - Serif font (Georgia) for headers
   - Bold 4px left borders for visual scanning
   - Uppercase labels for metadata

3. **Status Through Color**
   - Locked (navy): Can't be changed (calendar)
   - Hard (amber): Must be done
   - Stream colors: Quick identification
   - OK (green): Completed

4. **Minimal Ornamentation**
   - Flat design, no heavy shadows
   - Subtle 2px border radius
   - Clean spacing and alignment

5. **Consistent Patterns**
   - All cards use same left-border style
   - Consistent padding (16px)
   - Uniform spacing between elements

## Platform-Specific Notes

### iOS
- Uses Georgia font (built-in serif)
- System rounded corners on widgets
- SF symbols for icons where possible

### Android
- Uses generic "serif" font family
- Material design influences in animations
- Custom drawable for widget corners

## Comparison to Web App

The mobile app maintains **pixel-perfect** color matching with the web:
- ✅ Same Paper background (#f3f0e8)
- ✅ Same Ink text color (#1a1f1c)
- ✅ Same serif headers (Georgia)
- ✅ Same left-border card design (4px)
- ✅ Same status colors (locked, hard, ok)
- ✅ Same warm, tactile aesthetic

Users moving between web and mobile experience **visual continuity** - the same planning tool, same visual language, different form factor.
