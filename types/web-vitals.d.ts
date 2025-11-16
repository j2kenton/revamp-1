declare module 'web-vitals' {
  export type MetricRating = 'good' | 'needs-improvement' | 'poor';

  export interface Metric {
    id: string;
    name: string;
    value: number;
    delta: number;
    entries: PerformanceEntry[];
    rating: MetricRating;
    navigationType?: string;
  }

  export type ReportHandler = (metric: Metric) => void;

  export interface ReportOpts {
    reportInit?: (metric: Metric) => void;
    reportAllChanges?: boolean;
  }

  export function onCLS(cb: ReportHandler, opts?: ReportOpts): void;
  export function onFCP(cb: ReportHandler, opts?: ReportOpts): void;
  export function onINP(cb: ReportHandler, opts?: ReportOpts): void;
  export function onLCP(cb: ReportHandler, opts?: ReportOpts): void;
  export function onTTFB(cb: ReportHandler, opts?: ReportOpts): void;
}
