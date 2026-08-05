'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface ItemEstoque {
  id: string;
  nome: string;
  unidade_medida: string;
  quantidade_atual: number;
}

export default function GestaoEstoque() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [itens, setItens] = useState<ItemEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos');

  // Estado para Novo Item
  const [novoNome, setNovoNome] = useState('');
  const [novoStock, setNovoStock] = useState('');

  // Estado para Ajuste de Stock (Reposição/Quebra)
  const [ajusteId, setAjusteId] = useState<string | null>(null);
  const [qtdAjuste, setQtdAjuste] = useState('');
  const [tipoAjuste, setTipoAjuste] = useState<'entrada' | 'saida'>('entrada');
  const [processando, setProcessando] = useState(false);

  async function carregarEstoque() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('insumos')
        .select('id, nome, unidade_medida, quantidade_atual')
        .order('nome', { ascending: true });

      if (error) throw error;
      setItens(data || []);
    } catch (err: any) {
      alert("Erro ao carregar estoque: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarEstoque();
  }, []);

  const adicionarNovoItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim()) return;

    setProcessando(true);
    try {
      const { error } = await supabase.from('insumos').insert([{
        nome: novoNome.trim(),
        unidade_medida: 'unidades', // Bebidas e Embalagens são por unidade
        quantidade_atual: Number(novoStock) || 0
      }]);

      if (error) throw error;
      
      alert('✅ Novo item adicionado ao estoque central!');
      setNovoNome('');
      setNovoStock('');
      carregarEstoque();
    } catch (err: any) {
      alert('Erro ao criar item: ' + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const aplicarAjuste = async () => {
    if (!ajusteId || !qtdAjuste || Number(qtdAjuste) <= 0) return;

    const itemSelecionado = itens.find(i => i.id === ajusteId);
    if (!itemSelecionado) return;

    setProcessando(true);
    try {
      const qtdOperacao = Number(qtdAjuste);
      let novoStock = Number(itemSelecionado.quantidade_atual);

      if (tipoAjuste === 'entrada') {
        novoStock += qtdOperacao; // Reposição de mercadoria
      } else {
        novoStock -= qtdOperacao; // Quebra / Perda
        if (novoStock < 0) novoStock = 0; 
      }

      const { error } = await supabase
        .from('insumos')
        .update({ quantidade_atual: novoStock })
        .eq('id', ajusteId);

      if (error) throw error;

      alert(`✅ Estoque atualizado! Novo saldo de ${itemSelecionado.nome}: ${novoStock}`);
      setAjusteId(null);
      setQtdAjuste('');
      carregarEstoque();
    } catch (err: any) {
      alert('Erro ao ajustar estoque: ' + err.message);
    } finally {
      setProcessando(false);
    }
  };

  // Lógica de Filtros e Alertas
  const itensEmAlerta = itens.filter(i => i.quantidade_atual <= 10);
  
  const itensFiltrados = itens.filter(item => {
    const nome = item.nome.toLowerCase();
    if (filtro === 'alertas') return item.quantidade_atual <= 10;
    if (filtro === 'bebidas') return nome.includes('coca') || nome.includes('água') || nome.includes('agua') || nome.includes('ice tea') || nome.includes('guarana') || nome.includes('guaraná') || nome.includes('seven') || nome.includes('compal') || nome.includes('superbock') || nome.includes('sagres');
    if (filtro === 'sobremesas') return nome.includes('brownie') || nome.includes('pudim');
    if (filtro === 'embalagens') return nome.includes('pote') || nome.includes('garfo') || nome.includes('saco') || nome.includes('sacola') || nome.includes('tampa');
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans p-8 flex flex-col gap-6">
      
      {/* CABEÇALHO E ALERTA DE STOCK */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-black text-orange-500">📦 Gestão de Estoque (Bebidas, Sobremesas & Embalagens)</h1>
          <p className="text-xs text-zinc-400 mt-1">Controle a entrada de mercadoria e receba alertas quando precisar de repor o estoque.</p>
        </div>

        {itensEmAlerta.length > 0 && !loading && (
          <div className="bg-red-950/40 border border-red-900/50 rounded-3xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <h2 className="text-red-500 font-black text-sm uppercase tracking-widest flex items-center gap-2">
                <span className="animate-pulse">🚨</span> ALERTA DE REPOSIÇÃO NECESSÁRIA
              </h2>
              <p className="text-xs text-red-400/80 mt-1">Existem {itensEmAlerta.length} itens com o stock a acabar (10 unidades ou menos). Efetue a compra para evitar ruturas.</p>
            </div>
            <button 
              onClick={() => setFiltro('alertas')}
              className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md"
            >
              Ver Itens em Falta
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUNA ESQUERDA: CADASTRAR NOVO E FILTROS */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl">
            <h2 className="text-sm font-bold text-white mb-4">Cadastrar Novo Item Base</h2>
            <form onSubmit={adicionarNovoItem} className="space-y-4">
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Nome do Item</label>
                <input 
                  type="text" 
                  placeholder="Ex: Coca-Cola Zero 330ml, Pote..." 
                  value={novoNome} 
                  onChange={(e) => setNovoNome(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-orange-500" 
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Stock Inicial (Unidades)</label>
                <input 
                  type="number" 
                  min="0"
                  placeholder="Ex: 24" 
                  value={novoStock} 
                  onChange={(e) => setNovoStock(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-orange-500" 
                />
              </div>
              <button 
                type="submit" 
                disabled={processando}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl text-xs uppercase transition-all disabled:opacity-50"
              >
                + Adicionar ao Sistema
              </button>
            </form>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl shadow-xl flex flex-col gap-2">
            <h3 className="text-[10px] text-zinc-500 font-bold uppercase mb-1 px-2">Categorias / Filtros</h3>
            <button onClick={() => setFiltro('todos')} className={`text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${filtro === 'todos' ? 'bg-orange-600 text-white' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'}`}>📋 Todos os Itens</button>
            <button onClick={() => setFiltro('alertas')} className={`text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex justify-between items-center ${filtro === 'alertas' ? 'bg-red-600 text-white' : 'bg-zinc-950 text-red-500 hover:bg-red-950/30'}`}>
              🚨 Acabando <span className="bg-red-500/20 text-red-400 px-2 rounded-md">{itensEmAlerta.length}</span>
            </button>
            <button onClick={() => setFiltro('bebidas')} className={`text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${filtro === 'bebidas' ? 'bg-orange-600 text-white' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'}`}>🥤 Bebidas</button>
            <button onClick={() => setFiltro('sobremesas')} className={`text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${filtro === 'sobremesas' ? 'bg-orange-600 text-white' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'}`}>🍫 Sobremesas</button>
            <button onClick={() => setFiltro('embalagens')} className={`text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${filtro === 'embalagens' ? 'bg-orange-600 text-white' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'}`}>🛍️ Embalagens (Potes/Sacos)</button>
          </div>
        </div>

        {/* COLUNA DIREITA: LISTAGEM E AJUSTE (REPOSIÇÃO) */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="text-center text-zinc-500 py-12 font-bold text-xs uppercase tracking-widest">A carregar estoque...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {itensFiltrados.map((item) => {
                const stockCritico = item.quantidade_atual <= 10;

                return (
                  <div key={item.id} className={`bg-zinc-900 border p-5 rounded-3xl flex flex-col gap-4 shadow-lg transition-all ${stockCritico ? 'border-red-900/50 shadow-[0_0_15px_rgba(220,38,38,0.1)]' : 'border-zinc-800'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-white text-sm pr-2">{item.nome}</h3>
                        {stockCritico && <span className="text-[9px] font-bold uppercase text-red-500 mt-1 block">Stock Crítico</span>}
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`text-2xl font-black font-mono leading-none ${stockCritico ? 'text-red-500' : 'text-green-400'}`}>
                          {item.quantidade_atual}
                        </span>
                        <span className="text-[9px] text-zinc-500 uppercase font-bold mt-1">{item.unidade_medida}</span>
                      </div>
                    </div>

                    {ajusteId === item.id ? (
                      <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3 mt-auto">
                        <div className="flex gap-2">
                          <button onClick={() => setTipoAjuste('entrada')} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${tipoAjuste === 'entrada' ? 'bg-green-600 text-white shadow-md' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'}`}>
                            🛒 Comprar (+)
                          </button>
                          <button onClick={() => setTipoAjuste('saida')} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${tipoAjuste === 'saida' ? 'bg-red-600 text-white shadow-md' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'}`}>
                            🗑️ Quebra (-)
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input 
                            type="number" 
                            min="1"
                            placeholder="Qtd..." 
                            value={qtdAjuste}
                            onChange={(e) => setQtdAjuste(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm font-mono font-bold outline-none text-white text-center"
                          />
                          <button 
                            onClick={aplicarAjuste}
                            disabled={processando}
                            className="bg-orange-600 hover:bg-orange-500 text-white px-4 rounded-xl font-bold text-xs transition-all"
                          >
                            OK
                          </button>
                          <button onClick={() => setAjusteId(null)} className="text-zinc-500 hover:text-white px-3 font-bold bg-zinc-800 rounded-xl">✕</button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setAjusteId(item.id); setQtdAjuste(''); setTipoAjuste('entrada'); }}
                        className={`mt-auto w-full border font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 ${stockCritico ? 'bg-red-600/10 border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800'}`}
                      >
                        {stockCritico ? '⚠️ Registar Compra' : '🛒 Repor / Ajustar'}
                      </button>
                    )}
                  </div>
                );
              })}
              
              {itensFiltrados.length === 0 && (
                <div className="col-span-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center text-zinc-500 text-sm">
                  Nenhum item encontrado nesta categoria.
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}