'use client';
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TechnicianReport } from '../../types';

interface Props {
  data: TechnicianReport[];
}

export default function TechHoursChart({ data }: Props) {
  const chartData = data.map((t) => ({
    name: t.name.split(' ')[0],
    Starlink: Math.round((t.starlink_count / Math.max(1, t.visits)) * (t.total_minutes / 60)),
    PenDrive: Math.round((t.pen_drive_count / Math.max(1, t.visits)) * (t.total_minutes / 60)),
    totalHours: +(t.total_minutes / 60).toFixed(1),
  }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-700 mb-4">Horas por Técnico (Starlink vs Pen Drive)</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis unit="h" />
          <Tooltip formatter={(v: number) => `${v.toFixed(1)} h`} />
          <Legend />
          <Bar dataKey="Starlink" stackId="a" fill="#367C2B" />
          <Bar dataKey="PenDrive" stackId="a" fill="#FFDE00" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
