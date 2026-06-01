import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import ExportButton from '../components/ExportButton';

interface NonJdMachine {
  id: number;
  serial_number?: string;
  custom_name: string;
  brand?: string;
  model?: string;
  description?: string;
  created_at: string;
  org_count?: number;
  org_names?: string;
  activity_count?: number;
  last_activity_at?: string;
}

interface NonJdMachineDetail extends NonJdMachine {
  orgs: { id: number; name: string; first_seen_at: string }[];
  activities: {
    id: number;
    created_at: string;
    status: string;
    method: string;
    duration_minutes?: number;
    technician_name?: string;
    org_name?: string;
  }[];
}

const METHOD_LABEL: Record<string, string> = {
  starlink_data_sync: 'Starlink + Data Sync',
  pen_drive: 'Pen Drive',
  diagnosis: 'Diagnóstico',
};

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function NonJdMachinesPage() {
  const [machines, setMachines]       = useState<NonJdMachine[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [detail, setDetail]           = useState<NonJdMachineDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api.get<NonJdMachine[]>('/non-jd-machines')
      .then((r) => setMachines(Array.isArray(r.data) ? r.data : []))
      .catch(() => setMachines([]))
      .finally(() => setLoading(false));
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return; }
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = await api.get<NonJdMachineDetail>(`/non-jd-machines/${id}`);
      setDetail(r.data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedId]);

  const totalActivities = machines.reduce((s, m) => s + (m.activity_count ?? 0), 0);
  const orgsWithNonJd   = new Set(
    machines.flatMap((m) => (m.org_names ?? '').split(', ').filter(Boolean))
  ).size;

  const exportRows = machines.map((m) => ({
    'Nº Série/Chassi': m.serial_number ?? '—',
    'Nome':           m.custom_name,
    'Marca':          m.brand ?? '—',
    'Modelo':         m.model ?? '—',
    'Organizações':   m.org_names ?? '—',
    'Última Visita':  m.last_activity_at ? fmtDate(m.last_activity_at) : '—',
    'Total Atividades': m.activity_count ?? 0,
    'Cadastrada em':  fmtDate(m.created_at),
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Máquinas Não John Deere</h1>
          <p className="text-sm text-gray-500 mt-1">Registro histórico de máquinas de outras marcas</p>
        </div>
        <ExportButton data={exportRows} filename="maquinas-nao-jd" label="Exportar Excel" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Máquinas cadastradas', value: machines.length, color: 'text-gray-900' },
          { label: 'Organizações atendidas', value: orgsWithNonJd, color: 'text-blue-600' },
          { label: 'Total de atividades', value: totalActivities, color: 'text-jd-green' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jd-green" />
          </div>
        ) : machines.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Nenhuma máquina não-JD cadastrada ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-8 px-4 py-3" />
                  {['Nº Série/Chassi', 'Nome', 'Marca', 'Modelo', 'Organizações', 'Última Visita', 'Atividades'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => {
                  const isOpen = selectedId === m.id;
                  return (
                    <React.Fragment key={m.id}>
                      <tr
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => loadDetail(m.id)}
                      >
                        <td className="px-4 py-3 text-gray-400 text-center select-none">
                          {isOpen ? '▾' : '▸'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {m.serial_number ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{m.custom_name}</td>
                        <td className="px-4 py-3 text-gray-700">{m.brand ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{m.model ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={m.org_names ?? ''}>
                          {m.org_names || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {m.last_activity_at ? fmtDate(m.last_activity_at) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(m.activity_count ?? 0) > 0 ? (
                            <span className="bg-jd-green/10 text-jd-green text-xs font-bold px-2 py-0.5 rounded-full">
                              {m.activity_count}
                            </span>
                          ) : (
                            <span className="text-gray-300">0</span>
                          )}
                        </td>
                      </tr>

                      {/* Detail panel */}
                      {isOpen && (
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <td colSpan={8} className="px-8 py-5">
                            {detailLoading ? (
                              <div className="flex items-center gap-2 text-gray-400 text-sm">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
                                Carregando detalhes…
                              </div>
                            ) : detail ? (
                              <div className="space-y-5">
                                {/* Machine info */}
                                <div className="flex flex-wrap gap-4 text-sm">
                                  {detail.serial_number && (
                                    <span className="text-gray-500">Série: <span className="font-mono font-semibold text-gray-800">{detail.serial_number}</span></span>
                                  )}
                                  {detail.brand && <span className="text-gray-500">Marca: <span className="font-semibold text-gray-800">{detail.brand}</span></span>}
                                  {detail.model && <span className="text-gray-500">Modelo: <span className="font-semibold text-gray-800">{detail.model}</span></span>}
                                  {detail.description && <span className="text-gray-500">Descrição: <span className="text-gray-800">{detail.description}</span></span>}
                                  <span className="text-gray-500">Cadastrada em: <span className="text-gray-800">{fmtDate(detail.created_at)}</span></span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                  {/* Orgs */}
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                      Organizações ({detail.orgs.length})
                                    </p>
                                    {detail.orgs.length === 0 ? (
                                      <p className="text-gray-400 text-xs italic">Nenhuma organização registrada.</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {detail.orgs.map((o) => (
                                          <div key={o.id} className="flex items-center justify-between py-1 border-b border-gray-100">
                                            <span className="text-sm text-gray-800">{o.name}</span>
                                            <span className="text-xs text-gray-400">{fmtDate(o.first_seen_at)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Activities */}
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                      Atividades ({detail.activities.length})
                                    </p>
                                    {detail.activities.length === 0 ? (
                                      <p className="text-gray-400 text-xs italic">Nenhuma atividade registrada.</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {detail.activities.map((a) => (
                                          <div key={a.id} className="flex items-center gap-2 py-1 border-b border-gray-100 text-xs">
                                            <span className="text-gray-500 whitespace-nowrap">{fmtDate(a.created_at)}</span>
                                            <span className="text-gray-700 flex-1 truncate">{a.technician_name ?? '—'}</span>
                                            <span className="text-gray-500">{METHOD_LABEL[a.method] ?? a.method}</span>
                                            {a.duration_minutes && <span className="text-gray-400">{a.duration_minutes}min</span>}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-gray-400 text-sm italic">Erro ao carregar detalhes.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
