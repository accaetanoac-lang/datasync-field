import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { Activity } from '../types';
import ExportButton from '../components/ExportButton';

const POLL_MS = 30_000;

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filters, setFilters] = useState({
    tech_id: '',
    org_id: '',
    date_from: '',
    date_to: '',
    status: '',
    method: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      );
      const res = await api.get<Activity[]>('/activities', { params });
      setActivities(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const exportCsv = async () => {
    try {
      const res = await api.get('/reports/export?format=csv', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'activities.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao exportar CSV.');
    }
  };

  const METHOD_LABEL: Record<string, string> = {
    starlink_data_sync: 'Starlink + Data Sync',
    pen_drive: 'Pen Drive',
  };

  const STATUS_COLORS: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    in_progress: 'bg-blue-100 text-blue-700',
    no_use: 'bg-gray-100 text-gray-600',
  };

  const inProgressCount = activities.filter((a) => a.status === 'in_progress').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Atividades Detalhadas</h1>
            {inProgressCount > 0 && (
              <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                {inProgressCount} em andamento
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-1 flex items-center gap-2">
            {activities.length} registros
            {lastUpdated && (
              <span className="flex items-center gap-1 text-gray-400">
                ·
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                Atualizado às {lastUpdated.toLocaleTimeString('pt-BR')}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="bg-jd-green text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            Exportar CSV
          </button>
          <ExportButton
            data={activities.map((a) => ({
              Data: a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '',
              Técnico: a.technician_name ?? '',
              ID: a.employee_id ?? '',
              Organização: a.org_name ?? '',
              'Chassi/PIN': a.machine_pin ?? a.machine_custom_name ?? '',
              Método: METHOD_LABEL[a.method] ?? a.method,
              'Horímetro (h)': a.current_hours ?? '',
              'Diff (h)': a.hours_diff != null ? Number(a.hours_diff).toFixed(1) : '',
              'Duração (min)': a.duration_minutes ?? '',
              Status: a.status,
              Observações: a.notes ?? '',
            }))}
            filename="atividades"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
          placeholder="De"
        />
        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
          placeholder="Até"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
        >
          <option value="">Todos os status</option>
          <option value="completed">Concluída</option>
          <option value="in_progress">Em andamento</option>
          <option value="no_use">Sem uso</option>
        </select>
        <select
          value={filters.method}
          onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
        >
          <option value="">Todos os métodos</option>
          <option value="starlink_data_sync">Starlink + Data Sync</option>
          <option value="pen_drive">Pen Drive</option>
        </select>
        <button
          onClick={load}
          className="col-span-2 md:col-span-1 bg-jd-green text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700"
        >
          Filtrar
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jd-green" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Data', 'Técnico', 'Fazenda', 'Máquina', 'Método', 'Hor. Inf.', 'Diff h', 'Duração', 'Status'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activities.map((a) => (
                  <tr
                    key={a.id}
                    className={`transition-colors ${
                      a.status === 'in_progress'
                        ? 'bg-blue-50/50 hover:bg-blue-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(a.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{a.technician_name}</div>
                      <div className="text-xs text-gray-400">{a.employee_id}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{a.org_name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {a.machine_pin ?? a.machine_custom_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {METHOD_LABEL[a.method] ?? a.method}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {a.current_hours != null ? `${a.current_hours} h` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {a.hours_diff != null ? `${Number(a.hours_diff).toFixed(1)} h` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {a.duration_minutes != null ? `${a.duration_minutes} min` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {a.status === 'in_progress' && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1" />
                        )}
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {activities.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      Nenhuma atividade encontrada.
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
