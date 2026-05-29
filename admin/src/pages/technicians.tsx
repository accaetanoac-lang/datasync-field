import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { Technician, Activity } from '../types';

const EMPLOYEE_ID_REGEX = /^x\d{6}$/;

export default function TechniciansPage() {
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [techActivities, setTechActivities] = useState<Activity[]>([]);
  const [form, setForm] = useState({ employee_id: '', name: '', email: '', role: 'technician' });
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<Technician[]>('/technicians');
      setTechs(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadTechActivities = async (id: number) => {
    const res = await api.get<Activity[]>(`/technicians/${id}/activities`);
    setTechActivities(res.data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMPLOYEE_ID_REGEX.test(form.employee_id)) {
      setFormError('ID deve ter formato x000000 (x + 6 dígitos).');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Nome é obrigatório.');
      return;
    }

    try {
      await api.post('/technicians', form);
      setShowForm(false);
      setForm({ employee_id: '', name: '', email: '', role: 'technician' });
      setFormError('');
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao cadastrar.';
      setFormError(msg);
    }
  };

  const toggleActive = async (tech: Technician) => {
    try {
      await api.put(`/technicians/${tech.id}`, { active: !tech.active });
      await load();
    } catch {
      alert('Erro ao atualizar técnico.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gestão de Técnicos</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-jd-green text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          {showForm ? 'Cancelar' : '+ Novo Técnico'}
        </button>
      </div>

      {/* New technician form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Cadastrar Novo Técnico</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ID do Funcionário *
              </label>
              <input
                value={form.employee_id}
                onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value.toLowerCase() }))}
                placeholder="x000000"
                maxLength={7}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail (opcional)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Função</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
              >
                <option value="technician">Técnico de Campo</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            {formError && (
              <div className="col-span-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">{formError}</div>
            )}

            <div className="col-span-2">
              <button
                type="submit"
                className="bg-jd-green text-white text-sm font-semibold px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                Cadastrar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Technician table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jd-green" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['ID', 'Nome', 'Função', 'Atividades', 'Último acesso', 'Status', 'Ações'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {techs.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{t.employee_id}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {t.role === 'admin' ? 'Administrador' : 'Técnico de Campo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{(t as unknown as { total_activities?: number }).total_activities ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {(t as unknown as { last_activity?: string }).last_activity
                      ? new Date((t as unknown as { last_activity: string }).last_activity).toLocaleDateString('pt-BR')
                      : 'Nunca'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {t.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedTech(t);
                          loadTechActivities(t.id);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Histórico
                      </button>
                      <button
                        onClick={() => toggleActive(t)}
                        className={`text-xs hover:underline ${t.active ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {t.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Tech activity history modal */}
      {selectedTech && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="font-bold text-gray-900">{selectedTech.name}</h2>
                <p className="text-xs text-gray-400">{selectedTech.employee_id}</p>
              </div>
              <button onClick={() => setSelectedTech(null)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-left py-2">Data</th>
                    <th className="text-left py-2">Fazenda</th>
                    <th className="text-left py-2">Chassi</th>
                    <th className="text-left py-2">Método</th>
                    <th className="text-right py-2">Duração</th>
                    <th className="text-center py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {techActivities.map((a) => (
                    <tr key={a.id} className="border-b border-gray-50">
                      <td className="py-2 text-gray-600">{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="py-2">{a.org_name ?? '—'}</td>
                      <td className="py-2 font-mono text-xs">{a.machine_pin ?? a.machine_custom_name ?? '—'}</td>
                      <td className="py-2">{a.method === 'starlink_data_sync' ? 'Starlink' : 'Pen Drive'}</td>
                      <td className="py-2 text-right">{a.duration_minutes != null ? `${a.duration_minutes} min` : '—'}</td>
                      <td className="py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          a.status === 'completed' ? 'bg-green-100 text-green-700' :
                          a.status === 'no_use' ? 'bg-gray-100 text-gray-500' :
                          'bg-blue-100 text-blue-600'
                        }`}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                  {techActivities.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-gray-400">Sem atividades registradas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
