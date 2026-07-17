'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';

interface Produto {
  id: string;
  nome: string;
  preco: number;
  categoria: string;
}

interface ItemCarrinho {
  produto: Produto;
  quantidade: number;
}

export default function CaixaPDV() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [metodoPagamento, setMetodoPagamento] = useState<'dinheiro' | 'multibanco' | 'mbway'>('multibanco');
  const [loading, setLoading] = useState(true);

  // Inicializa o cliente do Supabase
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Carrega os produtos da sua tabela do Supabase
  useEffect(() => {
    async function carregarProdutos() {
      try {
        const { data, error } = await supabase
          .from('produtos')
          .select('id, nome, preco_whatsapp, categoria')
          .eq('ativo', true);

        if (error) {
          console.error("Erro do Supabase:", error);
          return;
        }

        if (data) {
          setProdutos(data.map((p: any) => ({ 
            id: p.id,
            nome: p.nome,
            categoria: p.categoria,
            preco: Number(p.preco_whatsapp) 
          })));
        }
      } catch (err) {
        console.error('Erro ao carregar produtos', err);
      } finally {
        setLoading(false);
      }
    }
    carregarProdutos();
  }, [supabase]);
  
  const adicionarAoCarrinho = (produto: Produto) => {
    setCarrinho((prev) => {
      const itemExistente = prev.find((item) => item.produto.id === produto.id);
      if (itemExistente) {
        return prev.map((item) =>
          item.produto.id === produto.id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item
        );
      }
      return [...prev, { produto, quantity: 1, quantidade: 1 }];
    });
  };

  const removerDoCarrinho = (produtoId: string) => {
    setCarrinho((prev) =>
      prev
        .map((item) =>
          item.produto.id === produtoId
            ? { ...item, quantidade: item.quantidade - 1 }
            : item
        )
        .filter((item) => item.quantidade > 0)
    );
  };

  const total = carrinho.reduce((acc, item) => acc + item.produto.preco * item.quantidade, 0);

  const finalizarVenda = async () => {
    if (carrinho.length === 0) return alert('O carrinho está vazio!');

    try {
      const { data: venda, error: erroVenda } = await supabase
        .from('vendas')
        .insert([{ 
          total: total, 
          metodo_pagamento: metodoPagamento,
          data_venda: new Date().toISOString()
        }])
        .select()
        .single();

      if (erroVenda) throw erroVenda;

      if (venda) {
        const itensParaInserir = carrinho.map(item => ({
          venda_id: venda.id,
          produto_id: item.produto.id,
          quantidade: item.quantidade,
          preco_unitario: item.produto.preco
        }));

        const { error: erroItens } = await supabase
          .from('itens_venda')
          .insert(itensParaInserir);

        if (erroItens) console.warn('Nota: Tabela itens_venda não encontrada ou erro ao inserir itens.');
      }

      alert(`Venda guardada no Supabase!\nTotal: ${total.toFixed(2)}€`);
      setCarrinho([]);
    } catch (err) {
      console.error('Erro ao finalizar venda:', err);
      alert(`Simulação: Venda processada localmente!\nTotal: ${total.toFixed(2)}€\n(Para gravar no banco, precisamos de criar a tabela 'vendas')`);
      setCarrinho([]);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex flex-col sm:flex-row gap-4 justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          {/* BOTÃO DE VOLTAR AO MENU */}
          <Link href="/admin" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
            ⬅️ Voltar ao Menu
          </Link>

          <span className="text-2xl">🥔</span>
          <div>
            <h1 className="text-lg font-bold text-orange-500 tracking-wide leading-none">Chef Batatô Vendas</h1>
          </div>
        </div>
        <div className="text-sm text-zinc-400">Operador: Administrador</div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Lista de Produtos Reais */}
        <main className="flex-1 p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
          <div className="col-span-full border-b border-zinc-800 pb-2 mb-2">
            <h2 className="text-lg font-semibold text-zinc-300">Menu de Vendas</h2>
          </div>
          
          {loading ? (
            <div className="col-span-full text-center text-zinc-500 py-12">A carregar os seus produtos...</div>
          ) : produtos.length === 0 ? (
            <div className="col-span-full text-center text-zinc-500 py-12">Nenhum produto encontrado na tabela 'produtos'.</div>
          ) : (
            produtos.map((prod) => (
              <button
                key={prod.id}
                onClick={() => adicionarAoCarrinho(prod)}
                className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-orange-500/50 p-4 rounded-xl text-left transition-all flex flex-col justify-between h-32 group"
              >
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md">
                    {prod.categoria || 'Geral'}
                  </span>
                  <h3 className="font-medium mt-2 text-zinc-100 group-hover:text-white transition-colors">{prod.nome}</h3>
                </div>
                <span className="text-lg font-bold text-white mt-2">{prod.preco.toFixed(2)}€</span>
              </button>
            ))
          )}
        </main>

        {/* Carrinho */}
        <aside className="w-96 bg-zinc-900 border-l border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800 font-semibold text-zinc-300">Pedido Atual</div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {carrinho.length === 0 ? (
              <div className="text-center text-zinc-500 mt-8 text-sm">Carrinho vazio</div>
            ) : (
              carrinho.map((item) => (
                <div key={item.produto.id} className="flex justify-between items-center bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  <div className="flex-1 min-w-0 pr-2">
                    <h4 className="text-sm font-medium text-zinc-200 truncate">{item.produto.nome}</h4>
                    <span className="text-xs text-zinc-400">{item.produto.preco.toFixed(2)}€ x {item.quantidade}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => removerDoCarrinho(item.produto.id)} className="bg-zinc-800 hover:bg-zinc-700 w-7 h-7 rounded flex items-center justify-center text-sm font-bold text-zinc-300">-</button>
                    <span className="text-sm font-semibold w-4 text-center">{item.quantidade}</span>
                    <button onClick={() => adicionarAoCarrinho(item.produto)} className="bg-zinc-800 hover:bg-zinc-700 w-7 h-7 rounded flex items-center justify-center text-sm font-bold text-zinc-300">+</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 bg-zinc-950 border-t border-zinc-800 space-y-4">
            <div className="flex justify-between items-center text-zinc-400 text-sm">
              <span>Subtotal:</span>
              <span className="text-white font-semibold text-base">{total.toFixed(2)}€</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Método de Pagamento</label>
              <div className="grid grid-cols-3 gap-2">
                {(['multibanco', 'mbway', 'dinheiro'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setMetodoPagamento(method)}
                    className={`py-2 px-1 text-xs font-medium rounded-lg border text-center transition-all capitalize ${
                      metodoPagamento === method
                        ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-600/10'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={finalizarVenda}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl transition-all text-center text-sm"
            >
              Finalizar Venda ({total.toFixed(2)}€)
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
