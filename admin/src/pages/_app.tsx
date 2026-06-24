import type { AppProps } from 'next/app';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import '../styles/globals.css';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/upload', label: 'Upload Planilhas' },
  { href: '/activities', label: 'Atividades' },
  { href: '/activities', label: 'Relatório OS' },
  { href: '/technicians', label: 'Técnicos' },
  { href: '/technician-report', label: 'Relatório Técnicos' },
  { href: '/organizations', label: 'Organizações' },
  { href: '/visit-management', label: 'Gestão de Visitas' },
  { href: '/machines', label: 'Máquinas Cadastradas' },
  { href: '/operations-center', label: 'Operations Center' },
  { href: '/non-jd-machines', label: 'Máq. Não JD' },
  { href: '/impediments', label: 'Impedimentos' },
  { href: '/settings', label: 'Configurações' },
];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLogin = router.pathname === '/login';
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (isLogin) {
      setAuthChecked(true);
      return;
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
    if (!token) {
      router.replace('/login');
    } else {
      setAuthChecked(true);
    }
  }, [isLogin, router]);

  // Avoid flashing the layout while redirecting unauthenticated users
  if (!isLogin && !authChecked) return null;

  function handleLogout() {
    localStorage.removeItem('admin_token');
    router.replace('/login');
  }

  return (
    <>
      <Head>
        <title>DataSync Field — Admin</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {isLogin ? (
        <Component {...pageProps} />
      ) : (
        <div className="min-h-screen bg-gray-50 flex">
          {/* Sidebar */}
          <aside className="w-56 bg-jd-green text-white flex flex-col py-6 shadow-lg flex-shrink-0">
            <div className="px-6 mb-8">
              <div className="text-xl font-bold text-jd-yellow">DataSync</div>
              <div className="text-xs text-green-200 tracking-widest">FIELD ADMIN</div>
            </div>
            <nav className="flex flex-col gap-1 px-3 flex-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    router.pathname === item.href
                      ? 'bg-white/20 text-white'
                      : 'text-green-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="px-3 mt-4 border-t border-white/20 pt-4">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-green-100 hover:bg-white/10 hover:text-white transition-colors text-left"
              >
                Sair
              </button>
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-auto p-8">
            <Component {...pageProps} />
          </main>
        </div>
      )}
    </>
  );
}
