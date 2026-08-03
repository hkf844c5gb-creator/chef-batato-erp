'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface IngredienteFicha {
  nome: string;
  quantidade: number;
  unidade: string;
}

interface FichaTecnicaDB {
  id: string;
  nome_receita: string;
  rendimento: number;
  unidade_rendimento: string;
  ingredientes: IngredienteFicha[];
}

interface LoteProducao {
  id: string;
  created_at: string;
  data_fabricacao: string;
  nome_recheio: string;
  quantidade: number;
  unidade: string;
  data_validade: string;
  lote_ativo: boolean;
  observacoes: string;
}

interface Insumo {
  id: string;
  nome: string;
  unidade_medida: string;
  quantidade_atual: number;
}

export default function ControloProducaoBatata() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [lotes, setLotes] = useState<LoteProducao[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [fichasTecnicas, setFichasTecnicas] = useState<FichaTecnicaDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState<'producao' | 'fichas' | 'editar-fichas'>('producao');
  
  const hoje = new Date().toISOString().split('T')[0];

  // Estado para Criar/Editar Ficha Técnica
  const [fichaEditandoId, setFichaEditandoId] = useState<string | null>(null);
  const [formFicha, setFormFicha] = useState({
    nome_receita: '',
    rendimento: 10,
    unidade_rendimento: 'potes',
    ingredientes: [] as IngredienteFicha[]
  });

  // Estado para o Formulário de Produção
  const [formProd, setFormProd] = useState({
    data_fabricacao: hoje,
    ficha_id: '',
    nome_receita: '',
    quantidade_produzida: 10,
    unidade_produzida: 'potes',
    data_validade: '',
    observacoes: ''
  });
  const [ingredientesGastosProd, setIngredientesGastosProd] = useState<{ insumo_id: string, quantidade: number, unidade: string }[]>([]);
  const [processando, setProcessando] = useState(false);

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: dadosLotes } = await supabase.from('producao').select('*').eq('lote_ativo', true).order('data_validade', { ascending: true });
      setLotes(dadosLotes || []);

      const { data: dadosInsumos } = await supabase.from('insumos').select('id, nome, unidade_medida, quantidade_atual').order('nome', { ascending: true });
      setInsumos(dadosInsumos || []);

      const { data: dadosFichas } = await supabase.from('fichas_tecnicas').select('*').order('nome_receita', { ascending: true });
      setFichasTecnicas(dadosFichas || []);
    } catch (err: any) {
      alert("Erro ao carregar dados: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  // Selecionar Ficha para Produção
  const selecionarFichaParaProducao = (ficha: FichaTecnicaDB) => {
    setFormProd({
      ...formProd,
      ficha_id: ficha.id,
      nome_receita: ficha.nome_receita,
      quantidade_produzida: ficha.rendimento,
      unidade_produzida: ficha.unidade_rendimento
    });

    const gastos = ficha.ingredientes.map(item => {
      const insumoEncontrado = insumos.find(i => i.nome.toLowerCase().includes(item.nome.toLowerCase()));
      return {
        insumo_id: insumoEncontrado ? insumoEncontrado.id : '',
        quantidade: item.quantidade,
        unidade: item.unidade
      };
    });
    setIngredientesGastosProd(gastos);
    setAbaAtiva('producao');
  };

  // Guardar Ficha Técnica (Criar ou Atualizar)
  const guardarFichaTecnica = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFicha.nome_receita || formFicha.ingredientes.length === 0) {
      return alert('Preencha o nome da receita e adicione pelo menos um ingrediente.');
    }

    try {
      if (fichaEditandoId) {
        const { error } = await supabase.from('fichas_tecnicas').update(formFicha).eq('id', fichaEditandoId);
        if (error) throw error;
        alert('✅ Ficha técnica atualizada com sucesso!');
      } else {
        const { error } = await supabase.from('fichas_tecnicas').insert([formFicha]);
        if (error) throw error;
        alert('✅ Nova ficha técnica criada com sucesso!');
      }

      setFichaEditandoId(null);
      setFormFicha({ nome_receita: '', rendimento: 10, unidade_rendimento: 'potes', ingredientes: [] });
      carregarDados();
      setAbaAtiva('fichas');
    } catch (err: any) {
      alert('Erro ao guardar ficha técnica: ' + err.message);
    }
  };

  const excluirFichaTecnica = async (id: string) => {
    if (!confirm('Tem a certeza que deseja excluir esta ficha técnica?')) return;
    try {
      const { error } = await supabase.from('fichas_tecnicas').delete().eq('id', id);
      if (error) throw error;
      carregarDados();
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const registarProducao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProd.nome_receita || formProd.quantidade_produzida <= 0 || !formProd.data_validade) {
      return alert('Preencha todos os campos obrigatórios da produção.');
    }

    setProcessando(true);
    try {
      let resumoGastosTexto = '';

      for (const ing of ingredientesGastosProd) {
        if (!ing.insumo_id || ing.quantidade <= 0) continue;

        const insumoAtual = insumos.find(i => i.id === ing.insumo_id);
        if (insumoAtual) {
          let qtdParaDescontar = Number(ing.quantidade);
          if (ing.unidade === 'g' && insumoAtual.unidade_medida.toLowerCase() === 'kg') {
            qtdParaDescontar = qtdParaDescontar / 1000;
          } else if (ing.unidade === 'ml' && insumoAtual.unidade_medida.toLowerCase() === 'l') {
            qtdParaDescontar = qtdParaDescontar / 1000;
          }

          const novaQtd = Number(insumoAtual.quantidade_atual) - qtdParaDescontar;
          await supabase.from('insumos').update({ quantidade_atual: novaQtd }).eq('id', insumoAtual.id);
          resumoGastosTexto += `• ${ing.quantidade} ${ing.unidade} de ${insumoAtual.nome}\n`;
        }
      }

      const payloadLote = {
        data_fabricacao: formProd.data_fabricacao,
        nome_recheio: formProd.nome_receita,
        quantidade: formProd.quantidade_produzida,
        unidade: formProd.unidade_produzida,
        data_validade: formProd.data_validade,
        lote_ativo: true,
        observacoes: `Material Usado:\n${resumoGastosTexto}${formProd.observacoes ? `Obs: ${formProd.observacoes}` : ''}`
      };

      await supabase.from('producao').insert([payloadLote]);
      alert('✅ Produção registada e stock de insumos atualizado!');
      carregarDados();
    } catch (err: any) {
      alert('Erro ao registar: ' + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const finalizarLote = async (id: string) => {
    if (!confirm('Deseja dar este lote como terminado?')) return;
    await supabase.from('producao').update({ lote_ativo: false }).eq('id', id);
    setLotes(lotes.filter(l => l.id !== id));
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A carregar sistema...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-12 p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h1 className="text-2xl font-black text-orange-500">🥔 Produção, Rendimento & Fichas Técnicas Dinâmicas</h1>
        
        <div className="flex gap-2 bg-zinc-900 border border-zinc-800 p-1.5 rounded-2xl">
          <button onClick={() => setAbaAtiva('producao')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === 'producao' ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white'}`}>🔥 Registar Produção</button>
          <button onClick={() => setAbaAtiva('fichas')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === 'fichas' ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white'}`}>📖 Gerir Fichas Técnicas</button>
        </div>
      </div>

      {abaAtiva === 'fichas' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
            <div>
              <h2 className="text-lg font-black text-white">Lista de Fichas Técnicas</h2>
              <p className="text-xs text-zinc-400">Pode criar, editar ingredientes, alterar rendimentos ou excluir receitas.</p>
            </div>
            <button onClick={() => {
              setFichaEditandoId(null);
              setFormFicha({ nome_receita: '', rendimento: 10, unidade_rendimento: 'potes', ingredientes: [{ nome: '', quantidade: 0, unidade: 'g' }] });
              setAbaAtiva('editar-fichas');
            }} className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all">
              + Nova Ficha Técnica
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fichasTecnicas.map(ficha => (
              <div key={ficha.id} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col gap-4 shadow-lg">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                  <h3 className="font-black text-white text-base">{ficha.nome_receita}</h3>
                  <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/30 px-2.5 py-1 rounded-lg font-bold">
                    Rende: {ficha.rendimento} {ficha.unidade_rendimento}
                  </span>
                </div>
                <ul className="space-y-2 flex-1">
                  {ficha.ingredientes?.map((ing, idx) => (
                    <li key={idx} className="flex justify-between text-xs bg-zinc-950 px-3.5 py-2 rounded-xl border border-zinc-800">
                      <span className="text-zinc-300 font-medium">{ing.nome}</span>
                      <span className="font-mono font-bold text-orange-400">{ing.quantidade} {ing.unidade}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => {
                    setFichaEditandoId(ficha.id);
                    setFormFicha(ficha);
                    setAbaAtiva('editar-fichas');
                  }} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 rounded-xl text-xs">Editar</button>
                  <button onClick={() => excluirFichaTecnica(ficha.id)} className="bg-red-950/40 border border-red-900/50 hover:bg-red-900 text-red-400 hover:text-white font-bold px-3 py-2 rounded-xl text-xs">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {abaAtiva === 'editar-fichas' && (
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl max-w-2xl mx-auto w-full shadow-xl">
          <h2 className="text-lg font-black text-white mb-4">{fichaEditandoId ? 'Editar Ficha Técnica' : 'Criar Nova Ficha Técnica'}</h2>
          
          <form onSubmit={guardarFichaTecnica} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Nome da Receita</label>
                <input type="text" required value={formFicha.nome_receita} onChange={e => setFormFicha({...formFicha, nome_receita: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold" />
              </div>
              <div>
                <label className="block text-[10px] text-green-500 font-bold uppercase mb-1">Rendimento</label>
                <input type="number" step="0.01" required value={formFicha.rendimento} onChange={e => setFormFicha({...formFicha, rendimento: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold text-green-400" />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Unidade Rendimento</label>
                <input type="text" required value={formFicha.unidade_rendimento} onChange={e => setFormFicha({...formFicha, unidade_rendimento: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold" />
              </div>
            </div>

            <div className="bg-orange-950/20 border border-orange-900/30 p-4 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-orange-400 uppercase">Ingredientes da Receita</span>
                <button type="button" onClick={() => setFormFicha({...formFicha, ingredientes: [...formFicha.ingredientes, { nome: '', quantidade: 0, unidade: 'g' }]})} className="text-xs text-orange-400 hover:underline">+ Adicionar Ingrediente</button>
              </div>

              {formFicha.ingredientes.map((ing, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input type="text" placeholder="Nome do ingrediente" required value={ing.nome} onChange={e => {
                    const novos = [...formFicha.ingredientes];
                    novos[idx].nome = e.target.value;
                    setFormFicha({...formFicha, ingredientes: novos});
                  }} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs" />

                  <input type="number" step="0.001" placeholder="Qtd" required value={ing.quantidade || ''} onChange={e => {
                    const novos = [...formFicha.ingredientes];
                    novos[idx].quantidade = parseFloat(e.target.value) || 0;
                    setFormFicha({...formFicha, ingredientes: novos});
                  }} className="w-24 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono" />

                  <select value={ing.unidade} onChange={e => {
                    const novos = [...formFicha.ingredientes];
                    novos[idx].unidade = e.target.value;
                    setFormFicha({...formFicha, ingredientes: novos});
                  }} className="w-20 bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-2 text-xs text-orange-400 font-bold">
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="unidade">un</option>
                  </select>

                  <button type="button" onClick={() => {
                    setFormFicha({...formFicha, ingredientes: formFicha.ingredientes.filter((_, i) => i !== idx)});
                  }} className="text-zinc-500 hover:text-red-400 px-2">✕</button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl text-xs uppercase">Guardar Ficha Técnica</button>
              <button type="button" onClick={() => setAbaAtiva('fichas')} className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-4 py-3 rounded-xl text-xs">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {abaAtiva === 'producao' && (
        <>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl mb-8 shadow-xl">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">Selecione uma Ficha Técnica para carregar na produção:</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {fichasTecnicas.map(ficha => (
                <button
                  key={ficha.id}
                  type="button"
                  onClick={() => selecionarFichaParaProducao(ficha)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${formProd.ficha_id === ficha.id ? 'bg-orange-600 border-orange-500 text-white' : 'bg-zinc-950 border-zinc-800 text-orange-400 hover:bg-zinc-800'}`}
                >
                  {ficha.nome_receita}
                </button>
              ))}
            </div>

            <form onSubmit={registarProducao} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Nome do Preparado</label>
                  <input type="text" value={formProd.nome_receita} onChange={e => setFormProd({...formProd, nome_receita: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] text-green-500 font-bold uppercase mb-1">Quantidade Produzida (Rendimento)</label>
                  <input type="number" step="0.01" value={formProd.quantidade_produzida} onChange={e => setFormProd({...formProd, quantidade_produzida: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold text-green-400" />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Unidade</label>
                  <input type="text" value={formProd.unidade_produzida} onChange={e => setFormProd({...formProd, unidade_produzida: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold" />
                </div>
              </div>

              <div className="bg-orange-950/20 border border-orange-900/30 p-5 rounded-2xl space-y-3">
                <span className="text-xs font-bold text-orange-400 uppercase">Ingredientes Gastos (Desconta Stock)</span>
                {ingredientesGastosProd.map((ing, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <select value={ing.insumo_id} onChange={e => {
                      const novos = [...ingredientesGastosProd];
                      novos[index].insumo_id = e.target.value;
                      setIngredientesGastosProd(novos);
                    }} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs">
                      <option value="">Selecione o insumo no stock...</option>
                      {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade_medida})</option>)}
                    </select>
                    <input type="number" step="0.001" value={ing.quantidade || ''} onChange={e => {
                      const novos = [...ingredientesGastosProd];
                      novos[index].quantidade = parseFloat(e.target.value) || 0;
                      setIngredientesGastosProd(novos);
                    }} placeholder="Qtd" className="w-24 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono" />
                    <span className="w-20 text-xs text-orange-400 font-bold px-2">{ing.unidade}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-orange-500 font-bold uppercase mb-1">Data de Validade</label>
                  <input type="date" value={formProd.data_validade} onChange={e => setFormProd({...formProd, data_validade: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-orange-400 cursor-pointer" />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Observações</label>
                  <input type="text" value={formProd.observacoes} onChange={e => setFormProd({...formProd, observacoes: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs" placeholder="Notas do lote..." />
                </div>
              </div>

              <button type="submit" disabled={processando} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider">
                Registar Produção e Baixar Stock 🚀
              </button>
            </form>
          </div>

          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Lotes Ativos em Stock</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {lotes.map(lote => (
              <div key={lote.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-white text-sm">{lote.nome_recheio}</h3>
                  <button onClick={() => finalizarLote(lote.id)} className="text-xs bg-zinc-950 border border-zinc-800 px-2.5 py-1 rounded-lg text-zinc-400 hover:text-green-400">Terminar ✔</button>
                </div>
                <div className="text-2xl font-black font-mono text-orange-400">{lote.quantidade} <span className="text-xs text-zinc-400 font-normal">{lote.unidade}</span></div>
                <div className="text-[10px] font-mono text-zinc-400 whitespace-pre-line bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">{lote.observacoes}</div>
                <div className="text-[11px] text-zinc-400">Validade: <strong className="text-white">{lote.data_validade ? new Date(lote.data_validade).toLocaleDateString('pt-PT') : 'N/D'}</strong></div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}