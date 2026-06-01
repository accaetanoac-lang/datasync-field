import React, { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { Activity, Impediment } from '../types';
import ExportButton from '../components/ExportButton';

const POLL_MS = 30_000;

const METHOD_LABEL: Record<string, string> = {
  starlink_data_sync: 'Starlink + Data Sync',
  pen_drive: 'Pen Drive',
  diagnosis: 'Diagnóstico',
};

const STATUS_COLORS: Record<string, string> = {
  completed:   'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  no_use:      'bg-gray-100 text-gray-600',
};

const DIAGNOSIS_RESULT_LABEL: Record<string, { label: string; color: string }> = {
  resolved:    { label: '✅ Restabelecida',    color: 'bg-green-100 text-green-700' },
  needs_return:{ label: '🔄 Requer retorno',   color: 'bg-yellow-100 text-yellow-700' },
  unidentified:{ label: '❌ Não identificado', color: 'bg-red-100 text-red-700' },
  no_modem:    { label: '📡 Sem Modem',        color: 'bg-blue-100 text-blue-700' },
};

const IMPEDIMENT_REASON_LABELS: Record<string, string> = {
  maintenance:  'Em manutenção',
  absent:       'Máquina ausente',
  in_operation: 'Em operação',
  outros:       'Outros',
};

type CombinedRow =
  | { kind: 'activity';   item: Activity;   date: number }
  | { kind: 'impediment'; item: Impediment; date: number };

export default function ActivitiesPage() {
  const router = useRouter();
  const [activities, setActivities]   = useState<Activity[]>([]);
  const [impediments, setImpediments] = useState<Impediment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [photoModal, setPhotoModal]   = useState<{ url: string; caption: string } | null>(null);
  const [filters, setFilters] = useState({
    tech_id:       '',
    org_id:        '',
    date_from:     '',
    date_to:       '',
    status:        '',
    method:        '',
    activity_type: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { activity_type, date_from, date_to, tech_id, org_id, status, method } = filters;

      const wantActivities  = activity_type !== 'impediment';
      const wantImpediments = !['diagnosis', 'normal', 'no_modem'].includes(activity_type);

      const actParams: Record<string, string> = {};
      if (date_from) actParams.date_from = date_from;
      if (date_to)   actParams.date_to   = date_to;
      if (tech_id)   actParams.tech_id   = tech_id;
      if (org_id)    actParams.org_id    = org_id;
      if (status)    actParams.status    = status;
      if (method)    actParams.method    = method;
      if (activity_type === 'diagnosis') actParams.is_diagnosis = 'true';
      else if (activity_type === 'normal') actParams.is_diagnosis = 'false';
      else if (activity_type === 'no_modem') { actParams.is_diagnosis = 'true'; actParams.diagnosis_result = 'no_modem'; }

      const impParams: Record<string, string> = {};
      if (date_from) impParams.from = new Date(date_from).toISOString();
      if (date_to)   impParams.to   = new Date(date_to + 'T23:59:59').toISOString();
      if (tech_id)   impParams.technician_id = tech_id;

      const [actRes, impRes] = await Promise.all([
        wantActivities  ? api.get<Activity[]>('/activities', { params: actParams })    : Promise.resolve({ data: [] as Activity[] }),
        wantImpediments ? api.get<Impediment[]>('/impediments', { params: impParams }) : Promise.resolve({ data: [] as Impediment[] }),
      ]);

      setActivities(Array.isArray(actRes.data) ? actRes.data : []);
      setImpediments(Array.isArray(impRes.data) ? impRes.data : []);
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

  // Merge and sort by date descending
  const combined: CombinedRow[] = [
    ...activities.map((a):  CombinedRow => ({ kind: 'activity',   item: a, date: new Date(a.created_at).getTime() })),
    ...impediments.map((i): CombinedRow => ({ kind: 'impediment', item: i, date: new Date(i.recorded_at).getTime() })),
  ].sort((a, b) => b.date - a.date);

  const exportCsv = async () => {
    try {
      const res = await api.get('/reports/export?format=csv', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'activities.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Erro ao exportar CSV.'); }
  };

  const exportRows = combined.map((row) => {
    if (row.kind === 'activity') {
      const a = row.item;
      return {
        Tipo: a.is_diagnosis ? 'Diagnóstico' : 'Coleta',
        Data: a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '',
        Técnico: a.technician_name ?? '', ID: a.employee_id ?? '',
        Organização: a.org_name ?? '', 'Chassi/PIN': a.machine_pin ?? a.machine_custom_name ?? '',
        Método: METHOD_LABEL[a.method] ?? a.method,
        'Horímetro (h)': a.current_hours ?? '', 'Diff (h)': a.hours_diff != null ? Number(a.hours_diff).toFixed(1) : '',
        'Duração (min)': a.duration_minutes ?? '', Status: a.status,
        Resultado: a.diagnosis_result ?? '', Motivo: '', Detalhes: '', Observações: a.notes ?? '',
      };
    } else {
      const i = row.item;
      return {
        Tipo: 'Impedimento',
        Data: new Date(i.recorded_at).toLocaleDateString('pt-BR'),
        Técnico: i.technician_name ?? '', ID: i.employee_id ?? '',
        Organização: i.org_name ?? '', 'Chassi/PIN': i.machine_pin ?? i.machine_custom_name ?? '',
        Método: '', 'Horímetro (h)': '', 'Diff (h)': '', 'Duração (min)': '', Status: '',
        Resultado: '', Motivo: IMPEDIMENT_REASON_LABELS[i.reason] ?? i.reason,
        Detalhes: i.custom_reason ?? '', Observações: i.notes ?? '',
      };
    }
  });

  const inProgressCount = activities.filter((a) => a.status === 'in_progress').length;
  const totalCount = combined.length;

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
            {activities.length > 0 && <span>{activities.length} atividade{activities.length !== 1 ? 's' : ''}</span>}
            {activities.length > 0 && impediments.length > 0 && <span>·</span>}
            {impediments.length > 0 && (
              <span className="text-amber-600 font-medium">⚠️ {impediments.length} impedimento{impediments.length !== 1 ? 's' : ''}</span>
            )}
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
          <ExportButton data={exportRows} filename="atividades-e-impedimentos" />
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
          disabled={filters.activity_type === 'impediment'}
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
          disabled={filters.activity_type === 'impediment'}
        >
          <option value="">Todos os métodos</option>
          <option value="starlink_data_sync">Starlink + Data Sync</option>
          <option value="pen_drive">Pen Drive</option>
        </select>
        <select
          value={filters.activity_type}
          onChange={(e) => setFilters((f) => ({ ...f, activity_type: e.target.value, status: '', method: '' }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
        >
          <option value="">Todos os tipos</option>
          <option value="diagnosis">🔧 Diagnósticos</option>
          <option value="normal">📡 Coletas normais</option>
          <option value="no_modem">📡 Sem Modem JDLink</option>
          <option value="impediment">⚠️ Impedimentos</option>
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
                  {['Data', 'Tipo', 'Técnico', 'Fazenda', 'Máquina', 'Método', 'Hor. Inf.', 'Diff h', 'Duração', 'Status', 'Resultado / Motivo', 'Foto Conexão', 'Foto Painel', 'OS'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {combined.map((row, idx) => {
                  if (row.kind === 'impediment') {
                    const imp = row.item;
                    return (
                      <tr key={`imp-${imp.id}`} className="bg-amber-50/40 hover:bg-amber-50 transition-colors">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {new Date(imp.recorded_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-amber-100 text-amber-700">
                            ⚠️ Impedimento
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{imp.technician_name ?? '—'}</div>
                          <div className="text-xs text-gray-400">{imp.employee_id ?? ''}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{imp.org_name ?? '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {imp.machine_pin ?? imp.machine_custom_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-300">—</td>
                        <td className="px-4 py-3 text-gray-300">—</td>
                        <td className="px-4 py-3 text-gray-300">—</td>
                        <td className="px-4 py-3 text-gray-300">—</td>
                        <td className="px-4 py-3 text-gray-300">—</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium whitespace-nowrap w-fit">
                              {IMPEDIMENT_REASON_LABELS[imp.reason] ?? imp.reason}
                            </span>
                            {imp.custom_reason && (
                              <span className="text-xs text-gray-500 truncate max-w-[160px]">{imp.custom_reason}</span>
                            )}
                            {imp.notes && (
                              <span className="text-xs text-gray-400 italic truncate max-w-[160px]">{imp.notes}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300">—</td>
                        <td className="px-4 py-3 text-gray-300">—</td>
                        <td className="px-4 py-3 text-gray-300">—</td>
                      </tr>
                    );
                  }

                  const a = row.item;
                  return (
                    <tr
                      key={`act-${a.id}`}
                      className={`transition-colors ${
                        a.status === 'in_progress' ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(a.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${a.is_diagnosis ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                          {a.is_diagnosis ? '🔧 Diagnóstico' : '📡 Coleta'}
                        </span>
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
                      <td className="px-4 py-3">
                        {a.is_diagnosis && a.diagnosis_result ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${DIAGNOSIS_RESULT_LABEL[a.diagnosis_result]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                            {DIAGNOSIS_RESULT_LABEL[a.diagnosis_result]?.label ?? a.diagnosis_result}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {a.connectivity_photo_url ? (
                          <button
                            onClick={() => setPhotoModal({
                              url: a.pre_signed_connectivity_photo_url ?? a.connectivity_photo_url!,
                              caption: `Foto Conexão — ${a.technician_name ?? '—'} — ${new Date(a.connectivity_photo_taken_at ?? a.created_at).toLocaleDateString('pt-BR')}`,
                            })}
                            className="block" title="Ver foto de conexão"
                          >
                            <img
                              src={a.pre_signed_connectivity_photo_url ?? a.connectivity_photo_url}
                              alt="conexão"
                              className="w-10 h-10 object-cover rounded border border-blue-200 hover:opacity-80 transition-opacity"
                            />
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {a.photo_url ? (
                          <button
                            onClick={() => setPhotoModal({
                              url: a.pre_signed_photo_url ?? a.photo_url!,
                              caption: `Foto Painel — ${a.technician_name ?? '—'} — ${new Date(a.photo_taken_at ?? a.created_at).toLocaleDateString('pt-BR')}`,
                            })}
                            className="block" title="Ver foto do painel"
                          >
                            <img
                              src={a.pre_signed_photo_url ?? a.photo_url}
                              alt="painel"
                              className="w-10 h-10 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity"
                            />
                          </button>
                        ) : (
                          <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                            Sem foto
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => router.push(`/activity-report/${a.id}`)}
                          className="text-xs font-semibold text-jd-green hover:text-green-700 whitespace-nowrap"
                          title="Ver Ordem de Serviço"
                        >
                          📄 Ver OS
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {combined.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-gray-400">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo modal */}
      {photoModal && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex flex-col items-center justify-center"
          onClick={() => setPhotoModal(null)}
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => e.key === 'Escape' && setPhotoModal(null)}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <button
            onClick={() => setPhotoModal(null)}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white text-xl transition-colors"
            aria-label="Fechar"
          >
            ✕
          </button>
          <div
            className="flex flex-col items-center gap-4 px-4 max-w-5xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={photoModal.url}
              alt="Painel da máquina"
              className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl"
            />
            <p className="text-white/90 text-sm text-center bg-black/50 px-5 py-2 rounded-full">
              {photoModal.caption}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
