import type { AppProps } from 'next/app';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import '../styles/globals.css';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/upload', label: 'Upload Planilhas' },
  { href: '/activities', label: 'Atividades' },
  { href: '/technicians', label: 'Técnicos' },
  { href: '/technician-report', label: 'Relatório Técnicos' },
  { href: '/organizations', label: 'Organizações' },
];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLogin = router.pathname === '/login';

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
            <nav className="flex flex-col gap-1 px-3">
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
