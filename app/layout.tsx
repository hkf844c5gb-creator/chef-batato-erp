'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Estado que controla se o menu está aberto ou fechado
  const [aberto, setAberto] = useState(false);
  
  // Deteta em que página estamos para "acender" o botão certo no menu
  const pathname = usePathname(); 

  const menuItems = [
    { href: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
    { href: '/admin/pdv', icon: '💻', label: 'Caixa (PDV)' },
    { href: '/admin/produtos', icon: '🍟', label: 'Produtos' },
    { href: '/admin/combos', icon: '🎁', label: 'Combos' },
    { href: '/admin/despesas', icon: '📉', label: 'Despesas' },
    { href: '/admin/estafetas', icon: '🛵', label: 'Estafetas' },
    { href: '/admin/revenda', icon: '🤝', label: 'Revenda' },
  ];

  return (
    <div className="flex h-screen bg-zinc-950 text-white font-sans overflow-hidden">
      
      {/* MENU LATERAL FIXO */}
      <aside 
        className={`bg-zinc-900 border-r border-zinc-800 transition-all duration-300 relative flex flex-col z-40 ${
          aberto ? 'w-64' : 'w-20'
        }`}
      >
        {/* Botão da Setinha para abrir/fechar */}
        <button
          onClick={() => setAberto(!aberto)}
          className="absolute -right-3 top-8 bg-orange-600 hover:bg-orange-500 text-white w-6 h-6 rounded-full flex items-center justify-center border-2 border-zinc-950 shadow-lg z-50 text-[10px]"
        >
          {aberto ? '◀' : '▶'}
        </button>

        {/* Cabeçalho do Menu (Logo) */}
        <div className="p-4 pt-6 flex items-center gap-3 border-b border-zinc-800/50 mb-4 h-20 overflow-hidden">
          <span className="text-3xl min-w-[30px] flex justify-center">🥔</span>
          {aberto && (
            <div className="whitespace-nowrap animate-fade-in">
              <h1 className="font-bold text-orange-500 leading-tight">Chef Batatô</h1>
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Backoffice</p>
            </div>
          )}
        </div>

        {/* Links do Menu */}
        <nav className="flex-1 overflow-y-auto flex flex-col gap-2 px-3 overflow-x-hidden">
          {menuItems.map((item) => {
            const isAtivo = pathname === item.href || pathname?.startsWith(item.href + '/');
            
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all whitespace-nowrap ${
                  isAtivo 
                    ? 'bg-orange-600/10 border border-orange-500/20 text-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.1)]' 
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
                }`}
              >
                <span className="text-xl min-w-[24px] flex justify-center">{item.icon}</span>
                {aberto && <span className={`text-sm transition-opacity duration-300 ${isAtivo ? 'font-bold' : 'font-medium'}`}>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Rodapé do Menu (Botão de Sair) */}
        <div className="p-4 border-t border-zinc-800 overflow-hidden">
          <Link 
            href="/" 
            className="flex items-center gap-3 px-3 py-3 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 rounded-xl transition-all whitespace-nowrap"
          >
            <span className="text-xl min-w-[24px] flex justify-center">🚪</span>
            {aberto && <span className="text-sm font-medium">Sair do Sistema</span>}
          </Link>
        </div>
      </aside>

      {/* ÁREA DO CONTEÚDO (Onde o PDV e as outras páginas vão aparecer) */}
      <main className="flex-1 overflow-auto bg-zinc-950">
        {children}
      </main>
      
    </div>
  );
}