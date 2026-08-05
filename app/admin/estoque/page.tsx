'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface ProdutoEstoque {
  id: string;
  nome: string;
  categoria: string;
  estoque_atual: number;
  estoque_minimo: number;
}

interface MovimentoKardex {
  id: string;
  nome_produto: string;
  tipo_movimento: string;
  quantidade: number;
  saldo_atualizado: number;
  origem: string;
  observacoes: string;
  data_movimento: string;
}

export default function GestaoEstoqueProdutos() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [historicoGlobal, setHistoricoGlobal] = useState<MovimentoKardex[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState('todos');

  // Modais
  const [modalRepor, setModalRepor] = useState<ProdutoEstoque | null>(null);
  const [modalAlerta, setModalAlerta] = useState<ProdutoEstoque | null>(null);
  
  // Novo Modal de Histórico Individual
  const [modalHistorico, setModalHistorico] = useState<ProdutoEstoque | null>(null);
  const [historicoProduto, setHistoricoProduto] = useState<MovimentoKardex[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Formulários
  const [qtdRepor, setQtdRepor] = useState('');
  const [dataRepor, setDataRepor] = useState(() => new Date().toISOString().split('T')[0]);
  const [novoAlerta, setNovoAlerta] = useState('');
  const [processando, setProcessando] = useState(false);

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: prods, error: errProds } = await supabase
        .from('produtos')
        .select('id, nome, categoria, estoque_atual, estoque_minimo')
        .eq('ativo', true)
        .order('nome', { ascending: true });

      if (errProds) throw errProds;
      setProdutos(prods || []);

      const { data: hist } = await supabase
        .from('movimentos_estoque')
        .select('*')
        .order('data_movimento', { ascending: false })
        .limit(15);
      
      if (hist) setHistoricoGlobal(hist);

    } catch (err: any) {
      console.error("Aviso:", err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDados(); }, []);

  const registarEntradaStock = async () => {
    if (!modalRepor || !qtdRepor || Number(qtdRepor) <= 0) return;
    setProcessando(true);

    try {
      const qtdAdicionar = Number(qtdRepor);
      const novoStock = Number(modalRepor.estoque_atual || 0) + qtdAdicionar;

      // 1. Atualiza o saldo do Produto
      const { error: errUpdate } = await supabase
        .from('produtos')
        .update({ estoque_atual: novoStock })
        .eq('id', modalRepor.id);
      
      if (errUpdate) throw errUpdate;

      // 2. Grava a Entrada no Histórico Oficial com a Data Selecionada
      await supabase.from('movimentos_estoque').insert([{
        produto_id: modalRepor.id,
        nome_produto: modalRepor.nome,
        tipo_movimento: 'ENTRADA',
        quantidade: qtdAdicionar,
        saldo_atualizado: novoStock,
        origem: 'COMPRA / REPOSIÇÃO',
        observacoes: `Registado via painel. Data Fatura: ${dataRepor}`
      }]);

      alert(`✅ ${qtdAdicionar} unidades de ${modalRepor.nome} adicionadas com sucesso!`);
      setModalRepor(null);
      setQtdRepor('');
      carregarDados();
    } catch (err: any) {
      alert(`Erro ao repor stock: ${err.message}`);
    } finally {
      setProcessando(false);
    }
  };

  const atualizarAlertaMinimo = async () => {
    if (!modalAlerta || !novoAlerta || Number(novoAlerta) < 0) return;
    setProcessando(true);

    try {
      const { error } = await supabase
        .from('produtos')
        .update({ estoque_minimo: Number(novoAlerta) })
        .eq('id', modalAlerta.id);
      
      if (error) throw error;

      alert(`✅ Alerta de ${modalAlerta.nome} definido para ${novoAlerta} unidades.`);
      setModalAlerta(null);
      setNovoAlerta('');
      carregarDados();
    } catch (err: any) {
      alert(`Erro ao atualizar alerta: ${err.message}`);
    } finally {
      setProcessando(false);
    }
  };

  const verHistoricoProduto = async (produto: ProdutoEstoque) => {
    setModalHistorico(produto);
    setLoadingHistorico(true);
    try {
      const { data, error } = await supabase
        .from('movimentos_estoque')
        .select('*')
        .eq('produto_id', produto.id)
        .order('data_movimento', { ascending: false })
        .limit(50); // Mostra os últimos 50 movimentos
      
      if (error) throw error;
      setHistoricoProduto(data || []);
    } catch (err: any) {
      alert("Erro ao carregar histórico: " + err.message);
    } finally {
      setLoadingHistorico(false);
    }
  };

  const produtosEmAlerta = produtos.filter(p => (p.estoque_atual || 0) <= (p.estoque_minimo || 5));
  
  const produtosFiltrados = produtos.filter(p => {
    const cat = (p.categoria || '').toLowerCase();
    if (filtroCategoria === 'alertas') return (p.estoque_atual || 0) <= (p.estoque_minimo || 5);
    if (filtroCategoria === 'bebidas') return cat.includes('bebida');
    if (filtroCategoria === 'sobremesas') return cat.includes('sobremesa') || cat.includes('brownie');
    if (filtroCategoria === 'batatas') return cat.includes('batata');
    if (filtroCategoria === 'embalagens') return cat.includes('embalagem') || cat.includes('material') || cat.includes('uso interno');
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans p-8 flex flex-col gap-6">
      
      {/* CABEÇALHO */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-black text-orange-500">📦 Gestão de Estoque Completa</h1>
          <p className="text-xs text-zinc-400 mt-1">Registo detalhado com data, histórico e cruzamento em tempo real com as vendas do PDV.</p>
        </div>

        {produtosEmAlerta.length > 0 && !loading && (
          <div className="bg-red-950/40 border border-red-900/50 rounded-3xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <h2 className="text-red-500 font-black text-sm uppercase tracking-widest flex items-center gap-2">
                <span className="animate-pulse">🚨</span> ALERTA DE RUPTURA DE STOCK
              </h2>
              <p className="text-xs text-red-400/80 mt-1">Existem {produtosEmAlerta.length} produtos abaixo do limite mínimo configurado. Faça a reposição.</p>
            </div>
            <button 
              onClick={() => setFiltroCategoria('alertas')}
              className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md"
            >
              Ver Itens em Falta
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* MENU LATERAL */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl shadow-xl flex flex-col gap-2">
            <h3 className="text-[10px] text-zinc-500 font-bold uppercase mb-1 px-2">Categorias</h3>
            <button onClick={() => setFiltroCategoria('todos')} className={`text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${filtroCategoria === 'todos' ? 'bg-orange-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'}`}>📋 Todos os Itens</button>
            <button onClick={() => setFiltroCategoria('alertas')} className={`text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex justify-between items-center ${filtroCategoria === 'alertas' ? 'bg-red-600 text-white shadow-md' : 'bg-zinc-950 text-red-500 hover:bg-red-950/30'}`}>
              🚨 Em Alerta <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-md text-[10px]">{produtosEmAlerta.length}</span>
            </button>
            <button onClick={() => setFiltroCategoria('bebidas')} className={`text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${filtroCategoria === 'bebidas' ? 'bg-orange-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'}`}>🥤 Bebidas</button>
            <button onClick={() => setFiltroCategoria('sobremesas')} className={`text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${filtroCategoria === 'sobremesas' ? 'bg-orange-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'}`}>🍫 Sobremesas</button>
            <button onClick={() => setFiltroCategoria('batatas')} className={`text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${filtroCategoria === 'batatas' ? 'bg-orange-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'}`}>🥔 Batatas (Recheios)</button>
            <button onClick={() => setFiltroCategoria('embalagens')} className={`text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${filtroCategoria === 'embalagens' ? 'bg-orange-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'}`}>🛍️ Embalagens / Materiais</button>
          </div>

          {/* HISTÓRICO GLOBAL RECENTE */}
          {historicoGlobal.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col gap-3 max-h-[600px] overflow-y-auto custom-scrollbar">
              <h3 className="text-[10px] text-zinc-500 font-bold uppercase mb-2">Movimentos Globais Recentes</h3>
              {historicoGlobal.map(h => {
                const isEntrada = h.tipo_movimento === 'ENTRADA';
                return (
                  <div key={h.id} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex flex-col gap-1 relative overflow-hidden">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${isEntrada ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <div className="flex justify-between items-start pl-2">
                      <strong className="text-white text-xs">{h.nome_produto}</strong>
                      <span className={`text-xs font-bold font-mono ${isEntrada ? 'text-green-400' : 'text-red-400'}`}>
                        {isEntrada ? '+' : '-'}{h.quantidade}
                      </span>
                    </div>
                    <div className="flex justify-between items-end pl-2 text-[9px] text-zinc-500">
                      <span>{h.origem}</span>
                      <span className="font-mono text-zinc-400 font-bold">Saldo: {h.saldo_atualizado}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* LISTA DE PRODUTOS */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="text-center text-zinc-500 py-12 font-bold text-xs uppercase tracking-widest animate-pulse">A carregar dados cruzados...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {produtosFiltrados.map((item) => {
                const stockAtual = item.estoque_atual || 0;
                const stockMinimo = item.estoque_minimo || 5;
                const stockCritico = stockAtual <= stockMinimo;

                return (
                  <div key={item.id} className={`bg-zinc-900 border p-5 rounded-3xl flex flex-col justify-between gap-4 shadow-lg transition-all ${stockCritico ? 'border-red-900/50 shadow-[0_0_15px_rgba(220,38,38,0.1)]' : 'border-zinc-800 hover:border-zinc-700'}`}>
                    
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <span className="text-[8px] font-bold uppercase tracking-widest text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">{item.categoria}</span>
                        <h3 className="font-bold text-white text-sm mt-2 leading-tight">{item.nome}</h3>
                        
                        {/* BOTÕES DE GESTÃO DO ITEM */}
                        <div className="flex flex-wrap gap-3 mt-3">
                          <button 
                            onClick={() => { setModalAlerta(item); setNovoAlerta(String(stockMinimo)); }}
                            className="text-[9px] text-zinc-400 hover:text-orange-400 uppercase font-bold flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded border border-zinc-800"
                          >
                            ✏️ Min: {stockMinimo}
                          </button>
                          <button 
                            onClick={() => verHistoricoProduto(item)}
                            className="text-[9px] text-zinc-400 hover:text-blue-400 uppercase font-bold flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded border border-zinc-800"
                          >
                            🕒 Histórico
                          </button>
                        </div>

                      </div>
                      <div className="flex flex-col items-end text-right">
                        <span className={`text-3xl font-black font-mono leading-none ${stockCritico ? 'text-red-500' : 'text-green-400'}`}>
                          {stockAtual}
                        </span>
                      </div>
                    </div>

                    <button 
                      onClick={() => { setModalRepor(item); setQtdRepor(''); }}
                      className={`w-full font-bold py-3.5 rounded-xl text-xs transition-all uppercase tracking-wider flex items-center justify-center gap-2 ${stockCritico ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20' : 'bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300'}`}
                    >
                      {stockCritico ? '⚠️ Registar Reposição' : '🛒 Repor Estoque'}
                    </button>
                  </div>
                );
              })}
              
              {produtosFiltrados.length === 0 && (
                <div className="col-span-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center text-zinc-500 text-sm">
                  Nenhum produto encontrado nesta categoria.
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* MODAL: REPOR STOCK */}
      {modalRepor && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-6 shadow-2xl relative">
            <button onClick={() => setModalRepor(null)} className="absolute top-5 right-5 text-zinc-400 hover:text-white bg-zinc-800 w-8 h-8 rounded-full flex items-center justify-center">✕</button>
            <h2 className="text-lg font-black text-white pr-8">🛒 Comprar / Repor Estoque</h2>
            <p className="text-xs text-orange-400 mb-6 font-bold">{modalRepor.nome}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Data da Entrada</label>
                <input type="date" value={dataRepor} onChange={(e) => setDataRepor(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Quantidade Adicionada (Unidades)</label>
                <input type="number" min="1" placeholder="Quantas unidades repôs?" value={qtdRepor} onChange={(e) => setQtdRepor(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-lg font-black text-green-400 outline-none focus:border-green-500" />
              </div>
              <button onClick={registarEntradaStock} disabled={processando} className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-xl text-sm uppercase tracking-widest mt-2 shadow-lg disabled:opacity-50">
                {processando ? 'A Gravar...' : 'Confirmar Entrada no Estoque'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ALERTA MÍNIMO */}
      {modalAlerta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative">
            <button onClick={() => setModalAlerta(null)} className="absolute top-5 right-5 text-zinc-400 hover:text-white bg-zinc-800 w-8 h-8 rounded-full flex items-center justify-center">✕</button>
            <h2 className="text-lg font-black text-white pr-8">🚨 Alerta de Estoque Mínimo</h2>
            <p className="text-xs text-orange-400 mb-6 font-bold">{modalAlerta.nome}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Avisar quando o estoque chegar a:</label>
                <input type="number" min="0" value={novoAlerta} onChange={(e) => setNovoAlerta(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-lg font-black text-red-400 outline-none focus:border-red-500 text-center" />
              </div>
              <button onClick={atualizarAlertaMinimo} disabled={processando} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-4 rounded-xl text-sm uppercase tracking-widest mt-2 shadow-lg disabled:opacity-50">
                Guardar Novo Limite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOVO MODAL: HISTÓRICO ESPECÍFICO DO PRODUTO */}
      {modalHistorico && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-3xl rounded-3xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button onClick={() => setModalHistorico(null)} className="absolute top-5 right-5 text-zinc-400 hover:text-white bg-zinc-800 w-8 h-8 rounded-full flex items-center justify-center">✕</button>
            
            <h2 className="text-lg font-black text-white pr-8">🕒 Histórico de Movimentos (Extrato)</h2>
            <p className="text-xs text-blue-400 mb-6 font-bold">{modalHistorico.nome}</p>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              {loadingHistorico ? (
                <p className="text-xs text-zinc-500 text-center py-8">A consultar base de dados...</p>
              ) : historicoProduto.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-8">Nenhum movimento registado para este item.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] text-zinc-500 uppercase border-b border-zinc-800">
                    <tr>
                      <th className="py-2">Data do Movimento</th>
                      <th className="py-2">Tipo</th>
                      <th className="py-2 text-center">Quantidade</th>
                      <th className="py-2 text-center">Saldo Restante</th>
                      <th className="py-2 text-right">Origem / Documento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {historicoProduto.map(h => {
                      const isEntrada = h.tipo_movimento === 'ENTRADA';
                      return (
                        <tr key={h.id} className="hover:bg-zinc-950 transition-all">
                          <td className="py-3 text-zinc-300">
                            {new Date(h.data_movimento).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${isEntrada ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                              {h.tipo_movimento}
                            </span>
                          </td>
                          <td className={`py-3 text-center font-mono font-bold ${isEntrada ? 'text-green-400' : 'text-red-400'}`}>
                            {isEntrada ? '+' : '-'}{h.quantidade}
                          </td>
                          <td className="py-3 text-center font-mono text-white font-bold">{h.saldo_atualizado}</td>
                          <td className="py-3 text-right text-[10px] text-zinc-500">
                            <span className="block font-bold text-zinc-400">{h.origem}</span>
                            {h.observacoes}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}