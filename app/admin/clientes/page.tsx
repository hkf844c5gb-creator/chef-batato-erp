'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface ItemPedidoDetalhe {
  id: string;
  nome_produto: string;
  quantidade: number;
  preco_unitario: number;
}

interface PedidoCompleto {
  id: string;
  numero_pedido: string;
  cliente: string;
  contacto_cliente: string;
  criado_em: string;
  canal: string;
  total_geral: number;
  forma_pagamento: string;
  itens: ItemPedidoDetalhe[];
}

interface GrupoClienteCruzado {
  nomePrincipal: string;
  contactosUnicos: string[];
  pedidos: PedidoCompleto[];
}

export default function CruzamentoPedidosClientes() {
  const [gruposClientes, setGruposClientes] = useState<GrupoClienteCruzado[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionadosParaUnir, setSelecionadosParaUnir] = useState<string[]>([]);
  
  // Dados para a fusão
  const [novoNomeUnificado, setNovoNomeUnificado] = useState('');
  const [contactoUnificado, setContactoUnificado] = useState('');
  const [moradaUnificada, setMoradaUnificada] = useState('');
  const [expandidoCliente, setExpandidoCliente] = useState<string | null>(null);
  const [isProcessando, setIsProcessando] = useState(false);
  const [filtroPesquisa, setFiltroPesquisa] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function carregarDadosComCruzamento() {
    setLoading(true);
    try {
      // 1. Buscar todos os pedidos
      const { data: pedidosData, error: errPedidos } = await supabase
        .from('pedidos')
        .select('*')
        .order('criado_em', { ascending: false });

      if (errPedidos) throw errPedidos;

      // 2. Buscar todos os itens de pedidos para cruzamento exato
      const { data: itensData, error: errItens } = await supabase
        .from('itens_pedido')
        .select('*');

      if (errItens) throw errItens;

      // 3. Cruzar pedidos com os seus respetivos itens
      const pedidosComItens: PedidoCompleto[] = (pedidosData || []).map((ped: any) => {
        const itensDoPedido = (itensData || []).filter((it: any) => it.pedido_id === ped.id);
        return {
          id: ped.id,
          numero_pedido: ped.numero_pedido,
          cliente: ped.cliente || 'Cliente Anónimo',
          contacto_cliente: ped.contacto_cliente || '',
          criado_em: ped.criado_em,
          canal: ped.canal || 'Balcão',
          total_geral: Number(ped.total_geral || 0),
          forma_pagamento: ped.forma_pagamento || 'Dinheiro',
          itens: itensDoPedido.map((it: any) => ({
            id: it.id,
            nome_produto: it.nome_produto,
            quantidade: it.quantidade,
            preco_unitario: Number(it.preco_unitario || 0)
          }))
        };
      });

      // 4. Agrupar por nome de cliente (normalizado para deteção de duplicados)
      const mapaClientes: { [key: string]: PedidoCompleto[] } = {};

      pedidosComItens.forEach(ped => {
        const nomeChave = (ped.cliente || 'Desconhecido').trim().toLowerCase();
        if (!mapaClientes[nomeChave]) {
          mapaClientes[nomeChave] = [];
        }
        mapaClientes[nomeChave].push(ped);
      });

      const gruposFormatados: GrupoClienteCruzado[] = Object.keys(mapaClientes).map(chave => {
        const listaPeds = mapaClientes[chave];
        const nomeOriginal = listaPeds[0].cliente;
        const contactos = Array.from(new Set(listaPeds.map(p => p.contacto_cliente).filter(Boolean)));
        return {
          nomePrincipal: nomeOriginal,
          contactosUnicos: contactos,
          pedidos: listaPeds
        };
      });

      setGruposClientes(gruposFormatados);
    } catch (err: any) {
      alert(`Erro no cruzamento de dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDadosComCruzamento();
  }, []);

  const toggleSelecao = (nome: string) => {
    if (selecionadosParaUnir.includes(nome)) {
      setSelecionadosParaUnir(selecionadosParaUnir.filter(n => n !== nome));
    } else {
      setSelecionadosParaUnir([...selecionadosParaUnir, nome]);
      if (!novoNomeUnificado) setNovoNomeUnificado(nome);
    }
  };

  async function executarFusao() {
    if (selecionadosParaUnir.length < 2) {
      return alert('Selecione pelo menos duas variações para unir.');
    }
    if (!novoNomeUnificado.trim()) {
      return alert('Insira o nome unificado correto.');
    }

    setIsProcessando(true);
    try {
      for (const nomeAntigo of selecionadosParaUnir) {
        await supabase
          .from('pedidos')
          .update({ 
            cliente: novoNomeUnificado.trim(),
            contacto_cliente: contactoUnificado.trim() || undefined
          })
          .eq('cliente', nomeAntigo);
      }

      // Atualizar também na tabela de clientes
      await supabase.from('clientes').upsert({
        nome: novoNomeUnificado.trim(),
        contacto: contactoUnificado.trim(),
        morada: moradaUnificada.trim()
      }, { onConflict: 'contacto' });

      alert('✅ Clientes e histórico cruzado unidos com sucesso!');
      setSelecionadosParaUnir([]);
      setNovoNomeUnificado('');
      setContactoUnificado('');
      setMoradaUnificada('');
      carregarDadosComCruzamento();
    } catch (err: any) {
      alert(`Erro ao fundir: ${err.message}`);
    } finally {
      setIsProcessando(false);
    }
  }

  const gruposFiltrados = gruposClientes.filter(g => 
    g.nomePrincipal.toLowerCase().includes(filtroPesquisa.toLowerCase()) ||
    g.contactosUnicos.some(c => c.includes(filtroPesquisa))
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 flex flex-col gap-8">
      
      {/* CABEÇALHO */}
      <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl">
        <div>
          <h1 className="text-xl font-black text-orange-500">📊 Cruzamento de Pedidos e Clientes</h1>
          <p className="text-xs text-zinc-400 mt-1">Visualize todas as pessoas que já pediram, os itens detalhados de cada compra e una perfis duplicados.</p>
        </div>
        <input 
          type="text" 
          placeholder="Pesquisar cliente ou telemóvel..." 
          value={filtroPesquisa}
          onChange={e => setFiltroPesquisa(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-orange-500 w-72"
        />
      </div>

      {/* PAINEL DE FUSÃO */}
      {selecionadosParaUnir.length > 0 && (
        <div className="bg-orange-950/30 border border-orange-500/50 p-6 rounded-3xl flex flex-col gap-4 shadow-2xl">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">
              A unificar {selecionadosParaUnir.length} nomes selecionados numa só pessoa:
            </h2>
            <button onClick={() => setSelecionadosParaUnir([])} className="text-xs text-zinc-400 hover:text-white">Cancelar ✕</button>
          </div>

          <div className="flex flex-wrap gap-2">
            {selecionadosParaUnir.map(n => (
              <span key={n} className="bg-orange-600/20 border border-orange-500 text-orange-300 text-xs px-3 py-1 rounded-lg font-bold">
                {n}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Nome Oficial Unificado</label>
              <input type="text" value={novoNomeUnificado} onChange={e => setNovoNomeUnificado(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none font-bold" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Contacto Principal</label>
              <input type="text" value={contactoUnificado} onChange={e => setContactoUnificado(e.target.value)} placeholder="Telemóvel" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Morada de Entrega</label>
              <input type="text" value={moradaUnificada} onChange={e => setMoradaUnificada(e.target.value)} placeholder="Morada completa" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none" />
            </div>
          </div>

          <button 
            onClick={executarFusao}
            disabled={isProcessando}
            className="mt-2 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg"
          >
            {isProcessando ? 'A Unificar...' : 'Confirmar Fusão de Clientes e Histórico 🚀'}
          </button>
        </div>
      )}

      {/* LISTA CRUZADA */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-4">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Pessoas com Histórico de Compras ({gruposFiltrados.length})</h2>

        {loading ? (
          <p className="text-xs text-zinc-500 text-center py-12">A cruzar dados de pedidos e itens...</p>
        ) : gruposFiltrados.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-12">Nenhum cliente encontrado.</p>
        ) : (
          <div className="space-y-3">
            {gruposFiltrados.map(grupo => {
              const estaSelecionado = selecionadosParaUnir.includes(grupo.nomePrincipal);
              const estaExpandido = expandidoCliente === grupo.nomePrincipal;
              const totalGasto = grupo.pedidos.reduce((acc, p) => acc + p.total_geral, 0);

              return (
                <div key={grupo.nomePrincipal} className={`border rounded-2xl transition-all ${estaSelecionado ? 'bg-orange-600/10 border-orange-500' : 'bg-zinc-950 border-zinc-800'}`}>
                  
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        checked={estaSelecionado} 
                        onChange={() => toggleSelecao(grupo.nomePrincipal)}
                        className="w-4 h-4 accent-orange-600 cursor-pointer"
                      />
                      <div>
                        <h3 className="font-bold text-sm text-white">{grupo.nomePrincipal}</h3>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          📞 Contactos: <span className="text-zinc-200">{grupo.contactosUnicos.join(', ') || 'N/D'}</span> | 📦 Pedidos: <span className="text-orange-400 font-bold">{grupo.pedidos.length}</span> | 💰 Total Gasto: <span className="text-green-400 font-mono font-bold">{totalGasto.toFixed(2)}€</span>
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => setExpandidoCliente(estaExpandido ? null : grupo.nomePrincipal)}
                      className="text-xs text-orange-400 hover:text-orange-300 font-medium px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-800"
                    >
                      {estaExpandido ? 'Ocultar Detalhes ▲' : 'Ver Todos os Pedidos e Itens ▼'}
                    </button>
                  </div>

                  {/* DETALHE COMPLETO DE CADA PEDIDO E ITENS */}
                  {estaExpandido && (
                    <div className="border-t border-zinc-800 p-4 bg-zinc-900/40 space-y-4">
                      <h4 className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Histórico Detalhado de Encomendas</h4>
                      
                      <div className="space-y-3">
                        {grupo.pedidos.map(ped => (
                          <div key={ped.id} className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col gap-2">
                            <div className="flex justify-between items-center text-xs border-b border-zinc-800/60 pb-2">
                              <div>
                                <span className="font-bold text-orange-400">Pedido #{ped.numero_pedido}</span>
                                <span className="text-zinc-400 ml-3">📅 {new Date(ped.criado_em).toLocaleString('pt-PT')}</span>
                                <span className="ml-3 bg-zinc-900 px-2 py-0.5 rounded text-[10px] text-zinc-300 border border-zinc-800">{ped.canal}</span>
                              </div>
                              <div className="font-mono font-bold text-white">
                                Total: {ped.total_geral.toFixed(2)}€ ({ped.forma_pagamento})
                              </div>
                            </div>

                            {/* ITENS DO PEDIDO */}
                            <div className="text-xs text-zinc-300 space-y-1">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase block">Itens Comprados:</span>
                              {ped.itens.length === 0 ? (
                                <span className="text-zinc-500 italic text-[11px]">Sem itens registados para este pedido.</span>
                              ) : (
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-1 pl-2">
                                  {ped.itens.map(it => (
                                    <li key={it.id} className="text-zinc-300 text-[11px]">
                                      • <strong className="text-white">{it.quantidade}x</strong> {it.nome_produto} <span className="text-zinc-500 font-mono">({it.preco_unitario.toFixed(2)}€ un)</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}