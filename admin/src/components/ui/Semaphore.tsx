import React from 'react';

type Level = 'red' | 'yellow' | 'green' | 'green2';

interface SemaphoreProps {
  level: Level;
  label: string;
  value: string;
  thresholds?: string;
}

const COLORS: Record<Level, { bg: string; border: string; icon: string }> = {
  red:    { bg: 'bg-red-50',    border: 'border-red-400',    icon: '🔴' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-400', icon: '🟡' },
  green:  { bg: 'bg-green-50',  border: 'border-green-500',  icon: '🟢' },
  green2: { bg: 'bg-green-100', border: 'border-green-700',  icon: '🟢🟢' },
};

export default function Semaphore({ level, label, value, thresholds }: SemaphoreProps) {
  const c = COLORS[level];
  return (
    <div className={`rounded-xl border-2 ${c.border} ${c.bg} p-4 flex flex-col gap-1`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{c.icon}</span>
        <span className="font-semibold text-gray-700 text-sm">{label}</span>
      </div>
      <span className="text-3xl font-bold text-gray-900">{value}</span>
      {thresholds && <span className="text-xs text-gray-400 mt-1">{thresholds}</span>}
    </div>
  );
}

export function getSemaphoreLevel(
  value: number,
  thresholds: [number, number, number],
  invert = false
): Level {
  // thresholds: [red_max, yellow_max, green_max] for ascending (higher = better)
  // invert = true: higher value is WORSE (e.g. risk acres)
  if (invert) {
    if (value > thresholds[1]) return 'red';
    if (value > thresholds[0]) return 'yellow';
    if (value > thresholds[2]) return 'green';
    return 'green2';
  }
  if (value < thresholds[0]) return 'red';
  if (value < thresholds[1]) return 'yellow';
  if (value < thresholds[2]) return 'green';
  return 'green2';
}
