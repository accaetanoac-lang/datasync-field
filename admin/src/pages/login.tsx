import React, { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';

const EMPLOYEE_ID_REGEX = /^x\d{6}$/;

export default function LoginPage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMPLOYEE_ID_REGEX.test(employeeId)) {
      setError('ID deve ter formato x000000.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post<{ token: string; technician: { role: string } }>('/auth/login', {
        employee_id: employeeId,
      });

      if (res.data.technician.role !== 'admin') {
        setError('Acesso restrito a administradores.');
        return;
      }

      localStorage.setItem('admin_token', res.data.token);
      router.push('/');
    } catch {
      setError('ID inválido ou acesso negado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-jd-green flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-jd-green">DataSync</div>
          <div className="text-sm text-gray-400 tracking-widest mt-1">FIELD ADMIN</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID do Funcionário
            </label>
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value.toLowerCase())}
              placeholder="x000000"
              maxLength={7}
              autoCapitalize="none"
              autoComplete="off"
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-center font-mono text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-jd-green"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-jd-green text-white font-semibold py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
