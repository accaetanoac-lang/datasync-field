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
    // Use actual duration per method so short activities still appear
    'Starlink': +(Number(t.starlink_minutes) / 60).toFixed(2),
    'Pen Drive': +(Number(t.pen_drive_minutes) / 60).toFixed(2),
    totalHours: +(Number(t.total_minutes) / 60).toFixed(2),
  }));

  const hasData = chartData.some((d) => d.totalHours > 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-700 mb-1">Horas por Técnico (Starlink vs Pen Drive)</h3>
      <p className="text-xs text-gray-400 mb-4">
        Apenas atividades concluídas · duração real por método
      </p>
      {!hasData ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
          Nenhuma atividade concluída registrada.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis unit="h" tickFormatter={(v: number) => v < 1 ? `${Math.round(v * 60)}m` : `${v.toFixed(1)}h`} />
            <Tooltip
              formatter={(v: number, name: string) =>
                v < 1
                  ? [`${Math.round(v * 60)} min`, name]
                  : [`${v.toFixed(1)} h`, name]
              }
            />
            <Legend />
            <Bar dataKey="Starlink" stackId="a" fill="#367C2B" />
            <Bar dataKey="Pen Drive" stackId="a" fill="#FFDE00" />
          </BarChart>
        </ResponsiveContainer>
      )}
      {/* Summary table below chart */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs text-gray-600">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-1 font-semibold">Técnico</th>
              <th className="text-right py-1 font-semibold">Visitas</th>
              <th className="text-right py-1 font-semibold">Coletadas</th>
              <th className="text-right py-1 font-semibold">Starlink</th>
              <th className="text-right py-1 font-semibold">Pen Drive</th>
              <th className="text-right py-1 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.id} className="border-b border-gray-50">
                <td className="py-1">{t.name}</td>
                <td className="py-1 text-right">{Number(t.visits)}</td>
                <td className="py-1 text-right">{Number(t.machines_collected)}</td>
                <td className="py-1 text-right">{Number(t.starlink_minutes)} min</td>
                <td className="py-1 text-right">{Number(t.pen_drive_minutes)} min</td>
                <td className="py-1 text-right font-semibold">{Number(t.total_minutes)} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
