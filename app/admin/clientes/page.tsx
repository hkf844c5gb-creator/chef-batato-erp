'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface PedidoHistorico {
  id: string;
  numero_pedido: string;
  cliente: string;
  contacto_cliente: string;
  criado_em: string;
  canal: string;
  total_geral: number;
  forma_pagamento: string;
}

interface GrupoCliente {
  nomePrincipal: string;
  contactos: string[];
  pedidos: PedidoHistorico[];
}

export default function GestaoClientesFusao() {
  const [gruposClientes, setGruposClientes] = useState<GrupoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionadosParaUnir, setSelecionadosParaUnir] = useState<string[]>([]);
  const [novoNomeUnificado, setNovoNomeUnificado] = useState('');
  const [moradaUnificada, setMoradaUnificada] = useState('');
  const [contactoUnificado, setContactoUnificado] = useState('');
  const [expandidoNome, setExpandidoNome] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function carregarDados() {
    setLoading(true);
    try {
      // 1. Buscar todos os pedidos registados
      const { data: pedidos, error } = await supabase
        .from('pedidos')
        .select('*')
        .order('criado_em', { ascending: false });

      if (error) throw error;

      // 2. Agrupar pedidos por nome do cliente (normalizado em maiúsculas/minúsculas para limpeza)
      const mapaClientes: { [key: string]: PedidoHistorico[] } = {};

      (pedidos || []).forEach((p: any) => {
        const nomeBruto = (p.cliente || 'Desconhecido').trim();
        const chave = nomeBruto.toLowerCase();
        if (!mapaClientes[chave]) {
          mapaClientes[chave] = [];
        }
        mapaClientes[chave].push(p);
      });

      const listaGrupos: GrupoCliente[] = Object.keys(mapaClientes).map(chave => {
        const pList = mapaClientes[chave];
        const nomeOriginal = pList[0].cliente;
        const contactosUnicos = Array.from(new Set(pList.map(p => p.contacto_cliente).filter(Boolean)));
        return {
          nomePrincipal: nomeOriginal,
          contactos: contactosUnicos,
          pedidos: pList
        };
      });

      setGruposClientes(listaGrupos);
    } catch (err: any) {
      alert(`Erro ao carregar dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const toggleSelecaoNome = (nome: string) => {
    if (selecionadosParaUnir.includes(nome)) {
      setSelecionadosParaUnir(selecionadosParaUnir.filter(n => n !== nome));
    } else {
      setSelecionadosParaUnir([...selecionadosParaUnir, nome]);
      if (!novoNomeUnificado) setNovoNomeUnificado(nome);
    }
  };

  // Função para unir os nomes selecionados na mesma pessoa
  async function unirClientesSelecionados() {
    if (selecionadosParaUnir.length < 2) {
      return alert('Selecione pelo menos 2 variações de nomes para unir.');
    }
    if (!novoNomeUnificado.trim()) {
      return alert('Defina o nome principal unificado para esta pessoa.');
    }

    setIsProcessando(true);
    try {
      // Atualiza na tabela pedidos todos os registos com os nomes antigos para o novo nome unificado
      for (const nomeAntigo of selecionadosParaUnir) {
        await supabase
          .from('pedidos')
          .update({ cliente: novoNomeUnificado.trim(), contacto_cliente: contactoUnificado.trim() || undefined })
          .eq('cliente', nomeAntigo);
      }

      // Regista na tabela central de clientes
      await supabase.from('clientes').upsert({
        nome: novoNomeUnificado.trim(),
        contacto: contactoUnificado.trim(),
        morada: moradaUnificada.trim()
      }, { onConflict: 'contacto' });

      alert('✅ Perfis unidos com sucesso!');
      setSelecionadosParaUnir([]);
      setNovoNomeUnificado('');
      setMoradaUnificada('');
      setContactoUnificado('');
      carregarDados();
    } catch (err: any) {
      alert(`Erro ao unir perfis: ${err.message}`);
    } finally {
      setIsProcessando(false);
    }
  }

  const [isProcessando, setIsProcessando] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 flex flex-col gap-8">
      
      <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl">
        <div>
          <h1 className="text-xl font-black text-orange-500">🔗 Gestão e Fusão de Clientes e Histórico</h1>
          <p className="text-xs text-zinc-400 mt-1">Selecione nomes duplicados ou variações do mesmo cliente para unir todo o histórico de pedidos.</p>
        </div>
        <div className="text-xs text-zinc-400 bg-zinc-950 px-4 py-2 rounded-xl border border-zinc-800">
          Total de Perfis Detetados: <span className="font-bold text-white">{gruposClientes.length}</span>
        </div>
      </div>

      {/* PAINEL DE FUSÃO SE HOUVER SELECIONADOS */}
      {selecionadosParaUnir.length > 0 && (
        <div className="bg-orange-950/30 border border-orange-500/50 p-6 rounded-3xl flex flex-col gap-4 shadow-2xl">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">
              A Unir {selecionadosParaUnir.length} variações selecionadas:
            </h2>
            <button 
              onClick={() => setSelecionadosParaUnir([])} 
              className="text-xs text-zinc-400 hover:text-white"
            >
              Cancelar Seleção ✕
            </button>
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
              <input 
                type="text" 
                value={novoNomeUnificado} 
                onChange={e => setNovoNomeUnificado(e.target.value)} 
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Contacto / Telemóvel Principal</label>
              <input 
                type="text" 
                value={contactoUnificado} 
                onChange={e => setContactoUnificado(e.target.value)} 
                placeholder="Telemóvel" 
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Morada de Entrega</label>
              <input 
                type="text" 
                value={moradaUnificada} 
                onChange={e => setMoradaUnificada(e.target.value)} 
                placeholder="Morada completa" 
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <button 
            onClick={unirClientesSelecionados}
            disabled={isProcessando}
            className="mt-2 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg"
          >
            {isProcessando ? 'A Processar Fusão...' : 'Confirmar e Unir Todos os Pedidos Destas Pessoas 🚀'}
          </button>
        </div>
      )}

      {/* LISTA DE CLIENTES E PEDIDOS */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-4">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Lista de Nomes no Histórico (Clique para marcar e unir)</h2>

        {loading ? (
          <p className="text-xs text-zinc-500 text-center py-12">A analisar base de dados de pedidos...</p>
        ) : (
          <div className="space-y-3">
            {gruposClientes.map((grupo) => {
              const estaSelecionado = selecionadosParaUnir.includes(grupo.nomePrincipal);
              const estaExpandido = expandidoNome === grupo.nomePrincipal;
              const totalGastoCliente = grupo.pedidos.reduce((acc, p) => acc + Number(p.total_geral || 0), 0);

              return (
                <div key={grupo.nomePrincipal} className={`border rounded-2xl transition-all ${estaSelecionado ? 'bg-orange-600/10 border-orange-500' : 'bg-zinc-950 border-zinc-800'}`}>
                  
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        checked={estaSelecionado} 
                        onChange={() => toggleSelecaoNome(grupo.nomePrincipal)}
                        className="w-4 h-4 accent-orange-600 cursor-pointer"
                      />
                      <div>
                        <h3 className="font-bold text-sm text-white">{grupo.nomePrincipal}</h3>
                        <p className="text-[11px] text-zinc-400">
                          📞 Contacto: {grupo.contactos.join(', ') || 'Sem contacto'} | 📦 Total de Pedidos: <span className="text-orange-400 font-bold">{grupo.pedidos.length}</span> | 💰 Gasto Total: <span className="text-green-400 font-mono font-bold">{totalGastoCliente.toFixed(2)}€</span>
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => setExpandidoNome(estaExpandido ? null : grupo.nomePrincipal)}
                      className="text-xs text-orange-400 hover:text-orange-300 font-medium px-3 py-1 bg-zinc-900 rounded-xl border border-zinc-800"
                    >
                      {estaExpandido ? 'Ocultar Pedidos ▲' : 'Ver Histórico de Pedidos ▼'}
                    </button>
                  </div>

                  {/* HISTÓRICO DETALHADO DE PEDIDOS DO CLIENTE */}
                  {estaExpandido && (
                    <div className="border-t border-zinc-800 p-4 bg-zinc-900/50 space-y-2">
                      <h4 className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Histórico de Pedidos Realizados</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-[10px] text-zinc-500 uppercase border-b border-zinc-800">
                            <tr>
                              <th className="py-2">Nº Pedido</th>
                              <th className="py-2">Data</th>
                              <th className="py-2">Canal</th>
                              <th className="py-2">Pagamento</th>
                              <th className="py-2 text-right">Total (€)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/40">
                            {grupo.pedidos.map(ped => (
                              <tr key={ped.id}>
                                <td className="py-2 font-bold text-orange-400">#{ped.numero_pedido}</td>
                                <td className="py-2 text-zinc-300">{new Date(ped.criado_em).toLocaleDateString('pt-PT')}</td>
                                <td className="py-2 text-zinc-400">{ped.canal}</td>
                                <td className="py-2 text-zinc-400">{ped.forma_pagamento}</td>
                                <td className="py-2 text-right font-mono font-bold text-white">{Number(ped.total_geral).toFixed(2)}€</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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