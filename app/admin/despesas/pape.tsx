'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Despesa {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data_despesa: string;
  metodo_pagamento: string;
}

const categoriasDespesas = [
  'Ingredientes & Mercadoria',
  'Embalagens & Consumíveis',
  'Frota & Combustível',
  'Estrutura & Fixos',
  'Marketing & Publicidade',
  'Devoluções & Reembolsos',
  'Outros'
];

export default function GestaoDespesas() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [despesasDB, setDespesasDB] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7)); // Formato YYYY-MM

  const [formDespesa, setFormDespesa] = useState<Despesa>({
    id: '',
    descricao: '',
    categoria: 'Ingredientes & Mercadoria',
    valor: 0,
    data_despesa: new Date().toISOString().split('T')[0],
    metodo_pagamento: 'Cartão da Empresa'
  });

  async function carregarDespesas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('despesas')
        .select('*')
        .order('data_despesa', { ascending: false });

      if (error) throw error;
      if (data) setDespesasDB(data);
    } catch (err) {
      console.error("Erro ao carregar despesas:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDespesas(); }, []);

  // --- FILTROS E MATEMÁTICA ---
  // Filtra as despesas para o mês/ano selecionado no topo do ecrã
  const despesasFiltradas = despesasDB.filter(d => d.data_despesa.startsWith(mesFiltro));
  
  const totalGastoMes = despesasFiltradas.reduce((sum, d) => sum + Number(d.valor), 0);

  // Calcula qual foi a categoria onde se gastou mais este mês
  const gastosPorCategoria = despesasFiltradas.reduce((acc, d) => {
    acc[d.categoria] = (acc[d.categoria] || 0) + Number(d.valor);
    return acc;
  }, {} as Record<string, number>);
  
  const categoriaMaisCara = Object.entries(gastosPorCategoria).sort((a, b) => b[1] - a[1])[0];

  // --- AÇÕES (CRUD) ---
  const abrirNovaDespesa = () => {
    setFormDespesa({
      id: '',
      descricao: '',
      categoria: 'Ingredientes & Mercadoria',
      valor: 0,
      data_despesa: new Date().toISOString().split('T')[0],
      metodo_pagamento: 'Cartão da Empresa'
    });
    setModalAberto(true);
  };

  const abrirEditarDespesa = (d: Despesa) => {
    setFormDespesa(d);
    setModalAberto(true);
  };

  const salvarDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDespesa.descricao.trim() || formDespesa.valor <= 0) return alert('Preencha a descrição e um valor válido.');
    
    setProcessando(true);
    try {
      const dados = {
        descricao: formDespesa.descricao,
        categoria: formDespesa.categoria,
        valor: formDespesa.valor,
        data_despesa: formDespesa.data_despesa,
        metodo_pagamento: formDespesa.metodo_pagamento
      };

      if (formDespesa.id) {
        const { error } = await supabase.from('despesas').update(dados).eq('id', formDespesa.id);
        if (error) throw error;
        alert('Despesa atualizada!');
      } else {
        const { error } = await supabase.from('despesas').insert([dados]);
        if (error) throw error;
        alert('Despesa registada com sucesso!');
      }

      setModalAberto(false);
      carregarDespesas();
    } catch (error: unknown) {
      const erroMsg = error instanceof Error ? error.message : JSON.stringify(error);
      alert('Erro ao gravar despesa:\n' + erroMsg);
    } finally {
      setProcessando(false);
    }
  };

  const excluirDespesa = async (id: string) => {
    if (!confirm('Deseja excluir este registo de despesa? Esta ação não tem volta.')) return;
    try {
      await supabase.from('despesas').delete().eq('id', id);
      carregarDespesas();
    } catch (err) { alert("Erro ao excluir."); }
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Carregar Cofre...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24 selection:bg-orange-500/30">
      
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center transition-all">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-900/40 text-2xl">
            📉
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Custos & Despesas</h1>
            <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Gestão Financeira</p>
          </div>
        </div>
        <button onClick={abrirNovaDespesa} className="bg-white hover:bg-zinc-200 text-zinc-950 px-5 py-2.5 rounded-xl text-sm font-black shadow-lg transition-transform active:scale-95 flex items-center gap-2">
          <span>+</span> Registar Fatura
        </button>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 md:p-8 space-y-8">
        
        {/* BARRA DE FILTRO DE MÊS */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase text-zinc-300 tracking-wider">Resumo do Mês</h2>
          <input 
            type="month" 
            value={mesFiltro} 
            onChange={(e) => setMesFiltro(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold outline-none focus:border-red-500 cursor-pointer"
          />
        </div>

        {/* DASHBOARD RÁPIDO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest">Saídas Totais no Mês</span>
            <div className="text-4xl font-black text-white font-mono mt-2 tracking-tighter">
              {totalGastoMes.toFixed(2)}<span className="text-2xl text-red-500 ml-1">€</span>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Categoria Que Mais Pesou</span>
            <div className="text-2xl font-black text-zinc-300 mt-2 tracking-tight flex flex-col">
              {categoriaMaisCara ? (
                <>
                  <span>{categoriaMaisCara[0]}</span>
                  <span className="text-sm font-mono text-zinc-500 mt-1">{categoriaMaisCara[1].toFixed(2)}€ gastos</span>
                </>
              ) : (
                <span className="text-zinc-600 italic text-lg">Sem registos</span>
              )}
            </div>
          </div>
        </div>

        {/* TABELA DE DESPESAS */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-[24px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-zinc-950/50 border-b border-zinc-800 text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                <tr>
                  <th className="p-5">Data</th>
                  <th className="p-5">Descrição / Fornecedor</th>
                  <th className="p-5">Categoria</th>
                  <th className="p-5">Pagamento</th>
                  <th className="p-5 text-right">Valor</th>
                  <th className="p-5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 font-medium text-sm">
                {despesasFiltradas.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-zinc-600 italic">Nenhuma fatura registada neste mês.</td></tr>
                ) : (
                  despesasFiltradas.map(desp => (
                    <tr key={desp.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="p-5 text-zinc-400 font-mono text-xs">{new Date(desp.data_despesa).toLocaleDateString('pt-PT')}</td>
                      <td className="p-5 text-white font-bold">{desp.descricao}</td>
                      <td className="p-5">
                        <span className="bg-zinc-800 text-zinc-300 text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider">
                          {desp.categoria}
                        </span>
                      </td>
                      <td className="p-5 text-zinc-400 text-xs">{desp.metodo_pagamento}</td>
                      <td className="p-5 text-right font-black font-mono text-red-400">{Number(desp.valor).toFixed(2)}€</td>
                      <td className="p-5 text-center flex items-center justify-center gap-4">
                        <button onClick={() => abrirEditarDespesa(desp)} className="text-zinc-500 hover:text-white transition-colors" title="Editar">✏️</button>
                        <button onClick={() => excluirDespesa(desp.id)} className="text-red-500/50 hover:text-red-400 transition-colors" title="Excluir">🗑️</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* MODAL DE REGISTO DE DESPESA */}
      {modalAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-end md:justify-center items-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full md:max-w-lg rounded-t-[32px] md:rounded-[32px] flex flex-col overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)] border border-zinc-800 animate-in slide-in-from-bottom-10 duration-300">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800/80">
              <h2 className="text-xl font-black text-white">{formDespesa.id ? '✏️ Editar Fatura' : '🧾 Nova Fatura/Despesa'}</h2>
              <button onClick={() => setModalAberto(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white">✕</button>
            </div>
            
            <form onSubmit={salvarDespesa} className="p-6 space-y-5">
              
              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Descrição / Fornecedor</label>
                <input required type="text" value={formDespesa.descricao} onChange={e => setFormDespesa({...formDespesa, descricao: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-red-500 font-bold" placeholder="Ex: Pingo Doce, Gasóleo BP, Embalagens..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Valor Total (€)</label>
                  <input required type="number" step="0.01" value={formDespesa.valor || ''} onChange={e => setFormDespesa({...formDespesa, valor: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-xl font-black text-red-400 font-mono text-center outline-none focus:border-red-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Data do Recibo</label>
                  <input type="date" required value={formDespesa.data_despesa} onChange={e => setFormDespesa({...formDespesa, data_despesa: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-xs font-bold text-white outline-none focus:border-red-500" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Categoria</label>
                <select value={formDespesa.categoria} onChange={e => setFormDespesa({...formDespesa, categoria: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white font-bold outline-none focus:border-red-500 cursor-pointer">
                  {categoriasDespesas.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Método Usado</label>
                <select value={formDespesa.metodo_pagamento} onChange={e => setFormDespesa({...formDespesa, metodo_pagamento: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white font-bold outline-none focus:border-red-500 cursor-pointer">
                  <option value="Cartão da Empresa">Cartão da Empresa</option>
                  <option value="Numerário do Caixa">Numerário (Tirado da Caixa)</option>
                  <option value="Transferência Bancária">Transferência Bancária</option>
                  <option value="MB Way">MB Way</option>
                </select>
              </div>
              
              <div className="pt-4">
                <button type="submit" disabled={processando} className="w-full bg-white hover:bg-zinc-200 text-zinc-950 py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95 uppercase tracking-wider disabled:opacity-50">
                  {processando ? 'A Gravar...' : 'Confirmar Saída'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}