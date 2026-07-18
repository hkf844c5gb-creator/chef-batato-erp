'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function DashboardFinanceiro() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7)); // Ex: 2026-07

  // Estados de Dados
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [despesas, setDespesas] = useState<any[]>([]);

  async function carregarDashboard() {
    setLoading(true);
    try {
      // Puxar Pedidos do Mês Selecionado
      const dataInicio = `${mesFiltro}-01T00:00:00.000Z`;
      
      // Lógica para obter o último dia do mês
      const ano = parseInt(mesFiltro.split('-')[0]);
      const mes = parseInt(mesFiltro.split('-')[1]);
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const dataFim = `${mesFiltro}-${ultimoDia}T23:59:59.999Z`;

      const { data: peds } = await supabase
        .from('pedidos')
        .select('*')
        .gte('criado_em', dataInicio)
        .lte('criado_em', dataFim);

      const { data: desp } = await supabase
        .from('despesas')
        .select('*')
        .gte('data_despesa', `${mesFiltro}-01`)
        .lte('data_despesa', `${mesFiltro}-${ultimoDia}`);

      if (peds) setPedidos(peds);
      if (desp) setDespesas(desp);
    } catch (err) {
      console.error("Erro ao carregar dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDashboard();
  }, [mesFiltro]);

  // --- MOTOR DE CÁLCULO FINANCEIRO ---

  // 1. FATURAÇÃO (Entradas)
  // O que o cliente pagou na totalidade (Subtotal dos produtos + Taxa de Entrega que ele pagou)
  const faturacaoBruta = pedidos.reduce((sum, p) => sum + Number(p.total_final || 0), 0);
  const subtotalProdutos = pedidos.reduce((sum, p) => sum + Number(p.subtotal || 0), 0);

  // 2. CUSTOS (Saídas)
  // A taxa de entrega é um custo porque, apesar de o cliente a pagar, ela sai diretamente para o estafeta.
  const custosEstafetas = pedidos.reduce((sum, p) => sum + Number(p.taxa_entrega || 0), 0);
  
  // Despesas operacionais (Ingredientes, embalagens, etc)
  const despesasOperacionais = despesas.reduce((sum, d) => sum + Number(d.valor || 0), 0);
  
  const custosTotais = custosEstafetas + despesasOperacionais;

  // 3. LUCRO LÍQUIDO REAL
  const lucroReal = faturacaoBruta - custosTotais;
  const margemLucro = faturacaoBruta > 0 ? (lucroReal / faturacaoBruta) * 100 : 0;

  // 4. ESTATÍSTICAS EXTRAS
  const totalViagens = pedidos.filter(p => p.tipo_pedido === 'Entrega').length;
  const totalTakeaway = pedidos.filter(p => p.tipo_pedido !== 'Entrega').length;
  const ticketMedio = pedidos.length > 0 ? (faturacaoBruta / pedidos.length) : 0;

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Processar Finanças...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24 selection:bg-orange-500/30">
      
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center transition-all">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center shadow-lg shadow-orange-900/40 text-2xl">
            📊
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel de Controlo</h1>
            <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Visão Geral da Empresa</p>
          </div>
        </div>
        
        {/* Seletor de Mês */}
        <div className="flex items-center gap-3">
          <label className="hidden md:block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Período:</label>
          <input 
            type="month" 
            value={mesFiltro} 
            onChange={(e) => setMesFiltro(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold outline-none focus:border-orange-500 cursor-pointer shadow-lg"
          />
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 md:p-8 space-y-8 animate-in fade-in duration-500">
        
        {/* SECÇÃO 1: O GRANDE RESULTADO (LUCRO LÍQUIDO) */}
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 rounded-[32px] p-8 md:p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
            <div>
              <h2 className="text-xs font-black text-green-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Lucro Líquido Real (Mês)
              </h2>
              <div className="text-6xl md:text-8xl font-black text-white tracking-tighter">
                {lucroReal.toFixed(2)}<span className="text-4xl text-zinc-500 ml-2">€</span>
              </div>
            </div>
            
            <div className="text-right bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800/50">
              <span className="block text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Margem de Lucro</span>
              <span className={`text-2xl font-black ${margemLucro >= 20 ? 'text-green-400' : margemLucro >= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                {margemLucro.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* SECÇÃO 2: ENTRADAS VS SAÍDAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* BLOCO ENTRADAS */}
          <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-[24px] p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800/60 pb-4">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg">💰</div>
              <h3 className="text-sm font-black text-zinc-300 uppercase tracking-widest">Faturação Bruta</h3>
            </div>
            
            <div>
              <div className="text-4xl font-black text-indigo-400 font-mono tracking-tighter">
                {faturacaoBruta.toFixed(2)}<span className="text-xl text-indigo-500/50 ml-1">€</span>
              </div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold mt-2">Dinheiro total que entrou na caixa</p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                <span className="text-xs font-bold text-zinc-400">Venda de Produtos</span>
                <span className="text-sm font-black text-white">{subtotalProdutos.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                <span className="text-xs font-bold text-zinc-400">Taxas Cobradas ao Cliente</span>
                <span className="text-sm font-black text-white">{custosEstafetas.toFixed(2)}€</span>
              </div>
            </div>
          </div>

          {/* BLOCO SAÍDAS */}
          <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-[24px] p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800/60 pb-4">
              <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-lg">💸</div>
              <h3 className="text-sm font-black text-zinc-300 uppercase tracking-widest">Custos Totais</h3>
            </div>
            
            <div>
              <div className="text-4xl font-black text-red-400 font-mono tracking-tighter">
                {custosTotais.toFixed(2)}<span className="text-xl text-red-500/50 ml-1">€</span>
              </div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold mt-2">Dinheiro total que saiu da empresa</p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                <span className="text-xs font-bold text-zinc-400">Despesas Operacionais (Compras)</span>
                <span className="text-sm font-black text-white">{despesasOperacionais.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                <span className="text-xs font-bold text-zinc-400">Repasse para Estafetas (Viagens)</span>
                <span className="text-sm font-black text-white">{custosEstafetas.toFixed(2)}€</span>
              </div>
            </div>
          </div>

        </div>

        {/* SECÇÃO 3: MÉTRICAS DE OPERAÇÃO (KPIs) */}
        <div>
          <h2 className="text-sm font-black uppercase text-zinc-500 tracking-wider mb-4 pl-1">Métricas da Operação</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-center items-center text-center">
              <span className="text-2xl mb-2">📦</span>
              <span className="text-3xl font-black text-white">{pedidos.length}</span>
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Total Pedidos</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-center items-center text-center">
              <span className="text-2xl mb-2">🛵</span>
              <span className="text-3xl font-black text-white">{totalViagens}</span>
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Entregas Feitas</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-center items-center text-center">
              <span className="text-2xl mb-2">🛍️</span>
              <span className="text-3xl font-black text-white">{totalTakeaway}</span>
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Takeaway / Salão</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-center items-center text-center">
              <span className="text-2xl mb-2">🏷️</span>
              <span className="text-3xl font-black text-amber-400 font-mono">{ticketMedio.toFixed(2)}€</span>
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Ticket Médio</span>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}
