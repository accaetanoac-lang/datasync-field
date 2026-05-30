import React, { useState, useCallback } from 'react';
import api from '../lib/api';
import { TechnicianDetail, TechnicianActivity } from '../types';
import ExportButton from '../components/ExportButton';

const METHOD_LABEL: Record<string, string> = {
  starlink_data_sync: 'Starlink + Data Sync',
  pen_drive: 'Pen Drive',
};

const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  no_use: 'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-600',
};

function fmtMin(minutes: number): string {
  if (!minutes) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function TechnicianReportPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<TechnicianDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setExpanded(new Set());
    try {
      const params: Record<string, string> = { detail: 'true' };
      if (from) params.from = from;
      if (to)   params.to = to;
      const res = await api.get<TechnicianDetail[]>('/reports/technicians', { params });
      setData(Array.isArray(res.data) ? res.data : []);
      setLoaded(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Flat rows for Excel export (one row per activity)
  const exportRows = data.flatMap((t) =>
    (t.activities ?? []).length
      ? (t.activities ?? []).map((a: TechnicianActivity) => ({
          Técnico: t.name,
          ID: t.employee_id,
          Data: fmtDate(a.started_at),
          Organização: a.org_name ?? '',
          'Chassi/PIN': a.machine_pin ?? a.machine_custom_name ?? '',
          Método: METHOD_LABEL[a.method] ?? a.method,
          'Duração (min)': a.duration_minutes ?? '',
          Status: a.status,
          Observações: a.notes ?? '',
        }))
      : [{
          Técnico: t.name,
          ID: t.employee_id,
          Data: '', Organização: '', 'Chassi/PIN': '', Método: '',
          'Duração (min)': '', Status: 'sem atividades', Observações: '',
        }]
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatório de Técnicos</h1>
          <p className="text-gray-500 text-sm mt-1">
            Produtividade por técnico · atividades coletadas e horas por método
          </p>
        </div>
        <ExportButton data={exportRows} filename="relatorio-tecnicos" label="Exportar Excel" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Até</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="bg-jd-green text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60"
        >
          {loading ? 'Carregando…' : 'Gerar Relatório'}
        </button>
        {(from || to) && (
          <button
            onClick={() => { setFrom(''); setTo(''); }}
            className="text-sm text-gray-400 hover:text-gray-600 px-2"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Table */}
      {!loaded && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400 text-sm">
          Clique em "Gerar Relatório" para carregar os dados.
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jd-green" />
        </div>
      )}

      {loaded && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-8 px-4 py-3" />
                  {[
                    'Técnico', 'ID', 'Total Visitas', 'Máq. Coletadas',
                    'Máq. Sem Uso', 'Horas Starlink', 'Horas Pen Drive',
                    'Total Horas', 'Média / Visita',
                  ].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((t) => {
                  const isOpen = expanded.has(t.id);
                  const avgMin = t.machines_collected > 0
                    ? Math.round(t.total_minutes / t.machines_collected)
                    : 0;

                  return (
                    <React.Fragment key={t.id}>
                      {/* Summary row */}
                      <tr
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => toggle(t.id)}
                      >
                        <td className="px-4 py-3 text-gray-400 text-center select-none">
                          {isOpen ? '▾' : '▸'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{t.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.employee_id}</td>
                        <td className="px-4 py-3 text-center font-medium">{t.total_visits}</td>
                        <td className="px-4 py-3 text-center text-green-700 font-medium">{t.machines_collected}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{t.machines_no_use}</td>
                        <td className="px-4 py-3 text-center text-jd-green font-medium">
                          {fmtMin(t.starlink_minutes)}
                        </td>
                        <td className="px-4 py-3 text-center text-yellow-600 font-medium">
                          {fmtMin(t.pen_drive_minutes)}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-800">
                          {fmtMin(t.total_minutes)}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">
                          {avgMin > 0 ? fmtMin(avgMin) : '—'}
                        </td>
                      </tr>

                      {/* Expandable activity detail */}
                      {isOpen && (
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <td colSpan={10} className="px-8 py-4">
                            {(t.activities ?? []).length === 0 ? (
                              <p className="text-gray-400 text-sm italic">Nenhuma atividade no período.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500 border-b border-gray-200">
                                    <th className="text-left py-1.5 pr-4 font-semibold">Data</th>
                                    <th className="text-left py-1.5 pr-4 font-semibold">Organização</th>
                                    <th className="text-left py-1.5 pr-4 font-semibold">Chassi / PIN</th>
                                    <th className="text-left py-1.5 pr-4 font-semibold">Método</th>
                                    <th className="text-right py-1.5 pr-4 font-semibold">Duração</th>
                                    <th className="text-center py-1.5 pr-4 font-semibold">Status</th>
                                    <th className="text-left py-1.5 font-semibold">Obs.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(t.activities ?? []).map((a: TechnicianActivity) => (
                                    <tr key={a.id} className="border-b border-gray-100 last:border-0">
                                      <td className="py-1.5 pr-4 text-gray-600">{fmtDate(a.started_at)}</td>
                                      <td className="py-1.5 pr-4 text-gray-800">{a.org_name ?? '—'}</td>
                                      <td className="py-1.5 pr-4 font-mono text-gray-700">
                                        {a.machine_pin ?? a.machine_custom_name ?? '—'}
                                      </td>
                                      <td className="py-1.5 pr-4 text-gray-700">
                                        {METHOD_LABEL[a.method] ?? a.method}
                                      </td>
                                      <td className="py-1.5 pr-4 text-right text-gray-700">
                                        {a.duration_minutes != null ? `${a.duration_minutes} min` : '—'}
                                      </td>
                                      <td className="py-1.5 pr-4 text-center">
                                        <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                                          {a.status}
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-gray-500 max-w-xs truncate">
                                        {a.notes ?? ''}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {data.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                      Nenhum técnico encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
