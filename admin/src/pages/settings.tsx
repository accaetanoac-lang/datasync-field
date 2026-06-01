import React, { useEffect, useState } from 'react';
import api from '../lib/api';

interface VersionConfig {
  current_version: string;
  min_required_version: string;
  update_url: string;
  update_message: string;
  force_update: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<VersionConfig>({
    current_version: '',
    min_required_version: '',
    update_url: '',
    update_message: '',
    force_update: false,
  });

  useEffect(() => {
    api.get<VersionConfig>('/version')
      .then((res) => setForm(res.data))
      .catch(() => setError('Erro ao carregar configurações.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.put<VersionConfig>('/version', form);
      setForm(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Erro ao salvar configurações. Verifique suas permissões.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-jd-green" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Configurações do App</h1>
      <p className="text-sm text-gray-500 mb-6">Gerencie versões e atualizações do aplicativo móvel.</p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Versão Atual do App</label>
          <input
            type="text"
            value={form.current_version}
            onChange={(e) => setForm((f) => ({ ...f, current_version: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-jd-green"
            placeholder="ex: 2.2.0"
          />
          <p className="text-xs text-gray-400 mt-1">Versão mais recente disponível para download.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Versão Mínima Requerida</label>
          <input
            type="text"
            value={form.min_required_version}
            onChange={(e) => setForm((f) => ({ ...f, min_required_version: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-jd-green"
            placeholder="ex: 2.0.0"
          />
          <p className="text-xs text-gray-400 mt-1">Usuários com versão abaixo desta serão bloqueados até atualizar.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL de Download</label>
          <input
            type="text"
            value={form.update_url}
            onChange={(e) => setForm((f) => ({ ...f, update_url: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-jd-green"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem de Atualização</label>
          <textarea
            value={form.update_message}
            onChange={(e) => setForm((f) => ({ ...f, update_message: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-jd-green resize-none"
            placeholder="Mensagem exibida ao usuário ao solicitar atualização..."
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, force_update: !f.force_update }))}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              form.force_update ? 'bg-jd-green' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                form.force_update ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-gray-700">Forçar Atualização</p>
            <p className="text-xs text-gray-400">Bloqueia o uso do app até o usuário atualizar.</p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        {saved && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">Configurações salvas com sucesso.</p>}

        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-jd-green text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
