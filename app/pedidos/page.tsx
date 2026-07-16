'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface ItemPedido {
  id: string;
  codigo_produto: string;
  nome_produto: string;
  quantidade: number;
  preco_unitario: number;
}

interface Pedido {
  id: string;
  numero_pedido: number;
  data_venda: string;
  cliente: string;
  canal: string;
  forma_pagamento: string;
  entregador: string;
  taxa_entrega: number;
  desconto: number;
  total_geral: number;
  pago: boolean;
  itens?: ItemPedido[];
}

export default function GestaoPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function carregarPedidosEItens() {
    setLoading(true);
    try {
      const { data: dataPedidos, error: errorPedidos } = await supabase
        .from('pedidos')
        .select('*')
        .order('numero_pedido', { ascending: false });

      if (errorPedidos) throw errorPedidos;

      if (dataPedidos && dataPedidos.length > 0) {
        const { data: dataItens, error: errorItens } = await supabase
          .from('itens_pedido')
          .select('*');

        if (errorItens) throw errorItens;

        const pedidosComItens = dataPedidos.map((pedido: any) => {
          const filtrados = dataItens ? dataItens.filter((item: any) => item.pedido_id === pedido.id) : [];
          return {
            ...pedido,
            taxa_entrega: Number(pedido.taxa_entrega || 0),
            desconto: Number(pedido.desconto || 0),
            total_geral: Number(pedido.total_geral || 0),
            pago: pedido.pago === true,
            itens: filtrados.map((item: any) => ({
              id: item.id,
              codigo_produto: item.codigo_produto || '',
              nome_produto: item.nome_produto || '',
              quantidade: Number(item.quantidade || 1),
              preco_unitario: Number(item.preco_unitario || 0)
            }))
          };
        });

        setPedidos(pedidosComItens);
      } else {
        setPedidos([]);
      }
    } catch (err) {
      console.error('Erro ao carregar os pedidos:', err);
    } finally {
      setLoading(false);
    }
  }

  const liquidarCaderninho = async (pedidoId: string) => {
    try {
      const { error } = await supabase
        .from('pedidos')
        .update({ pago: true })
        .eq('id', pedidoId);

      if (error) throw error;
      setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, pago: true } : p));
    } catch (err) {
      console.error(err);
      alert('Erro ao liquidar pagamento.');
    }
  };

  useEffect(() => {
    carregarPedidosEItens();

    const canalAtualizacao = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        carregarPedidosEItens();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canalAtualizacao);
    };
  }, []);

  // Métricas rápidas da noite
  const faturamentoTotal = pedidos.reduce((acc, p) => acc + p.total_geral, 0);
  const totalDescontos = pedidos.reduce((acc, p) => acc + p.desconto, 0);
  const pendenteCaderninho = pedidos.filter(p => !p.pago).reduce((acc, p) => acc + p.total_geral, 0);

  const getCorCanal = (canal: string) => {
    if (canal === 'Glovo') return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    if (canal === 'WhatsApp') return 'bg-green-500/10 text-green-500 border-green-500/20';
    if (canal === 'Palmbites') return 'bg-teal-500/10 text-teal-500 border-teal-500/20';
    return 'bg-zinc-500/10 text-zinc-400 border-zinc-800';
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
      
      {/* Topo do Painel */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📓</span>
          <h1 className="text-xl font-bold tracking-wide">Registo e Controlo de Vendas</h1>
        </div>
        <button 
          onClick={carregarPedidosEItens}
          className="bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold px-4 py-2 rounded-xl border border-zinc-700 transition-all"
        >
          🔄 Sincronizar Dados
        </button>
      </header>

      {/* Painel de Indicadores Rápidos */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-xl flex justify-between items-center">
          <div><span className="text-[10px] text-zinc-400 uppercase font-black">Faturamento Bruto</span><p className="text-2xl font-black mt-1">{faturamentoTotal.toFixed(2)}€</p></div>
          <span className="text-2xl">💰</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-xl flex justify-between items-center">
          <div><span className="text-[10px] text-zinc-400 uppercase font-black">Descontos Aplicados</span><p className="text-2xl font-black mt-1 text-red-400">{totalDescontos.toFixed(2)}€</p></div>
          <span className="text-2xl">🎟️</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-xl flex justify-between items-center">
          <div><span className="text-[10px] text-zinc-400 uppercase font-black">Em Falta (Caderninho)</span><p className="text-2xl font-black mt-1 text-orange-400">{pendenteCaderninho.toFixed(2)}€</p></div>
          <span className="text-2xl">✏️</span>
        </div>
      </div>

      {/* Grid de Cards das Vendas */}
      <main className="flex-1 px-6 pb-6 overflow-y-auto">
        {loading ? (
          <div className="text-center text-zinc-500 py-24">A carregar registos...</div>
        ) : pedidos.length === 0 ? (
          <div className="text-center text-zinc-500 py-24 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl max-w-xl mx-auto">
            Nenhum pedido lançado no sistema até ao momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pedidos.map((ped) => (
              <div key={ped.id} className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-md hover:border-zinc-700/60 transition-all">
                
                <div>
                  {/* Cabeçalho do Card */}
                  <div className="flex justify-between items-start gap-2 border-b border-zinc-800/60 pb-3 mb-3">
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500">#{ped.numero_pedido}</span>
                      <h3 className="font-bold text-zinc-100 text-sm mt-0.5">{ped.cliente}</h3>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${getCorCanal(ped.canal)}`}>
                        {ped.canal}
                      </span>
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${ped.pago ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {ped.pago ? 'Pago' : 'Pendente'}
                      </span>
                    </div>
                  </div>

                  {/* Lista de Itens internos */}
                  <div className="space-y-2 mb-4">
                    {ped.itens && ped.itens.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs text-zinc-300">
                        <span className="line-clamp-1 pr-2">
                          <span className="font-bold text-orange-400 mr-1.5">{item.quantidade}x</span>
                          {item.nome_produto}
                        </span>
                        <span className="font-mono text-zinc-500 text-[11px]">{(item.preco_unitario * item.quantidade).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rodapé Dinâmico do Card */}
                <div className="border-t border-zinc-800/60 pt-3 mt-2 space-y-2 text-xs text-zinc-400">
                  <div className="flex justify-between text-[11px]">
                    <span>Pagamento: <span className="text-zinc-200 font-medium">{ped.forma_pagamento}</span></span>
                    {ped.taxa_entrega > 0 && <span>Entrega: {ped.taxa_entrega.toFixed(2)}€</span>}
                  </div>
                  
                  {ped.desconto > 0 && (
                    <div className="flex justify-between text-[11px] text-red-400">
                      <span>Desconto Aplicado:</span>
                      <span>-{ped.desconto.toFixed(2)}€</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t border-zinc-800/40 pt-2">
                    <span className="text-[11px]">Estafeta: <span className="text-zinc-300 font-medium">{ped.entregador || 'Nenhum'}</span></span>
                    <span className="text-base font-black text-orange-500">{ped.total_geral.toFixed(2)}€</span>
                  </div>

                  {/* Botão de liquidação de Caderninho */}
                  {!ped.pago && (
                    <button 
                      onClick={() => liquidarCaderninho(ped.id)} 
                      className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold py-1.5 rounded-lg transition-all"
                    >
                      ✓ Recebido (Confirmar Pagamento)
                    </button>
                  )}
                </div>

              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
