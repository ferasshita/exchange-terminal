import { Bell, Calendar, ChartCandlestick, LayoutDashboard, LogOut, Newspaper, Search, Settings, Shield, Store } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { dataService } from '../../api/services';
import { useAuth } from '../../hooks/useAuth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/markets', label: 'Markets', icon: ChartCandlestick },
  { to: '/exchange-rates', label: 'Exchange Rates', icon: ChartCandlestick },
  { to: '/charts', label: 'Charts', icon: ChartCandlestick },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/economic-calendar', label: 'Economic Calendar', icon: Calendar },
  { to: '/exchange-offices', label: 'Exchange Offices', icon: Store },
  { to: '/analytics', label: 'Analytics', icon: ChartCandlestick },
  { to: '/ingestion', label: 'Ingestion', icon: Newspaper },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const adminItems = [
  { to: '/admin/currencies', label: 'Admin Currencies' },
  { to: '/admin/exchange-rates', label: 'Admin Rates' },
  { to: '/admin/news', label: 'Admin News' },
  { to: '/admin/economic-events', label: 'Admin Events' },
  { to: '/admin/sources', label: 'Admin Sources' },
  { to: '/admin/exchange-offices', label: 'Admin Offices' },
  { to: '/admin/users', label: 'Admin Users' },
];

export const AppShell = () => {
  const [q, setQ] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['global-search', q],
    queryFn: () => dataService.search(q).then((res) => res.data),
    enabled: q.length > 1,
  });

  const flatResults = useMemo(() => {
    if (!data) return [] as string[];
    return [
      ...data.currencies.map((x: { code: string; name: string }) => `Currency: ${x.code} ${x.name}`),
      ...data.news.map((x: { title: string }) => `News: ${x.title}`),
      ...data.exchangeOffices.map((x: { name: string }) => `Office: ${x.name}`),
      ...data.economicEvents.map((x: { title: string }) => `Event: ${x.title}`),
    ].slice(0, 6);
  }, [data]);

  return (
    <div className="grid min-h-screen grid-cols-[230px_1fr] bg-[#04070d] text-slate-200">
      <aside className="border-r border-slate-900 p-3">
        <Link to="/dashboard" className="mb-5 flex items-center gap-2 text-sm font-semibold text-blue-400">
          <Shield size={16} /> Exchange Terminal
        </Link>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded px-2 py-1.5 text-xs ${isActive ? 'bg-slate-800 text-blue-300' : 'text-slate-400 hover:bg-slate-900'}`
                }
              >
                <Icon size={14} />
                {item.label}
              </NavLink>
            );
          })}
          {user?.role === 'ADMIN' ? (
            <>
              <div className="mt-3 border-t border-slate-800 pt-3 text-[10px] uppercase tracking-wide text-slate-500">Admin</div>
              {adminItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `block rounded px-2 py-1 text-xs ${isActive ? 'bg-slate-800 text-blue-300' : 'text-slate-400 hover:bg-slate-900'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </>
          ) : null}
        </nav>
      </aside>
      <main className="flex flex-col">
        <header className="flex items-center justify-between border-b border-slate-900 px-3 py-2">
          <div className="relative w-full max-w-md">
            <Search size={14} className="absolute top-2 left-2 text-slate-500" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              className="w-full rounded border border-slate-800 bg-slate-950 py-1 pr-2 pl-7 text-xs outline-none focus:border-blue-500"
              placeholder="Search currencies, news, offices, events"
            />
            {flatResults.length ? (
              <div className="absolute top-8 z-20 w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs shadow-2xl">
                {flatResults.map((item) => (
                  <div key={item} className="py-0.5 text-slate-300">
                    {item}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="rounded bg-emerald-600/20 px-2 py-1 text-emerald-300">Market Open</span>
            <span>{new Date().toLocaleTimeString()}</span>
            <Bell size={14} className="text-slate-400" />
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-900"
            >
              <LogOut size={12} /> Logout
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-3">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
