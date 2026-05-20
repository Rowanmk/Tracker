export type ChartThemeId =
  | 'crew-classic'
  | 'soft-editorial'
  | 'vibrant-dashboard'
  | 'mono-print'
  | 'high-contrast';

export interface ChartTheme {
  id: ChartThemeId;
  name: string;
  description: string;
  palette: string[];
  gridColor: string;
  gridStyle: 'solid' | 'dashed' | 'none';
  axisLabelColor: string;
  axisLabelSize: string;
  axisLabelWeight: string;
  barRadius: number;
  tooltipStyle: 'light-card' | 'dark-pill';
  fontFamily: string;
}

export const chartThemes: Record<ChartThemeId, ChartTheme> = {
  'crew-classic': {
    id: 'crew-classic',
    name: 'Crew Classic',
    description: 'Current navy/blue palette with dashed grey gridlines and sharp bars.',
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
    description: 'Muted teals, sage and dusty rose with thin solid gridlines and softer bars.',
    palette: ['#5B8E7D', '#7FA7A3', '#C58C8C', '#8AA39B', '#A4B494', '#6C8E91', '#B37A7A'],
    gridColor: '#D6DDD8',
    gridStyle: 'solid',
    axisLabelColor: '#5F6B67',
    axisLabelSize: 'text-xs',
    axisLabelWeight: 'font-normal',
    barRadius: 4,
    tooltipStyle: 'light-card',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
  'vibrant-dashboard': {
    id: 'vibrant-dashboard',
    name: 'Vibrant Dashboard',
    description: 'Bright saturated colour pops, no gridlines, rounded bars and dark-pill tooltips.',
    palette: ['#4F46E5', '#D946EF', '#F59E0B', '#10B981', '#0EA5E9', '#F43F5E', '#8B5CF6'],
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
    description: 'Greyscale with a single navy accent and faint print-friendly gridlines.',
    palette: ['#001B47', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB', '#374151', '#E5E7EB'],
    gridColor: '#ECEFF3',
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
    description: 'Bold primaries, strong gridlines and larger axis labels for maximum clarity.',
    palette: ['#0033FF', '#FF0033', '#FFD400', '#00A651', '#00B8FF', '#7A00FF', '#FF6A00'],
    gridColor: '#9CA3AF',
    gridStyle: 'solid',
    axisLabelColor: '#111827',
    axisLabelSize: 'text-sm',
    axisLabelWeight: 'font-semibold',
    barRadius: 2,
    tooltipStyle: 'dark-pill',
    fontFamily: '"Frutiger", "Helvetica Neue", "Arial", sans-serif',
  },
};