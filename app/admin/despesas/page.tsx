'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Despesa {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data_despesa: string;
  fornecedor: string; 
  metodo_pagamento: string;
  status: string; 
}

const categoriasDespesas = [
  '⚠️ Por Classificar', 
  'Ingredientes & Mercadoria',
  'Embalagens & Consumíveis',
  'Frota & Combustível',
  'Estrutura & Fixos',
  'Marketing & Publicidade',
  'Devoluções & Reembolsos',
  'Fatura Física',
  'Extrato Bancário',
  'Taxas e Comissões (Glovo/Uber)',
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
  const [modoBulk, setModoBulk] = useState(false); // NOVO: Modo de Classificação em Massa
  const [selecionados, setSelecionados] = useState<string[]>([]); // NOVO: Itens selecionados
  
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7)); 
  const [modoRascunhosGlobais, setModoRascunhosGlobais] = useState(false);

  const [formDespesa, setFormDespesa] = useState<Despesa>({
    id: '',
    descricao: '',
    categoria: 'Ingredientes & Mercadoria',
    valor: 0,
    fornecedor: '',
    data_despesa: new Date().toISOString().split('T')[0],
    metodo_pagamento: 'Cartão da Empresa',
    status: 'Validado' 
  });

  async function carregarDespesas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('despesas')
        .select('*')
        .order('data_despesa', { ascending: false })
        .limit(3000); 

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
  const despesasPorClassificarGlobais = despesasDB.filter(d => d.categoria === '⚠️ Por Classificar');
  
  const despesasFiltradas = modoRascunhosGlobais 
    ? despesasPorClassificarGlobais 
    : despesasDB.filter(d => d.data_despesa.startsWith(mesFiltro)); 
  
  const totalGastoMes = despesasFiltradas.reduce((sum, d) => sum + Number(d.valor), 0);

  const gastosPorCategoria = despesasFiltradas.reduce((acc, d) => {
    if (d.categoria !== '⚠️ Por Classificar') {
      acc[d.categoria] = (acc[d.categoria] || 0) + Number(d.valor);
    }
    return acc;
  }, {} as Record<string, number>);
  
  const categoriaMaisCara = Object.entries(gastosPorCategoria).sort((a, b) => b[1] - a[1])[0];

  // --- SELEÇÃO EM MASSA ---
  const toggleSelecionado = (id: string) => {
    setSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleTodos = () => {
    if (selecionados.length === despesasFiltradas.length) {
      setSelecionados([]);
    } else {
      setSelecionados(despesasFiltradas.map(d => d.id));
    }
  };

  const abrirClassificacaoEmMassa = () => {
    if (selecionados.length === 0) return;
    setModoBulk(true);
    setFormDespesa({
      id: '', descricao: '', valor: 0, fornecedor: '', data_despesa: '',
      categoria: 'Ingredientes & Mercadoria', 
      metodo_pagamento: 'Conciliação Automática',
      status: 'Validado' // Como pediu, assume-se sempre pago!
    });
    setModalAberto(true);
  };

  // --- AÇÕES (CRUD) ---
  const abrirNovaDespesa = () => {
    setModoBulk(false);
    setFormDespesa({
      id: '', descricao: '', categoria: 'Ingredientes & Mercadoria', valor: 0, fornecedor: '',
      data_despesa: new Date().toISOString().split('T')[0], metodo_pagamento: 'Cartão da Empresa', status: 'Validado'
    });
    setModalAberto(true);
  };

  const abrirEditarDespesa = (d: Despesa) => {
    setModoBulk(false);
    setFormDespesa({
      ...d,
      status: d.categoria === '⚠️ Por Classificar' ? 'Validado' : (d.status || 'Validado'), // Se é rascunho, sugere logo Validado
      fornecedor: d.fornecedor || ''
    });
    setModalAberto(true);
  };

  const salvarDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessando(true);
    
    try {
      if (modoBulk) {
        // GRAVAR EM MASSA
        if (formDespesa.categoria === '⚠️ Por Classificar') throw new Error("Escolha uma categoria válida.");
        
        const { error } = await supabase
          .from('despesas')
          .update({ 
            categoria: formDespesa.categoria, 
            status: formDespesa.status 
          })
          .in('id', selecionados);
          
        if (error) throw error;
        setSelecionados([]);
      } else {
        // GRAVAR INDIVIDUAL
        if (!formDespesa.descricao.trim() || formDespesa.valor <= 0) throw new Error('Preencha a descrição e um valor válido.');
        
        const dados = {
          descricao: formDespesa.descricao, categoria: formDespesa.categoria, valor: formDespesa.valor,
          fornecedor: formDespesa.fornecedor, data_despesa: formDespesa.data_despesa,
          metodo_pagamento: formDespesa.metodo_pagamento, status: formDespesa.status 
        };

        if (formDespesa.id) {
          const { error } = await supabase.from('despesas').update(dados).eq('id', formDespesa.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('despesas').insert([dados]);
          if (error) throw error;
        }
      }

      setModalAberto(false);
      await carregarDespesas();
      
      if (modoRascunhosGlobais && despesasPorClassificarGlobais.length <= (modoBulk ? selecionados.length : 1)) {
        setModoRascunhosGlobais(false);
      }
    } catch (error: unknown) {
      const erroMsg = error instanceof Error ? error.message : JSON.stringify(error);
      alert('Erro ao gravar:\n' + erroMsg);
    } finally {
      setProcessando(false);
    }
  };

  const excluirDespesa = async (id: string) => {
    if (!confirm('Deseja excluir este registo de despesa? Esta ação não tem volta.')) return;
    try {
      await supabase.from('despesas').delete().eq('id', id);
      carregarDespesas();
      if (modoRascunhosGlobais && despesasPorClassificarGlobais.length <= 1) setModoRascunhosGlobais(false);
    } catch (err) { alert("Erro ao excluir."); }
  };

  const excluirSelecionados = async () => {
    if (selecionados.length === 0) return;
    if (!confirm(`Deseja excluir definitivamente as ${selecionados.length} despesas selecionadas?`)) return;
    try {
      await supabase.from('despesas').delete().in('id', selecionados);
      setSelecionados([]);
      carregarDespesas();
    } catch (err) { alert("Erro ao excluir."); }
  };

  const renderizarStatus = (status: string) => {
    if (status === 'Validado') return <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">✓ Validado</span>;
    if (status === 'Falta Fatura') return <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">⚠️ Falta Fatura</span>;
    if (status === 'Falta Pagamento') return <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">⏳ Falta Pagamento</span>;
    return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider animate-pulse">📝 Por Classificar</span>;
  };

  // --- LÓGICA DE CONTEXTO DA FATURA (RAIO-X) ---
  // Extrai o nome da fatura (que vem a seguir ao emoji 📄)
  const faturaRef = formDespesa.descricao.includes('📄') ? formDespesa.descricao.split('📄')[1].trim() : null;
  // Procura todas as outras despesas que tenham exatamente o mesmo nome de fatura na descrição
  const itensDaMesmaFatura = faturaRef ? despesasDB.filter(d => d.descricao.includes(`📄 ${faturaRef}`)) : [];
  const valorTotalDestaFatura = itensDaMesmaFatura.reduce((acc, curr) => acc + Number(curr.valor), 0);

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Carregar Cofre...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24 selection:bg-orange-500/30">
      
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center transition-all">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-900/40 text-2xl">📉</div>
          <div><h1 className="text-2xl font-black text-white tracking-tight">Custos & Despesas</h1><p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Gestão Financeira</p></div>
        </div>
        <button onClick={abrirNovaDespesa} className="bg-white hover:bg-zinc-200 text-zinc-950 px-5 py-2.5 rounded-xl text-sm font-black shadow-lg transition-transform active:scale-95 flex items-center gap-2">
          <span>+</span> Registar Entrada Manual
        </button>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 md:p-8 space-y-8">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-sm font-black uppercase text-zinc-300 tracking-wider">
              {modoRascunhosGlobais ? '⚠️ A Visualizar Rascunhos Pendentes' : 'Resumo do Mês'}
            </h2>
            
            {!modoRascunhosGlobais && despesasPorClassificarGlobais.length > 0 && (
              <button 
                onClick={() => { setModoRascunhosGlobais(true); setSelecionados([]); }}
                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg shadow-amber-500/20 animate-pulse transition-colors flex items-center gap-2"
              >
                🔍 Tem {despesasPorClassificarGlobais.length} rascunho(s) a aguardar (Ver Todos)
              </button>
            )}

            {modoRascunhosGlobais && (
              <button 
                onClick={() => { setModoRascunhosGlobais(false); setSelecionados([]); }}
                className="bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-full transition-colors flex items-center gap-2"
              >
                ⬅ Voltar ao Filtro de Mês
              </button>
            )}
          </div>

          <input 
            type="month" 
            value={mesFiltro} 
            onChange={(e) => { setMesFiltro(e.target.value); setModoRascunhosGlobais(false); setSelecionados([]); }} 
            className={`bg-zinc-900 border px-4 py-2 rounded-lg text-sm font-bold outline-none cursor-pointer transition-colors ${modoRascunhosGlobais ? 'border-zinc-800/50 text-zinc-600' : 'border-zinc-800 text-white focus:border-red-500'}`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest">Saídas Totais (Nesta Vista)</span>
            <div className="text-4xl font-black text-white font-mono mt-2 tracking-tighter">{totalGastoMes.toFixed(2)}<span className="text-2xl text-red-500 ml-1">€</span></div>
          </div>
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Categoria Que Mais Pesou</span>
            <div className="text-2xl font-black text-zinc-300 mt-2 tracking-tight flex flex-col">
              {categoriaMaisCara ? (<><span>{categoriaMaisCara[0]}</span><span className="text-sm font-mono text-zinc-500 mt-1">{categoriaMaisCara[1].toFixed(2)}€ gastos</span></>) : (<span className="text-zinc-600 italic text-lg">Sem registos organizados</span>)}
            </div>
          </div>
        </div>

        {/* BARRA DE AÇÕES EM MASSA */}
        {selecionados.length > 0 && (
          <div className="bg-orange-600/20 border border-orange-500 p-4 rounded-2xl flex justify-between items-center shadow-[0_0_20px_rgba(249,115,22,0.15)] animate-in fade-in zoom-in duration-300">
            <div>
              <span className="text-orange-400 font-bold text-sm">{selecionados.length} item(ns) selecionado(s)</span>
            </div>
            <div className="flex gap-2">
              <button onClick={abrirClassificacaoEmMassa} className="bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shadow-lg">
                📝 Classificar Selecionados
              </button>
              <button onClick={excluirSelecionados} className="bg-red-950 hover:bg-red-900 text-red-400 border border-red-900 text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                🗑️ Eliminar
              </button>
            </div>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-[24px] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-zinc-950/50 border-b border-zinc-800 text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                <tr>
                  <th className="p-5 w-10">
                    <input 
                      type="checkbox" 
                      checked={despesasFiltradas.length > 0 && selecionados.length === despesasFiltradas.length} 
                      onChange={toggleTodos}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 accent-orange-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-5">Data</th>
                  <th className="p-5">Fornecedor</th>
                  <th className="p-5">Descrição do Item / Fatura</th>
                  <th className="p-5">Categoria</th>
                  <th className="p-5 text-center">Estado</th>
                  <th className="p-5 text-right">Valor</th>
                  <th className="p-5 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 font-medium text-sm">
                {despesasFiltradas.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-zinc-600 italic">Nenhuma fatura ou despesa nesta vista.</td></tr>
                ) : (
                  despesasFiltradas.map(desp => {
                    const isRascunho = desp.categoria === '⚠️ Por Classificar';
                    const isSelecionado = selecionados.includes(desp.id);
                    
                    return (
                    <tr key={desp.id} className={`transition-colors cursor-pointer ${isSelecionado ? 'bg-orange-950/30' : isRascunho ? 'bg-amber-950/10 hover:bg-amber-900/20' : 'hover:bg-zinc-800/30'}`} onClick={() => toggleSelecionado(desp.id)}>
                      <td className="p-5" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={isSelecionado}
                          onChange={() => toggleSelecionado(desp.id)}
                          className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 accent-orange-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-5 text-zinc-400 font-mono text-xs">{new Date(desp.data_despesa).toLocaleDateString('pt-PT')}</td>
                      <td className="p-5 text-zinc-300 max-w-[150px] truncate">{desp.fornecedor || '---'}</td>
                      
                      <td className="p-5 text-white font-bold whitespace-normal min-w-[250px] leading-relaxed">
                        {desp.descricao}
                      </td>

                      <td className="p-5">
                        <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider ${isRascunho ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-zinc-800 text-zinc-300'}`}>
                          {desp.categoria}
                        </span>
                      </td>
                      
                      <td className="p-5 text-center">{renderizarStatus(desp.status)}</td>
                      <td className="p-5 text-right font-black font-mono text-red-400">{Number(desp.valor).toFixed(2)}€</td>
                      <td className="p-5 text-center flex items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => abrirEditarDespesa(desp)} className={`transition-colors text-xs font-bold px-3 py-1.5 rounded-lg ${isRascunho ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/40' : 'bg-zinc-800 hover:bg-zinc-700 text-white'}`} title="Editar / Classificar">
                          {isRascunho ? 'Classificar' : 'Editar'}
                        </button>
                        <button onClick={() => excluirDespesa(desp.id)} className="text-red-500/50 hover:text-red-400 transition-colors" title="Excluir">🗑️</button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* MODAL (SERVE PARA SINGLE EDIT OU BULK EDIT) */}
      {modalAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-end md:justify-center items-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full md:max-w-xl rounded-t-[32px] md:rounded-[32px] flex flex-col overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)] border border-zinc-800 animate-in slide-in-from-bottom-10 duration-300 max-h-[90vh]">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800/80">
              <h2 className="text-xl font-black text-white">
                {modoBulk ? '📦 Classificação em Massa' : (formDespesa.id && formDespesa.categoria === '⚠️ Por Classificar' ? '📝 Classificar Item Extraído' : formDespesa.id ? '✏️ Editar Fatura' : '🧾 Lançar Entrada Manual')}
              </h2>
              <button onClick={() => setModalAberto(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white">✕</button>
            </div>
            
            <form onSubmit={salvarDespesa} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
              
              {modoBulk ? (
                <>
                  {/* VISTA MODO BULK */}
                  <div className="bg-orange-950/30 border border-orange-900 p-4 rounded-2xl mb-4">
                    <p className="text-xs text-orange-400 font-bold mb-2">Vai classificar {selecionados.length} itens simultaneamente:</p>
                    <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1 bg-zinc-950/50 p-2 rounded-xl border border-zinc-800/50">
                      {selecionados.map(id => {
                        const d = despesasDB.find(x => x.id === id);
                        return (
                          <div key={id} className="flex justify-between text-[11px] text-zinc-300 items-center">
                            <span className="truncate pr-4">{d?.descricao}</span>
                            <span className="font-mono text-red-400 font-bold">{d?.valor.toFixed(2)}€</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* VISTA MODO SINGLE */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Item Extraído / Descrição</label>
                      <input required type="text" value={formDespesa.descricao} onChange={e => setFormDespesa({...formDespesa, descricao: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-zinc-300 outline-none focus:border-red-500 font-bold" />
                    </div>
                    
                    <div className="col-span-2">
                      <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Fornecedor / Origem</label>
                      <input type="text" value={formDespesa.fornecedor || ''} onChange={e => setFormDespesa({...formDespesa, fornecedor: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-red-500 font-bold" placeholder="Ex: Pingo Doce, BP, Meta..." />
                    </div>
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
                </>
              )}

              {/* CAMPOS COMUNS A BULK E SINGLE */}
              <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 pt-4">
                <div className="col-span-2">
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2 text-orange-500">Destino: Classificar Categoria</label>
                  <select value={formDespesa.categoria} onChange={e => setFormDespesa({...formDespesa, categoria: e.target.value})} className={`w-full bg-zinc-950 border rounded-2xl px-4 py-3.5 text-sm font-bold outline-none cursor-pointer transition-colors ${formDespesa.categoria === '⚠️ Por Classificar' ? 'border-orange-500 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.15)]' : 'border-zinc-800 text-white focus:border-red-500'}`}>
                    {categoriasDespesas.filter(c => c !== '⚠️ Por Classificar' || !modoBulk).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Estado do Pagamento (A Fatura já está paga?)</label>
                  <select value={formDespesa.status} onChange={e => setFormDespesa({...formDespesa, status: e.target.value})} className="w-full bg-zinc-950 border border-green-900/50 rounded-2xl px-4 py-3.5 text-sm text-green-400 font-bold outline-none focus:border-green-500 cursor-pointer">
                    <option value="Validado">✓ Sim, já está Paga (Validado)</option>
                    <option value="Pendente">⏳ Não, falta Pagar (Pendente)</option>
                    <option value="Falta Fatura">⚠️ Falta anexar Fatura</option>
                  </select>
                </div>
              </div>
              
              {/* MAGIA: CONTEXTO DA FATURA INTEIRA NO MODO SINGLE */}
              {!modoBulk && faturaRef && itensDaMesmaFatura.length > 0 && (
                <div className="bg-zinc-950/80 p-4 rounded-2xl border border-zinc-800 mt-4 shadow-inner">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">🧾 Raio-X da Fatura: {faturaRef}</h4>
                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">Total Fatura: {valorTotalDestaFatura.toFixed(2)}€</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                    {itensDaMesmaFatura.map(rel => (
                      <div key={rel.id} className="flex justify-between text-[11px] items-center py-1 border-b border-zinc-800/30 last:border-0">
                         <span className={`truncate pr-2 w-3/4 ${rel.id === formDespesa.id ? 'text-orange-400 font-bold bg-orange-500/10 px-1 rounded' : 'text-zinc-500'}`}>
                           {rel.descricao.split('📄')[0]} 
                           {rel.categoria !== '⚠️ Por Classificar' && <span className="ml-2 text-[9px] text-green-500 bg-green-500/10 px-1 rounded">✓ {rel.categoria.split('&')[0]}</span>}
                         </span>
                         <span className={`font-mono ${rel.id === formDespesa.id ? 'text-orange-400 font-bold' : 'text-zinc-500'}`}>{Number(rel.valor).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4">
                <button type="submit" disabled={processando || formDespesa.categoria === '⚠️ Por Classificar'} className="w-full bg-white hover:bg-zinc-200 text-zinc-950 py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95 uppercase tracking-wider disabled:opacity-50">
                  {processando ? 'A Gravar...' : formDespesa.categoria === '⚠️ Por Classificar' ? 'Escolha a Categoria Acima ⬆️' : modoBulk ? `Gravar ${selecionados.length} Itens` : 'Salvar Classificação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}