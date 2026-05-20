export type ChartTooltipStyle = 'light-card' | 'dark-pill';
export type ChartGridStyle = 'solid' | 'dashed' | 'none';

export interface ChartTheme {
  id: string;
  name: string;
  description: string;
  palette: string[];
  gridColor: string;
  gridStyle: ChartGridStyle;
  axisLabelColor: string;
  axisLabelSize: string;
  axisLabelWeight: string;
  barRadius: number;
  tooltipStyle: ChartTooltipStyle;
  fontFamily: string;
}

export const chartThemes = {
  'crew-classic': {
    id: 'crew-classic',
    name: 'Crew Classic',
    description: 'Current navy/blue palette with dashed grey grids and sharp bars.',
    palette: ['#001B47', '#0060B8', '#007EE0', '#FF8A2A', '#FFB000', '#008A00', '#7C3AED'],
    gridColor: '#E5E7EB',
    gridStyle: 'dashed',
    axisLabelColor: '#6B7280',
    axisLabelSize: 'text-xs',
    axisLabelWeight: 'font-normal',
    barRadius: 2,
    tooltipStyle: 'light-card',
    fontFamily: '"Frutiger", "Helvetica Neue", "Arial", sans-serif',
  },
  'soft-editorial': {
    id: 'soft-editorial',
    name: 'Soft Editorial',
    description: 'Muted teals, sage and dusty rose with serif labels and gentle rounding.',
    palette: ['#4C8C84', '#86A89A', '#BE8A86', '#7A9CC6', '#C7A86B', '#8C6F87', '#5F7A68'],
    gridColor: '#D8E1DE',
    gridStyle: 'solid',
    axisLabelColor: '#56616B',
    axisLabelSize: 'text-xs',
    axisLabelWeight: 'font-normal',
    barRadius: 4,
    tooltipStyle: 'light-card',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
  'vibrant-dashboard': {
    id: 'vibrant-dashboard',
    name: 'Vibrant Dashboard',
    description: 'Bright saturated colour pops, no gridlines and rounded dashboard bars.',
    palette: ['#4F46E5', '#C026D3', '#F59E0B', '#10B981', '#0EA5E9', '#F43F5E', '#8B5CF6'],
    gridColor: '#FFFFFF',
    gridStyle: 'none',
    axisLabelColor: '#374151',
    axisLabelSize: 'text-xs',
    axisLabelWeight: 'font-medium',
    barRadius: 6,
    tooltipStyle: 'dark-pill',
    fontFamily: '"Frutiger", "Helvetica Neue", "Arial", sans-serif',
  },
  'mono-print': {
    id: 'mono-print',
    name: 'Mono Print',
    description: 'Greyscale-first with a navy accent and faint print-friendly guides.',
    palette: ['#001B47', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB', '#111827', '#94A3B8'],
    gridColor: '#E5E7EB',
    gridStyle: 'solid',
    axisLabelColor: '#4B5563',
    axisLabelSize: 'text-xs',
    axisLabelWeight: 'font-normal',
    barRadius: 2,
    tooltipStyle: 'light-card',
    fontFamily: '"Frutiger", "Helvetica Neue", "Arial", sans-serif',
  },
  'high-contrast': {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'Bold primaries, stronger guides and larger axis labels for clarity.',
    palette: ['#0033CC', '#E11D48', '#16A34A', '#F59E0B', '#7C3AED', '#0891B2', '#DC2626'],
    gridColor: '#9CA3AF',
    gridStyle: 'solid',
    axisLabelColor: '#111827',
    axisLabelSize: 'text-sm',
    axisLabelWeight: 'font-semibold',
    barRadius: 2,
    tooltipStyle: 'dark-pill',
    fontFamily: '"Frutiger", "Helvetica Neue", "Arial", sans-serif',
  },
} satisfies Record<string, ChartTheme>;

export type ChartThemeId = keyof typeof chartThemes;
export const defaultChartThemeId: ChartThemeId = 'crew-classic';