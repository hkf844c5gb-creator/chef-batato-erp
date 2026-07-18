'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function DashboardPage() {
  // Inicializa com o mês e ano atual (YYYY-MM)
  const [mesSelecionado, setMesSelecionado] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading] = useState(true);
  const [metricas, setMetricas] = useState({
    faturacaoBruta: 0,
    custosOperacionais: 0,
    repasseEstafetas: 0,
    lucroLiquido: 0,
    margemLucro: 0,
    totalPedidos: 0,
    entregasEfetuadas: 0,
    volumeTakeaway: 0,
    ticketMedio: 0
  });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function carregarDados() {
      setLoading(true);
      try {
        const [ano, mes] = mesSelecionado.split('-');
        // Primeiro e último dia do mês selecionado
        const dataInicio = new Date(Number(ano), Number(mes) - 1, 1).toISOString();
        const dataFim = new Date(Number(ano), Number(mes), 0, 23, 59, 59).toISOString();

        // 1. Buscar Pedidos
        const { data: pedidos, error: erroPedidos } = await supabase
          .from('pedidos')
          .select('total_geral, canal, taxa_entrega, criado_em')
          .gte('criado_em', dataInicio)
          .lte('criado_em', dataFim)
          .eq('pago', true);

        // 2. Buscar Despesas
        // Ajuste 'criado_em' consoante a sua tabela (pode ser data_despesa)
        const { data: despesas, error: erroDespesas } = await supabase
          .from('despesas')
          .select('valor')
          .gte('criado_em', dataInicio)
          .lte('criado_em', dataFim);

        const pedidosValidos = pedidos || [];
        const despesasValidas = despesas || [];

        let faturacao = 0;
        let repasse = 0;
        let entregas = 0;
        let takeaway = 0;

        pedidosValidos.forEach(p => {
          faturacao += Number(p.total_geral || 0);
          repasse += Number(p.taxa_entrega || 0);
          
          if (p.taxa_entrega > 0 || p.canal === 'Glovo') {
            entregas++;
          } else {
            takeaway++;
          }
        });

        const custosOps = despesasValidas.reduce((acc, d) => acc + Number(d.valor || 0), 0);
        
        const lucro = faturacao - custosOps - repasse;
        const margem = faturacao > 0 ? (lucro / faturacao) * 100 : 0;
        const ticket = pedidosValidos.length > 0 ? faturacao / pedidosValidos.length : 0;

        setMetricas({
          faturacaoBruta: faturacao,
          custosOperacionais: custosOps,
          repasseEstafetas: repasse,
          lucroLiquido: lucro,
          margemLucro: margem,
          totalPedidos: pedidosValidos.length,
          entregasEfetuadas: entregas,
          volumeTakeaway: takeaway,
          ticketMedio: ticket
        });

      } catch (err) {
        console.error('Erro ao carregar métricas:', err);
      } finally {
        setLoading(false);
      }
    }

    carregarDados();
  }, [mesSelecionado, supabase]);

  return (
    <div className="p-8 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-orange-500">Dashboard Financeiro</h1>
          <p className="text-zinc-400 text-sm mt-1">Visão geral e desempenho do Chef Batatô</p>
        </div>
        
        {/* Filtro de Mês */}
        <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-xl flex items-center gap-3 shadow-sm">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-2">Mês/Ano:</label>
          <input 
            type="month" 
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm font-bold text-zinc-200 focus:border-orange-500 outline-none cursor-pointer"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64 text-zinc-500 animate-pulse">A extrair dados do cofre...</div>
      ) : (
        <>
          {/* MÁQUINA DE DINHEIRO (Lucros e Faturação) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden shadow-lg">
              <div className="absolute -right-4 -top-4 text-6xl opacity-5">💰</div>
              <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Faturação Bruta</h3>
              <p className="text-3xl font-black text-white">{metricas.faturacaoBruta.toFixed(2)}€</p>
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden shadow-lg">
              <div className="absolute -right-4 -top-4 text-6xl opacity-5">📉</div>
              <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Custos Operacionais</h3>
              <p className="text-3xl font-black text-red-400">{metricas.custosOperacionais.toFixed(2)}€</p>
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden shadow-lg">
              <div className="absolute -right-4 -top-4 text-6xl opacity-5">🛵</div>
              <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Repasse Estafetas</h3>
              <p className="text-3xl font-black text-orange-400">{metricas.repasseEstafetas.toFixed(2)}€</p>
            </div>
            
            <div className={`border p-6 rounded-2xl relative overflow-hidden shadow-lg ${metricas.lucroLiquido >= 0 ? 'bg-green-950/20 border-green-900/50' : 'bg-red-950/20 border-red-900/50'}`}>
              <div className="absolute -right-4 -top-4 text-6xl opacity-5">💎</div>
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${metricas.lucroLiquido >= 0 ? 'text-green-500' : 'text-red-500'}`}>Lucro Líquido Real</h3>
              <div className="flex items-end gap-3">
                <p className={`text-3xl font-black ${metricas.lucroLiquido >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {metricas.lucroLiquido.toFixed(2)}€
                </p>
                <span className={`text-sm font-bold mb-1 ${metricas.lucroLiquido >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
                  ({metricas.margemLucro.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          {/* INDICADORES DE OPERAÇÃO */}
          <h2 className="text-lg font-bold text-zinc-300 mb-4 flex items-center gap-2"><span className="text-orange-500">⚡</span> Performance Operacional</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4 shadow-md">
              <div className="bg-zinc-800 w-12 h-12 rounded-xl flex items-center justify-center text-xl">📦</div>
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Total Pedidos</p>
                <p className="text-xl font-bold text-white">{metricas.totalPedidos}</p>
              </div>
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4 shadow-md">
              <div className="bg-orange-500/10 border border-orange-500/20 w-12 h-12 rounded-xl flex items-center justify-center text-xl">🎫</div>
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Ticket Médio</p>
                <p className="text-xl font-bold text-orange-400">{metricas.ticketMedio.toFixed(2)}€</p>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4 shadow-md">
              <div className="bg-blue-500/10 border border-blue-500/20 w-12 h-12 rounded-xl flex items-center justify-center text-xl">🛵</div>
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Entregas</p>
                <p className="text-xl font-bold text-blue-400">{metricas.entregasEfetuadas}</p>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4 shadow-md">
              <div className="bg-purple-500/10 border border-purple-500/20 w-12 h-12 rounded-xl flex items-center justify-center text-xl">🛍️</div>
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Takeaway/Balcão</p>
                <p className="text-xl font-bold text-purple-400">{metricas.volumeTakeaway}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
