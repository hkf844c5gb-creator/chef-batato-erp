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
  mes_referencia: string;
  pago: boolean; 
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
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const [despesasDB, setDespesasDB] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [modoBulk, setModoBulk] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7)); 
  const [modoRascunhosGlobais, setModoRascunhosGlobais] = useState(false);

  const [formDespesa, setFormDespesa] = useState<Despesa>({
    id: '', descricao: '', categoria: 'Ingredientes & Mercadoria', valor: 0,
    fornecedor: '', data_despesa: new Date().toISOString().split('T')[0], mes_referencia: '', pago: true 
  });

  async function carregarDespesas() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('despesas').select('*').order('data_despesa', { ascending: false }).limit(3000); 
      if (error) throw error;
      if (data) setDespesasDB(data);
    } catch (err) { console.error("Erro ao carregar despesas:", err); } finally { setLoading(false); }
  }

  useEffect(() => { carregarDespesas(); }, []);

  const despesasPorClassificarGlobais = despesasDB.filter(d => d.categoria === '⚠️ Por Classificar');
  const despesasFiltradas = modoRascunhosGlobais ? despesasPorClassificarGlobais : despesasDB.filter(d => d.data_despesa && d.data_despesa.startsWith(mesFiltro)); 
  const totalGastoMes = despesasFiltradas.reduce((sum, d) => sum + Number(d.valor), 0);

  const toggleSelecionado = (id: string) => { setSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };
  const toggleTodos = () => { setSelecionados(selecionados.length === despesasFiltradas.length ? [] : despesasFiltradas.map(d => d.id)); };

  const abrirClassificacaoEmMassa = () => {
    if (selecionados.length === 0) return;
    setModoBulk(true);
    setFormDespesa({ id: '', descricao: '', valor: 0, fornecedor: '', data_despesa: '', mes_referencia: '', categoria: 'Ingredientes & Mercadoria', pago: true });
    setModalAberto(true);
  };

  const abrirEditarDespesa = (d: Despesa) => {
    setModoBulk(false);
    setFormDespesa({ ...d, pago: d.pago !== false }); // Assegura que default é pago=true
    setModalAberto(true);
  };

  const salvarDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessando(true);
    
    try {
      if (modoBulk) {
        if (formDespesa.categoria === '⚠️ Por Classificar') throw new Error("Escolha uma categoria.");
        const { error } = await supabase.from('despesas').update({ categoria: formDespesa.categoria, pago: formDespesa.pago }).in('id', selecionados);
        if (error) throw error;
        setSelecionados([]);
      } else {
        if (!formDespesa.descricao.trim() || formDespesa.valor <= 0) throw new Error('Preencha a descrição e um valor válido.');
        const dados = { descricao: formDespesa.descricao, categoria: formDespesa.categoria, valor: formDespesa.valor, fornecedor: formDespesa.fornecedor, data_despesa: formDespesa.data_despesa, mes_referencia: formDespesa.data_despesa.slice(0, 7), pago: formDespesa.pago };

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
      if (modoRascunhosGlobais && despesasPorClassificarGlobais.length <= (modoBulk ? selecionados.length : 1)) setModoRascunhosGlobais(false);
    } catch (error: any) { alert('Erro ao gravar:\n' + error.message); } finally { setProcessando(false); }
  };

  const excluirSelecionados = async () => {
    if (selecionados.length === 0) return;
    if (!confirm(`Deseja excluir as ${selecionados.length} despesas?`)) return;
    await supabase.from('despesas').delete().in('id', selecionados);
    setSelecionados([]); carregarDespesas();
  };

  const faturaRef = formDespesa.descricao.includes('📄') ? formDespesa.descricao.split('📄')[1].trim() : null;
  const itensDaMesmaFatura = faturaRef ? despesasDB.filter(d => d.descricao.includes(`📄 ${faturaRef}`)) : [];
  const valorTotalDestaFatura = itensDaMesmaFatura.reduce((acc, curr) => acc + Number(curr.valor), 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24">
      <header className="bg-zinc-950/80 border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center">
        <div><h1 className="text-2xl font-black text-white">Custos & Despesas</h1></div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-black uppercase text-zinc-300">
              {modoRascunhosGlobais ? '⚠️ A Visualizar Rascunhos' : 'Resumo do Mês'}
            </h2>
            {!modoRascunhosGlobais && despesasPorClassificarGlobais.length > 0 && (
              <button onClick={() => { setModoRascunhosGlobais(true); setSelecionados([]); }} className="bg-amber-500 text-zinc-950 text-[10px] font-black px-3 py-1.5 rounded-full animate-pulse">
                🔍 {despesasPorClassificarGlobais.length} rascunhos perdidos!
              </button>
            )}
            {modoRascunhosGlobais && (<button onClick={() => { setModoRascunhosGlobais(false); setSelecionados([]); }} className="bg-zinc-800 text-white text-[10px] font-bold px-3 py-1.5 rounded-full">⬅ Voltar</button>)}
          </div>
          <input type="month" value={mesFiltro} onChange={(e) => { setMesFiltro(e.target.value); setModoRascunhosGlobais(false); setSelecionados([]); }} className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-lg text-sm text-white" />
        </div>

        {selecionados.length > 0 && (
          <div className="bg-orange-600/20 border border-orange-500 p-4 rounded-2xl flex justify-between items-center shadow-lg">
            <span className="text-orange-400 font-bold text-sm">{selecionados.length} item(ns) selecionado(s)</span>
            <div className="flex gap-2">
              <button onClick={abrirClassificacaoEmMassa} className="bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-xl">📝 Classificar Selecionados</button>
              <button onClick={excluirSelecionados} className="bg-red-950 text-red-400 border border-red-900 text-xs font-bold px-4 py-2 rounded-xl">🗑️ Eliminar</button>
            </div>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-zinc-950/50 border-b border-zinc-800 text-[9px] font-bold text-zinc-500 uppercase">
              <tr>
                <th className="p-4 w-10"><input type="checkbox" checked={despesasFiltradas.length > 0 && selecionados.length === despesasFiltradas.length} onChange={toggleTodos} className="w-4 h-4 rounded accent-orange-500" /></th>
                <th className="p-4">Data</th>
                <th className="p-4">Descrição do Item / Fatura</th>
                <th className="p-4">Categoria</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-right">Valor</th>
                <th className="p-4 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-sm">
              {despesasFiltradas.map(desp => {
                const isRascunho = desp.categoria === '⚠️ Por Classificar';
                return (
                  <tr key={desp.id} className={`${selecionados.includes(desp.id) ? 'bg-orange-950/30' : isRascunho ? 'bg-amber-950/10' : ''}`} onClick={() => toggleSelecionado(desp.id)}>
                    <td className="p-4"><input type="checkbox" checked={selecionados.includes(desp.id)} onChange={() => toggleSelecionado(desp.id)} className="w-4 h-4 accent-orange-500" /></td>
                    <td className="p-4 text-zinc-400 font-mono text-xs">{desp.data_despesa}</td>
                    <td className="p-4 text-white font-bold whitespace-normal">{desp.descricao}</td>
                    <td className="p-4"><span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${isRascunho ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-300'}`}>{desp.categoria}</span></td>
                    <td className="p-4 text-center">{desp.pago ? <span className="text-green-400 text-[10px] font-bold">✓ PAGO</span> : <span className="text-red-400 text-[10px] font-bold">PENDENTE</span>}</td>
                    <td className="p-4 text-right font-black text-red-400">{Number(desp.valor).toFixed(2)}€</td>
                    <td className="p-4 text-center"><button onClick={(e) => { e.stopPropagation(); abrirEditarDespesa(desp); }} className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-xs font-bold">{isRascunho ? 'Classificar' : 'Editar'}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 w-full max-w-xl rounded-3xl p-6 flex flex-col max-h-[90vh]">
            <h2 className="text-xl font-black mb-4">{modoBulk ? '📦 Classificação em Massa' : '✏️ Editar Fatura'}</h2>
            
            <form onSubmit={salvarDespesa} className="flex-1 overflow-y-auto space-y-4">
              {!modoBulk && (
                <>
                  <input required type="text" value={formDespesa.descricao} onChange={e => setFormDespesa({...formDespesa, descricao: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-300" />
                  <input required type="number" step="0.01" value={formDespesa.valor || ''} onChange={e => setFormDespesa({...formDespesa, valor: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-red-400 font-bold" />
                </>
              )}

              <label className="block text-xs font-bold text-orange-500 mt-4">Classificar Categoria</label>
              <select value={formDespesa.categoria} onChange={e => setFormDespesa({...formDespesa, categoria: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm">
                {categoriasDespesas.filter(c => c !== '⚠️ Por Classificar' || !modoBulk).map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <label className="block text-xs font-bold text-zinc-400 mt-4">Estado do Pagamento</label>
              <select value={formDespesa.pago ? 'true' : 'false'} onChange={e => setFormDespesa({...formDespesa, pago: e.target.value === 'true'})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-green-400 font-bold">
                <option value="true">✓ Sim, já está Paga</option>
                <option value="false">⏳ Não, falta Pagar</option>
              </select>

              {!modoBulk && faturaRef && itensDaMesmaFatura.length > 0 && (
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 mt-4">
                  <h4 className="text-[10px] font-black text-zinc-400 mb-2 uppercase">🧾 Raio-X da Fatura: {faturaRef} (Total: {valorTotalDestaFatura.toFixed(2)}€)</h4>
                  {itensDaMesmaFatura.map(rel => (
                    <div key={rel.id} className="flex justify-between text-[11px] py-1 border-b border-zinc-800/30">
                       <span className="truncate pr-2 w-3/4">{rel.descricao.split('📄')[0]}</span>
                       <span className="text-orange-400 font-bold">{Number(rel.valor).toFixed(2)}€</span>
                    </div>
                  ))}
                </div>
              )}
              
              <button type="submit" disabled={processando || formDespesa.categoria === '⚠️ Por Classificar'} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 rounded-xl mt-4 disabled:opacity-50">
                {processando ? 'A Gravar...' : 'Gravar Classificação'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}