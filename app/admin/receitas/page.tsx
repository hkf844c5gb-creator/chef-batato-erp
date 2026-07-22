'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Insumo {
  id: string;
  nome: string;
  unidade_medida: string;
  quantidade_atual: number;
  quantidade_alerta: number;
  custo_por_unidade: number;
}

interface Produto {
  id: string;
  nome: string;
  categoria: string;
}

interface FichaItem {
  id: string;
  insumo_id: string;
  quantidade_necessaria: number;
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
  
  // Estados para a Ficha Técnica
  const [produtoSelecionado, setProdutoSelecionado] = useState<string>('');
  const [fichaAtual, setFichaAtual] = useState<FichaItem[]>([]);

  // Estados dos Formulários
  const [formInsumo, setFormInsumo] = useState({ nome: '', unidade_medida: 'unid', quantidade_atual: 0, quantidade_alerta: 0, custo_por_unidade: 0 });
  
  // NOVO: Adicionado campo "rendimento" com valor padrão 1
  const [formFicha, setFormFicha] = useState({ insumo_id: '', quantidade_total: 0, rendimento: 1 });
  
  const [isProcessando, setIsProcessando] = useState(false);

  async function carregarDadosBase() {
    setLoading(true);
    try {
      const { data: dataInsumos, error: errInsumos } = await supabase
        .from('insumos')
        .select('*')
        .order('nome', { ascending: true });
      if (errInsumos) throw errInsumos;
      setInsumos(dataInsumos || []);

      const { data: dataProdutos, error: errProdutos } = await supabase
        .from('produtos')
        .select('id, nome, categoria')
        .eq('ativo', true)
        .order('nome', { ascending: true });
      if (errProdutos) throw errProdutos;
      
      const produtosSemBebidas = (dataProdutos || []).filter((p: Produto) => {
        const categoria = (p.categoria || '').toLowerCase().trim();
        return categoria !== 'bebida' && categoria !== 'bebidas';
      });

      setProdutos(produtosSemBebidas);

    } catch (err: any) {
      alert("Erro ao carregar dados: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDadosBase(); }, []);

  useEffect(() => {
    async function carregarFichaDoProduto() {
      if (!produtoSelecionado) {
        setFichaAtual([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('fichas_tecnicas')
          .select('id, insumo_id, quantidade_necessaria, insumos(*)')
          .eq('produto_id', produtoSelecionado);
        
        if (error) throw error;
        
        const fichasFormatadas = (data || []).map((item: any) => ({
          id: item.id,
          insumo_id: item.insumo_id,
          quantidade_necessaria: item.quantidade_necessaria,
          insumos: Array.isArray(item.insumos) ? item.insumos[0] : item.insumos
        })) as FichaItem[];

        setFichaAtual(fichasFormatadas);
      } catch (err: any) {
        console.error("Erro ao carregar ficha técnica", err);
      }
    }
    carregarFichaDoProduto();
  }, [produtoSelecionado]);

  // --- AÇÕES DA DESPENSA (INSUMOS) ---
  const adicionarInsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formInsumo.nome) return alert('Dê um nome ao insumo.');
    setIsProcessando(true);
    try {
      const { error } = await supabase.from('insumos').insert([formInsumo]);
      if (error) throw error;
      
      setFormInsumo({ nome: '', unidade_medida: 'unid', quantidade_atual: 0, quantidade_alerta: 0, custo_por_unidade: 0 });
      carregarDadosBase();
    } catch (err: any) {
      alert("Erro ao guardar insumo: " + err.message);
    } finally {
      setIsProcessando(false);
    }
  };

  const atualizarStockInsumo = async (id: string, novaQuantidade: number) => {
    try {
      const { error } = await supabase.from('insumos').update({ quantidade_atual: novaQuantidade }).eq('id', id);
      if (error) throw error;
      setInsumos(insumos.map(i => i.id === id ? { ...i, quantidade_atual: novaQuantidade } : i));
    } catch (err: any) {
      alert("Erro ao atualizar stock: " + err.message);
    }
  };

  const excluirInsumo = async (id: string) => {
    if (!confirm('Atenção: Excluir este insumo vai removê-lo de TODAS as fichas técnicas. Continuar?')) return;
    try {
      const { error } = await supabase.from('insumos').delete().eq('id', id);
      if (error) throw error;
      carregarDadosBase();
      if (produtoSelecionado) setProdutoSelecionado(produtoSelecionado);
    } catch (err: any) {
      alert("Erro ao excluir: " + err.message);
    }
  };

  // --- AÇÕES DA FICHA TÉCNICA (RECEITAS) ---
  const adicionarNaFicha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!produtoSelecionado) return alert('Selecione um produto primeiro.');
    if (!formFicha.insumo_id || formFicha.quantidade_total <= 0 || formFicha.rendimento <= 0) {
      return alert('Preencha as quantidades corretamente (devem ser maiores que zero).');
    }
    
    setIsProcessando(true);
    try {
      // O SISTEMA FAZ A MATEMÁTICA AQUI!
      // Divide o total pelo rendimento e arredonda para 5 casas decimais (ex: 1 / 11 = 0.09091)
      const quantidadeCalculada = Number((formFicha.quantidade_total / formFicha.rendimento).toFixed(5));

      const { error } = await supabase.from('fichas_tecnicas').insert([{
        produto_id: produtoSelecionado,
        insumo_id: formFicha.insumo_id,
        quantidade_necessaria: quantidadeCalculada
      }]);
      
      if (error) {
        if (error.code === '23505') throw new Error('Este insumo já faz parte desta receita. Exclua o atual se quiser alterar.');
        throw error;
      }
      
      // Reseta o formulário
      setFormFicha({ insumo_id: '', quantidade_total: 0, rendimento: 1 });
      
      const { data } = await supabase.from('fichas_tecnicas').select('id, insumo_id, quantidade_necessaria, insumos(*)').eq('produto_id', produtoSelecionado);
      
      if (data) {
        const fichasFormatadas = data.map((item: any) => ({
          id: item.id,
          insumo_id: item.insumo_id,
          quantidade_necessaria: item.quantidade_necessaria,
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
    } catch (err: any) {
      alert("Erro ao remover da ficha: " + err.message);
    }
  };

  if (loading && insumos.length === 0) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Carregar Cozinha...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-12 selection:bg-orange-500/30">
      
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-700 flex items-center justify-center shadow-lg shadow-orange-900/40 text-2xl">
            📦
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Stocks & Receitas</h1>
            <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Custo e Controlo de Insumos</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-5 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* ========================================== */}
        {/* LADO ESQUERDO: A DESPENSA (INSUMOS)        */}
        {/* ========================================== */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col shadow-xl">
          <div className="p-6 border-b border-zinc-800/80 bg-zinc-950/50 flex justify-between items-center">
            <h2 className="text-lg font-black uppercase text-zinc-300 tracking-widest flex items-center gap-2">
              <span className="text-orange-500">1.</span> A Minha Despensa
            </h2>
          </div>

          <div className="p-6">
            <form onSubmit={adicionarInsumo} className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="col-span-2 sm:col-span-4">
                <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-1">Nome do Ingrediente/Embalagem</label>
                <input required type="text" value={formInsumo.nome} onChange={e => setFormInsumo({...formInsumo, nome: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-orange-500" placeholder="Ex: Batata Lisa, Caixa M..." />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-1">Medida</label>
                <select value={formInsumo.unidade_medida} onChange={e => setFormInsumo({...formInsumo, unidade_medida: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-orange-500">
                  <option value="kg">Kg</option>
                  <option value="g">Gramas (g)</option>
                  <option value="litro">Litro (L)</option>
                  <option value="ml">Mililitros (ml)</option>
                  <option value="unid">Unidades</option>
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
                <button type="submit" disabled={isProcessando} className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded-xl px-3 py-2 text-sm font-bold transition-all shadow-lg disabled:opacity-50">
                  + Add
                </button>
              </div>
            </form>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {insumos.length === 0 ? <p className="text-zinc-500 text-sm text-center py-4">A despensa está vazia.</p> : null}
              {insumos.map(ins => {
                const emAlerta = ins.quantidade_atual <= ins.quantidade_alerta;
                return (
                  <div key={ins.id} className={`flex items-center justify-between p-3 rounded-xl border ${emAlerta ? 'bg-red-950/20 border-red-900/50' : 'bg-zinc-950 border-zinc-800'}`}>
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-200">{ins.nome}</span>
                        {emAlerta && <span className="bg-red-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded animate-pulse">ACABANDO</span>}
                      </div>
                      <span className="text-[10px] text-zinc-500">Alerta se chegar a: {ins.quantidade_alerta} {ins.unidade_medida}</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
                        <input 
                          type="number" 
                          step="0.01" 
                          value={ins.quantidade_atual} 
                          onChange={(e) => atualizarStockInsumo(ins.id, parseFloat(e.target.value) || 0)}
                          className={`w-20 bg-transparent text-center font-mono text-sm py-1.5 font-bold outline-none ${emAlerta ? 'text-red-400' : 'text-green-400'}`} 
                        />
                        <span className="bg-zinc-800 text-zinc-400 text-xs px-2 py-1.5 font-bold border-l border-zinc-700">{ins.unidade_medida}</span>
                      </div>
                      <button onClick={() => excluirInsumo(ins.id)} className="text-zinc-600 hover:text-red-500 transition-colors px-1" title="Excluir">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>


        {/* ========================================== */}
        {/* LADO DIREITO: FICHAS TÉCNICAS (RECEITAS)   */}
        {/* ========================================== */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col shadow-xl">
          <div className="p-6 border-b border-zinc-800/80 bg-zinc-950/50 flex justify-between items-center">
            <h2 className="text-lg font-black uppercase text-zinc-300 tracking-widest flex items-center gap-2">
              <span className="text-orange-500">2.</span> Ficha Técnica
            </h2>
          </div>

          <div className="p-6 flex flex-col h-full">
            
            <div className="mb-6">
              <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-2">Selecione o Prato para ver/montar a receita</label>
              <select 
                value={produtoSelecionado} 
                onChange={(e) => setProdutoSelecionado(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="">-- Escolha um Produto do Cardápio --</option>
                {produtos.map(p => (
                  <option key={p.id} value={p.id}>{p.nome} ({p.categoria})</option>
                ))}
              </select>
            </div>

            {!produtoSelecionado ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm border-2 border-dashed border-zinc-800 rounded-2xl p-8">
                <span className="text-4xl mb-3 opacity-20">📖</span>
                <p>Selecione um produto acima para construir a sua ficha técnica.</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                
                <div className="flex-1 min-h-[250px] bg-zinc-950 rounded-2xl border border-zinc-800 p-4 mb-6">
                  <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4 border-b border-zinc-800 pb-2">Ingredientes que compõem este prato:</h3>
                  
                  {fichaAtual.length === 0 ? (
                    <p className="text-zinc-600 text-sm italic text-center py-6">Este produto ainda não gasta nenhum insumo.</p>
                  ) : (
                    <ul className="space-y-2">
                      {fichaAtual.map(ficha => (
                        <li key={ficha.id} className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                          <div>
                            <span className="text-sm font-bold text-white block">{ficha.insumos.nome}</span>
                            <span className="text-[10px] text-zinc-500 uppercase">Gasta do stock: <strong className="text-orange-400 font-mono text-xs">{ficha.quantidade_necessaria} {ficha.insumos.unidade_medida}</strong> por cada venda</span>
                          </div>
                          <button onClick={() => removerDaFicha(ficha.id)} className="w-8 h-8 rounded-lg bg-red-950/30 text-red-500 hover:bg-red-600 hover:text-white flex items-center justify-center transition-colors">
                            🗑️
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* NOVO FORMULÁRIO COM CALCULADORA AUTOMÁTICA */}
                <form onSubmit={adicionarNaFicha} className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 grid grid-cols-2 gap-3 mt-auto">
                  <div className="col-span-2">
                    <label className="block text-[10px] text-green-500 font-bold uppercase mb-1">Selecione o Insumo da Despensa</label>
                    <select required value={formFicha.insumo_id} onChange={e => setFormFicha({...formFicha, insumo_id: e.target.value})} className="w-full bg-zinc-900 border border-green-900/50 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-green-500">
                      <option value="">-- Escolher... --</option>
                      {insumos.map(ins => (
                        <option key={ins.id} value={ins.id}>{ins.nome} (em {ins.unidade_medida})</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="col-span-1">
                    <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-1" title="A quantidade total que usou na panela">Qtd Total (Panela)</label>
                    <input required type="number" step="0.001" min="0.001" value={formFicha.quantidade_total || ''} onChange={e => setFormFicha({...formFicha, quantidade_total: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-orange-500" placeholder="Ex: 1" />
                  </div>

                  <div className="col-span-1">
                    <label className="block text-[10px] text-orange-400 font-bold uppercase mb-1" title="Em quantas batatas/porções essa panela se divide?">Rende Porções?</label>
                    <input required type="number" step="1" min="1" value={formFicha.rendimento || ''} onChange={e => setFormFicha({...formFicha, rendimento: parseInt(e.target.value) || 1})} className="w-full bg-zinc-900 border border-orange-900/30 rounded-xl px-3 py-2.5 text-sm text-orange-400 font-bold outline-none focus:border-orange-500" placeholder="Ex: 11" />
                  </div>

                  <div className="col-span-2">
                    <button type="submit" disabled={isProcessando} className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white rounded-xl px-3 py-3 text-sm font-bold transition-all shadow-lg mt-1 flex items-center justify-center gap-2">
                      <span>🔗 Calcular e Vincular</span>
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