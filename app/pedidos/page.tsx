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

  // --- ESTADOS PARA A EDIÇÃO ---
  const [modalEditar, setModalEditar] = useState(false);
  const [pedidoEditando, setPedidoEditando] = useState<Pedido | null>(null);
  const [salvando, setSalvando] = useState(false);

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

  // --- NOVA FUNÇÃO: EXCLUIR PEDIDO ---
  const excluirPedido = async (pedidoId: string) => {
    if (!confirm('⚠️ Tem a certeza que deseja excluir este pedido definitivamente? Esta ação não pode ser desfeita.')) return;
    
    try {
      // É boa prática apagar os itens associados primeiro (caso a base de dados não tenha CASCADE)
      await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoId);
      
      const { error } = await supabase.from('pedidos').delete().eq('id', pedidoId);
      if (error) throw error;
      
      setPedidos(prev => prev.filter(p => p.id !== pedidoId));
    } catch (err: any) {
      alert(`Erro ao excluir pedido: ${err.message}`);
    }
  };

  // --- NOVA FUNÇÃO: ABRIR MODAL DE EDIÇÃO ---
  const abrirEdicao = (pedido: Pedido) => {
    setPedidoEditando({ ...pedido });
    setModalEditar(true);
  };

  // --- NOVA FUNÇÃO: SALVAR EDIÇÃO ---
  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedidoEditando) return;

    setSalvando(true);
    try {
      // Recalcula o Total Geral baseado nas novas taxas ou descontos introduzidos
      const subtotalItens = pedidoEditando.itens?.reduce((acc, item) => acc + (item.quantidade * item.preco_unitario), 0) || 0;
      const novoTotal = Math.max(0, subtotalItens + Number(pedidoEditando.taxa_entrega) - Number(pedidoEditando.desconto));

      const { error } = await supabase
        .from('pedidos')
        .update({
          cliente: pedidoEditando.cliente,
          canal: pedidoEditando.canal,
          forma_pagamento: pedidoEditando.forma_pagamento,
          entregador: pedidoEditando.entregador,
          taxa_entrega: pedidoEditando.taxa_entrega,
          desconto: pedidoEditando.desconto,
          pago: pedidoEditando.pago,
          total_geral: novoTotal
        })
        .eq('id', pedidoEditando.id);

      if (error) throw error;

      setModalEditar(false);
      carregarPedidosEItens(); // Recarrega para garantir que os dados visuais batem certo
    } catch (err: any) {
      alert(`Erro ao salvar edição: ${err.message}`);
    } finally {
      setSalvando(false);
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
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans relative">
      
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
              <div key={ped.id} className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-md hover:border-zinc-700/60 transition-all relative group">
                
                {/* BOTÕES DE EDIÇÃO E EXCLUSÃO (Aparecem no topo do card) */}
                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => abrirEdicao(ped)} className="w-7 h-7 bg-zinc-800 hover:bg-blue-600 rounded-lg flex items-center justify-center text-xs transition-colors" title="Editar Informações">
                    ✏️
                  </button>
                  <button onClick={() => excluirPedido(ped.id)} className="w-7 h-7 bg-zinc-800 hover:bg-red-600 rounded-lg flex items-center justify-center text-xs transition-colors" title="Excluir Pedido">
                    🗑️
                  </button>
                </div>

                <div>
                  {/* Cabeçalho do Card */}
                  <div className="flex justify-between items-start gap-2 border-b border-zinc-800/60 pb-3 mb-3 pr-16">
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

      {/* --- MODAL DE EDIÇÃO --- */}
      {modalEditar && pedidoEditando && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl p-6 shadow-2xl relative">
            <button onClick={() => setModalEditar(false)} className="absolute top-5 right-5 text-zinc-400 hover:text-white">✕</button>
            
            <h2 className="text-xl font-bold text-white mb-6 border-b border-zinc-800 pb-3">
              Editar Pedido #{pedidoEditando.numero_pedido}
            </h2>

            <form onSubmit={salvarEdicao} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Cliente</label>
                  <input 
                    type="text" 
                    required
                    value={pedidoEditando.cliente} 
                    onChange={e => setPedidoEditando({...pedidoEditando, cliente: e.target.value})} 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500 outline-none" 
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Canal</label>
                  <select 
                    value={pedidoEditando.canal} 
                    onChange={e => setPedidoEditando({...pedidoEditando, canal: e.target.value})} 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500 outline-none"
                  >
                    <option value="Balcão">Balcão</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Glovo">Glovo</option>
                    <option value="Palmbites">Palmbites</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Pagamento</label>
                  <select 
                    value={pedidoEditando.forma_pagamento} 
                    onChange={e => setPedidoEditando({...pedidoEditando, forma_pagamento: e.target.value})} 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500 outline-none"
                  >
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="MBWay">MBWay</option>
                    <option value="Multibanco">Multibanco</option>
                    <option value="Dinheiro Glovo">Dinheiro Glovo</option>
                    <option value="Glovo">Faturamento Glovo</option>
                    <option value="Caderninho">Caderninho</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Estado do Pagamento</label>
                  <select 
                    value={pedidoEditando.pago ? 'true' : 'false'} 
                    onChange={e => setPedidoEditando({...pedidoEditando, pago: e.target.value === 'true'})} 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500 outline-none"
                  >
                    <option value="true">Pago</option>
                    <option value="false">Pendente</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Entregador</label>
                  <input 
                    type="text" 
                    value={pedidoEditando.entregador || ''} 
                    onChange={e => setPedidoEditando({...pedidoEditando, entregador: e.target.value})} 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500 outline-none"
                    placeholder="Nome do estafeta"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Taxa de Entrega (€)</label>
                  <input 
                    type="number" step="0.01" min="0" 
                    value={pedidoEditando.taxa_entrega} 
                    onChange={e => setPedidoEditando({...pedidoEditando, taxa_entrega: parseFloat(e.target.value) || 0})} 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-orange-400 font-bold focus:border-orange-500 outline-none" 
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Desconto (€)</label>
                  <input 
                    type="number" step="0.01" min="0" 
                    value={pedidoEditando.desconto} 
                    onChange={e => setPedidoEditando({...pedidoEditando, desconto: parseFloat(e.target.value) || 0})} 
                    className="w-full bg-zinc-950 border border-red-900/50 rounded-xl px-3 py-2 text-sm text-red-400 font-bold focus:border-red-500 outline-none" 
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800 mt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setModalEditar(false)} 
                  className="px-5 py-2.5 text-sm font-bold text-zinc-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={salvando}
                  className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {salvando ? 'A Guardar...' : 'Guardar Alterações'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}
