'use client';
import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SummaryStats } from '../../types';

interface Props {
  stats: SummaryStats;
}

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#1a1a1a'];

export default function ConnectivityPie({ stats }: Props) {
  const { machines } = stats;
  const online = machines.total - machines.range_30_60 - machines.range_61_365 - machines.range_365plus - machines.no_connection_date;

  const data = [
    { name: 'Online / < 30 dias', value: Math.max(0, online) },
    { name: '30–60 dias offline', value: machines.range_30_60 },
    { name: '61–365 dias offline', value: machines.range_61_365 },
    { name: '365+ dias offline', value: machines.range_365plus + machines.no_connection_date },
  ].filter((d) => d.value > 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-700 mb-4">Conectividade de Máquinas</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={90}
            dataKey="value"
            label={({ name, percent }) => `${(percent * 100).toFixed(1)}%`}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => [`${v} máquinas`, '']} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
