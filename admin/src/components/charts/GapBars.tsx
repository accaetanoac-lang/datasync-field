'use client';
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { BiRow } from '../../types';

interface Props {
  biData: BiRow[];
}

export default function GapBars({ biData }: Props) {
  const totals = biData.reduce(
    (acc, row) => ({
      maxPrepare: acc.maxPrepare + (row.max_prepare ?? 0),
      ytdPrepare: acc.ytdPrepare + (row.ytd_prepare ?? 0),
      maxPlant: acc.maxPlant + (row.max_plant ?? 0),
      ytdPlant: acc.ytdPlant + (row.ytd_plant ?? 0),
      maxApply: acc.maxApply + (row.max_apply ?? 0),
      ytdApply: acc.ytdApply + (row.ytd_apply ?? 0),
      maxHarvest: acc.maxHarvest + (row.max_harvest ?? 0),
      ytdHarvest: acc.ytdHarvest + (row.ytd_harvest ?? 0),
    }),
    { maxPrepare: 0, ytdPrepare: 0, maxPlant: 0, ytdPlant: 0, maxApply: 0, ytdApply: 0, maxHarvest: 0, ytdHarvest: 0 }
  );

  const data = [
    { op: 'Preparo', Máx: totals.maxPrepare, YTD: totals.ytdPrepare, GAP: totals.maxPrepare - totals.ytdPrepare },
    { op: 'Plantio', Máx: totals.maxPlant, YTD: totals.ytdPlant, GAP: totals.maxPlant - totals.ytdPlant },
    { op: 'Aplicação', Máx: totals.maxApply, YTD: totals.ytdApply, GAP: totals.maxApply - totals.ytdApply },
    { op: 'Colheita', Máx: totals.maxHarvest, YTD: totals.ytdHarvest, GAP: totals.maxHarvest - totals.ytdHarvest },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-700 mb-4">18.5 — GAP de Hectares Conectadas por Operação</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="op" />
          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v: number) => `${v.toLocaleString('pt-BR')} ha`} />
          <Legend />
          <Bar dataKey="Máx" fill="#367C2B" />
          <Bar dataKey="YTD" fill="#FFDE00" />
          <Bar dataKey="GAP" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
