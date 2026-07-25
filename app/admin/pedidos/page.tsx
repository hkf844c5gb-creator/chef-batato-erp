'use client';

import { useState, useEffect, useMemo } from 'react';
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
  ids_fragmentados?: string[]; 
}

export default function GestaoPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

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
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          *,
          itens:itens_pedido (*)
        `)
        .order('numero_pedido', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const agrupados = new Map<string, Pedido>();

        data.forEach((linha: any) => {
          const chaveNum = String(linha.numero_pedido); 
          const taxa = Number(linha.taxa_entrega || 0);
          const desconto = Number(linha.desconto || 0);

          const itensDestaLinha = (linha.itens || []).map((item: any) => {
            let precoUnitarioCorreto = Number(item.preco_unitario || 0);

            if (linha.canal === 'Revendedores') {
              const nomeProduto = (item.nome_produto || '').toLowerCase();
              if (nomeProduto.includes('fudge') || nomeProduto.includes('new york')) {
                precoUnitarioCorreto = 1.70;
              } else {
                precoUnitarioCorreto = 2.70;
              }
            }

            return {
              id: item.id,
              codigo_produto: item.codigo_produto || '',
              nome_produto: item.nome_produto || '',
              quantidade: Number(item.quantidade || 1),
              preco_unitario: precoUnitarioCorreto
            };
          });

          if (!agrupados.has(chaveNum)) {
            agrupados.set(chaveNum, {
              ...linha,
              numero_pedido: Number(linha.numero_pedido),
              taxa_entrega: taxa,
              desconto: desconto,
              pago: linha.pago === true,
              itens: [...itensDestaLinha],
              ids_fragmentados: [linha.id] 
            });
          } else {
            const existente = agrupados.get(chaveNum)!;
            
            existente.itens?.push(...itensDestaLinha);
            existente.ids_fragmentados?.push(linha.id);
            
            if (!existente.entregador && linha.entregador) {
              existente.entregador = linha.entregador;
            }
            if (!existente.cliente && linha.cliente) {
              existente.cliente = linha.cliente;
            }
            if (linha.pago === true) {
              existente.pago = true;
            }

            existente.taxa_entrega = Math.max(existente.taxa_entrega, taxa);
            existente.desconto = Math.max(existente.desconto, desconto);
          }
        });

        const pedidosFormatados = Array.from(agrupados.values()).map(ped => {
          const subtotalItens = (ped.itens || []).reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
          ped.total_geral = subtotalItens + ped.taxa_entrega - ped.desconto;
          return ped;
        }).sort((a, b) => b.numero_pedido - a.numero_pedido);

        setPedidos(pedidosFormatados);
      } else {
        setPedidos([]);
      }
    } catch (err) {
      console.error('Erro ao carregar os pedidos:', err);
    } finally {
      setLoading(false);
    }
  }

  const liquidarCaderninho = async (pedidoNum: number) => {
    try {
      const { error } = await supabase
        .from('pedidos')
        .update({ pago: true })
        .eq('numero_pedido', pedidoNum);

      if (error) throw error;
      setPedidos(prev => prev.map(p => p.numero_pedido === pedidoNum ? { ...p, pago: true } : p));
    } catch (err) {
      console.error(err);
      alert('Erro ao liquidar pagamento.');
    }
  };

  const excluirPedido = async (pedidoNum: number, ids: string[]) => {
    if (!confirm(`⚠️ Tem a certeza que deseja excluir definitivamente o pedido #${pedidoNum}?`)) return;
    
    try {
      await supabase.from('itens_pedido').delete().in('pedido_id', ids);
      
      const { error } = await supabase.from('pedidos').delete().in('id', ids);
      if (error) throw error;
      
      setPedidos(prev => prev.filter(p => p.numero_pedido !== pedidoNum));
    } catch (err: any) {
      alert(`Erro ao excluir pedido: ${err.message}`);
    }
  };

  const abrirEdicao = (pedido: Pedido) => {
    setPedidoEditando({ ...pedido });
    setModalEditar(true);
  };

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedidoEditando) return;

    setSalvando(true);
    try {
      const subtotalItens = pedidoEditando.itens?.reduce((acc, item) => acc + (item.quantidade * item.preco_unitario), 0) || 0;
      const novoTotal = Math.max(0, subtotalItens + Number(pedidoEditando.taxa_entrega) - Number(pedidoEditando.desconto));

      const { error: erroPrincipal } = await supabase
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

      if (erroPrincipal) throw erroPrincipal;

      if (pedidoEditando.ids_fragmentados && pedidoEditando.ids_fragmentados.length > 1) {
        await supabase
          .from('pedidos')
          .update({
            taxa_entrega: 0,
            desconto: 0,
            total_geral: 0,
            pago: pedidoEditando.pago 
          })
          .eq('numero_pedido', pedidoEditando.numero_pedido)
          .neq('id', pedidoEditando.id);
      }

      setModalEditar(false);
      carregarPedidosEItens(); 
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

  // 🎯 EXTRATOR DE DATA UNIVERSAL (Lida com qualquer formato vindo da BD)
  const extrairDataIso = (valor: string) => {
    if (!valor) return '';
    // Procura o padrão YYYY-MM-DD independentemente de haver horas a seguir
    const match = valor.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    return '';
  };

  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((pedido) => {
      const dataPedidoFormatada = extrairDataIso(pedido.data_venda);
      
      // Se o pedido não tiver data legível, passamos para não o ocultar acidentalmente
      if (!dataPedidoFormatada) return true;

      if (dataInicio && dataPedidoFormatada < dataInicio) return false;
      if (dataFim && dataPedidoFormatada > dataFim) return false;

      return true;
    });
  }, [pedidos, dataInicio, dataFim]);

  const limparFiltroDatas = () => {	
    setDataInicio('');
    setDataFim('');
  };

  const selecionarHoje = () => {
    const hojeIso = new Date().toISOString().split('T')[0];
    setDataInicio(hojeIso);
    setDataFim(hojeIso);
  };

  const faturamentoTotal = pedidosFiltrados.reduce((acc, p) => acc + p.total_geral, 0);
  const totalDescontos = pedidosFiltrados.reduce((acc, p) => acc + p.desconto, 0);
  const pendenteCaderninho = pedidosFiltrados.filter(p => !p.pago).reduce((acc, p) => acc + p.total_geral, 0);

  const getCorCanal = (canal: string) => {
    if (canal === 'Glovo') return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    if (canal === 'WhatsApp') return 'bg-green-500/10 text-green-500 border-green-500/20';
    if (canal === 'Palmbites') return 'bg-teal-500/10 text-teal-500 border-teal-500/20';
    if (canal === 'Revendedores') return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    return 'bg-zinc-500/10 text-zinc-400 border-zinc-800';
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans relative">
      
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

      {/* 📅 SECÇÃO DE FILTROS POR DATA */}
      <section className="px-6 pt-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex flex-col xl:flex-row xl:items-end gap-4">
            <div className="flex-1">
              <h2 className="text-sm font-bold text-zinc-100">Filtrar por Intervalo de Datas</h2>
              <p className="text-xs text-zinc-500 mt-1">Selecione o dia, mês e ano inicial até ao dia, mês e ano final.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full xl:w-auto">
              <div>
                <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">De (Data Inicial)</label>
                <input
                  type="date"
                  value={dataInicio}
                  max={dataFim || undefined}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="w-full sm:w-48 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:border-orange-500 outline-none [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">Até (Data Final)</label>
                <input
                  type="date"
                  value={dataFim}
                  min={dataInicio || undefined}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="w-full sm:w-48 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:border-orange-500 outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selecionarHoje}
                className="bg-orange-600 hover:bg-orange-500 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={limparFiltroDatas}
                disabled={!dataInicio && !dataFim}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold px-4 py-2.5 rounded-xl border border-zinc-700 transition-all"
              >
                Limpar Filtro
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-800 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
            <span><strong className="text-white">{pedidosFiltrados.length}</strong> pedidos encontrados no período</span>
            {(dataInicio || dataFim) && (
              <span>
                Mostrando de <strong className="text-orange-400">{dataInicio || 'início'}</strong> até <strong className="text-orange-400">{dataFim || 'hoje'}</strong>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* MÉTRICAS / RESUMO */}
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

      <main className="flex-1 px-6 pb-6 overflow-y-auto">
        {loading ? (
          <div className="text-center text-zinc-500 py-24">A carregar registos...</div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="text-center text-zinc-500 py-24 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl max-w-xl mx-auto">
            {pedidos.length === 0
              ? 'Nenhum pedido lançado no sistema até ao momento.'
              : 'Nenhum pedido encontrado dentro do intervalo de datas selecionado.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pedidosFiltrados.map((ped) => (
              <div key={ped.id} className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-md hover:border-zinc-700/60 transition-all relative group">
                
                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => abrirEdicao(ped)} className="w-7 h-7 bg-zinc-800 hover:bg-blue-600 rounded-lg flex items-center justify-center text-xs transition-colors" title="Editar Informações">
                    ✏️
                  </button>
                  <button onClick={() => excluirPedido(ped.numero_pedido, ped.ids_fragmentados!)} className="w-7 h-7 bg-zinc-800 hover:bg-red-600 rounded-lg flex items-center justify-center text-xs transition-colors" title="Excluir Pedido">
                    🗑️
                  </button>
                </div>

                <div>
                  <div className="flex justify-between items-start gap-2 border-b border-zinc-800/60 pb-3 mb-3 pr-16">
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500">#{ped.numero_pedido} · {ped.data_venda}</span>
                      <h3 className="font-bold text-zinc-100 text-sm mt-0.5">{ped.cliente || 'Cliente Anónimo'}</h3>
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

                  {!ped.pago && (
                    <button 
                      onClick={() => liquidarCaderninho(ped.numero_pedido)} 
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

      {/* MODAL DE EDIÇÃO */}
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
                    value={pedidoEditando.cliente || ''} 
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
                    <option value="Revendedores">Revendedores</option>
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