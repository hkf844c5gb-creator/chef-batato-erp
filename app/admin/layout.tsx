'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const menuItems = [
    { nome: 'Dashboard', rota: '/admin/dashboard', icone: '📊' },
    { nome: 'Frente de Caixa', rota: '/admin/pdv', icone: '🛒' },
    { nome: 'Estafetas', rota: '/admin/estafetas', icone: '🛵' },
    { nome: 'Despesas', rota: '/admin/despesas', icone: '📉' },
    { nome: 'Auditoria IA', rota: '/admin/conciliacao', icone: '🤖' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col md:flex-row selection:bg-orange-500/30">
      
      {/* MENU DESKTOP (Lateral) */}
      <aside className="hidden md:flex w-64 flex-col bg-zinc-950 border-r border-zinc-800/80 sticky top-0 h-screen z-50">
        <div className="p-6 border-b border-zinc-800/80 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-orange-900/20">
            🥔
          </div>
          <div>
            <h1 className="font-black text-white text-lg tracking-tight leading-none">Chef Batatô</h1>
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Painel de Gestão</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto no-scrollbar">
          {menuItems.map((item) => {
            const isAtivo = pathname === item.rota;
            return (
              <Link 
                key={item.rota} 
                href={item.rota}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isAtivo 
                    ? 'bg-zinc-900 border border-zinc-800 text-white font-black shadow-lg' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50 font-bold'
                }`}
              >
                <span className="text-xl">{item.icone}</span>
                <span className="text-sm">{item.nome}</span>
                {isAtivo && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-black">
              R
            </div>
            <div>
              <span className="block text-xs font-black text-white">Rafael</span>
              <span className="block text-[9px] text-green-400 font-bold uppercase tracking-widest">Online</span>
            </div>
          </div>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL (Onde as páginas vão ser injetadas) */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto no-scrollbar">
        {children}
      </div>

      {/* MENU MOBILE (Barra Inferior) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/80 z-50 pb-safe">
        <div className="flex justify-around items-center p-2">
          {menuItems.map((item) => {
            const isAtivo = pathname === item.rota;
            return (
              <Link 
                key={item.rota} 
                href={item.rota}
                className={`flex flex-col items-center justify-center p-2 rounded-xl w-16 transition-all ${
                  isAtivo ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span className={`text-2xl mb-1 ${isAtivo ? 'scale-110 transition-transform' : ''}`}>
                  {item.icone}
                </span>
                <span className="text-[8px] font-black uppercase tracking-widest text-center truncate w-full">
                  {item.nome}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

    </div>
  );
}