'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function DashboardFinanceiro() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));

  const [pedidos, setPedidos] = useState<any[]>([]);
  const [despesas, setDespesas] = useState<any[]>([]);
  const [estafetas, setEstafetas] = useState<any[]>([]);

  async function carregarDashboard() {
    setLoading(true);
    try {
      const ano = parseInt(mesFiltro.split('-')[0]);
      const mes = parseInt(mesFiltro.split('-')[1]);
      const ultimoDia = new Date(ano, mes, 0).getDate();
      
      const dataInicio = `${mesFiltro}-01T00:00:00.000Z`;
      const dataFim = `${mesFiltro}-${ultimoDia}T23:59:59.999Z`;

      const { data: peds } = await supabase.from('pedidos').select('*').gte('criado_em', dataInicio).lte('criado_em', dataFim);
      const { data: desp } = await supabase.from('despesas').select('*').gte('data_despesa', `${mesFiltro}-01`).lte('data_despesa', `${mesFiltro}-${ultimoDia}`);
      const { data: ests } = await supabase.from('estafetas').select('*'); // Para verificar dívidas e alertas

      if (peds) setPedidos(peds);
      if (desp) setDespesas(desp);
      if (ests) setEstafetas(ests);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDashboard(); }, [mesFiltro]);

  // --- MATEMÁTICA ---
  const faturacaoBruta = pedidos.reduce((sum, p) => sum + Number(p.total_final || 0), 0);
  const custosEstafetas = pedidos.reduce((sum, p) => sum + Number(p.taxa_entrega || 0), 0);
  const despesasOperacionais = despesas.reduce((sum, d) => sum + Number(d.valor || 0), 0);
  const custosTotais = custosEstafetas + despesasOperacionais;
  const lucroReal = faturacaoBruta - custosTotais;
  const margemLucro = faturacaoBruta > 0 ? (lucroReal / faturacaoBruta) * 100 : 0;

  // --- SISTEMA DE ALERTAS (LÓGICA INTELIGENTE) ---
  const gerarAlertas = () => {
    const alertas = [];
    
    // Alerta 1: Quebra de margem de lucro
    if (faturacaoBruta > 0 && margemLucro < 15) {
      alertas.push({ tipo: 'critico', icone: '📉', texto: 'A margem de lucro caiu abaixo dos 15%. Controle as despesas com ingredientes!' });
    }

    // Alerta 2: Estafetas com acumulado alto (Lembrete de acerto)
    const viagensRecentes = pedidos.filter(p => p.taxa_entrega > 0 && p.entregador);
    const entregadoresAtivos = [...new Set(viagensRecentes.map(v => v.entregador))];
    if (entregadoresAtivos.length > 0) {
      alertas.push({ tipo: 'aviso', icone: '🛵', texto: `Há ${entregadoresAtivos.length} estafeta(s) a rodar hoje. Verifique se há acertos pendentes no caixa.` });
    }

    // Alerta 3: Possível quebra de stock de Embalagens/Batatas
    const totalBatatasVendidas = pedidos.length; // Simplificação: 1 pedido = 1 embalagem/batata
    if (totalBatatasVendidas > 50) {
      const despesasEmbalagem = despesas.filter(d => d.categoria.includes('Embalagens'));
      if (despesasEmbalagem.length === 0) {
        alertas.push({ tipo: 'aviso', icone: '📦', texto: `Já vendeu ${totalBatatasVendidas} itens este mês, mas não registou compra de embalagens. Atenção ao stock!` });
      }
    }

    // Alerta 4: Se o sistema estiver perfeito
    if (alertas.length === 0) {
      alertas.push({ tipo: 'sucesso', icone: '✅', texto: 'A operação está saudável. As métricas cruzam na perfeição.' });
    }

    return alertas;
  };

  const alertasAtivos = gerarAlertas();

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Processar Finanças...</div>;

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
        
        <div className="flex items-center gap-3">
          <label className="hidden md:block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Período:</label>
          <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="bg-zinc-900 border border-zinc-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold outline-none focus:border-orange-500 cursor-pointer shadow-lg" />
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 md:p-8 grid grid-cols-1 xl:grid-cols-3 gap-8 animate-in fade-in duration-500">
        
        {/* COLUNA ESQUERDA & CENTRO: MÉTRICAS (Ocupa 2/3) */}
        <div className="xl:col-span-2 space-y-8">
          
          {/* SECÇÃO 1: LUCRO LÍQUIDO */}
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 rounded-[32px] p-8 md:p-10 shadow-2xl relative overflow-hidden group hover:border-zinc-700 transition-all">
            <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 group-hover:bg-green-500/20 transition-all duration-700"></div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
              <div>
                <h2 className="text-xs font-black text-green-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Lucro Líquido Real
                </h2>
                <div className="text-6xl md:text-8xl font-black text-white tracking-tighter">
                  {lucroReal.toFixed(2)}<span className="text-4xl text-zinc-500 ml-2">€</span>
                </div>
              </div>
              
              <div className="text-right bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800/50 backdrop-blur-md">
                <span className="block text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Margem de Lucro</span>
                <span className={`text-2xl font-black ${margemLucro >= 20 ? 'text-green-400' : margemLucro >= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                  {margemLucro.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* SECÇÃO 2: ENTRADAS VS SAÍDAS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-[24px] p-6 space-y-6">
              <div className="flex items-center gap-3 border-b border-zinc-800/60 pb-4">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg">💰</div>
                <h3 className="text-sm font-black text-zinc-300 uppercase tracking-widest">Faturação Bruta</h3>
              </div>
              <div>
                <div className="text-4xl font-black text-indigo-400 font-mono tracking-tighter">{faturacaoBruta.toFixed(2)}<span className="text-xl text-indigo-500/50 ml-1">€</span></div>
                <p className="text-[10px] text-zinc-500 uppercase font-bold mt-2">Receitas totais da operação</p>
              </div>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-[24px] p-6 space-y-6">
              <div className="flex items-center gap-3 border-b border-zinc-800/60 pb-4">
                <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-lg">💸</div>
                <h3 className="text-sm font-black text-zinc-300 uppercase tracking-widest">Custos Totais</h3>
              </div>
              <div>
                <div className="text-4xl font-black text-red-400 font-mono tracking-tighter">{custosTotais.toFixed(2)}<span className="text-xl text-red-500/50 ml-1">€</span></div>
                <p className="text-[10px] text-zinc-500 uppercase font-bold mt-2">Despesas e repasses estafetas</p>
              </div>
            </div>
          </div>

        </div>

        {/* COLUNA DIREITA: ALERTAS & MÉTRICAS (Ocupa 1/3) */}
        <div className="space-y-8">
          
          {/* SISTEMA DE ALERTAS */}
          <div>
            <h2 className="text-sm font-black uppercase text-zinc-300 tracking-wider mb-4 pl-1">Central de Alertas</h2>
            <div className="space-y-3">
              {alertasAtivos.map((alerta, idx) => (
                <div key={idx} className={`p-4 rounded-2xl border flex items-start gap-3 transition-colors ${
                  alerta.tipo === 'critico' ? 'bg-red-950/20 border-red-900/40 text-red-300' :
                  alerta.tipo === 'aviso' ? 'bg-amber-950/20 border-amber-900/40 text-amber-300' :
                  'bg-green-950/20 border-green-900/40 text-green-300'
                }`}>
                  <span className="text-xl mt-0.5">{alerta.icone}</span>
                  <p className="text-xs font-bold leading-relaxed">{alerta.texto}</p>
                </div>
              ))}
            </div>
          </div>

          {/* KPIs EXTRAS */}
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[24px] space-y-4">
            <h3 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Volume de Operação</h3>
            
            <div className="flex justify-between items-center bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
              <span className="text-xs font-bold text-zinc-400">Total de Pedidos</span>
              <span className="text-lg font-black text-white">{pedidos.length}</span>
            </div>
            
            <div className="flex justify-between items-center bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
              <span className="text-xs font-bold text-zinc-400">Entregas Estafetas</span>
              <span className="text-lg font-black text-white">{pedidos.filter(p => p.tipo_pedido === 'Entrega').length}</span>
            </div>
            
            <div className="flex justify-between items-center bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
              <span className="text-xs font-bold text-zinc-400">Ticket Médio</span>
              <span className="text-lg font-black text-amber-400 font-mono">
                {pedidos.length > 0 ? (faturacaoBruta / pedidos.length).toFixed(2) : '0.00'}€
              </span>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
