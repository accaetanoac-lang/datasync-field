import React from 'react';
import * as XLSX from 'xlsx';

type Row = Record<string, unknown>;

interface Props {
  data: Row[];
  filename: string;
  label?: string;
  disabled?: boolean;
}

function formatCell(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString('pt-BR');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function flattenRow(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, v]) => !Array.isArray(v))
      .map(([k, v]) => [k, formatCell(v)])
  );
}

export default function ExportButton({ data, filename, label = 'Exportar Excel', disabled }: Props) {
  const handleExport = () => {
    if (!data.length) return;

    const flat = data.map(flattenRow);
    const ws = XLSX.utils.json_to_sheet(flat);

    // Auto-width columns
    const keys = Object.keys(flat[0] ?? {});
    ws['!cols'] = keys.map((k) => ({
      wch: Math.min(60, Math.max(k.length + 2, ...flat.map((r) => String(r[k] ?? '').length + 1))),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || !data.length}
      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {label}
    </button>
  );
}
