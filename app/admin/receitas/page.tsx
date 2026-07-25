'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Insumo {
  id: string;
  nome: string;
  unidade_medida: string;
  quantidade_atual: number;
  quantidade_alerta: number;
  custo_por_unidade?: number;
  custo_unidade?: number;
}

interface Produto {
  id: string;
  nome: string;
  categoria: string;
  rendimento?: number; 
}

interface FichaItem {
  id: string;
  insumo_id: string;
  quantidade_necessaria: number; 
  unidade_receita: string; 
  insumos: Insumo; 
}

export default function ReceitasEStocks() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  
  const [produtoSelecionado, setProdutoSelecionado] = useState<string>('');
  const [fichaAtual, setFichaAtual] = useState<FichaItem[]>([]);
  const [rendimentoProduto, setRendimentoProduto] = useState<number>(1);
  const [salvouRendimento, setSalvouRendimento] = useState(false); // Estado para o botão OK

  const [formInsumo, setFormInsumo] = useState({ nome: '', unidade_medida: 'unid', quantidade_atual: 0, quantidade_alerta: 0, custo_por_unidade: 0 });
  const [formFicha, setFormFicha] = useState({ insumo_id: '', quantidade_receita: 0, unidade_receita: 'g' });
  
  const [isProcessando, setIsProcessando] = useState(false);

  // 1. CARREGAR DADOS
  async function carregarDadosBase() {
    setLoading(true);
    try {
      const { data: dataInsumos, error: errInsumos } = await supabase.from('insumos').select('*').order('nome', { ascending: true });
      if (errInsumos) console.error("Erro ao carregar insumos:", errInsumos);
      else setInsumos(dataInsumos || []);

      const { data: dataProdutos, error: errProdutos } = await supabase.from('produtos').select('id, nome, categoria, rendimento').eq('ativo', true).order('nome', { ascending: true });
      if (errProdutos) throw errProdutos;
      
      const produtosSemBebidas = (dataProdutos || []).filter((p: Produto) => {
        const categoria = (p.categoria || '').toLowerCase().trim();
        return categoria !== 'bebida' && categoria !== 'bebidas';
      });
      setProdutos(produtosSemBebidas);

    } catch (err: any) {
      console.error("Erro geral ao carregar dados:", err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDadosBase(); }, []);

  // Ao selecionar um produto, atualiza o rendimento atual dele
  useEffect(() => {
    if (produtoSelecionado) {
      const prod = produtos.find(p => p.id === produtoSelecionado);
      setRendimentoProduto(prod?.rendimento || 1);
    }
  }, [produtoSelecionado, produtos]);

  // 2. CARREGAR FICHA DO PRATO SELECIONADO
  useEffect(() => {
    async function carregarFichaDoProduto() {
      if (!produtoSelecionado) return setFichaAtual([]);
      try {
        const { data, error } = await supabase.from('fichas_tecnicas').select('id, insumo_id, quantidade_necessaria, unidade_receita, insumos(*)').eq('produto_id', produtoSelecionado);
        if (error) throw error;
        
        const fichasFormatadas = (data || []).map((item: any) => ({
          id: item.id,
          insumo_id: item.insumo_id,
          quantidade_necessaria: item.quantidade_necessaria,
          unidade_receita: item.unidade_receita || (Array.isArray(item.insumos) ? item.insumos[0]?.unidade_medida : item.insumos?.unidade_medida) || 'un',
          insumos: Array.isArray(item.insumos) ? item.insumos[0] : item.insumos
        })) as FichaItem[];
        setFichaAtual(fichasFormatadas);
      } catch (err: any) { console.error("Erro ao carregar ficha técnica", err); }
    }
    carregarFichaDoProduto();
  }, [produtoSelecionado]);

  // Função disparada pelo botão "OK" do Rendimento
  const handleSalvarRendimento = async () => {
    const rendimentoSeguro = rendimentoProduto < 1 ? 1 : rendimentoProduto;
    setRendimentoProduto(rendimentoSeguro);
    
    if (!produtoSelecionado) return;
    try {
      await supabase.from('produtos').update({ rendimento: rendimentoSeguro }).eq('id', produtoSelecionado);
      setProdutos(produtos.map(p => p.id === produtoSelecionado ? { ...p, rendimento: rendimentoSeguro } : p));
      
      // Feedback visual no botão
      setSalvouRendimento(true);
      setTimeout(() => setSalvouRendimento(false), 2000);
    } catch(e) {
      console.error("Erro ao atualizar rendimento", e);
    }
  };

  // FUNÇÕES BÁSICAS DA DESPENSA
  const adicionarInsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formInsumo.nome) return alert('Dê um nome ao insumo.');
    setIsProcessando(true);
    try {
      const { error } = await supabase.from('insumos').insert([formInsumo]);
      if (error) throw error;
      setFormInsumo({ nome: '', unidade_medida: 'unid', quantidade_atual: 0, quantidade_alerta: 0, custo_por_unidade: 0 });
      carregarDadosBase();
    } catch (err: any) { alert("Erro ao guardar insumo: " + err.message); } finally { setIsProcessando(false); }
  };

  const atualizarStockInsumo = async (id: string, novaQuantidade: number) => {
    try {
      const { error } = await supabase.from('insumos').update({ quantidade_atual: novaQuantidade }).eq('id', id);
      if (error) throw error;
      setInsumos(insumos.map(i => i.id === id ? { ...i, quantidade_atual: novaQuantidade } : i));
    } catch (err: any) { alert("Erro ao atualizar stock: " + err.message); }
  };

  const excluirInsumo = async (id: string) => {
    if (!confirm('Atenção: Excluir este insumo vai removê-lo de TODAS as fichas técnicas. Continuar?')) return;
    try {
      const { error } = await supabase.from('insumos').delete().eq('id', id);
      if (error) throw error;
      carregarDadosBase();
    } catch (err: any) { alert("Erro ao excluir: " + err.message); }
  };

  // 3. O MOTOR DE CONVERSÃO MATEMÁTICO
  const converterUnidade = (quantidade: number, unidadeDeOrigem: string, unidadeDeDestino: string) => {
    const orig = unidadeDeOrigem.toLowerCase().trim();
    const dest = unidadeDeDestino.toLowerCase().trim();
    
    if (orig === dest) return quantidade;

    if (orig === 'g' && dest === 'kg') return quantidade / 1000;
    if (orig === 'kg' && dest === 'g') return quantidade * 1000;
    
    if (orig === 'ml' && (dest === 'litro' || dest === 'l')) return quantidade / 1000;
    if ((orig === 'litro' || orig === 'l') && dest === 'ml') return quantidade * 1000;

    return quantidade; 
  };

  const adicionarNaFicha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!produtoSelecionado) return alert('Selecione um prato primeiro.');
    if (!formFicha.insumo_id || formFicha.quantidade_receita <= 0) {
      return alert('Preencha a quantidade corretamente (maior que 0).');
    }
    
    const insumoEscolhido = insumos.find(i => i.id === formFicha.insumo_id);
    if (!insumoEscolhido) return alert("Insumo não encontrado na despensa.");

    setIsProcessando(true);
    try {
      const qtdConvertidaParaArmazem = converterUnidade(formFicha.quantidade_receita, formFicha.unidade_receita, insumoEscolhido.unidade_medida);

      const { error } = await supabase.from('fichas_tecnicas').insert([{
        produto_id: produtoSelecionado,
        insumo_id: formFicha.insumo_id,
        quantidade_necessaria: qtdConvertidaParaArmazem, 
        unidade_receita: formFicha.unidade_receita 
      }]);
      
      if (error) {
        if (error.code === '23505') throw new Error('Este insumo já faz parte desta receita.');
        throw error;
      }
      
      setFormFicha({ insumo_id: '', quantidade_receita: 0, unidade_receita: 'g' });
      
      const { data } = await supabase.from('fichas_tecnicas').select('id, insumo_id, quantidade_necessaria, unidade_receita, insumos(*)').eq('produto_id', produtoSelecionado);
      if (data) {
        const fichasFormatadas = data.map((item: any) => ({
          id: item.id,
          insumo_id: item.insumo_id,
          quantidade_necessaria: item.quantidade_necessaria,
          unidade_receita: item.unidade_receita || (Array.isArray(item.insumos) ? item.insumos[0]?.unidade_medida : item.insumos?.unidade_medida) || 'un',
          insumos: Array.isArray(item.insumos) ? item.insumos[0] : item.insumos
        })) as FichaItem[];
        setFichaAtual(fichasFormatadas);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessando(false);
    }
  };

  const removerDaFicha = async (idFicha: string) => {
    try {
      const { error } = await supabase.from('fichas_tecnicas').delete().eq('id', idFicha);
      if (error) throw error;
      setFichaAtual(fichaAtual.filter(f => f.id !== idFicha));
    } catch (err: any) { alert("Erro ao remover da ficha: " + err.message); }
  };

  if (loading && insumos.length === 0) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Carregar Cozinha...</div>;

  // Cálculos da Receita Completa
  const custoTotalPanela = fichaAtual.reduce((acc, ficha) => {
    const custoUnit = Number(ficha.insumos?.custo_por_unidade || ficha.insumos?.custo_unidade || 0);
    return acc + (ficha.quantidade_necessaria * custoUnit);
  }, 0);

  const custoPorPorcao = custoTotalPanela / (rendimentoProduto || 1);

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-12 selection:bg-orange-500/30">
      
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-700 flex items-center justify-center shadow-lg shadow-orange-900/40 text-2xl">📦</div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Stocks & Receitas</h1>
            <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Custo e Controlo de Insumos</p>
          </div>
        </div>
        <button onClick={carregarDadosBase} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold px-4 py-2 rounded-xl transition-colors">🔄 Atualizar Despensa</button>
      </header>

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-5 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* -------------------- LADO ESQUERDO: A DESPENSA -------------------- */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col shadow-xl">
          <div className="p-6 border-b border-zinc-800/80 bg-zinc-950/50 flex justify-between items-center">
            <h2 className="text-lg font-black uppercase text-zinc-300 tracking-widest flex items-center gap-2">
              <span className="text-orange-500">1.</span> A Minha Despensa (Faturas)
            </h2>
          </div>

          <div className="p-6">
            <form onSubmit={adicionarInsumo} className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="col-span-2 sm:col-span-4">
                <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-1">Nome do Ingrediente/Embalagem</label>
                <input required type="text" value={formInsumo.nome} onChange={e => setFormInsumo({...formInsumo, nome: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-orange-500" placeholder="Ex: Nata para Cozinhar..." />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-1">Medida na Compra</label>
                <select value={formInsumo.unidade_medida} onChange={e => setFormInsumo({...formInsumo, unidade_medida: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-orange-500">
                  <option value="kg">Kg</option>
                  <option value="g">Gramas (g)</option>
                  <option value="litro">Litro (L)</option>
                  <option value="ml">Mililitros (ml)</option>
                  <option value="unid">Unid.</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-1">Qtd Atual</label>
                <input required type="number" step="0.01" value={formInsumo.quantidade_atual} onChange={e => setFormInsumo({...formInsumo, quantidade_atual: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-[10px] text-red-500 font-bold uppercase mb-1">Alerta em</label>
                <input required type="number" step="0.01" value={formInsumo.quantidade_alerta} onChange={e => setFormInsumo({...formInsumo, quantidade_alerta: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-900 border border-red-900/50 rounded-xl px-3 py-2 text-sm text-red-400 outline-none focus:border-red-500" />
              </div>
              <div>
                <label className="block text-[10px] text-transparent select-none mb-1">Ação</label>
                <button type="submit" disabled={isProcessando} className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded-xl px-3 py-2 text-sm font-bold transition-all shadow-lg disabled:opacity-50">+ Add</button>
              </div>
            </form>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {insumos.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">A despensa está vazia. Leia faturas no Conciliador para preencher.</p>
              ) : null}
              {insumos.map(ins => {
                const emAlerta = ins.quantidade_atual <= ins.quantidade_alerta;
                return (
                  <div key={ins.id} className={`flex items-center justify-between p-3 rounded-xl border ${emAlerta ? 'bg-red-950/20 border-red-900/50' : 'bg-zinc-950 border-zinc-800'}`}>
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-200">{ins.nome}</span>
                        {emAlerta && <span className="bg-red-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded animate-pulse">ACABANDO</span>}
                      </div>
                      <span className="text-[10px] text-zinc-500">Custo un/kg: {Number(ins.custo_por_unidade || ins.custo_unidade || 0).toFixed(2)}€</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
                        <input 
                          type="number" step="0.01" value={ins.quantidade_atual} 
                          onChange={(e) => atualizarStockInsumo(ins.id, parseFloat(e.target.value) || 0)}
                          className={`w-20 bg-transparent text-center font-mono text-sm py-1.5 font-bold outline-none ${emAlerta ? 'text-red-400' : 'text-green-400'}`} 
                        />
                        <span className="bg-zinc-800 text-zinc-400 text-xs px-2 py-1.5 font-bold border-l border-zinc-700">{ins.unidade_medida || 'un'}</span>
                      </div>
                      <button onClick={() => excluirInsumo(ins.id)} className="text-zinc-600 hover:text-red-500 transition-colors px-1" title="Excluir">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* -------------------- LADO DIREITO: FICHAS TÉCNICAS (CONVERSOR) -------------------- */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col shadow-xl">
          <div className="p-6 border-b border-zinc-800/80 bg-zinc-950/50 flex justify-between items-center">
            <h2 className="text-lg font-black uppercase text-zinc-300 tracking-widest flex items-center gap-2">
              <span className="text-orange-500">2.</span> Ficha Técnica da Panela
            </h2>
          </div>

          <div className="p-6 flex flex-col h-full">
            
            <div className="mb-6">
              <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-2">Selecione o Prato Final:</label>
              <select 
                value={produtoSelecionado} onChange={(e) => setProdutoSelecionado(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="">-- Selecionar Prato/Produto --</option>
                {produtos.map(p => (<option key={p.id} value={p.id}>{p.nome} ({p.categoria})</option>))}
              </select>
            </div>

            {!produtoSelecionado ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm border-2 border-dashed border-zinc-800 rounded-2xl p-8">
                <span className="text-4xl mb-3 opacity-20">📖</span>
                <p>Selecione um produto acima para construir a sua ficha técnica.</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                
                {/* 🎯 ÁREA DE RENDIMENTO AGORA APARECE SEMPRE NO TOPO DA RECEITA */}
                <div className="bg-orange-950/20 border border-orange-900/50 p-4 rounded-xl mb-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-orange-400 uppercase tracking-wider">Rendimento da Receita</h4>
                    <p className="text-[10px] text-orange-500/70 mt-1">Quantas porções/pratos a panela inteira rende?</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-zinc-950 border border-orange-500/50 rounded-lg overflow-hidden">
                      <input
                        type="number"
                        min="1"
                        value={rendimentoProduto}
                        onChange={(e) => setRendimentoProduto(Number(e.target.value) || 1)}
                        className="w-16 bg-transparent px-2 py-2 text-center text-white font-bold outline-none"
                      />
                      <span className="pr-3 text-[10px] text-orange-500/70 font-bold uppercase select-none">Doses</span>
                    </div>
                    <button 
                      onClick={handleSalvarRendimento}
                      className={`px-4 py-2 rounded-lg font-black text-xs transition-all ${salvouRendimento ? 'bg-green-600 text-white' : 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg'}`}
                    >
                      {salvouRendimento ? '✔️ Salvo' : 'OK'}
                    </button>
                  </div>
                </div>

                {/* LISTAGEM DOS INSUMOS E CUSTO DA PANELA */}
                <div className="flex-1 min-h-[200px] bg-zinc-950 rounded-2xl border border-zinc-800 p-4 mb-4">
                  <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4 border-b border-zinc-800 pb-2">Ingredientes da Receita:</h3>
                  
                  {fichaAtual.length === 0 ? (
                    <p className="text-zinc-600 text-sm italic text-center py-6">Adicione os ingredientes abaixo para formar a panela/lote.</p>
                  ) : (
                    <ul className="space-y-2">
                      {fichaAtual.map(ficha => {
                        const custoUnitarioCompra = Number(ficha.insumos?.custo_por_unidade || ficha.insumos?.custo_unidade || 0);
                        const custoTotalDesteItem = ficha.quantidade_necessaria * custoUnitarioCompra;
                        const quantidadeOriginalTela = converterUnidade(ficha.quantidade_necessaria, ficha.insumos?.unidade_medida || 'un', ficha.unidade_receita || 'un');

                        return (
                          <li key={ficha.id} className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                            <div>
                              <span className="text-sm font-bold text-white block">{ficha.insumos?.nome || 'Insumo'}</span>
                              <span className="text-[10px] text-zinc-500 uppercase flex gap-1 items-center mt-1">
                                Qtd: <strong className="text-orange-400 font-mono text-xs">{quantidadeOriginalTela.toFixed(2)} {ficha.unidade_receita}</strong> 
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-black font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 px-2.5 py-1 rounded-lg">
                                {custoTotalDesteItem.toFixed(2)}€
                              </span>
                              <button onClick={() => removerDaFicha(ficha.id)} className="w-8 h-8 rounded-lg bg-red-950/30 text-red-500 hover:bg-red-600 hover:text-white flex items-center justify-center transition-colors">🗑️</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* SOMATÓRIO E MATEMÁTICA */}
                {fichaAtual.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Custo da Panela Toda</p>
                      <p className="text-lg font-black text-zinc-300 font-mono">{custoTotalPanela.toFixed(2)}€</p>
                    </div>
                    <div className="bg-green-950/20 border border-green-900/30 p-3 rounded-xl shadow-[0_0_15px_rgba(34,197,94,0.05)]">
                      <p className="text-[10px] text-green-500 uppercase font-bold mb-1">Custo Final por Prato</p>
                      <p className="text-xl font-black text-green-400 font-mono">{custoPorPorcao.toFixed(2)}€</p>
                    </div>
                  </div>
                )}

                {/* FORMULÁRIO DE ADIÇÃO À RECEITA */}
                <form onSubmit={adicionarNaFicha} className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 grid grid-cols-12 gap-3 mt-auto">
                  <div className="col-span-12">
                    <label className="block text-[10px] text-green-500 font-bold uppercase mb-1">1. Qual ingrediente usou?</label>
                    <select required value={formFicha.insumo_id} onChange={e => setFormFicha({...formFicha, insumo_id: e.target.value})} className="w-full bg-zinc-900 border border-green-900/50 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-green-500">
                      <option value="">-- Escolher da Despensa --</option>
                      {insumos.map(ins => (
                        <option key={ins.id} value={ins.id}>
                          {ins.nome} (Comprado em {ins.unidade_medida || 'un'})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="col-span-7">
                    <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-1">2. Qtd na Panela</label>
                    <input required type="number" step="0.01" min="0.01" value={formFicha.quantidade_receita || ''} onChange={e => setFormFicha({...formFicha, quantidade_receita: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono font-bold outline-none focus:border-orange-500" placeholder="Ex: 500" />
                  </div>

                  <div className="col-span-5">
                    <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-1">Unidade</label>
                    <select required value={formFicha.unidade_receita} onChange={e => setFormFicha({...formFicha, unidade_receita: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-2.5 text-sm text-zinc-300 outline-none focus:border-orange-500">
                      <option value="g">g</option>
                      <option value="kg">Kg</option>
                      <option value="ml">ml</option>
                      <option value="litro">L</option>
                      <option value="un">unid.</option>
                    </select>
                  </div>

                  <div className="col-span-12 pt-1">
                    <button type="submit" disabled={isProcessando} className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white rounded-xl px-3 py-3 text-sm font-bold transition-all shadow-lg flex items-center justify-center gap-2">
                      <span>🔗 Inserir Ingrediente na Panela</span>
                    </button>
                  </div>
                </form>

              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}