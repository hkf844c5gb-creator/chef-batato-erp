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

  // Estados para o Modal de Edição
  const [modalAberto, setModalAberto] = useState(false);
  const [despesaEditando, setDespesaEditando] = useState<Despesa | null>(null);
  const [form, setForm] = useState({ descricao: '', categoria: '', valor: 0, data_despesa: '', metodo_pagamento: '' });
  const [processando, setProcessando] = useState(false);

  async function carregarDespesas() {
    setLoading(true);
    const inicioMes = `${filtroMes}-01`;
    const fimMes = `${filtroMes}-31`; 

    const { data, error } = await supabase
      .from('despesas')
      .select('*')
      .gte('data_despesa', inicioMes)
      .lte('data_despesa', fimMes)
      .order('data_despesa', { ascending: false })
      .order('created_at', { ascending: false });

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

  const abrirModalEdicao = (desp: Despesa) => {
    setDespesaEditando(desp);
    setForm({
      descricao: desp.descricao,
      categoria: desp.categoria,
      valor: desp.valor,
      data_despesa: desp.data_despesa || '',
      metodo_pagamento: desp.metodo_pagamento || 'Manual'
    });
    setModalAberto(true);
  };

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!despesaEditando) return;
    
    setProcessando(true);
    try {
      const payload = {
        descricao: form.descricao,
        categoria: form.categoria,
        valor: form.valor,
        data_despesa: form.data_despesa,
        metodo_pagamento: form.metodo_pagamento
      };

      const { error } = await supabase.from('despesas').update(payload).eq('id', despesaEditando.id);
      
      if (error) throw error;
      
      setDespesas(prev => prev.map(d => d.id === despesaEditando.id ? { ...d, ...payload } : d));
      setModalAberto(false);
    } catch (err: any) {
      alert('Erro ao guardar alterações: ' + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const totalDespesas = despesas.reduce((acc, d) => acc + Number(d.valor), 0);

  const getCategoriaCor = (categoria: string) => {
    const cat = categoria?.toLowerCase() || '';
    if (cat.includes('marketing')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (cat.includes('taxas') || cat.includes('comissões')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (cat.includes('ingredientes') || cat.includes('mercadoria')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (cat.includes('embalagens')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    if (cat.includes('frota') || cat.includes('combustível')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (cat.includes('fixos') || cat.includes('estrutura')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
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
            className="bg-zinc-900 border border-zinc-700 text-white px-4 py-2 rounded-xl text-sm outline-none focus:border-orange-500 shadow-lg" 
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
                  
                  <div className="flex items-center gap-2 justify-end sm:w-auto w-full border-t sm:border-t-0 border-zinc-800 pt-3 sm:pt-0">
                    <div className="text-xl font-black text-red-400 font-mono whitespace-nowrap mr-3">
                      {Number(desp.valor).toFixed(2)}€
                    </div>
                    <button 
                      onClick={() => abrirModalEdicao(desp)} 
                      className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-blue-600 hover:border-blue-500 flex items-center justify-center text-zinc-400 hover:text-white transition-all shadow-sm" 
                      title="Editar Despesa"
                    >
                      ✏️
                    </button>
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

      {/* MODAL DE EDIÇÃO DE DESPESA */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col justify-center items-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full max-w-lg rounded-[32px] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-zinc-800">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800 bg-zinc-950/50">
              <h2 className="text-xl font-black text-white">✏️ Editar Despesa</h2>
              <button onClick={() => setModalAberto(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white hover:bg-zinc-700 transition-colors">✕</button>
            </div>
            
            <form onSubmit={salvarEdicao} className="p-6 space-y-5">
              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Descrição</label>
                <input required type="text" value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors" />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Categoria</label>
                <select value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 appearance-none cursor-pointer">
                  <option value="Ingredientes & Mercadoria">Ingredientes & Mercadoria</option>
                  <option value="Embalagens & Consumíveis">Embalagens & Consumíveis</option>
                  <option value="Marketing (Glovo)">Marketing (Glovo)</option>
                  <option value="Marketing (Meta/Facebook)">Marketing (Meta/Facebook)</option>
                  <option value="Marketing & Publicidade">Outro Marketing & Publicidade</option>
                  <option value="Taxas e Comissões (Glovo/Uber)">Taxas e Comissões (Glovo/Uber)</option>
                  <option value="Frota & Combustível">Frota & Combustível</option>
                  <option value="Estrutura & Fixos">Estrutura & Fixos</option>
                  <option value="Impostos">Impostos</option>
                  <option value="Extrato Bancário">Extrato Bancário (Por classificar)</option>
                  <option value="Outras Despesas">Outras Despesas</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Data</label>
                  <input required type="date" value={form.data_despesa} onChange={e => setForm({...form, data_despesa: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Valor (€)</label>
                  <input required type="number" step="0.01" value={form.valor} onChange={e => setForm({...form, valor: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-xl font-black font-mono text-center outline-none text-red-400 focus:border-red-500" />
                </div>
              </div>

              <div className="pt-4">
                <button type="submit" disabled={processando} className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95 uppercase tracking-wider disabled:opacity-50 text-white">
                  {processando ? 'A Guardar...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}