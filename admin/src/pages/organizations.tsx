import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { Organization, BiRow } from '../types';

interface OrgReport extends Organization {
  offline_machines: number;
  last_visit?: string;
  last_technician?: string;
  machines_collected?: number;
  pending?: number;
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgReport[]>([]);
  const [biData, setBiData] = useState<Record<number, BiRow>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OrgReport | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<OrgReport[]>('/reports/organizations'),
      api.get<BiRow[]>('/reports/bi'),
    ]).then(([orgRes, biRes]) => {
      setOrgs(orgRes.data);
      const biMap: Record<number, BiRow> = {};
      for (const row of biRes.data) biMap[row.org_id] = row;
      setBiData(biMap);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  const bi = selected ? biData[selected.id] : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organizações</h1>
        <p className="text-gray-500 text-sm mt-1">{filtered.length} organizações</p>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar organização..."
        className="w-full max-w-md border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
      />

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
                  {['Organização', 'ID JD', 'Máq. Offline', 'Técnico', 'Última Visita', 'Coletadas', 'Pendentes', 'Engajamento'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelected(o)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{o.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{o.org_id_jd}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${
                        (o.offline_machines ?? 0) > 5 ? 'text-red-600' :
                        (o.offline_machines ?? 0) > 0 ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {o.offline_machines ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{o.last_technician ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {o.last_visit ? new Date(o.last_visit).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-green-600 font-medium">{o.machines_collected ?? 0}</td>
                    <td className="px-4 py-3 text-red-500 font-medium">{o.pending ?? 0}</td>
                    <td className="px-4 py-3">
                      {biData[o.id]?.engagement_level ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {biData[o.id].engagement_level}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Org drilldown modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="font-bold text-gray-900">{selected.name}</h2>
                <p className="text-xs text-gray-400">ID: {selected.org_id_jd}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {bi && (
                <>
                  <h3 className="font-semibold text-gray-800">Saúde Digital (CDE)</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <InfoRow label="Nível de Engajamento" value={bi.engagement_level ?? '—'} />
                    <InfoRow label="Total Modems" value={String(bi.all_modems ?? '—')} />
                    <InfoRow label="Modems Inativos" value={String(bi.non_active_modems ?? '—')} />
                    <InfoRow label="Gen4/G5 Conectadas" value={String(bi.lg_ag_connected_gen45 ?? '—')} />
                    <InfoRow label="Hectares em Risco" value={bi.risk_acres ? `${bi.risk_acres.toLocaleString('pt-BR')} ha` : '—'} />
                    <InfoRow label="Hectares Engajados" value={bi.highly_engaged_acres ? `${bi.highly_engaged_acres.toLocaleString('pt-BR')} ha` : '—'} />
                    <InfoRow label="Média R12 VCA" value={String(bi.r12_vca_avg ?? '—')} />
                    <InfoRow label="Último Login Web" value={bi.last_login_web ?? '—'} />
                    <InfoRow label="Último Login Mobile" value={bi.last_login_mobile ?? '—'} />
                  </div>

                  <h3 className="font-semibold text-gray-800 mt-4">VCAs Ativas</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: 'Setup File', value: bi.vca_setup_file },
                      { label: 'Work Plan', value: bi.vca_work_plan },
                      { label: 'Field/Boundary', value: bi.vca_field_boundary },
                      { label: 'Equipment Monitoring', value: bi.vca_equipment_monitoring },
                      { label: 'Work Details', value: bi.vca_work_details },
                      { label: 'Agronomic Reports', value: bi.vca_agronomic_reports },
                    ].map((vca) => (
                      <div key={vca.label} className="flex items-center gap-2">
                        <span className={vca.value ? 'text-green-500' : 'text-red-400'}>
                          {vca.value ? '✓' : '✗'}
                        </span>
                        <span className={vca.value ? 'text-gray-700' : 'text-gray-400'}>{vca.label}</span>
                      </div>
                    ))}
                  </div>

                  <h3 className="font-semibold text-gray-800 mt-4">GAP de Hectares</h3>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                    <div className="font-semibold text-gray-700">Operação</div>
                    <div className="font-semibold text-gray-700">YTD</div>
                    <div className="font-semibold text-gray-700">GAP</div>
                    {[
                      { op: 'Colheita', ytd: bi.ytd_harvest, gap: bi.gap_harvest },
                      { op: 'Preparo', ytd: bi.ytd_prepare, gap: bi.gap_prepare },
                      { op: 'Plantio', ytd: bi.ytd_plant, gap: bi.gap_plant },
                      { op: 'Aplicação', ytd: bi.ytd_apply, gap: bi.gap_apply },
                    ].map((r) => (
                      <React.Fragment key={r.op}>
                        <div>{r.op}</div>
                        <div>{r.ytd?.toLocaleString('pt-BR') ?? '—'} ha</div>
                        <div className="text-red-500">{r.gap?.toLocaleString('pt-BR') ?? '—'} ha</div>
                      </React.Fragment>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
