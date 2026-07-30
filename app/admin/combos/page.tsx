'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Combo {
  id: string; codigo: string; nome: string; descricao: string;
  tipo_preco: 'fixo' | 'desconto' | 'desconto_fixo' | 'item_gratis';
  preco_fixo: number; desconto_percentual: number; desconto_absoluto: number;
  item_gratis_categoria: string; ativo: boolean; esgotado: boolean;
}

interface Grupo {
  id: string; nome: string; quantidade_minima: number; quantidade_maxima: number;
  obrigatorio: boolean; ordem: number;
}

interface ProdutoSimples {
  id: string; nome: string; codigo: string; categoria: string;
}

export default function GestaoCombos() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [combos, setCombos] = useState<Combo[]>([]);
  const [todosProdutos, setTodosProdutos] = useState<ProdutoSimples[]>([]);
  const [loading, setLoading] = useState(true);

  const [comboSelecionado, setComboSelecionado] = useState<Combo | null>(null);
  const [grupos, setGrupos] = useState<Grupo[]>([]);

  // Estados locais para seleção de produtos e taxas nos grupos
  const [selecoesLocais, setSelecoesLocais] = useState<{ [grupoId: string]: string[] }>({});
  const [taxasLocais, setTaxasLocais] = useState<{ [grupoId: string]: { [produtoId: string]: string } }>({});
  const [salvandoTudo, setSalvandoTudo] = useState(false);

  // Modal Principal do Combo (Criar/Editar)
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipoPreco, setTipoPreco] = useState<'fixo' | 'desconto' | 'desconto_fixo' | 'item_gratis'>('desconto');
  const [precoFixo, setPrecoFixo] = useState('');
  const [descontoPercentual, setDescontoPercentual] = useState('10');
  const [descontoAbsoluto, setDescontoAbsoluto] = useState('');
  const [itemGratisCategoria, setItemGratisCategoria] = useState('bebida');
  const [ativo, setAtivo] = useState(true);
  const [esgotado, setEsgotado] = useState(false);

  // Estados para adicionar novo grupo diretamente no modal ou painel
  const [novoGrupoNome, setNovoGrupoNome] = useState('batata');
  const [novoQtdMin, setNovoQtdMin] = useState(1);
  const [novoQtdMax, setNovoQtdMax] = useState(1);
  const [novoObrigatorio, setNovoObrigatorio] = useState(true);

  async function carregarDadosIniciais(comboIdParaSelecionar?: string) {
    setLoading(true);
    try {
      const { data: dataCombos } = await supabase.from('combos').select('*').order('nome', { ascending: true });
      const listaCombos = dataCombos || [];
      setCombos(listaCombos);

      const { data: dataProds } = await supabase.from('produtos').select('id, nome, codigo, categoria, tipo').order('nome', { ascending: true });
      const produtosFormatados = (dataProds || []).map((p: any) => ({
        id: p.id,
        nome: p.nome || 'Produto sem nome',
        codigo: p.codigo || '',
        categoria: (p.categoria || p.tipo || 'geral').toLowerCase().trim()
      }));
      setTodosProdutos(produtosFormatados);

      if (comboIdParaSelecionar) {
        const recemCriado = listaCombos.find(c => c.id === comboIdParaSelecionar);
        if (recemCriado) selecionarCombo(recemCriado);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDadosIniciais(); }, []);

  async function selecionarCombo(combo: Combo) {
    setComboSelecionado(combo);
    try {
      const { data: dataGrupos } = await supabase.from('combo_grupos').select(`
          id, nome, quantidade_minima, quantidade_maxima, obrigatorio, ordem,
          combo_grupo_produtos (id, grupo_id, produto_id, acrescimo_preco, ativo)
        `).eq('combo_id', combo.id).order('ordem', { ascending: true });
      
      const grps = dataGrupos || [];
      setGrupos(grps);

      const novasSelecoes: { [grupoId: string]: string[] } = {};
      const novasTaxas: { [grupoId: string]: { [produtoId: string]: string } } = {};

      grps.forEach(g => {
        novasSelecoes[g.id] = (g.combo_grupo_produtos || []).map((v: any) => v.produto_id);
        novasTaxas[g.id] = {};
        (g.combo_grupo_produtos || []).forEach((v: any) => {
          novasTaxas[g.id][v.produto_id] = v.acrescimo_preco?.toString() || '0.00';
        });
      });

      setSelecoesLocais(novasSelecoes);
      setTaxasLocais(novasTaxas);
    } catch (err) { alert('Erro ao carregar grupos do combo.'); }
  }

  const abrirModalNovo = () => {
    setEditandoId(null); setCodigo(''); setNome(''); setDescricao(''); setTipoPreco('desconto');
    setPrecoFixo(''); setDescontoPercentual('10'); setDescontoAbsoluto(''); setItemGratisCategoria('bebida');
    setAtivo(true); setEsgotado(false); setModalAberto(true);
  };

  const abrirModalEditar = (combo: Combo) => {
    setEditandoId(combo.id); setCodigo(combo.codigo || ''); setNome(combo.nome || ''); setDescricao(combo.descricao || '');
    setTipoPreco(combo.tipo_preco || 'desconto'); setPrecoFixo(combo.preco_fixo?.toString() || '');
    setDescontoPercentual(combo.desconto_percentual?.toString() || '0'); setDescontoAbsoluto(combo.desconto_absoluto?.toString() || '0');
    setItemGratisCategoria(combo.item_gratis_categoria || 'bebida'); setAtivo(combo.ativo); setEsgotado(combo.esgotado);
    setModalAberto(true);
  };

  const lidarSalvarCombo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome) return alert('Nome do combo obrigatório.');
    const payload = {
      codigo: codigo || `CMB${Date.now().toString().slice(-4)}`,
      nome, descricao, tipo_preco: tipoPreco,
      preco_fixo: tipoPreco === 'fixo' ? (parseFloat(precoFixo) || 0) : null,
      desconto_percentual: tipoPreco === 'desconto' ? (parseFloat(descontoPercentual) || 0) : 0,
      desconto_absoluto: tipoPreco === 'desconto_fixo' ? (parseFloat(descontoAbsoluto) || 0) : 0,
      item_gratis_categoria: tipoPreco === 'item_gratis' ? itemGratisCategoria : null,
      ativo, esgotado
    };

    try {
      if (editandoId) { 
        await supabase.from('combos').update(payload).eq('id', editandoId); 
        setModalAberto(false); 
        carregarDadosIniciais(editandoId);
      } else { 
        const { data: novoCmb, error } = await supabase.from('combos').insert([payload]).select().single();
        if (error) throw error;
        setModalAberto(false); 
        if (novoCmb) {
          await carregarDadosIniciais(novoCmb.id);
        }
      }
    } catch (err: any) { alert(`Erro: ${err.message}`); }
  };

  const removerCombo = async (id: string, nomeCombo: string) => {
    if (!confirm(`Deseja eliminar o combo "${nomeCombo}"?`)) return;
    try {
      await supabase.from('combos').delete().eq('id', id);
      if (comboSelecionado?.id === id) setComboSelecionado(null);
      carregarDadosIniciais();
    } catch (err: any) { alert('Erro ao eliminar.'); }
  };

  async function adicionarGrupoAoCombo(e: React.FormEvent) {
    e.preventDefault();
    if (!comboSelecionado) return;
    try {
      await supabase.from('combo_grupos').insert([{
        combo_id: comboSelecionado.id, 
        nome: novoGrupoNome, 
        quantidade_minima: novoQtdMin,
        quantidade_maxima: novoQtdMax, 
        obrigatorio: novoObrigatorio, 
        ordem: grupos.length
      }]);
      selecionarCombo(comboSelecionado);
    } catch (err) { alert('Erro ao criar grupo.'); }
  }

  async function removerGrupo(grupoId: string) {
    if (!confirm('Eliminar este grupo de escolha?')) return;
    await supabase.from('combo_grupos').delete().eq('id', grupoId);
    if (comboSelecionado) selecionarCombo(comboSelecionado);
  }

  const handleCheckboxChange = (grupoId: string, produtoId: string) => {
    setSelecoesLocais(prev => {
      const list = prev[grupoId] || [];
      if (list.includes(produtoId)) {
        return { ...prev, [grupoId]: list.filter(id => id !== produtoId) };
      } else {
        return { ...prev, [grupoId]: [...list, produtoId] };
      }
    });
  };

  const handleTaxaChange = (grupoId: string, produtoId: string, valor: string) => {
    setTaxasLocais(prev => {
      const grupoTaxas = prev[grupoId] || {};
      return {
        ...prev,
        [grupoId]: { ...grupoTaxas, [produtoId]: valor }
      };
    });
  };

  async function salvarTodasOpcoes() {
    if (!comboSelecionado) return;
    setSalvandoTudo(true);

    try {
      const grupoIds = grupos.map(g => g.id);

      if (grupoIds.length > 0) {
        await supabase.from('combo_grupo_produtos').delete().in('grupo_id', grupoIds);

        const payloads: any[] = [];
        grupoIds.forEach(grupoId => {
          const produtosSelecionados = selecoesLocais[grupoId] || [];
          const taxasDoGrupo = taxasLocais[grupoId] || {};
          
          produtosSelecionados.forEach(prodId => {
            payloads.push({
              grupo_id: grupoId,
              produto_id: prodId,
              acrescimo_preco: parseFloat(taxasDoGrupo[prodId]) || 0,
              ativo: true
            });
          });
        });

        if (payloads.length > 0) {
          const { error: insertError } = await supabase.from('combo_grupo_produtos').insert(payloads);
          if (insertError) throw insertError;
        }
      }

      alert('✅ Composição do combo guardada com sucesso!');
      await selecionarCombo(comboSelecionado);
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao salvar: ${err.message || err}`);
    } finally {
      setSalvandoTudo(false);
    }
  }

  const getNomeApresentacao = (cat: string) => {
    switch (cat) {
      case 'batata': return '🥔 Categoria: Batatas';
      case 'bebida': return '🥤 Categoria: Bebidas';
      case 'sobremesa': return '🍫 Categoria: Sobremesas / Brownies';
      case 'adicional': return '🥓 Categoria: Adicionais / Extras';
      default: return `Categoria: ${cat.toUpperCase()}`;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col relative">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center z-10 shadow-lg">
        <div>
          <h1 className="text-xl font-bold text-orange-500">⚙️ Chef Batatô · Gestão de Combos</h1>
          <p className="text-xs text-zinc-400 mt-1">Crie os seus combos e configure batatas, bebidas e sobremesas com obrigatoriedade e quantidades.</p>
        </div>
        <button onClick={abrirModalNovo} className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all">
          + Novo Combo
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-hidden">
        {/* LISTA DE COMBOS */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 overflow-y-auto shadow-xl">
          <h3 className="text-xs font-bold uppercase text-zinc-400 tracking-wider">Combos Registados</h3>
          {combos.length === 0 ? (
            <p className="text-xs text-zinc-500 italic p-4 text-center">Nenhum combo criado ainda. Clique em "+ Novo Combo".</p>
          ) : (
            combos.map(cb => (
              <div key={cb.id} onClick={() => selecionarCombo(cb)} className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-3 ${comboSelecionado?.id === cb.id ? 'bg-orange-500/10 border-orange-500/40 shadow' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-zinc-200 text-sm">{cb.nome}</h4>
                    <span className="text-[10px] text-zinc-500 font-mono block mt-1">{cb.codigo}</span>
                  </div>
                  <div className="text-right">
                      <span className="font-black font-mono text-orange-500 text-sm">
                        {cb.tipo_preco === 'fixo' && `${Number(cb.preco_fixo).toFixed(2)}€`}
                        {cb.tipo_preco === 'desconto' && `-${cb.desconto_percentual}%`}
                        {cb.tipo_preco === 'desconto_fixo' && `-${Number(cb.desconto_absoluto).toFixed(2)}€`}
                        {cb.tipo_preco === 'item_gratis' && `🎁 Item`}
                      </span>
                  </div>
                </div>
                <div className="flex gap-2 border-t border-zinc-800/50 pt-3">
                  <button onClick={(e) => { e.stopPropagation(); abrirModalEditar(cb); }} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1.5 rounded-lg text-xs font-semibold border border-zinc-700 transition-all">
                    Editar Combo
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); removerCombo(cb.id, cb.nome); }} className="flex-1 bg-red-950/40 hover:bg-red-900/60 text-red-400 py-1.5 rounded-lg text-xs font-semibold border border-red-900/50 transition-all">
                    Eliminar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* PAINEL DE MONTAGEM DE PRODUTOS E CATEGORIAS DO COMBO */}
        <div className="lg:col-span-2 overflow-y-auto space-y-6 pr-1 relative pb-24">
          {comboSelecionado ? (
            <>
              <div className="bg-orange-500/5 border border-orange-500/20 p-5 rounded-2xl flex justify-between items-center shadow-lg">
                <div>
                  <h2 className="text-lg font-black text-white">Montagem: {comboSelecionado.nome}</h2>
                  <p className="text-xs text-zinc-400 mt-1">{comboSelecionado.descricao || 'Adicione abaixo os grupos de escolha (Batatas, Bebidas, Sobremesas).'}</p>
                </div>
                <button onClick={() => setComboSelecionado(null)} className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-xl border border-zinc-700">Fechar</button>
              </div>

              {/* FORMULÁRIO PARA ADICIONAR GRUPO (BATATA, BEBIDA, SOBRESTRUTURA) */}
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl shadow-xl">
                <h3 className="text-xs font-bold uppercase text-orange-400 tracking-wider mb-4">➕ Adicionar Categoria / Grupo de Escolha ao Combo</h3>
                <form onSubmit={adicionarGrupoAoCombo} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs">
                  <div className="md:col-span-4">
                    <label className="block text-zinc-400 mb-1 font-bold">Categoria</label>
                    <select required value={novoGrupoNome} onChange={e => setNovoGrupoNome(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-orange-500">
                      <option value="batata">🥔 Batatas</option>
                      <option value="bebida">🥤 Bebidas</option>
                      <option value="sobremesa">🍫 Sobremesas / Brownies</option>
                      <option value="adicional">🥓 Adicionais / Extras</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-zinc-400 mb-1 font-bold">Qtd. Mínima</label>
                    <input required type="number" min="0" value={novoQtdMin} onChange={e => setNovoQtdMin(parseInt(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center text-white" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-zinc-400 mb-1 font-bold">Qtd. Máxima</label>
                    <input required type="number" min="1" value={novoQtdMax} onChange={e => setNovoQtdMax(parseInt(e.target.value))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center text-white" />
                  </div>
                  <div className="md:col-span-4 flex gap-2">
                    <button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-lg font-bold shadow transition-all">+ Adicionar Grupo</button>
                  </div>
                </form>
              </div>

              {/* LISTA DOS GRUPOS E SELEÇÃO DE PRODUTOS */}
              <div className="space-y-4">
                {grupos.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl text-center text-zinc-500 text-xs">
                    Nenhum grupo adicionado a este combo ainda. Adicione uma categoria acima (ex: Batatas ou Bebidas).
                  </div>
                ) : (
                  grupos.map(grp => {
                    // Filtrar produtos correspondentes à categoria do grupo
                    const produtosDaCategoria = todosProdutos.filter(p => {
                      const catProd = p.categoria;
                      const catGrupo = grp.nome;
                      if (catGrupo === 'batata') return catProd.includes('batata');
                      if (catGrupo === 'bebida') return catProd.includes('bebida');
                      if (catGrupo === 'sobremesa') return catProd.includes('sobremesa') || catProd.includes('brownie');
                      if (catGrupo === 'adicional') return catProd.includes('adicional') || catProd.includes('extra');
                      return true;
                    });

                    const selecoesDesteGrupo = selecoesLocais[grp.id] || [];
                    const taxasDesteGrupo = taxasLocais[grp.id] || {};

                    return (
                      <div key={grp.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-xl">
                        <div className="bg-zinc-950 px-5 py-3 border-b border-zinc-800/80 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-black text-orange-400 uppercase tracking-wide text-sm">{getNomeApresentacao(grp.nome)}</span>
                            <span className="ml-3 bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                              Obrigatório (Mín: {grp.quantidade_minima} | Máx: {grp.quantidade_maxima})
                            </span>
                          </div>
                          <button onClick={() => removerGrupo(grp.id)} className="text-xs text-red-400 hover:text-red-300 font-bold">Eliminar Grupo</button>
                        </div>

                        <div className="p-4 bg-zinc-950/30 flex-1">
                          <p className="text-[11px] text-zinc-400 mb-3">Selecione os sabores/produtos que farão parte desta categoria no combo:</p>
                          {produtosDaCategoria.length === 0 ? (
                            <p className="text-[11px] text-zinc-500 italic">Nenhum produto encontrado no stock para esta categoria.</p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {produtosDaCategoria.map(prod => {
                                const isLinked = selecoesDesteGrupo.includes(prod.id);
                                const valorTaxa = taxasDesteGrupo[prod.id] || '0';

                                return (
                                  <div key={prod.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isLinked ? 'bg-orange-600/10 border-orange-500/50 shadow-sm' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}>
                                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                                      <input 
                                        type="checkbox" 
                                        checked={isLinked} 
                                        onChange={() => handleCheckboxChange(grp.id, prod.id)}
                                        className="w-4 h-4 accent-orange-500 cursor-pointer"
                                      />
                                      <span className={`text-xs font-bold ${isLinked ? 'text-orange-400' : 'text-zinc-300'}`}>{prod.nome}</span>
                                    </label>

                                    {isLinked && (
                                      <div className="flex items-center gap-1.5 ml-2">
                                        <span className="text-[9px] font-bold text-zinc-500 uppercase">Taxa Extra:</span>
                                        <input 
                                          type="number" 
                                          step="0.10"
                                          min="0"
                                          value={valorTaxa}
                                          onChange={(e) => handleTaxaChange(grp.id, prod.id, e.target.value)}
                                          className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs text-right text-orange-400 font-mono outline-none focus:border-orange-500" 
                                        />
                                        <span className="text-xs text-zinc-500 font-bold">€</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* BOTÃO GLOBAL DE GRAVAÇÃO DA MONTAGEM */}
              {grupos.length > 0 && (
                <div className="mt-6 p-5 bg-zinc-900 border border-orange-500/30 rounded-2xl flex justify-between items-center shadow-[0_0_20px_rgba(249,115,22,0.1)] sticky bottom-0 z-20 backdrop-blur-xl bg-opacity-95">
                  <div>
                    <h4 className="font-bold text-white text-sm">Tudo configurado?</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Clique no botão para guardar todas as escolhas e produtos deste combo.</p>
                  </div>
                  <button
                    type="button"
                    disabled={salvandoTudo}
                    onClick={salvarTodasOpcoes}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-xl text-sm flex items-center gap-2 transition-all shadow-lg disabled:opacity-50"
                  >
                    {salvandoTudo ? 'A guardar...' : '💾 Salvar Composição do Combo'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="h-full bg-zinc-900 border border-zinc-800 rounded-2xl p-12 flex flex-col justify-center items-center text-center shadow-xl">
              <span className="text-4xl mb-3">👈</span>
              <h3 className="font-bold text-zinc-200 text-base">Selecione um combo na lista à esquerda</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm">Poderá configurar os sabores de batatas, bebidas e sobremesas, além das regras de obrigatoriedade e quantidades.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL CRIAR / EDITAR COMBO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-2xl shadow-2xl relative my-8">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center sticky top-0 bg-zinc-900 rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-orange-500">{editandoId ? 'Editar Combo' : 'Novo Combo'}</h2>
              <button onClick={() => setModalAberto(false)} className="text-zinc-400 hover:text-white text-xl">✕</button>
            </div>
            <form onSubmit={lidarSalvarCombo} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-zinc-400 mb-1">CÓDIGO ÚNICO</label><input type="text" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase().replace(/\s/g, '_'))} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none font-mono" /></div>
                <div><label className="block text-xs font-bold text-zinc-400 mb-1">NOME DO COMBO</label><input required type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Menu Chef Batatô" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none" /></div>
              </div>
              <div><label className="block text-xs font-bold text-zinc-400 mb-1">DESCRIÇÃO COMERCIAL</label><textarea rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: 1 Batata Grande + 1 Bebida + 1 Brownie" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none resize-none" /></div>
              <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 mb-2 uppercase tracking-wider">Lógica de Faturamento do Combo</label>
                  <select value={tipoPreco} onChange={e => setTipoPreco(e.target.value as any)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
                    <option value="desconto">Soma os itens e aplica DESCONTO PERCENTUAL (%)</option>
                    <option value="desconto_fixo">Soma os itens e desconta VALOR FIXO EM EUROS (€)</option>
                    <option value="item_gratis">Soma os itens e dá UM ITEM GRÁTIS de uma categoria</option>
                    <option value="fixo">Ignora os itens e cobra PREÇO FIXO FINAL (€)</option>
                  </select>
                </div>
                {tipoPreco === 'desconto' && (<div><label className="block text-xs font-bold text-zinc-400 mb-1">PERCENTAGEM DE DESCONTO (%)</label><input type="number" step="0.1" min="0" max="100" required value={descontoPercentual} onChange={e => setDescontoPercentual(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none" /></div>)}
                {tipoPreco === 'desconto_fixo' && (<div><label className="block text-xs font-bold text-zinc-400 mb-1">VALOR EXATO A DESCONTAR (€)</label><input type="number" step="0.10" min="0" required value={descontoAbsoluto} onChange={e => setDescontoAbsoluto(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none" /></div>)}
                {tipoPreco === 'item_gratis' && (<div><label className="block text-xs font-bold text-zinc-400 mb-1">QUAL CATEGORIA SERÁ GRÁTIS NO COMBO?</label><select value={itemGratisCategoria} onChange={e => setItemGratisCategoria(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none"><option value="bebida">Bebida Grátis</option><option value="sobremesa">Sobremesa By BrownieRia Grátis</option><option value="batata">Batata Grátis</option><option value="mais_barato">Descontar o Item mais barato</option></select></div>)}
                {tipoPreco === 'fixo' && (<div><label className="block text-xs font-bold text-zinc-400 mb-1">PREÇO FIXO FINAL (€)</label><input type="number" step="0.10" min="0" required value={precoFixo} onChange={e => setPrecoFixo(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none" /></div>)}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalAberto(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl text-sm font-bold text-zinc-300">Cancelar</button>
                <button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-700 py-3 rounded-xl text-sm font-bold shadow-lg">Guardar e Configurar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}