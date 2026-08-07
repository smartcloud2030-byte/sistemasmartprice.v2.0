import React from 'react';
import { cn } from '../../lib/utils';

const CRITICAL_THRESHOLD = 85;
const WARNING_THRESHOLD = 65;

function barColor(percent: number): string {
  if (percent >= CRITICAL_THRESHOLD) return 'bg-red-500';
  if (percent >= WARNING_THRESHOLD) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function textColor(percent: number): string {
  if (percent >= CRITICAL_THRESHOLD) return 'text-red-600';
  if (percent >= WARNING_THRESHOLD) return 'text-yellow-600';
  return 'text-emerald-600';
}

interface Props {
  label: string;
  icon: React.ElementType;
  percent: number;
  detail: string;
}

export const Gauge: React.FC<Props> = ({ label, icon: Icon, percent, detail }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-bold text-black dark:text-white">{label}</span>
      </div>
      <span className={cn('text-sm font-black', textColor(percent))}>{percent.toFixed(1)}%</span>
    </div>
    <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
      <div className={cn('h-full transition-all', barColor(percent))} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
    <p className="text-xs text-zinc-400">{detail}</p>
  </div>
);
