'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Insumo {
  id: string;
  nome: string;
  unidade_medida: string;
  quantidade_atual: number;
  quantidade_alerta: number;
}

export default function QuadroStock() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(new Date());

  async function carregarStock() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('insumos')
        .select('*')
        .order('nome', { ascending: true });
      
      if (error) throw error;
      setInsumos(data || []);
      setUltimaAtualizacao(new Date());
    } catch (err: any) {
      console.error("Erro ao carregar stock:", err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { 
    carregarStock(); 
    // Atualiza automaticamente a cada 5 minutos
    const interval = setInterval(carregarStock, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Organizar os insumos por níveis de urgência
  const stockCritico = insumos.filter(i => i.quantidade_atual <= i.quantidade_alerta);
  const stockAtencao = insumos.filter(i => i.quantidade_atual > i.quantidade_alerta && i.quantidade_atual <= i.quantidade_alerta * 1.5);
  const stockNormal = insumos.filter(i => i.quantidade_atual > i.quantidade_alerta * 1.5);

  const CardInsumo = ({ insumo, status }: { insumo: Insumo, status: 'critico' | 'atencao' | 'normal' }) => {
    const cores = {
      critico: 'bg-red-950/40 border-red-900/50 text-red-500',
      atencao: 'bg-yellow-950/40 border-yellow-900/50 text-yellow-500',
      normal: 'bg-green-950/40 border-green-900/50 text-green-500'
    };

    return (
      <div className={`p-5 rounded-2xl border ${cores[status]} flex flex-col justify-between shadow-lg relative overflow-hidden`}>
        {/* Barra lateral de cor */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${status === 'critico' ? 'bg-red-500' : status === 'atencao' ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
        
        <div className="pl-2">
          <h3 className="font-bold text-zinc-100 truncate text-lg">{insumo.nome}</h3>
          <p className="text-[10px] uppercase font-bold tracking-widest mt-1 opacity-70">Alerta em: {insumo.quantidade_alerta} {insumo.unidade_medida}</p>
        </div>
        
        <div className="mt-4 pl-2 flex items-baseline gap-1">
          <span className="text-4xl font-black font-mono tracking-tighter">{insumo.quantidade_atual}</span>
          <span className="text-sm font-bold opacity-70">{insumo.unidade_medida}</span>
        </div>
      </div>
    );
  };

  if (loading && insumos.length === 0) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Ler Prateleiras...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans p-5 md:p-8">
      
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span>📊</span> Quadro de Stock
          </h1>
          <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest mt-1">
            Última atualização: {ultimaAtualizacao.toLocaleTimeString('pt-PT')}
          </p>
        </div>
        <button onClick={carregarStock} className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2">
          🔄 Atualizar Agora
        </button>
      </header>

      <div className="space-y-8">
        
        {/* SEÇÃO CRÍTICA (FALTA OU QUASE A FALTAR) */}
        <section>
          <div className="flex items-center gap-3 mb-4 border-b border-red-900/30 pb-2">
            <span className="bg-red-500/20 text-red-500 p-1.5 rounded-lg">🔴</span>
            <h2 className="text-xl font-black text-red-400 uppercase tracking-widest">Crítico / Esgotado ({stockCritico.length})</h2>
          </div>
          {stockCritico.length === 0 ? (
            <p className="text-zinc-600 text-sm italic p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">Nenhum produto em estado crítico.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {stockCritico.map(ins => <CardInsumo key={ins.id} insumo={ins} status="critico" />)}
            </div>
          )}
        </section>

        {/* SEÇÃO ATENÇÃO (A CHEGAR AO ALERTA) */}
        <section>
          <div className="flex items-center gap-3 mb-4 border-b border-yellow-900/30 pb-2">
            <span className="bg-yellow-500/20 text-yellow-500 p-1.5 rounded-lg">🟡</span>
            <h2 className="text-xl font-black text-yellow-400 uppercase tracking-widest">Atenção ({stockAtencao.length})</h2>
          </div>
          {stockAtencao.length === 0 ? (
            <p className="text-zinc-600 text-sm italic p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">Nenhum produto em atenção.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {stockAtencao.map(ins => <CardInsumo key={ins.id} insumo={ins} status="atencao" />)}
            </div>
          )}
        </section>

        {/* SEÇÃO NORMAL (STOCK SAUDÁVEL) */}
        <section>
          <div className="flex items-center gap-3 mb-4 border-b border-green-900/30 pb-2">
            <span className="bg-green-500/20 text-green-500 p-1.5 rounded-lg">🟢</span>
            <h2 className="text-xl font-black text-green-400 uppercase tracking-widest">Stock Normal ({stockNormal.length})</h2>
          </div>
          {stockNormal.length === 0 ? (
            <p className="text-zinc-600 text-sm italic p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">Nenhum produto com stock normal.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {stockNormal.map(ins => <CardInsumo key={ins.id} insumo={ins} status="normal" />)}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}