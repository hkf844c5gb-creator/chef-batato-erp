'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface ItemConciliado {
  id: string;
  nome_item: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  categoria: string;
  fornecedor: string;
  data_fatura: string;
}

const CATEGORIAS_PRODUTOS = [
  { id: 'base batata', label: '🥔 Base Batata' },
  { id: 'recheio strogonoff', label: '🍄 Recheio Strogonoff' },
  { id: 'costela', label: '🥩 Costela' },
  { id: 'frango', label: '🍗 Frango' },
  { id: 'calabresa', label: '🥓 Calabresa' },
  { id: 'misto', label: '🧀 Misto' },
  { id: 'brócolos', label: '🥦 Brócolos' },
  { id: 'brownie', label: '🍫 Brownie' },
];

const CATEGORIAS_GERAIS = [
  { id: 'papelaria', label: '📝 Papelaria / Escritório' },
  { id: 'embalagens', label: '📦 Embalagens / Caixas' },
  { id: 'limpeza', label: '🧹 Limpeza' },
  { id: 'manutencao', label: '🔧 Manutenção / Equipamentos' },
  { id: 'geral', label: '🌐 Outros Gastos Gerais' },
];

export default function GestaoGastosConciliacaoRealUnificada() {
  const [todosItens, setTodosItens] = useState<ItemConciliado[]>([]);
  const [loading, setLoading] = useState(true);

  const [abaAtiva, setAbaAtiva] = useState<'gastos' | 'relatorio'>('gastos');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'produtos' | 'gerais'>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [mesSelecionado, setMesSelecionado] = useState(''); // Deixar vazio para ver tudo globalmente

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function carregarItensDaConciliacaoInteligente() {
    setLoading(true);
    try {
      // Procura nas tabelas comuns geradas pelo Conciliador Inteligente
      let dataFinal: any[] = [];

      // 1. Tentar buscar da tabela de itens extraídos da conciliação
      const res1 = await supabase.from('itens_conciliacao_fatura').select('*');
      if (res1.data && res1.data.length > 0) {
        dataFinal = res1.data;
      } else {
        // 2. Se não existir, tenta buscar diretamente da tabela de histórico de conciliação / faturas
        const res2 = await supabase.from('faturas_conciliacao').select('*');
        if (res2.data && res2.data.length > 0) {
          dataFinal = res2.data;
        } else {
          // 3. Tenta tabela genérica de conciliação se houver
          const res3 = await supabase.from('conciliacoes').select('*');
          dataFinal = res3.data || [];
        }
      }

      const formatados = dataFinal.map((item: any) => ({
        id: item.id || Math.random().toString(),
        nome_item: item.nome_item || item.descricao || item.item || 'Registo / Fatura Conciliada',
        quantidade: Number(item.quantidade || item.qtd || 1),
        preco_unitario: Number(item.preco_unitario || item.valor_total || item.valor || 0),
        subtotal: Number(item.subtotal || item.valor_total || item.valor || 0),
        categoria: item.categoria || 'geral',
        fornecedor: item.fornecedor || item.nome_fornecedor || 'Recibo / Fatura',
        data_fatura: item.data_fatura || item.data || item.mes_referencia || '2026-05'
      }));

      setTodosItens(formatados);
    } catch (err) {
      console.error('Erro ao buscar dados do conciliador:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarItensDaConciliacaoInteligente();
  }, []);

  const alterarCategoriaItem = async (itemId: string, novaCategoria: string) => {
    try {
      await supabase
        .from('itens_conciliacao_fatura')
        .update({ categoria: novaCategoria })
        .eq('id', itemId);

      setTodosItens(prev =>
        prev.map(i => (i.id === itemId ? { ...i, categoria: novaCategoria } : i))
      );
    } catch (err: any) {
      alert(`Erro ao atualizar: ${err.message}`);
    }
  };

  const relatorioMensal = useMemo(() => {
    const itensMes = todosItens.filter(item => {
      if (!mesSelecionado) return true;
      return (item.data_fatura || '').includes(mesSelecionado);
    });

    let totalGastoProdutos = 0;
    let totalGastoGerais = 0;
    const resumoProdutos: { [cat: string]: { gasto: number; qtd: number } } = {};
    const resumoGerais: { [cat: string]: { gasto: number; qtd: number } } = {};

    CATEGORIAS_PRODUTOS.forEach(c => { resumoProdutos[c.id] = { gasto: 0, qtd: 0 }; });
    CATEGORIAS_GERAIS.forEach(c => { resumoGerais[c.id] = { gasto: 0, qtd: 0 }; });

    itensMes.forEach(item => {
      const cat = item.categoria || 'geral';
      const sub = Number(item.subtotal || 0);
      const qtd = Number(item.quantidade || 0);
      const isProduto = CATEGORIAS_PRODUTOS.some(p => p.id === cat);

      if (isProduto) {
        totalGastoProdutos += sub;
        if (!resumoProdutos[cat]) resumoProdutos[cat] = { gasto: 0, qtd: 0 };
        resumoProdutos[cat].gasto += sub;
        resumoProdutos[cat].qtd += qtd;
      } else {
        totalGastoGerais += sub;
        if (!resumoGerais[cat]) resumoGerais[cat] = { gasto: 0, qtd: 0 };
        resumoGerais[cat].gasto += sub;
        resumoGerais[cat].qtd += qtd;
      }
    });

    return { totalGastoProdutos, totalGastoGerais, totalGeralMes: totalGastoProdutos + totalGastoGerais, resumoProdutos, resumoGerais };
  }, [todosItens, mesSelecionado]);

  const itensFiltrados = useMemo(() => {
    return todosItens.filter(item => {
      const cat = item.categoria || 'geral';
      const isProduto = CATEGORIAS_PRODUTOS.some(p => p.id === cat);
      if (filtroTipo === 'produtos' && !isProduto) return false;
      if (filtroTipo === 'gerais' && isProduto) return false;
      if (filtroCategoria && cat !== filtroCategoria) return false;

      if (mesSelecionado && !(item.data_fatura || '').includes(mesSelecionado)) return false;

      if (termoPesquisa) {
        const t = termoPesquisa.toLowerCase();
        const nomeMatch = (item.nome_item || '').toLowerCase().includes(t);
        const fornecedorMatch = (item.fornecedor || '').toLowerCase().includes(t);
        const dataMatch = (item.data_fatura || '').includes(t);
        if (!nomeMatch && !fornecedorMatch && !dataMatch) return false;
      }
      return true;
    });
  }, [todosItens, filtroTipo, filtroCategoria, termoPesquisa, mesSelecionado]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <h1 className="text-xl font-bold tracking-wide">Gastos & Faturas da Conciliação (Sincronizado)</h1>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setAbaAtiva('gastos')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === 'gastos' ? 'bg-orange-600 text-white shadow' : 'bg-zinc-800 text-zinc-400'}`}>
            🔍 Gastos Item por Item
          </button>
          <button onClick={() => setAbaAtiva('relatorio')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === 'relatorio' ? 'bg-orange-600 text-white shadow' : 'bg-zinc-800 text-zinc-400'}`}>
            📊 Controlo de Custo de Produção
          </button>
          <button onClick={carregarItensDaConciliacaoInteligente} className="bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold px-4 py-2 rounded-xl border border-zinc-700 transition-all">
            🔄 Sincronizar Faturas
          </button>
        </div>
      </header>

      {abaAtiva === 'gastos' ? (
        <>
          <section className="px-6 pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex gap-2">
                <button onClick={() => setFiltroTipo('todos')} className={`px-4 py-2 rounded-xl text-xs font-bold ${filtroTipo === 'todos' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-400'}`}>Todos</button>
                <button onClick={() => setFiltroTipo('produtos')} className={`px-4 py-2 rounded-xl text-xs font-bold ${filtroTipo === 'produtos' ? 'bg-orange-600/20 text-orange-400 border border-orange-500/40' : 'bg-zinc-900 text-zinc-400'}`}>🥔 Matérias-Primas (Produtos)</button>
                <button onClick={() => setFiltroTipo('gerais')} className={`px-4 py-2 rounded-xl text-xs font-bold ${filtroTipo === 'gerais' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40' : 'bg-zinc-900 text-zinc-400'}`}>📝 Despesas Gerais</button>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase font-bold text-zinc-400">Filtrar por Mês:</label>
                <input type="text" value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} placeholder="Ex: 2026-05" className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white w-28" />
                {mesSelecionado && (
                  <button onClick={() => setMesSelecionado('')} className="text-xs text-orange-400 underline font-bold">Ver Todos</button>
                )}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4">
              <input 
                type="text" 
                value={termoPesquisa}
                onChange={e => setTermoPesquisa(e.target.value)}
                placeholder="Pesquisar por Data, Item ou Fornecedor..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:border-orange-500 outline-none"
              />
              <select 
                value={filtroCategoria} 
                onChange={e => setFiltroCategoria(e.target.value)} 
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white outline-none cursor-pointer"
              >
                <option value="">Todas as Categorias</option>
                <optgroup label="Produtos">
                  {CATEGORIAS_PRODUTOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </optgroup>
                <optgroup label="Gerais">
                  {CATEGORIAS_GERAIS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </optgroup>
              </select>
            </div>
          </section>

          <main className="flex-1 p-6 overflow-y-auto">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-4 font-bold">Data Fatura</th>
                    <th className="p-4 font-bold">Fornecedor</th>
                    <th className="p-4 font-bold">Item Extraído</th>
                    <th className="p-4 font-bold">Quantidade</th>
                    <th className="p-4 font-bold">Valor Total (€)</th>
                    <th className="p-4 font-bold">Categorizar Item</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {loading ? (
                    <tr><td colSpan={6} className="text-center p-8 text-zinc-500">A carregar faturas da conciliação...</td></tr>
                  ) : itensFiltrados.length === 0 ? (
                    <tr><td colSpan={6} className="text-center p-8 text-zinc-500">Nenhum item encontrado. Clique em "Sincronizar Faturas" acima para atualizar.</td></tr>
                  ) : (
                    itensFiltrados.map(item => (
                      <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="p-4 font-mono text-xs text-zinc-400">{item.data_fatura}</td>
                        <td className="p-4 font-medium text-zinc-300">{item.fornecedor}</td>
                        <td className="p-4 font-bold text-white">{item.nome_item}</td>
                        <td className="p-4 font-mono text-xs text-orange-400 font-bold">{item.quantidade} un/kg</td>
                        <td className="p-4 font-mono font-bold text-red-400">{item.subtotal.toFixed(2)}€</td>
                        <td className="p-4">
                          <select 
                            value={item.categoria} 
                            onChange={e => alterarCategoriaItem(item.id, e.target.value)}
                            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white outline-none cursor-pointer focus:border-orange-500"
                          >
                            <optgroup label="Produtos">
                              {CATEGORIAS_PRODUTOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </optgroup>
                            <optgroup label="Gerais">
                              {CATEGORIAS_GERAIS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </optgroup>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </main>
        </>
      ) : (
        <main className="flex-1 p-6 overflow-y-auto space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex justify-between items-center shadow-lg">
            <div>
              <h2 className="text-base font-bold text-white">Controlo de Custos de Produção</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Soma automática dos custos e quantidades de matéria-prima das faturas conciliadas.</p>
            </div>
            <div>
              <input type="text" value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} placeholder="Ex: 2026-05" className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
              <span className="text-[10px] text-zinc-400 uppercase font-black">Custo Matérias-Primas (Produtos)</span>
              <p className="text-2xl font-black mt-1 text-orange-500">{relatorioMensal.totalGastoProdutos.toFixed(2)}€</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
              <span className="text-[10px] text-zinc-400 uppercase font-black">Custo Despesas Gerais</span>
              <p className="text-2xl font-black mt-1 text-blue-400">{relatorioMensal.totalGastoGerais.toFixed(2)}€</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
              <span className="text-[10px] text-zinc-400 uppercase font-black">Custo Global Total</span>
              <p className="text-2xl font-black mt-1 text-red-400">{relatorioMensal.totalGeralMes.toFixed(2)}€</p>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-zinc-800 font-bold text-sm text-orange-400">🥔 Resumo de Quantidades e Custos por Matéria-Prima</div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Matéria-Prima / Produto</th>
                  <th className="p-3">Quantidade Total Comprada</th>
                  <th className="p-3">Custo Total (€)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {Object.entries(relatorioMensal.resumoProdutos).map(([catId, dados]) => {
                  const info = CATEGORIAS_PRODUTOS.find(c => c.id === catId);
                  return (
                    <tr key={catId}>
                      <td className="p-3 font-medium text-white">{info?.label || catId}</td>
                      <td className="p-3 font-mono text-xs">{dados.qtd.toFixed(1)} un/kg</td>
                      <td className="p-3 font-mono font-bold text-red-400">{dados.gasto.toFixed(2)}€</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      )}
    </div>
  );
}