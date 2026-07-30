'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface ItemReceita {
  id: string;
  receita_id: string;
  nome_item: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  categoria: string;
  receita?: {
    cliente_canal: string;
    data_receita: string;
    numero_documento: string;
  };
}

const CATEGORIAS_RECEITAS = [
  { id: 'geral', label: '🌐 Geral' },
  { id: 'brownie', label: '🍫 Brownie' },
  { id: 'batata', label: '🥔 Batatas / Pratos' },
  { id: 'bebidas', label: '🥤 Bebidas' },
  { id: 'combos', label: '🍟 Combos' },
  { id: 'taxas_entregas', label: '🛵 Taxas de Entrega' },
];

export default function GestaoConciliacaoReceitas() {
  const [todosItens, setTodosItens] = useState<ItemReceita[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [termoPesquisa, setTermoPesquisa] = useState('');

  // Modal para registar/importar receita conciliada
  const [modalAberto, setModalAberto] = useState(false);
  const [clienteCanal, setClienteCanal] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [dataReceita, setDataReceita] = useState(new Date().toISOString().split('T')[0]);
  const [itensTemp, setItensTemp] = useState<Omit<ItemReceita, 'id' | 'receita_id'>[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Campos temporários
  const [tempNome, setTempNome] = useState('');
  const [tempQtd, setTempQtd] = useState('1');
  const [tempPreco, setTempPreco] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function carregarDadosReceitas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('itens_receita')
        .select(`
          *,
          receita:receitas_entradas (cliente_canal, data_receita, numero_documento)
        `)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      setTodosItens(data || []);
    } catch (err) {
      console.error('Erro ao carregar receitas:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDadosReceitas();
  }, []);

  const selecionarCategoriaItem = async (item: ItemReceita, novaCategoria: string) => {
    try {
      const { error } = await supabase
        .from('itens_receita')
        .update({ categoria: novaCategoria })
        .eq('id', item.id);

      if (error) throw error;

      if (item.receita?.cliente_canal) {
        await supabase
          .from('regras_categorizacao_receitas')
          .upsert(
            {
              cliente_canal: item.receita.cliente_canal.trim().toLowerCase(),
              nome_item: item.nome_item.trim().toLowerCase(),
              categoria: novaCategoria
            },
            { onConflict: 'cliente_canal,nome_item' }
          );
      }

      setTodosItens(prev =>
        prev.map(i => (i.id === item.id ? { ...i, categoria: novaCategoria } : i))
      );
    } catch (err: any) {
      alert(`Erro ao atualizar categoria: ${err.message}`);
    }
  };

  const abrirModalNovo = () => {
    setClienteCanal('');
    setNumeroDocumento('');
    setDataReceita(new Date().toISOString().split('T')[0]);
    setItensTemp([]);
    setTempNome('');
    setTempQtd('1');
    setTempPreco('');
    setModalAberto(true);
  };

  const adicionarItemTemp = async () => {
    if (!tempNome || !tempPreco) return alert('Informe o nome do item e o preço unitário.');
    const qtd = parseFloat(tempQtd) || 1;
    const preco = parseFloat(tempPreco) || 0;
    const subtotal = qtd * preco;

    let categoriaSugerida = 'geral';

    if (clienteCanal.trim()) {
      const { data: regra } = await supabase
        .from('regras_categorizacao_receitas')
        .select('categoria')
        .eq('cliente_canal', clienteCanal.trim().toLowerCase())
        .eq('nome_item', tempNome.trim().toLowerCase())
        .single();

      if (regra) {
        categoriaSugerida = regra.categoria; // Reconhece automaticamente!
      }
    }

    setItensTemp([
      ...itensTemp,
      {
        nome_item: tempNome,
        quantidade: qtd,
        preco_unitario: preco,
        subtotal,
        categoria: categoriaSugerida
      }
    ]);

    setTempNome('');
    setTempQtd('1');
    setTempPreco('');
  };

  const removerItemTemp = (index: number) => {
    setItensTemp(itensTemp.filter((_, i) => i !== index));
  };

  const salvarReceitaConciliada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteCanal) return alert('Informe o canal ou cliente.');
    if (itensTemp.length === 0) return alert('Adicione pelo menos um item.');

    setSalvando(true);
    try {
      const valorTotal = itensTemp.reduce((acc, it) => acc + it.subtotal, 0);

      const { data: receitaData, error: receitaError } = await supabase
        .from('receitas_entradas')
        .insert([{
          cliente_canal: clienteCanal,
          numero_documento: numeroDocumento,
          data_receita: dataReceita,
          valor_total: valorTotal,
          estado: 'conciliado'
        }])
        .select()
        .single();

      if (receitaError) throw receitaError;

      const itensParaInserir = itensTemp.map(item => ({
        receita_id: receitaData.id,
        nome_item: item.nome_item,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        subtotal: item.subtotal,
        categoria: item.categoria
      }));

      const { error: itensError } = await supabase.from('itens_receita').insert(itensParaInserir);
      if (itensError) throw itensError;

      for (const item of itensTemp) {
        await supabase
          .from('regras_categorizacao_receitas')
          .upsert(
            {
              cliente_canal: clienteCanal.trim().toLowerCase(),
              nome_item: item.nome_item.trim().toLowerCase(),
              categoria: item.categoria
            },
            { onConflict: 'cliente_canal,nome_item' }
          );
      }

      setModalAberto(false);
      carregarDadosReceitas();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const itensFiltrados = useMemo(() => {
    return todosItens.filter(item => {
      if (filtroCategoria && item.categoria !== filtroCategoria) return false;
      if (termoPesquisa) {
        const termo = termoPesquisa.toLowerCase();
        const nomeMatch = item.nome_item.toLowerCase().includes(termo);
        const canalMatch = item.receita?.cliente_canal?.toLowerCase().includes(termo);
        if (!nomeMatch && !canalMatch) return false;
      }
      return true;
    });
  }, [todosItens, filtroCategoria, termoPesquisa]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💰</span>
          <h1 className="text-xl font-bold tracking-wide">Conciliação de Receitas: Categorização Item por Item</h1>
        </div>
        <button onClick={abrirModalNovo} className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all">
          + Importar / Registar Receita
        </button>
      </header>

      {/* FILTROS */}
      <section className="px-6 pt-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">Pesquisar Item ou Canal</label>
            <input 
              type="text" 
              value={termoPesquisa}
              onChange={e => setTermoPesquisa(e.target.value)}
              placeholder="Ex: Frango Cremoso, Glovo..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:border-orange-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">Filtrar por Categoria</label>
            <select 
              value={filtroCategoria} 
              onChange={e => setFiltroCategoria(e.target.value)} 
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:border-orange-500 outline-none cursor-pointer"
            >
              <option value="">Todas as Categorias</option>
              {CATEGORIAS_RECEITAS.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* TABELA DE ITENS DE RECEITA */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-4 font-bold">Data</th>
                <th className="p-4 font-bold">Canal / Cliente</th>
                <th className="p-4 font-bold">Item Detalhado</th>
                <th className="p-4 font-bold">Qtd / Preço</th>
                <th className="p-4 font-bold">Subtotal</th>
                <th className="p-4 font-bold">Selecionar Categoria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr><td colSpan={6} className="text-center p-8 text-zinc-500">A carregar itens de receitas...</td></tr>
              ) : itensFiltrados.length === 0 ? (
                <tr><td colSpan={6} className="text-center p-8 text-zinc-500">Nenhum item de receita encontrado.</td></tr>
              ) : (
                itensFiltrados.map(item => (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-4 font-mono text-xs text-zinc-400">
                      {item.receita?.data_receita || '---'}
                    </td>
                    <td className="p-4 font-medium text-zinc-300">{item.receita?.cliente_canal || '---'}</td>
                    <td className="p-4 font-bold text-white">{item.nome_item}</td>
                    <td className="p-4 font-mono text-xs text-zinc-400">
                      {item.quantidade}x · {Number(item.preco_unitario).toFixed(2)}€
                    </td>
                    <td className="p-4 font-mono font-bold text-green-400">+{Number(item.subtotal).toFixed(2)}€</td>
                    <td className="p-4">
                      <select 
                        value={item.categoria} 
                        onChange={e => selecionarCategoriaItem(item, e.target.value)}
                        className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white outline-none cursor-pointer focus:border-orange-500"
                      >
                        {CATEGORIAS_RECEITAS.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* MODAL IMPORTAR / REGISTAR RECEITA */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl shadow-2xl relative my-8">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-lg font-bold text-orange-500">Conciliação de Receita (Reconhecimento Automático)</h2>
              <button onClick={() => setModalAberto(false)} className="text-zinc-400 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={salvarReceitaConciliada} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-zinc-400 mb-1">CANAL / CLIENTE</label>
                  <input required type="text" value={clienteCanal} onChange={e => setClienteCanal(e.target.value)} placeholder="Ex: Glovo, Palmbites, Balcão..." className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1">Nº DOCUMENTO</label>
                  <input type="text" value={numeroDocumento} onChange={e => setNumeroDocumento(e.target.value)} placeholder="Opcional" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1">DATA DA RECEITA</label>
                <input required type="date" value={dataReceita} onChange={e => setDataReceita(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white [color-scheme:dark]" />
              </div>

              {/* LISTAGEM ITEM POR ITEM DA RECEITA */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <h3 className="text-xs font-bold uppercase text-zinc-400">Itens Vendidos (Categorização Automática ou Manual)</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-6">
                    <input type="text" value={tempNome} onChange={e => setTempNome(e.target.value)} placeholder="Nome do item..." className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white outline-none" />
                  </div>
                  <div className="sm:col-span-2">
                    <input type="number" step="0.1" min="0.1" value={tempQtd} onChange={e => setTempQtd(e.target.value)} placeholder="Qtd" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white outline-none" />
                  </div>
                  <div className="sm:col-span-3">
                    <input type="number" step="0.01" min="0" value={tempPreco} onChange={e => setTempPreco(e.target.value)} placeholder="Preço Unit. (€)" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white outline-none" />
                  </div>
                  <div className="sm:col-span-1">
                    <button type="button" onClick={adicionarItemTemp} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 rounded-lg text-xs transition-all">＋</button>
                  </div>
                </div>

                {itensTemp.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    {itensTemp.map((it, i) => (
                      <div key={i} className="flex justify-between items-center bg-zinc-900 p-2 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-orange-400">{it.quantidade}x</span>
                          <span className="text-zinc-200">{it.nome_item}</span>
                          <span className="text-[9px] font-bold text-green-400 uppercase bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">
                            Categoria: {it.categoria}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-zinc-300">{Number(it.subtotal).toFixed(2)}€</span>
                          <button type="button" onClick={() => removerItemTemp(i)} className="text-red-400 hover:text-red-300 font-bold">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setModalAberto(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl text-sm font-bold text-zinc-300 transition-all">Cancelar</button>
                <button type="submit" disabled={salvando} className="flex-1 bg-orange-600 hover:bg-orange-700 py-3 rounded-xl text-sm font-bold shadow-lg transition-all disabled:opacity-50">
                  {salvando ? 'A Registar...' : 'Guardar e Memorizar Receita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}