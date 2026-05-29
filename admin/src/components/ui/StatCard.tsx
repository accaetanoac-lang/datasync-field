import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}

export default function StatCard({ title, value, subtitle, color = 'text-gray-900' }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-1">
      <span className="text-sm text-gray-500 font-medium">{title}</span>
      <span className={`text-3xl font-bold ${color}`}>{value}</span>
      {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
    </div>
  );
}
