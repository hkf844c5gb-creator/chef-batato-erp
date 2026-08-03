'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface ItemPedido {
  id: string;
  nome_produto: string;
  quantidade: number;
  preco_unitario: number;
}

interface PedidoDetalhado {
  id: string;
  numero_pedido: string;
  cliente: string;
  contacto_cliente: string;
  criado_em: string;
  canal: string;
  total_geral: number;
  forma_pagamento: string;
  entregador: string;
  taxa_entrega: number;
  desconto: number;
  itens: ItemPedido[];
}

interface ClienteGestao {
  idClienteBD?: string;
  codigoId: string; // ID 01, 02, 03...
  nomePrincipal: string;
  contacto: string;
  morada: string;
  pedidos: PedidoDetalhado[];
}

export default function GestaoClientesCompleta() {
  const [clientes, setClientes] = useState<ClienteGestao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroPesquisa, setFiltroPesquisa] = useState('');
  const [ordemAlfabetica, setOrdemAlfabetica] = useState<'asc' | 'desc'>('asc');

  // Modais e seleções
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteGestao | null>(null);
  const [pedidoModalDetalhe, setPedidoModalDetalhe] = useState<PedidoDetalhado | null>(null);
  
  // Edição de cliente
  const [editando, setEditando] = useState(false);
  const [editNome, setEditNome] = useState('');
  const [editContacto, setEditContacto] = useState('');
  const [editMorada, setEditMorada] = useState('');

  // Fusão de clientes duplicados
  const [selecionadosParaUnir, setSelecionadosParaUnir] = useState<string[]>([]);
  const [nomeUnificadoModal, setNomeUnificadoModal] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function carregarDadosCompletos() {
    setLoading(true);
    try {
      // 1. Buscar todos os pedidos
      const { data: pedidosData } = await supabase.from('pedidos').select('*').order('criado_em', { ascending: false });
      // 2. Buscar itens dos pedidos
      const { data: itensData } = await supabase.from('itens_pedido').select('*');
      // 3. Buscar tabela central de clientes (para moradas e contactos oficiais)
      const { data: clientesCadastrados } = await supabase.from('clientes').select('*');

      const itensMap: { [key: string]: ItemPedido[] } = {};
      (itensData || []).forEach((it: any) => {
        if (!itensMap[it.pedido_id]) itensMap[it.pedido_id] = [];
        itensMap[it.pedido_id].push({
          id: it.id,
          nome_produto: it.nome_produto,
          quantidade: it.quantidade,
          preco_unitario: Number(it.preco_unitario || 0)
        });
      });

      const pedidosCompletos: PedidoDetalhado[] = (pedidosData || []).map((ped: any) => ({
        id: ped.id,
        numero_pedido: ped.numero_pedido,
        cliente: (ped.cliente || 'Anónimo').trim(),
        contacto_cliente: ped.contacto_cliente || '',
        criado_em: ped.criado_em,
        canal: ped.canal || 'Balcão',
        total_geral: Number(ped.total_geral || 0),
        forma_pagamento: ped.forma_pagamento || 'Dinheiro',
        entregador: ped.entregador || 'Nenhum',
        taxa_entrega: Number(ped.taxa_entrega || 0),
        desconto: Number(ped.desconto || 0),
        itens: itensMap[ped.id] || []
      }));

      // Agrupar por nome de cliente
      const mapaAgrupado: { [key: string]: PedidoDetalhado[] } = {};
      pedidosCompletos.forEach(ped => {
        const chave = ped.cliente.toLowerCase();
        if (!mapaAgrupado[chave]) mapaAgrupado[chave] = [];
        mapaAgrupado[chave].push(ped);
      });

      let contador = 1;
      const listaFinal: ClienteGestao[] = Object.keys(mapaAgrupado).map(chave => {
        const pList = mapaAgrupado[chave];
        const nomeReal = pList[0].cliente;
        
        // Procurar na tabela de clientes oficial se existe morada ou contacto guardado
        const infoCadastrada = (clientesCadastrados || []).find((c: any) => c.nome.toLowerCase() === chave);
        const contactoEncontrado = infoCadastrada?.contacto || pList.find(p => p.contacto_cliente)?.contacto_cliente || '';
        const moradaEncontrada = infoCadastrada?.morada || '';

        const idFormatado = String(contador++).padStart(2, '0');

        return {
          idClienteBD: infoCadastrada?.id,
          codigoId: idFormatado,
          nomePrincipal: nomeReal,
          contacto: contactoEncontrado,
          morada: moradaEncontrada,
          pedidos: pList
        };
      });

      setClientes(listaFinal);
    } catch (err: any) {
      alert(`Erro ao carregar dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDadosCompletos();
  }, []);

  // Abrir detalhes do cliente
  const abrirFichaCliente = (cli: ClienteGestao) => {
    setClienteSelecionado(cli);
    setEditNome(cli.nomePrincipal);
    setEditContacto(cli.contacto);
    setEditMorada(cli.morada);
    setEditando(false);
  };

  // Guardar Edição / Morada do Cliente
  const guardarEdicaoCliente = async () => {
    if (!clienteSelecionado) return;
    try {
      const nomeAntigo = clienteSelecionado.nomePrincipal;

      // 1. Atualizar nome e contacto na tabela de pedidos
      await supabase
        .from('pedidos')
        .update({ cliente: editNome.trim(), contacto_cliente: editContacto.trim() })
        .eq('cliente', nomeAntigo);

      // 2. Atualizar ou inserir na tabela central de clientes (com morada)
      await supabase.from('clientes').upsert({
        nome: editNome.trim(),
        contacto: editContacto.trim(),
        morada: editMorada.trim()
      }, { onConflict: 'contacto' });

      alert('✅ Ficha de cliente e morada atualizadas com sucesso!');
      setEditando(false);
      carregarDadosCompletos();
      // Atualizar objeto local
      setClienteSelecionado({
        ...clienteSelecionado,
        nomePrincipal: editNome.trim(),
        contacto: editContacto.trim(),
        morada: editMorada.trim()
      });
    } catch (err: any) {
      alert(`Erro ao atualizar: ${err.message}`);
    }
  };

  // Unir clientes selecionados
  const unirClientes = async () => {
    if (selecionadosParaUnir.length < 2) return alert('Selecione pelo menos 2 clientes para unir.');
    if (!nomeUnificadoModal.trim()) return alert('Insira o nome principal unificado.');

    try {
      for (const nomeAntigo of selecionadosParaUnir) {
        await supabase.from('pedidos').update({ cliente: nomeUnificadoModal.trim() }).eq('cliente', nomeAntigo);
      }
      alert('✅ Clientes unidos com sucesso!');
      setSelecionadosParaUnir([]);
      setNomeUnificadoModal('');
      carregarDadosCompletos();
    } catch (err: any) {
      alert(`Erro na fusão: ${err.message}`);
    }
  };

  // Filtrar e Ordenar Clientes
  const clientesFiltrados = clientes.filter(c => 
    c.nomePrincipal.toLowerCase().includes(filtroPesquisa.toLowerCase()) ||
    c.contacto.includes(filtroPesquisa) ||
    c.morada.toLowerCase().includes(filtroPesquisa.toLowerCase())
  ).sort((a, b) => {
    if (ordemAlfabetica === 'asc') {
      return a.nomePrincipal.localeCompare(b.nomePrincipal);
    } else {
      return b.nomePrincipal.localeCompare(a.nomePrincipal);
    }
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 flex flex-col gap-6 font-sans">
      
      {/* CABEÇALHO */}
      <div className="flex flex-wrap justify-between items-center bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl gap-4">
        <div>
          <h1 className="text-xl font-black text-orange-500">👑 Gestão Centralizada de Clientes e Pedidos</h1>
          <p className="text-xs text-zinc-400 mt-1">Cruzamento automático com histórico, moradas, IDs sequenciais e detalhes de encomendas.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="text" 
            placeholder="Pesquisar por nome, telemóvel ou morada..." 
            value={filtroPesquisa}
            onChange={e => setFiltroPesquisa(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-orange-500 w-80"
          />
          <button 
            onClick={() => setOrdemAlfabetica(ordemAlfabetica === 'asc' ? 'desc' : 'asc')}
            className="bg-zinc-950 border border-zinc-800 px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-300 hover:text-white"
          >
            Ordem: {ordemAlfabetica === 'asc' ? 'A-Z ▲' : 'Z-A ▼'}
          </button>
        </div>
      </div>

      {/* PAINEL DE FUSÃO RÁPIDA SE HOUVER SELECIONADOS */}
      {selecionadosParaUnir.length > 0 && (
        <div className="bg-orange-950/30 border border-orange-500/50 p-5 rounded-2xl flex flex-col gap-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-orange-400">A unir {selecionadosParaUnir.length} perfis selecionados:</span>
            <button onClick={() => setSelecionadosParaUnir([])} className="text-zinc-400 hover:text-white">Cancelar ✕</button>
          </div>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Nome unificado correto..." 
              value={nomeUnificadoModal} 
              onChange={e => setNomeUnificadoModal(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none font-bold"
            />
            <button onClick={unirClientes} className="bg-orange-600 hover:bg-orange-700 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider">
              Confirmar Fusão 🚀
            </button>
          </div>
        </div>
      )}

      {/* TABELA DE CLIENTES */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-4">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Lista de Clientes Registados ({clientesFiltrados.length})</h2>

        {loading ? (
          <p className="text-xs text-zinc-500 text-center py-12">A sincronizar base de dados...</p>
        ) : clientesFiltrados.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-12">Nenhum cliente encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] text-zinc-500 uppercase border-b border-zinc-800">
                <tr>
                  <th className="py-3 w-10 text-center">Unir</th>
                  <th className="py-3 w-16">ID</th>
                  <th className="py-3">Nome do Cliente</th>
                  <th className="py-3">Contacto</th>
                  <th className="py-3">Morada de Entrega</th>
                  <th className="py-3 text-center">Qtd. Pedidos</th>
                  <th className="py-3 text-right">Total Gasto (€)</th>
                  <th className="py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {clientesFiltrados.map(cli => {
                  const estaSelecionado = selecionadosParaUnir.includes(cli.nomePrincipal);
                  const totalGasto = cli.pedidos.reduce((acc, p) => acc + p.total_geral, 0);

                  return (
                    <tr key={cli.codigoId} className="hover:bg-zinc-950/60 transition-all">
                      <td className="py-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={estaSelecionado}
                          onChange={() => {
                            if (estaSelecionado) setSelecionadosParaUnir(selecionadosParaUnir.filter(n => n !== cli.nomePrincipal));
                            else {
                              setSelecionadosParaUnir([...selecionadosParaUnir, cli.nomePrincipal]);
                              if (!nomeUnificadoModal) setNomeUnificadoModal(cli.nomePrincipal);
                            }
                          }}
                          className="w-4 h-4 accent-orange-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 font-mono font-bold text-orange-400">#{cli.codigoId}</td>
                      <td className="py-3 font-bold text-white cursor-pointer hover:underline" onClick={() => abrirFichaCliente(cli)}>
                        {cli.nomePrincipal}
                      </td>
                      <td className="py-3 text-zinc-300">{cli.contacto || <span className="text-zinc-600 italic">Sem contacto</span>}</td>
                      <td className="py-3 text-zinc-300">{cli.morada || <span className="text-amber-500/70 italic">Sem morada (Clique para adicionar)</span>}</td>
                      <td className="py-3 text-center font-bold text-zinc-200">{cli.pedidos.length}</td>
                      <td className="py-3 text-right font-mono font-black text-green-400">{totalGasto.toFixed(2)}€</td>
                      <td className="py-3 text-right">
                        <button 
                          onClick={() => abrirFichaCliente(cli)}
                          className="bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white px-3 py-1.5 rounded-xl font-bold transition-all border border-orange-500/30"
                        >
                          Ver Ficha & Histórico ➜
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: FICHA DO CLIENTE E HISTÓRICO DE PEDIDOS */}
      {clienteSelecionado && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-4xl rounded-3xl p-6 flex flex-col max-h-[90vh] shadow-2xl relative">
            
            <button onClick={() => setClienteSelecionado(null)} className="absolute top-5 right-5 text-zinc-400 hover:text-white text-base">✕</button>

            <div className="flex justify-between items-start border-b border-zinc-800 pb-4">
              <div>
                <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded uppercase">Ficha ID #{clienteSelecionado.codigoId}</span>
                <h2 className="text-2xl font-black text-white mt-2">{clienteSelecionado.nomePrincipal}</h2>
              </div>
              <button 
                onClick={() => setEditando(!editando)}
                className="bg-zinc-800 hover:bg-zinc-700 text-xs font-bold px-4 py-2 rounded-xl text-zinc-200 transition-all mr-8"
              >
                {editando ? 'Cancelar Edição' : '✏️ Editar Nome / Morada'}
              </button>
            </div>

            {/* SE ESTIVER A EDITAR */}
            {editando ? (
              <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 my-4 space-y-4">
                <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest">Atualizar Dados do Cliente</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Nome Completo</label>
                    <input type="text" value={editNome} onChange={e => setEditNome(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Contacto / Telemóvel</label>
                    <input type="text" value={editContacto} onChange={e => setEditContacto(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Morada de Entrega</label>
                    <input type="text" value={editMorada} onChange={e => setEditMorada(e.target.value)} placeholder="Ex: Rua Principal, 123" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none" />
                  </div>
                </div>
                <button onClick={guardarEdicaoCliente} className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider">
                  Guardar Alterações 💾
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 py-4 text-xs text-zinc-300">
                <div>📞 Telemóvel: <strong className="text-white">{clienteSelecionado.contacto || 'Não informado'}</strong></div>
                <div>📍 Morada: <strong className="text-white">{clienteSelecionado.morada || 'Não informada'}</strong></div>
              </div>
            )}

            {/* HISTÓRICO DE PEDIDOS DO CLIENTE */}
            <div className="flex-1 overflow-y-auto space-y-3 mt-2 pr-1">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Histórico de Pedidos ({clienteSelecionado.pedidos.length})</h3>

              {clienteSelecionado.pedidos.map(ped => (
                <div key={ped.id} className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs border-b border-zinc-800/80 pb-2">
                    <div>
                      {/* LINK DIRETO NO NÚMERO DO PEDIDO PARA ABRIR DETALHES */}
                      <button 
                        onClick={() => setPedidoModalDetalhe(ped)}
                        className="font-black text-orange-400 hover:underline text-sm"
                      >
                        Pedido #{ped.numero_pedido} 🔍
                      </button>
                      <span className="text-zinc-400 ml-3">📅 {new Date(ped.criado_em).toLocaleDateString('pt-PT')}</span>
                      <span className="ml-2 bg-zinc-900 px-2 py-0.5 rounded text-[10px] text-zinc-300 border border-zinc-800">{ped.canal}</span>
                    </div>
                    <div className="font-mono font-bold text-green-400 text-sm">
                      {ped.total_geral.toFixed(2)}€ ({ped.forma_pagamento})
                    </div>
                  </div>

                  {/* ITENS COMPRADOS */}
                  <div className="text-xs text-zinc-300">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Itens Encomendados:</span>
                    <div className="flex flex-wrap gap-2">
                      {ped.itens.map(it => (
                        <span key={it.id} className="bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg text-xs">
                          <strong className="text-white">{it.quantidade}x</strong> {it.nome_produto} <span className="text-zinc-500">({it.preco_unitario.toFixed(2)}€)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* MODAL: DETALHE COMPLETO DO PEDIDO ESPECÍFICO */}
      {pedidoModalDetalhe && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl p-6 flex flex-col gap-4 shadow-2xl relative">
            <button onClick={() => setPedidoModalDetalhe(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-white">✕</button>

            <div>
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest bg-orange-500/10 px-2 py-0.5 rounded">Detalhes Oficiais do Pedido</span>
              <h2 className="text-xl font-black text-white mt-1">Pedido #{pedidoModalDetalhe.numero_pedido}</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Cliente: <strong className="text-zinc-200">{pedidoModalDetalhe.cliente}</strong></p>
            </div>

            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-2 text-xs text-zinc-300">
              <div className="flex justify-between"><span>Data:</span> <strong className="text-white">{new Date(pedidoModalDetalhe.criado_em).toLocaleString('pt-PT')}</strong></div>
              <div className="flex justify-between"><span>Canal:</span> <strong className="text-white">{pedidoModalDetalhe.canal}</strong></div>
              <div className="flex justify-between"><span>Pagamento:</span> <strong className="text-white">{pedidoModalDetalhe.forma_pagamento}</strong></div>
              <div className="flex justify-between"><span>Estafeta:</span> <strong className="text-white">{pedidoModalDetalhe.entregador}</strong></div>
              <div className="flex justify-between"><span>Taxa Entrega:</span> <strong className="text-white">{pedidoModalDetalhe.taxa_entrega.toFixed(2)}€</strong></div>
              {pedidoModalDetalhe.desconto > 0 && <div className="flex justify-between text-red-400"><span>Desconto Aplicado:</span> <strong>-{pedidoModalDetalhe.desconto.toFixed(2)}€</strong></div>}
            </div>

            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Itens do Pedido</h4>
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-2 max-h-48 overflow-y-auto">
                {pedidoModalDetalhe.itens.map(it => (
                  <div key={it.id} className="flex justify-between text-xs border-b border-zinc-800/40 pb-1.5">
                    <span><strong className="text-white">{it.quantidade}x</strong> {it.nome_produto}</span>
                    <span className="font-mono text-orange-400">{(it.quantidade * it.preco_unitario).toFixed(2)}€</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center bg-orange-600/10 border border-orange-500/30 p-4 rounded-2xl">
              <span className="text-xs font-bold uppercase text-orange-400">Valor Total do Pedido</span>
              <span className="text-xl font-black font-mono text-white">{pedidoModalDetalhe.total_geral.toFixed(2)}€</span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}