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
  cliente: string;
  contacto_cliente: string;
  canal: 'Balcão' | 'WhatsApp' | 'Glovo' | 'Palmbites';
  forma_pagamento: string;
  entregador: string;
  taxa_entrega: number;
  desconto: number;
  total_geral: number;
  pago: boolean;
  criado_em: string;
  itens_pedido?: ItemPedido[];
}

export default function RelatoriosFaturacao() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidosFiltrados, setPedidosFiltrados] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroDB, setErroDB] = useState<string | null>(null);

  // Filtros Existentes
  const [filtroData, setFiltroData] = useState<'hoje' | '7dias' | 'mes' | 'todos'>('hoje');
  const [filtroCanal, setFiltroCanal] = useState<string>('todos');
  const [filtroPagamento, setFiltroPagamento] = useState<string>('todos');
  
  // NOVOS FILTROS: Busca e Ordenação (Inicia em 'za' por padrão)
  const [termoBusca, setTermoBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<'recente' | 'antigo' | 'az' | 'za'>('za');
  
  const [pedidoExpandidoId, setPedidoExpandidoId] = useState<string | null>(null);

  // Estados para o Modal de Edição Financeira
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const [pedidoSendoEditado, setPedidoSendoEditado] = useState<Pedido | null>(null);
  
  const [editCliente, setEditCliente] = useState('');
  const [editCanal, setEditCanal] = useState<'Balcão' | 'WhatsApp' | 'Glovo' | 'Palmbites'>('Balcão');
  const [editPagamento, setEditPagamento] = useState('');
  const [editTotal, setEditTotal] = useState(0);
  const [editPago, setEditPago] = useState(false);

  // Função: Limpa "Pedido #339.0 (Histórico)" e devolve apenas "339"
  const limparNomePedido = (nome: string) => {
    const match = nome.match(/Pedido\s*#?(\d+)/i);
    if (match) return match[1]; 
    return nome;
  };

  async function carregarRelatorios() {
    setLoading(true);
    setErroDB(null);

    const { data: pedidosData, error: errPed } = await supabase
      .from('pedidos')
      .select('*')
      .order('criado_em', { ascending: false });

    if (errPed) {
      setErroDB(`Falha na tabela 'pedidos': ${errPed.message}`);
      setLoading(false);
      return;
    }

    const { data: itensData, error: errItens } = await supabase
      .from('itens_pedido')
      .select('*');

    if (errItens) {
      setErroDB(`Falha na tabela 'itens_pedido': ${errItens.message}`);
      setLoading(false);
      return;
    }

    const pedidosMapeados = (pedidosData || []).map((p: any) => ({
      ...p,
      itens_pedido: (itensData || []).filter((i: any) => i.pedido_id === p.id)
    }));

    setPedidos(pedidosMapeados);
    setLoading(false);
  }

  useEffect(() => {
    carregarRelatorios();
  }, []);

  // Aplicação de filtros e Ordenação
  useEffect(() => {
    let resultado = [...pedidos];
    const agora = new Date();
    
    // 1. Filtro de Data
    resultado = resultado.filter(p => {
      const dataPedido = new Date(p.criado_em);
      if (filtroData === 'hoje') return dataPedido.toDateString() === agora.toDateString();
      if (filtroData === '7dias') {
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(agora.getDate() - 7);
        return dataPedido >= seteDiasAtras;
      }
      if (filtroData === 'mes') return dataPedido.getMonth() === agora.getMonth() && dataPedido.getFullYear() === agora.getFullYear();
      return true;
    });

    // 2. Filtros de Dropdown
    if (filtroCanal !== 'todos') resultado = resultado.filter(p => p.canal === filtroCanal);
    if (filtroPagamento !== 'todos') resultado = resultado.filter(p => p.forma_pagamento === filtroPagamento);

    // 3. Filtro de Busca
    if (termoBusca.trim() !== '') {
      const termo = termoBusca.toLowerCase();
      resultado = resultado.filter(p => {
        const nomeLimpo = limparNomePedido(p.cliente).toLowerCase();
        return nomeLimpo.includes(termo) || p.cliente.toLowerCase().includes(termo);
      });
    }

    // 4. Ordenação (Incluindo a lógica de Z a A)
    resultado.sort((a, b) => {
      if (ordenacao === 'recente') return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
      if (ordenacao === 'antigo') return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
      if (ordenacao === 'az') return limparNomePedido(a.cliente).localeCompare(limparNomePedido(b.cliente), undefined, { numeric: true });
      if (ordenacao === 'za') return limparNomePedido(b.cliente).localeCompare(limparNomePedido(a.cliente), undefined, { numeric: true });
      return 0;
    });

    setPedidosFiltrados(resultado);
  }, [pedidos, filtroData, filtroCanal, filtroPagamento, termoBusca, ordenacao]);

  // FUNÇÕES DE MANUTENÇÃO
  const abrirModalEdicao = (pedido: Pedido) => {
    setPedidoSendoEditado(pedido);
    setEditCliente(pedido.cliente); 
    setEditCanal(pedido.canal);
    setEditPagamento(pedido.forma_pagamento);
    setEditTotal(pedido.total_geral);
    setEditPago(pedido.pago);
    setModalEdicaoAberto(true);
  };

  const salvarAlteracoesFinanceiras = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedidoSendoEditado) return;

    try {
      const { error } = await supabase.from('pedidos').update({
        cliente: editCliente,
        canal: editCanal,
        forma_pagamento: editPagamento,
        total_geral: Number(editTotal),
        pago: editPago
      }).eq('id', pedidoSendoEditado.id);

      if (error) throw error;

      alert('Lançamento financeiro corrigido com sucesso!');
      setModalEdicaoAberto(false);
      carregarRelatorios();
    } catch (err: any) {
      alert(`Erro ao atualizar lançamento: ${err.message}`);
    }
  };

  const excluirRegistroCaixa = async (id: string) => {
    if (!confirm('💥 ATENÇÃO: Deseja mesmo eliminar este registo de forma definitiva? Isto irá abater o valor do fluxo de caixa.')) return;
    try {
      const { error } = await supabase.from('pedidos').delete().eq('id', id);
      if (error) throw error;
      setPedidoExpandidoId(null);
      carregarRelatorios();
    } catch (err: any) {
      alert(`Erro ao eliminar registo: ${err.message}`);
    }
  };

  // Métricas
  const totalFaturado = pedidosFiltrados.reduce((acc, p) => acc + Number(p.total_geral), 0);
  const totalRecebido = pedidosFiltrados.filter(p => p.pago).reduce((acc, p) => acc + Number(p.total_geral), 0);
  const totalPendente = pedidosFiltrados.filter(p => !p.pago).reduce((acc, p) => acc + Number(p.total_geral), 0);
  const totalTaxasEntrega = pedidosFiltrados.reduce((acc, p) => acc + Number(p.taxa_entrega), 0);

  const faturamentoPorMetodo = pedidosFiltrados.reduce((acc: { [key: string]: number }, p) => {
    acc[p.forma_pagamento] = (acc[p.forma_pagamento] || 0) + Number(p.total_geral);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24">
      
      {/* HEADER PREMIUM */}
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-4 flex justify-between items-center transition-all">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
            <span className="text-xl">📊</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Relatórios</h1>
            <p className="text-[10px] text-zinc-400 font-medium">Auditoria de Caixa</p>
          </div>
        </div>
        <button onClick={carregarRelatorios} className="w-10 h-10 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center rounded-full transition-transform active:scale-90">
          <span className="text-lg">🔄</span>
        </button>
      </header>

      {erroDB && (
        <div className="m-5 bg-red-950/40 border border-red-900 p-5 rounded-[24px]">
          <h2 className="text-red-500 font-bold text-sm uppercase tracking-wider mb-2">⚠️ Erro de Ligação</h2>
          <code className="block bg-black/50 p-3 rounded-lg text-red-400 font-mono text-xs">{erroDB}</code>
        </div>
      )}

      <main className="flex-1 p-5 space-y-6">
        
        {/* DASHBOARD DESLIZANTE */}
        {!erroDB && (
          <div className="flex gap-4 overflow-x-auto snap-x no-scrollbar pb-2 -mx-5 px-5">
            <div className="snap-center min-w-[160px] flex-1 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-5 rounded-3xl shadow-xl flex flex-col justify-between relative overflow-hidden">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest relative z-10">Faturado Total</span>
              <span className="text-2xl font-black text-white font-mono mt-2 relative z-10 tracking-tighter">{totalFaturado.toFixed(2)}<span className="text-sm text-blue-400 ml-0.5">€</span></span>
            </div>
            <div className="snap-center min-w-[160px] flex-1 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-5 rounded-3xl shadow-xl flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
              <span className="text-[10px] font-bold text-green-500/80 uppercase tracking-widest relative z-10">Caixa Realizado</span>
              <span className="text-2xl font-black text-green-400 font-mono mt-2 relative z-10 tracking-tighter">{totalRecebido.toFixed(2)}<span className="text-sm text-green-500/50 ml-0.5">€</span></span>
            </div>
            <div className="snap-center min-w-[160px] flex-1 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-5 rounded-3xl shadow-xl flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
              <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest relative z-10">Fiado Pendente</span>
              <span className="text-2xl font-black text-red-400 font-mono mt-2 relative z-10 tracking-tighter">{totalPendente.toFixed(2)}<span className="text-sm text-red-500/50 ml-0.5">€</span></span>
            </div>
            <div className="snap-center min-w-[160px] flex-1 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-5 rounded-3xl shadow-xl flex flex-col justify-between relative overflow-hidden">
              <span className="text-[10px] font-bold text-orange-500/80 uppercase tracking-widest relative z-10">Custos Entrega</span>
              <span className="text-2xl font-black text-orange-400 font-mono mt-2 relative z-10 tracking-tighter">{totalTaxasEntrega.toFixed(2)}<span className="text-sm text-orange-500/50 ml-0.5">€</span></span>
            </div>
          </div>
        )}

        {/* ÁREA DE FILTROS MODERNIZADA */}
        {!erroDB && (
          <div className="bg-zinc-900/40 p-5 rounded-3xl border border-zinc-800/60 space-y-5">
            
            {/* Linha 1: Tempo e Busca */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">Período Analisado</span>
                <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 overflow-x-auto no-scrollbar">
                  {(['hoje', '7dias', 'mes', 'todos'] as const).map(periodo => (
                    <button 
                      key={periodo} 
                      onClick={() => setFiltroData(periodo)} 
                      className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filtroData === periodo ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      {periodo === '7dias' ? '7 Dias' : periodo}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">Filtrar por Número do Pedido</span>
                <input 
                  type="text" 
                  placeholder="Introduza o número do pedido..." 
                  value={termoBusca}
                  onChange={e => setTermoBusca(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs font-bold text-zinc-200 outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Linha 2: Dropdowns de Filtro e Ordenação */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-zinc-800/50">
              <div>
                <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Origem</span>
                <select value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none focus:border-blue-500">
                  <option value="todos">Todos</option>
                  <option value="Balcão">Balcão</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Glovo">Glovo</option>
                  <option value="Palmbites">Palmbites</option>
                </select>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Pagamento</span>
                <select value={filtroPagamento} onChange={e => setFiltroPagamento(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none focus:border-blue-500">
                  <option value="todos">Todos</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="MBWay">MBWay</option>
                  <option value="Multibanco">Multibanco</option>
                  <option value="Glovo">Glovo</option>
                  <option value="Caderninho">Caderninho</option>
                </select>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Ordenação</span>
                <select value={ordenacao} onChange={e => setOrdenacao(e.target.value as any)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none focus:border-blue-500">
                  <option value="za">Alfabética (Z-A) · Padrão</option>
                  <option value="az">Alfabética (A-Z)</option>
                  <option value="recente">Mais Recentes</option>
                  <option value="antigo">Mais Antigos</option>
                </select>
              </div>
            </div>

          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* HISTÓRICO DE LANÇAMENTOS */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center pl-1">
              <h3 className="text-sm font-black uppercase text-zinc-300 tracking-wider">📦 Lançamentos ({pedidosFiltrados.length})</h3>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="text-center p-10 text-zinc-500 text-sm animate-pulse">A carregar fluxo financeiro...</div>
              ) : pedidosFiltrados.length === 0 ? (
                <div className="text-center p-10 bg-zinc-900/30 rounded-3xl border border-zinc-800/50 text-zinc-500 text-sm">
                  Nenhuma venda encontrada para os filtros atuais.
                </div>
              ) : (
                pedidosFiltrados.map(p => {
                  const isExpanded = pedidoExpandidoId === p.id;
                  const dataFormatada = new Date(p.criado_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
                  const horaFormatada = new Date(p.criado_em).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                  
                  // Aplica a limpeza do nome para exibir apenas o numeral do pedido!
                  const nomeApresentacao = limparNomePedido(p.cliente);

                  return (
                    <div key={p.id} className="bg-zinc-900/60 border border-zinc-800/60 rounded-[24px] overflow-hidden transition-all">
                      
                      {/* CABEÇALHO DO CARTÃO */}
                      <div 
                        onClick={() => setPedidoExpandidoId(isExpanded ? null : p.id)} 
                        className="p-4 cursor-pointer hover:bg-zinc-800/40 transition-colors flex items-center justify-between"
                      >
                        <div className="flex gap-4 items-center">
                          <div className="flex flex-col items-center justify-center bg-zinc-950 border border-zinc-800 rounded-xl w-14 h-14 flex-shrink-0">
                            <span className="text-[10px] uppercase font-black text-zinc-500">{dataFormatada.split(' ')[1]}</span>
                            <span className="text-lg font-black text-zinc-200 leading-none">{dataFormatada.split(' ')[0]}</span>
                          </div>
                          <div>
                            <p className="font-mono font-black text-white text-lg tracking-tight">
                              {nomeApresentacao}
                            </p>
                            <p className="text-[10px] text-zinc-400 font-mono mt-1 flex gap-2 items-center">
                              <span>{horaFormatada}</span>
                              <span className="w-1 h-1 bg-zinc-600 rounded-full"></span>
                              <span className="uppercase text-blue-400 font-bold tracking-wider">{p.canal}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <span className="font-black text-white font-mono text-lg">{p.total_geral.toFixed(2)}€</span>
                          {p.pago ? (
                            <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">Pago</span>
                          ) : (
                            <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-widest animate-pulse">Pendente</span>
                          )}
                        </div>
                      </div>

                      {/* CORPO EXPANDIDO */}
                      {isExpanded && (
                        <div className="bg-zinc-950/80 p-4 border-t border-zinc-800/50">
                          
                          <div className="space-y-2 mb-4">
                            {p.itens_pedido && p.itens_pedido.length > 0 ? (
                              p.itens_pedido.map(item => (
                                <div key={item.id} className="flex justify-between items-center text-xs">
                                  <span className="text-zinc-300 font-medium"><span className="text-zinc-500 mr-2">{item.quantidade}x</span> {item.nome_produto}</span>
                                  <span className="text-zinc-500 font-mono">{(item.quantidade * item.preco_unitario).toFixed(2)}€</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-[10px] text-zinc-500 italic">Sem detalhes de produtos.</p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 font-mono bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50 mb-4">
                            <div><span className="text-zinc-600">Pagamento:</span> <span className="text-zinc-200">{p.forma_pagamento}</span></div>
                            <div><span className="text-zinc-600">Estafeta:</span> <span className="text-zinc-200">{p.entregador || 'N/A'}</span></div>
                            <div><span className="text-zinc-600">Taxa Ent.:</span> <span className="text-zinc-200">{p.taxa_entrega.toFixed(2)}€</span></div>
                            <div><span className="text-zinc-600">Desconto:</span> <span className="text-red-400">{p.desconto.toFixed(2)}€</span></div>
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button onClick={() => abrirModalEdicao(p)} className="bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors">
                              ✏️ Editar
                            </button>
                            <button onClick={() => excluirRegistroCaixa(p.id)} className="bg-red-950/30 hover:bg-red-900/50 text-red-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors border border-red-900/30">
                              🗑️ Apagar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* PAINEL LATERAL: APURAMENTO CAIXA */}
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/60 rounded-[32px] p-6 flex flex-col gap-4 shadow-2xl h-fit">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200 flex items-center gap-2"><span className="text-xl">💰</span> Apuramento Físico</h3>
              <p className="text-[10px] text-zinc-500 mt-1 font-medium">Verifique os montantes da sua gaveta ou conta bancária.</p>
            </div>

            <div className="divide-y divide-zinc-800/40">
              {Object.keys(faturamentoPorMetodo).length === 0 ? (
                <p className="text-zinc-600 italic py-6 text-center text-xs">Sem valores registados.</p>
              ) : (
                Object.entries(faturamentoPorMetodo).map(([metodo, valor]) => (
                  <div key={metodo} className="py-3.5 flex justify-between items-center">
                    <span className="text-zinc-300 text-sm font-bold flex items-center gap-2">
                      <span className="text-zinc-500">{metodo === 'Caderninho' ? '📓' : '💳'}</span> {metodo}
                    </span>
                    <span className="font-black font-mono text-white text-lg">{valor.toFixed(2)}€</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 📱 MODAL AUTOMÁTICO DE EDICÃO */}
      {modalEdicaoAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex flex-col justify-end md:justify-center items-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 w-full md:max-w-sm rounded-t-[32px] md:rounded-[32px] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
            
            <div className="p-5 pb-4 flex justify-between items-center border-b border-zinc-800/50">
              <div>
                <h2 className="text-lg font-black text-white leading-none">Corrigir Lançamento</h2>
                <span className="text-[10px] text-zinc-500 font-mono mt-1 block">Ref: {pedidoSendoEditado?.id.substring(0,8)}</span>
              </div>
              <button onClick={() => setModalEdicaoAberto(false)} className="bg-zinc-800 p-2 rounded-full w-8 h-8 flex items-center justify-center text-zinc-400 font-bold hover:text-white">✕</button>
            </div>

            <form onSubmit={salvarAlteracoesFinanceiras} className="p-6 space-y-5 text-sm">
              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Pedido / Identificação</label>
                <input required type="text" value={editCliente} onChange={e => setEditCliente(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors font-medium font-mono" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Origem</label>
                  <select value={editCanal} onChange={e => setEditCanal(e.target.value as any)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-3 text-white outline-none focus:border-blue-500 appearance-none font-medium">
                    <option value="Balcão">Balcão</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Glovo">Glovo</option>
                    <option value="Palmbites">Palmbites</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Método</label>
                  <select value={editPagamento} onChange={e => setEditPagamento(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-3 text-white outline-none focus:border-blue-500 appearance-none font-medium">
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="MBWay">MBWay</option>
                    <option value="Multibanco">Multibanco</option>
                    <option value="Glovo">Glovo</option>
                    <option value="Dinheiro Glovo">Dinh. Glovo</option>
                    <option value="Caderninho">Caderninho</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Valor Faturado (€)</label>
                <input required type="number" step="0.01" min="0" value={editTotal} onChange={e => setEditTotal(parseFloat(e.target.value) || 0)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-lg font-black text-blue-400 font-mono outline-none focus:border-blue-500" />
              </div>

              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex justify-between items-center cursor-pointer" onClick={() => setEditPago(!editPago)}>
                <div>
                  <p className="font-bold text-zinc-200">Status do Recebimento</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">O dinheiro já entrou em caixa?</p>
                </div>
                <div className={`px-4 py-2 rounded-xl font-black uppercase tracking-wider text-[10px] transition-all ${editPago ? 'bg-green-500 text-zinc-950 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                  {editPago ? '✔️ Realizado' : '⏳ Pendente'}
                </div>
              </div>

              <div className="pt-4 pb-2">
                <button type="submit" className="w-full bg-white hover:bg-zinc-200 active:bg-zinc-300 text-zinc-950 py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95">
                  Confirmar Correção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
