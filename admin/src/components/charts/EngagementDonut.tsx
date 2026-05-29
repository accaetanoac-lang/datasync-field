'use client';
import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BiRow } from '../../types';

interface Props {
  biData: BiRow[];
}

const ENGAGEMENT_COLORS: Record<string, string> = {
  'Highly Engaged Retained': '#367C2B',
  'R12 Digitally Engaged': '#FFDE00',
  'Highly Engaged': '#22c55e',
  'Land & Digital': '#f59e0b',
};

export default function EngagementDonut({ biData }: Props) {
  const counts: Record<string, number> = {};
  for (const row of biData) {
    if (row.engagement_level) {
      counts[row.engagement_level] = (counts[row.engagement_level] ?? 0) + 1;
    }
  }

  const data = Object.entries(counts).map(([name, value]) => ({ name, value }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-700 mb-4">18.6 — Engajamento Digital (Distribuição)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="42%"
            innerRadius={55}
            outerRadius={90}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={ENGAGEMENT_COLORS[entry.name] ?? `hsl(${i * 60}, 60%, 50%)`}
              />
            ))}
          </Pie>
          <Tooltip formatter={(v: number, name: string) => [`${v} orgs`, name]} />
          <Legend
            iconType="circle"
            iconSize={10}
            wrapperStyle={{ paddingTop: 12, fontSize: 12, lineHeight: '20px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
