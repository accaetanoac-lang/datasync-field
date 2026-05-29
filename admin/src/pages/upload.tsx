import React, { useState, useRef, useEffect } from 'react';
import api from '../lib/api';
import { UploadHistory } from '../types';

export default function UploadPage() {
  const [mlc, setMlc] = useState<File | null>(null);
  const [cde, setCde] = useState<File | null>(null);
  const [gap, setGap] = useState<File | null>(null);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ machines_processed: number; orgs_processed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<UploadHistory[]>([]);

  const mlcRef = useRef<HTMLInputElement>(null);
  const cdeRef = useRef<HTMLInputElement>(null);
  const gapRef = useRef<HTMLInputElement>(null);

  const loadHistory = async () => {
    try {
      const res = await api.get<UploadHistory[]>('/upload/history');
      setHistory(res.data);
    } catch {
      // Ignore
    }
  };

  useEffect(() => { loadHistory(); }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mlc || !cde || !gap) {
      setError('Selecione os 3 arquivos Excel.');
      return;
    }
    if (!month) {
      setError('Selecione o mês de referência.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append('file_mlc', mlc);
    form.append('file_cde', cde);
    form.append('file_gap', gap);
    form.append('reference_month', month + '-01');

    try {
      const res = await api.post<{ machines_processed: number; orgs_processed: number }>('/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      await loadHistory();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao processar arquivos.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const DropZone = ({
    label,
    file,
    onFile,
    inputRef,
  }: {
    label: string;
    file: File | null;
    onFile: (f: File) => void;
    inputRef: React.RefObject<HTMLInputElement>;
  }) => (
    <div
      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
        file ? 'border-jd-green bg-green-50' : 'border-gray-300 hover:border-jd-green bg-white'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <div className="text-3xl mb-2">{file ? '✅' : '📁'}</div>
      <div className="font-semibold text-gray-700 text-sm">{label}</div>
      <div className="text-xs text-gray-400 mt-1">
        {file ? file.name : 'Clique ou arraste o arquivo .xlsx'}
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload de Planilhas Mensais</h1>
        <p className="text-gray-500 text-sm mt-1">
          Carregue os três arquivos exportados do John Deere Operations Center.
        </p>
      </div>

      <form onSubmit={handleUpload} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DropZone
            label="MLC — Última Conexão"
            file={mlc}
            onFile={setMlc}
            inputRef={mlcRef}
          />
          <DropZone
            label="CDE — Saúde do Cliente"
            file={cde}
            onFile={setCde}
            inputRef={cdeRef}
          />
          <DropZone
            label="GAP — Hectares Conectadas"
            file={gap}
            onFile={setGap}
            inputRef={gapRef}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Mês de Referência</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-jd-green"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
            <strong>Processamento concluído!</strong>
            <br />
            {result.machines_processed} máquinas e {result.orgs_processed} organizações atualizadas.
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-jd-green text-white font-semibold px-8 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-3"
        >
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          )}
          {loading ? 'Processando...' : 'Processar Planilhas'}
        </button>
      </form>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Histórico de Uploads</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="text-left py-2">Data</th>
                  <th className="text-left py-2">Mês Ref.</th>
                  <th className="text-left py-2">Enviado por</th>
                  <th className="text-right py-2">Máquinas</th>
                  <th className="text-right py-2">Orgs</th>
                  <th className="text-center py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2">{new Date(h.processed_at).toLocaleDateString('pt-BR')}</td>
                    <td className="py-2">{h.reference_month?.substring(0, 7)}</td>
                    <td className="py-2">{h.uploaded_by_name ?? '—'}</td>
                    <td className="py-2 text-right">{h.machines_processed ?? '—'}</td>
                    <td className="py-2 text-right">{h.orgs_processed ?? '—'}</td>
                    <td className="py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        h.status === 'done' ? 'bg-green-100 text-green-700' :
                        h.status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
