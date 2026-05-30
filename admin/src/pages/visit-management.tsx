import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import api from '../lib/api';
import { VisitManagement } from '../types';
import ExportButton from '../components/ExportButton';

const STATUS_LABEL: Record<string, string> = {
  full_collection: 'Coleta completa',
  partial_collection: 'Coleta parcial',
  no_collection: 'Sem coleta',
  pending: 'Pendente',
};

const STATUS_BADGE: Record<string, string> = {
  full_collection: 'bg-green-100 text-green-700',
  partial_collection: 'bg-yellow-100 text-yellow-700',
  no_collection: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-500',
};

const STATUS_DOT: Record<string, string> = {
  full_collection: 'bg-green-500',
  partial_collection: 'bg-yellow-400',
  no_collection: 'bg-red-500',
  pending: 'bg-gray-400',
};

function KpiCard({
  label, value, color = 'text-gray-900', sub,
}: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function VisitManagementPage() {
  const [visits, setVisits] = useState<VisitManagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    technician_id: '',
    org_id: '',
    status: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      );
      const res = await api.get<VisitManagement[]>('/visits/management', { params });
      setVisits(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // KPI calculations
  const nonPending = visits.filter((v) => v.visit_status !== 'pending');
  const full = nonPending.filter((v) => v.visit_status === 'full_collection').length;
  const partial = nonPending.filter((v) => v.visit_status === 'partial_collection').length;
  const noCollection = nonPending.filter((v) => v.visit_status === 'no_collection').length;
  const compliancePct = nonPending.length > 0
    ? Math.round((full / nonPending.length) * 100)
    : 0;

  // Chart: compliance % per technician
  type TechStat = { name: string; full: number; total: number };
  const techMap = new Map<number, TechStat>();
  nonPending.forEach((v) => {
    const key = v.technician_id ?? 0;
    const s = techMap.get(key) ?? { name: v.technician_name ?? '?', full: 0, total: 0 };
    s.total++;
    if (v.visit_status === 'full_collection') s.full++;
    techMap.set(key, s);
  });
  const chartData = Array.from(techMap.values())
    .map((s) => ({ name: s.name.split(' ')[0], pct: Math.round((s.full / s.total) * 100) }))
    .sort((a, b) => b.pct - a.pct);

  const exportData = visits.map((v) => ({
    'Data/Hora': v.detected_at ? new Date(v.detected_at).toLocaleString('pt-BR') : '',
    Técnico: v.technician_name ?? '',
    ID: v.employee_id ?? '',
    Fazenda: v.org_name ?? '',
    Pendentes: v.machines_pending,
    Coletadas: v.machines_collected,
    'Não coletadas': v.machines_not_collected,
    Status: STATUS_LABEL[v.visit_status] ?? v.visit_status,
    'PINs pendentes': (v.machine_pins_pending ?? []).join(', '),
    'PINs coletados': (v.machine_pins_collected ?? []).join(', '),
    'PINs perdidos': (v.machine_pins_missed ?? []).join(', '),
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestão de Visitas em Campo</h1>
          <p className="text-gray-500 text-sm mt-1">{visits.length} visitas detectadas</p>
        </div>
        <ExportButton data={exportData} filename="gestao-visitas" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total Visitas" value={nonPending.length} />
        <KpiCard label="Coleta Completa" value={full} color="text-green-600" />
        <KpiCard label="Coleta Parcial" value={partial} color="text-yellow-600" />
        <KpiCard label="Sem Coleta" value={noCollection} color="text-red-600" />
        <KpiCard
          label="% Conformidade"
          value={`${compliancePct}%`}
          color={compliancePct >= 80 ? 'text-green-600' : compliancePct >= 50 ? 'text-yellow-600' : 'text-red-600'}
          sub="coleta completa / total"
        />
      </div>

      {/* Compliance chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Conformidade por Técnico (%)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip formatter={(v) => [`${v}%`, 'Conformidade']} />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.pct >= 80 ? '#16a34a' : entry.pct >= 50 ? '#ca8a04' : '#dc2626'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
        >
          <option value="">Todos os status</option>
          <option value="full_collection">Coleta completa</option>
          <option value="partial_collection">Coleta parcial</option>
          <option value="no_collection">Sem coleta</option>
        </select>
        <input
          type="text"
          value={filters.technician_id}
          onChange={(e) => setFilters((f) => ({ ...f, technician_id: e.target.value }))}
          placeholder="ID técnico"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
        />
        <input
          type="text"
          value={filters.org_id}
          onChange={(e) => setFilters((f) => ({ ...f, org_id: e.target.value }))}
          placeholder="ID fazenda"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
        />
        <button
          onClick={load}
          className="bg-jd-green text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700"
        >
          Filtrar
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jd-green" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Data/Hora', 'Técnico', 'Fazenda', 'Pendentes', 'Coletadas', 'Não coletadas', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visits.map((v) => (
                  <React.Fragment key={v.id}>
                    <tr
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                    >
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(v.detected_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{v.technician_name ?? '—'}</div>
                        <div className="text-xs text-gray-400">{v.employee_id}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{v.org_name ?? '—'}</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-700">{v.machines_pending}</td>
                      <td className="px-4 py-3 text-center font-semibold text-green-600">{v.machines_collected}</td>
                      <td className="px-4 py-3 text-center font-semibold text-red-500">{v.machines_not_collected}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[v.visit_status] ?? 'bg-gray-100 text-gray-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${STATUS_DOT[v.visit_status] ?? 'bg-gray-400'}`} />
                          {STATUS_LABEL[v.visit_status] ?? v.visit_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {expandedId === v.id ? '▲' : '▼'}
                      </td>
                    </tr>

                    {expandedId === v.id && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50 px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Collected */}
                            <div>
                              <p className="text-xs font-semibold text-green-700 uppercase mb-2">
                                Máquinas Coletadas ({(v.machine_pins_collected ?? []).length})
                              </p>
                              {(v.machine_pins_collected ?? []).length === 0 ? (
                                <p className="text-xs text-gray-400 italic">Nenhuma</p>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {(v.machine_pins_collected ?? []).map((pin) => (
                                    <span
                                      key={pin}
                                      className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-xs px-2 py-0.5 rounded font-mono"
                                    >
                                      ✓ {pin}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Not collected */}
                            <div>
                              <p className="text-xs font-semibold text-red-600 uppercase mb-2">
                                Máquinas Não Coletadas ({(v.machine_pins_missed ?? []).length})
                              </p>
                              {(v.machine_pins_missed ?? []).length === 0 ? (
                                <p className="text-xs text-gray-400 italic">Nenhuma</p>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {(v.machine_pins_missed ?? []).map((pin) => (
                                    <span
                                      key={pin}
                                      className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-600 text-xs px-2 py-0.5 rounded font-mono"
                                    >
                                      ✗ {pin}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {visits.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      Nenhuma visita encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
