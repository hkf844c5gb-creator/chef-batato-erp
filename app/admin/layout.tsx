'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); 

  const menuItems = [
    { href: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
    { href: '/admin/pdv', icon: '💻', label: 'Frente de Loja (PDV)' },
    { href: '/admin/pedidos', icon: '📓', label: 'Pedidos' },
    { href: '/admin/clientes', icon: '👥', label: 'Clientes' },
    { href: '/admin/caixa', icon: '💶', label: 'Caixa / Movimentos' },
    
    // --- PRODUÇÃO E STOCK ESSENCIAIS ---
    { href: '/admin/producao-batata', icon: '🥔', label: 'Produção Batata' },
    { href: '/admin/estoque', icon: '📦', label: 'Gestão de Estoque' },
    
    // --- CADASTROS E GESTÃO ---
    { href: '/admin/produtos', icon: '🍟', label: 'Produtos' },
    { href: '/admin/combos', icon: '🎁', label: 'Combos' },
    { href: '/admin/despesas', icon: '💳', label: 'Despesas' },
    { href: '/admin/estafetas', icon: '🛵', label: 'Estafetas' },
    { href: '/admin/relatorios', icon: '📑', label: 'Relatórios' },
    { href: '/admin/conciliacao', icon: '📋', label: 'Conciliação' },
  ];

  return (
    <div className="flex h-screen bg-zinc-950 text-white font-sans overflow-hidden">
      
      {/* MENU LATERAL TOTALMENTE FIXO E SEMPRE ABERTO */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col z-40 shrink-0">
        
        {/* Cabeçalho do Menu (Logo Personalizada) */}
        <div className="p-4 pt-6 flex items-center gap-3 border-b border-zinc-800/50 mb-4 h-20 shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-orange-500/50 shrink-0 flex items-center justify-center bg-black shadow-[0_0_10px_rgba(249,115,22,0.2)]">
            <img 
              src="/logo.jpg" 
              alt="Logo Chef Batatô" 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="whitespace-nowrap">
            <h1 className="font-bold text-orange-500 leading-tight">Chef Batatô</h1>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Backoffice</p>
          </div>
        </div>

        {/* Links do Menu */}
        <nav className="flex-1 overflow-y-auto flex flex-col gap-2 px-3 pb-4 custom-scrollbar">
          {menuItems.map((item, index) => {
            const isAtivo = pathname === item.href || pathname?.startsWith(item.href + '/');
            
            const addSeparator = index === 7; 
            
            return (
              <div key={item.href}>
                {addSeparator && <div className="h-px bg-zinc-800/50 my-2 w-full"></div>}
                <Link 
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all whitespace-nowrap ${
                    isAtivo 
                      ? 'bg-orange-600/10 border border-orange-500/20 text-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.1)]' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
                  }`}
                >
                  <span className="text-xl min-w-[24px] flex justify-center">{item.icon}</span>
                  <span className={`text-sm ${isAtivo ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>

        {/* Rodapé do Menu (Botão de Sair) */}
        <div className="p-4 border-t border-zinc-800 shrink-0">
          <Link 
            href="/" 
            className="flex items-center gap-3 px-3 py-3 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 rounded-xl transition-all whitespace-nowrap"
          >
            <span className="text-xl min-w-[24px] flex justify-center">🚪</span>
            <span className="text-sm font-medium">Sair do Sistema</span>
          </Link>
        </div>
      </aside>

      {/* ÁREA DO CONTEÚDO */}
      <main className="flex-1 overflow-auto bg-zinc-950 relative">
        {children}
      </main>
      
    </div>
  );
}