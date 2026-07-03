# Crew Tracker Design System

## 1. Project Identity

**Product name:** Crew Tracker  
**Primary purpose:** Performance tracking, target management, delivery visibility, and operational reporting for accounting teams.  
**Brand style:** Professional, data-led, high-contrast, dashboard-first interface using a navy-led brand palette with blue, orange, and gold accents.

---

## 2. Core Brand Palette

### Primary colours

| Token | Hex | Usage |
|---|---:|---|
| `--ac-blue-dark` | `#001B47` | Primary brand colour, headers, tile headers, primary buttons, progress markers |
| `--ac-blue-dark-hover` | `#00245F` | Primary button hover state |
| `--ac-blue` | `#0060B8` | Header gradient, secondary brand blue |
| `--ac-blue-light` | `#007EE0` | Header gradient, highlighted blue accent |
| `--ac-orange` | `#FF8A2A` | Warning/orange status, header gradient |
| `--ac-gold` | `#FFB000` | Gold brand accent, header gradient |

### Functional colours

| Purpose | Tailwind / Hex | Usage |
|---|---|---|
| Success | `green-500`, `#10B981`, `#008A00` | Ahead, on track, positive status |
| Warning | `orange-500`, `#F59E0B`, `#FF8A2A` | Slightly behind, attention required |
| Error | `red-500`, `#EF4444`, `#FF3B30` | Behind, failed states, critical variance |
| Neutral surfaces | `gray-50` to `gray-900` | Page backgrounds, borders, tables, dark mode |
| White | `#FFFFFF` | Cards, tiles, inputs, modal surfaces |

---

## 3. Typography

### Primary font

```css
font-family: "Frutiger", "Helvetica Neue", "Arial", sans-serif;
```

### Font files

| Weight | File |
|---|---|
| Regular `400` | `/fonts/frutiger/Frutiger-Regular.woff2` and `.woff` |
| Bold `700` | `/fonts/frutiger/Frutiger-Bold.woff2` and `.woff` |
| Light `300` | `/fonts/frutiger/Frutiger-Light.woff2` and `.woff` |

### Common text styles

| Element | Technical style |
|---|---|
| Page title | `text-3xl font-bold tracking-tight text-gray-900 dark:text-white` |
| Page subtitle | `mt-2 text-sm font-normal text-gray-600 dark:text-gray-400` |
| Tile header | White bold text on `#001B47` |
| Navigation | `text-xl font-semibold text-white` |
| Table headings | `text-xs font-bold uppercase tracking-wide` |
| Chart labels | Theme-controlled `text-xs` or `text-sm`, normal to semibold weight |

---

## 4. Layout System

### Global layout

| Area | Technical detail |
|---|---|
| App background | `bg-gray-50 dark:bg-gray-900` |
| Main content padding | `px-6 py-6` |
| Header | Sticky top navigation with full-width brand gradient |
| Header gradient | `linear-gradient(to right, #001B47, #0060B8, #007EE0, #FF8A2A, #FFB000)` |
| Page spacing | Standard page sections use `space-y-6` |
| Card spacing | Common internal padding: `p-4`, `p-6` |

### Responsive behaviour

| Component | Behaviour |
|---|---|
| Dashboard tiles | `grid grid-cols-1 lg:grid-cols-3 gap-6` |
| Settings forms | Stack on mobile, grid columns on medium+ screens |
| Tables | Horizontal scroll using `overflow-x-auto` |
| Header nav | Hidden below `md`, visible as horizontal links from `md` upward |

---

## 5. Reusable UI Components

### Primary button

```css
.btn-primary {
  color: white;
  font-weight: 600;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  background-color: #001B47;
}
.btn-primary:hover {
  background-color: #00245F;
}
```

### Secondary button

```css
.btn-secondary {
  border-color: #001B47;
  color: #001B47;
}
.btn-secondary:hover {
  background-color: #001B47;
  color: white;
}
```

### Branded tile

```css
.tile-brand {
  border: 2px solid #001B47;
  border-radius: 12px;
  background-color: white;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}
```

### Tile header

```css
.tile-header {
  background-color: #001B47;
  color: white;
  padding: 8px 12px;
  border-radius: 8px 8px 0 0;
}
```

### Inputs and selects

Common technical classes:

```txt
px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
bg-white dark:bg-gray-700 text-gray-900 dark:text-white
focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
```

Number inputs intentionally hide browser spinner controls.

---

## 6. Data Visualisation System

Crew Tracker uses SVG-based custom chart components and Tremor charts.

### Shared chart theme architecture

Chart configuration lives in `src/utils/chartThemes.ts` and is provided through `ChartThemeContext`.

Each chart theme defines:

| Property | Purpose |
|---|---|
| `palette` | Ordered colour set used for bars, lines, rankings, and chart segments |
| `gridColor` | SVG gridline colour |
| `gridStyle` | `solid`, `dashed`, or `none` |
| `axisLabelColor` | Axis label and chart annotation colour |
| `axisLabelSize` | Tailwind text-size class |
| `axisLabelWeight` | Tailwind font-weight class |
| `barRadius` | SVG bar corner radius |
| `tooltipStyle` | Tooltip visual mode |
| `fontFamily` | Chart-specific font stack |

### Available chart themes

| Theme | Technical look |
|---|---|
| Crew Classic | Navy/blue core palette, dashed grey grids, compact labels |
| Soft Editorial | Muted teal/sage/rose palette, serif labels, softer bar rounding |
| Vibrant Dashboard | Saturated palette, no gridlines, rounded bars, dark tooltips |
| Mono Print | Greyscale with navy accent, print-friendly guides |
| High Contrast | Strong primaries, solid guides, larger labels |

---

## 7. Chart Components

### Accountant Progress tile

**File:** `src/components/TeamProgressTile.tsx`

| Graphic element | Technical detail |
|---|---|
| Horizontal progress bars | `h-7` rounded bars inside grey tracks |
| Actual fill | Theme palette colour based on run-rate performance |
| Expected marker | Absolute vertical marker at expected progress percentage |
| Variance label | Right-side `+/-` indicator coloured by status |
| Tooltip | Absolute positioned card, sorted by accountant completion percentage descending |

### Employee Progress chart

**File:** `src/components/EmployeeProgressChart.tsx`

| Graphic element | Technical detail |
|---|---|
| SVG viewbox | `800 x 300` |
| Baseline | `BASELINE_Y = 250` |
| Bar colours | Derived from theme palette and run-rate thresholds |
| 100% reference | Dashed horizontal line in percent mode |
| Tooltip | Accountant or service split with delivered, target, and run-rate data |

### Run Rate tile

**File:** `src/components/RunRateTile.tsx`

| Graphic element | Technical detail |
|---|---|
| SVG viewbox | `800 x 320` |
| Bars | Cumulative delivered by day |
| Line | Dashed target run-rate polyline |
| Labels | Daily ahead/behind variance labels above bars |
| Tooltip | Day-level accountant split with cumulative delivered and ahead/behind values |

### Self Assessment Progress chart

**File:** `src/components/SelfAssessmentProgressChart.tsx`

| Graphic element | Technical detail |
|---|---|
| SVG viewbox | `1000 x 460` |
| Lines | One cumulative completion line per accountant |
| Target line | Dashed planned cumulative target line |
| Today marker | Vertical dashed line with current target percentage |
| Legend | Clickable accountant buttons below chart |
| Tooltip | Completed, remaining, and annual target values |

### Stats and Figures charts

**File:** `src/pages/TeamView.tsx`

| Graphic element | Technical detail |
|---|---|
| Combo chart | SVG bars for monthly actuals plus line for rolling average |
| Ranking chart | Horizontal SVG bar ranking by accountant |
| Heatmap | HTML table cells coloured by delivery intensity |
| Service tabs | Metric cards coloured by active theme palette |

### Annual Summary charts

**File:** `src/pages/AnnualSummary.tsx`

| Graphic element | Technical detail |
|---|---|
| Monthly stacked bar | Tremor `BarChart` |
| Service mix donut | Tremor `DonutChart` |
| Leaderboard tables | Printable tables with highlighting for major movement |
| Print styling | Embedded `@media print` CSS for A4 output |

---

## 8. Status Logic

### Run-rate colour thresholds

| Condition | Status | Default visual |
|---|---|---|
| At or ahead of run rate | Good | Green |
| Slightly behind | Warning | Orange |
| Significantly behind | Risk | Red |

### Common percentage status

```ts
if (percentage >= 90) return green;
if (percentage >= 75) return orange;
return red;
```

### Self Assessment run-rate threshold

| Run-rate percentage | Status |
|---:|---|
| `>= 95%` | On or ahead |
| `75% – 94%` | Slightly behind |
| `< 75%` | Significantly behind |

---

## 9. Tables

### Common table styling

| Element | Technical detail |
|---|---|
| Header rows | `bg-gray-50`, uppercase labels |
| Alternating rows | `bg-white` and `bg-gray-50/50` |
| Hover state | `hover:bg-gray-50` or themed hover colours |
| Sticky headers | Used in scrollable performance tables |
| Sticky totals | Used in Self Assessment tables and tracker summaries |
| Borders | `border-gray-200 dark:border-gray-700` |

### Tracker table

| Graphic element | Technical detail |
|---|---|
| Day headers | Compact columns with weekend/public holiday highlight |
| Editable cells | Number inputs, full-cell height, centred text |
| Team View cells | Read-only summary blocks with dash for zero |
| Weekend/holiday highlight | Red-tinted background |

### Targets table

| Graphic element | Technical detail |
|---|---|
| Staff cards | One card per accountant |
| Active staff header | Blue gradient |
| Untargeted staff header | Grey gradient |
| Locked Self Assessment cells | Slate/grey background and disabled cursor |
| Totals | Fixed-width total column with bold text |

---

## 10. Navigation

### Header

| Graphic element | Technical detail |
|---|---|
| Wrapper | `sticky top-0 z-50` |
| Background | Brand gradient from navy to gold |
| Title | `text-4xl font-extrabold text-white tracking-wide` |
| Nav links | White, semibold, hover opacity transition |
| Accountant dropdown | White translucent button on header |

### Dropdowns

| Graphic element | Technical detail |
|---|---|
| Container | White rounded card with shadow and border |
| Active option | Blue-tinted background |
| Section labels | Tiny uppercase grey labels |
| Scroll area | Max height with overflow-y auto |

---

## 11. Dark Mode

Dark mode is enabled through Tailwind class strategy:

```js
darkMode: "class"
```

The `ThemeProvider` stores the selected theme in local storage and toggles the `dark` class on the root document element.

Common dark-mode conventions:

| Light | Dark |
|---|---|
| `bg-white` | `dark:bg-gray-800` |
| `text-gray-900` | `dark:text-white` |
| `border-gray-200` | `dark:border-gray-700` |
| `bg-gray-50` | `dark:bg-gray-700/30` |

---

## 12. Motion and Interaction

### Animations

```css
.animate-fade-in {
  animation: fadeIn 0.25s ease-in-out;
}

.animate-slide-up {
  animation: slideUp 0.25s ease-in-out;
}
```

### Transitions

Common transition patterns:

```txt
transition
transition-colors
transition-all duration-300 ease-in-out
transition-[width] duration-[800ms] ease-in-out
```

### Hover states

| UI area | Technical behaviour |
|---|---|
| Buttons | Darker background or subtle neutral fill |
| Cards | `hover:shadow-md` where used |
| Table rows | Slight grey or themed background |
| Chart bars | Cursor pointer and tooltip display |

---

## 13. Print Design

Annual Summary includes dedicated A4 print styling.

| Print element | Technical detail |
|---|---|
| Page size | `@page { size: A4 portrait; margin: 10mm; }` |
| Hidden screen UI | Header, nav, controls, page headers |
| Cards | Shadows removed and page-break avoidance enabled |
| Charts | Fixed print heights for stable output |
| Page breaks | Explicit `.annual-page-break` sections |

---

## 14. Accessibility Notes

| Area | Technical detail |
|---|---|
| Inputs | Labels paired visually with controls |
| Buttons | Clear text labels and focus ring styles |
| Playback day buttons | `aria-pressed`, `aria-current`, and `aria-label` |
| Modals | High z-index overlays with focused action choices |
| Colour status | Most status indicators include text/numeric labels, not only colour |

---

## 15. Key CSS Files

| File | Purpose |
|---|---|
| `index.css` | Main Tailwind entry, brand tokens, shared component classes |
| `styles.css` | Legacy/shared stylesheet with matching design tokens |
| `tailwind.config.js` | Theme extension, font stack, Tremor token mapping, safelist |

---

## 16. Key Design-Related Source Files

| File | Purpose |
|---|---|
| `src/utils/chartThemes.ts` | Chart theme definitions |
| `src/context/ChartThemeContext.tsx` | Chart theme provider and persistence |
| `src/pages/Settings.tsx` | Chart appearance selector and design documentation access |
| `src/components/Layout.tsx` | Global header, navigation, and account dropdown |
| `src/components/TeamProgressTile.tsx` | Accountant progress bars and tooltip design |
| `src/components/EmployeeProgressChart.tsx` | Main SVG progress bar chart |
| `src/components/RunRateTile.tsx` | Daily cumulative run-rate chart |
| `src/components/SelfAssessmentProgressChart.tsx` | Self Assessment cumulative line chart |
| `src/pages/AnnualSummary.tsx` | Printable annual report design |
| `src/pages/TeamView.tsx` | Stats charts and delivery heatmap |

---

## 17. Implementation Rules for Future Design Work

1. Preserve the navy-led brand system unless a redesign is explicitly requested.
2. Reuse `tile-brand`, `tile-header`, `btn-primary`, and `btn-secondary` before creating new classes.
3. Keep dashboard chart styling controlled through `ChartThemeContext`.
4. Use existing grey surface hierarchy for tables and cards.
5. Preserve dark-mode class conventions.
6. Keep data visualisations labelled with actual values, percentages, or variance.
7. Prevent colour-only communication for status-critical states.
8. Use horizontal scrolling for dense operational tables rather than compressing content below readable sizes.
9. Keep print-specific annual-report styles isolated inside Annual Summary.
10. Maintain Frutiger as the default product font stack.