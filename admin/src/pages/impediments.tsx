import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import ExportButton from '../components/ExportButton';

interface Impediment {
  id: number;
  recorded_at: string;
  reason: string;
  custom_reason?: string;
  notes?: string;
  technician_name?: string;
  employee_id?: string;
  org_name?: string;
  machine_pin?: string;
  machine_custom_name?: string;
  tech_lat?: number;
  tech_lng?: number;
}

const REASON_LABELS: Record<string, string> = {
  maintenance:  'Máquina em manutenção',
  absent:       'Máquina ausente',
  in_operation: 'Em operação de campo',
  outros:       'Outros',
};

const REASON_OPTIONS = [
  { value: '',            label: 'Todos os motivos' },
  { value: 'maintenance', label: 'Máquina em manutenção' },
  { value: 'absent',      label: 'Máquina ausente' },
  { value: 'in_operation',label: 'Em operação de campo' },
  { value: 'outros',      label: 'Outros' },
];

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function ImpedimentsPage() {
  const [impediments, setImpediments] = useState<Impediment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [from, setFrom]               = useState(defaultFrom());
  const [to, setTo]                   = useState('');
  const [reason, setReason]           = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (from)   params.from   = new Date(from).toISOString();
      if (to)     params.to     = new Date(to + 'T23:59:59').toISOString();
      if (reason) params.reason = reason;

      const res = await api.get<Impediment[]>('/impediments', { params });
      setImpediments(Array.isArray(res.data) ? res.data : []);
    } catch {
      setImpediments([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, reason]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportData = impediments.map((imp) => ({
    'Data':        new Date(imp.recorded_at).toLocaleString('pt-BR'),
    'Técnico':     imp.technician_name ?? '—',
    'Funcionário': imp.employee_id ?? '—',
    'Fazenda':     imp.org_name ?? '—',
    'Máquina':     imp.machine_pin ?? imp.machine_custom_name ?? '—',
    'Motivo':      REASON_LABELS[imp.reason] ?? imp.reason,
    'Detalhes':    imp.custom_reason ?? '—',
    'Observações': imp.notes ?? '—',
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Impedimentos Registrados</h1>
          <p className="text-sm text-gray-500 mt-1">Máquinas em que o técnico não pôde atuar</p>
        </div>
        <ExportButton data={exportData} filename="impedimentos" label="Exportar Excel" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jd-green"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Até</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jd-green"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Motivo</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jd-green"
          >
            {REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-jd-green text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          Filtrar
        </button>
      </div>

      {/* Summary chips */}
      {!loading && (
        <div className="flex gap-3 flex-wrap">
          <span className="bg-amber-100 text-amber-800 text-sm font-semibold px-3 py-1.5 rounded-full">
            ⚠️ {impediments.length} impedimento{impediments.length !== 1 ? 's' : ''}
          </span>
          {Object.entries(REASON_LABELS).map(([key, label]) => {
            const count = impediments.filter((i) => i.reason === key).length;
            if (count === 0) return null;
            return (
              <span key={key} className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-full">
                {label}: {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jd-green" />
          </div>
        ) : impediments.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Nenhum impedimento encontrado no período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Data', 'Técnico', 'Fazenda', 'Máquina', 'Motivo', 'Detalhes', 'Observações'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {impediments.map((imp) => (
                  <tr key={imp.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(imp.recorded_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {imp.technician_name ?? '—'}
                      {imp.employee_id && <span className="text-xs text-gray-400 ml-1">({imp.employee_id})</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{imp.org_name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {imp.machine_pin ?? imp.machine_custom_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        imp.reason === 'absent'       ? 'bg-blue-100 text-blue-700'   :
                        imp.reason === 'maintenance'  ? 'bg-orange-100 text-orange-700' :
                        imp.reason === 'in_operation' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {REASON_LABELS[imp.reason] ?? imp.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                      {imp.custom_reason ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate text-xs">
                      {imp.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
