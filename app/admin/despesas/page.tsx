'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface Despesa {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data_despesa: string;
  metodo_pagamento: string;
  status: string;
}

export default function DespesasPage() {
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(true);
  
  const getMesAtual = () => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  };

  const [filtroMes, setFiltroMes] = useState(getMesAtual());

  async function carregarDespesas() {
    setLoading(true);
    const inicioMes = `${filtroMes}-01`;
    const fimMes = `${filtroMes}-31`;

    // 🎯 CORREÇÃO: Removido o .order('created_at') que causava o erro
    const { data, error } = await supabase
      .from('despesas')
      .select('*')
      .gte('data_despesa', inicioMes)
      .lte('data_despesa', fimMes)
      .order('data_despesa', { ascending: false });

    if (error) {
      alert("Erro ao carregar despesas: " + error.message);
    } else if (data) {
      setDespesas(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    carregarDespesas();
  }, [filtroMes]);

  const excluirDespesa = async (id: string) => {
    if (!confirm('Tem a certeza que deseja eliminar permanentemente esta despesa?')) return;
    
    const { error } = await supabase.from('despesas').delete().eq('id', id);
    
    if (error) {
      alert('Erro ao excluir: ' + error.message);
    } else {
      setDespesas(prev => prev.filter(d => d.id !== id));
    }
  };

  const totalDespesas = despesas.reduce((acc, d) => acc + Number(d.valor), 0);

  const getCategoriaCor = (categoria: string) => {
    const cat = categoria.toLowerCase();
    if (cat.includes('marketing')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (cat.includes('taxas') || cat.includes('comissões')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (cat.includes('ingredientes') || cat.includes('mercadoria')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (cat.includes('embalagens')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    if (cat.includes('frota')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  };

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto relative min-h-screen">
      <div className="mb-8 border-b border-zinc-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          Gestão de Despesas <span className="text-2xl">💸</span>
        </h1>
        <div className="flex items-center gap-4">
          <input 
            type="month" 
            value={filtroMes} 
            onChange={(e) => setFiltroMes(e.target.value)} 
            className="bg-zinc-900 border border-zinc-700 text-white px-4 py-2 rounded-xl text-sm outline-none focus:border-orange-500" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-xl flex flex-col justify-center">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Gasto no Mês</span>
          <div className="text-4xl font-black text-red-400 font-mono mt-2 tracking-tighter">
            {totalDespesas.toFixed(2)}<span className="text-2xl ml-1 text-zinc-500">€</span>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-xl flex flex-col justify-center">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Registos Encontrados</span>
          <div className="text-3xl font-bold text-white mt-2">
            {despesas.length} <span className="text-sm text-zinc-500 font-normal">itens lançados</span>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[24px] overflow-hidden shadow-xl">
        <div className="p-5 border-b border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
          <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Listagem Detalhada</h3>
        </div>
        
        <div className="p-4">
          {loading ? (
            <div className="text-center text-zinc-500 py-10 font-bold uppercase tracking-widest text-xs">A carregar despesas...</div>
          ) : despesas.length === 0 ? (
            <div className="text-center text-zinc-600 py-10 italic">Nenhuma despesa registada para este mês.</div>
          ) : (
            <div className="space-y-2">
              {despesas.map((desp) => (
                <div key={desp.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-zinc-950 border border-zinc-800/80 hover:border-zinc-600 rounded-xl transition-colors gap-4">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-bold text-white line-clamp-2 leading-snug">
                      {desp.descricao}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <span className="text-[10px] text-zinc-500 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                        📅 {new Date(desp.data_despesa).toLocaleDateString('pt-PT')}
                      </span>
                      <span className={`text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider font-bold ${getCategoriaCor(desp.categoria)}`}>
                        {desp.categoria}
                      </span>
                      {desp.metodo_pagamento === 'Conciliação Automática' && (
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase">
                          🤖 IA
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-5 justify-end sm:w-auto w-full border-t sm:border-t-0 border-zinc-800 pt-3 sm:pt-0">
                    <div className="text-xl font-black text-red-400 font-mono whitespace-nowrap">
                      {Number(desp.valor).toFixed(2)}€
                    </div>
                    <button 
                      onClick={() => excluirDespesa(desp.id)} 
                      className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-red-600 hover:border-red-500 flex items-center justify-center text-zinc-400 hover:text-white transition-all shadow-sm" 
                      title="Excluir Despesa"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}