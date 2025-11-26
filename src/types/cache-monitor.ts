/**
 * Types for Cache Monitoring and Alerting
 */

export interface Alert {
  severity: 'warning' | 'critical';
  metric: string;
  threshold: number;
  actual: number;
  action: string;
  change?: string;
}
