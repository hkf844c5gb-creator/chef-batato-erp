'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Cliente {
  id: string;
  nome: string;
  contacto: string;
  morada: string;
  localidade: string;
  observacoes: string;
}

interface PedidoHistorico {
  id: string;
  numero_pedido: string;
  criado_em: string;
  canal: string;
  total_geral: number;
  forma_pagamento: string;
}

export default function GestaoClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [historicoPedidos, setHistoricoPedidos] = useState<PedidoHistorico[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);

  // Estados do formulário de novo/editar cliente
  const [nome, setNome] = useState('');
  const [contacto, setContacto] = useState('');
  const [morada, setMorada] = useState('');
  const [localidade, setLocalidade] = useState('Aveiro');
  const [observacoes, setObservacoes] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function carregarClientes() {
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nome', { ascending: true });
    
    if (data) setClientes(data);
    setLoading(false);
  }

  useEffect(() => {
    carregarClientes();
  }, []);

  async function selecionarCliente(cliente: Cliente) {
    setClienteSelecionado(cliente);
    // Buscar histórico de pedidos deste cliente pelo nome ou contacto
    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .or(`cliente.ilike.%${cliente.nome}%,contacto_cliente.eq.${cliente.contacto}`)
      .order('criado_em', { ascending: false });

    if (data) setHistoricoPedidos(data);
  }

  async function salvarCliente(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return alert('Insira o nome do cliente.');

    const { error } = await supabase.from('clientes').insert([{
      nome, contacto, morada, localidade, observacoes
    }]);

    if (error) {
      alert(`Erro ao guardar cliente: ${error.message}`);
    } else {
      alert('Cliente registado com sucesso!');
      setNome(''); setContacto(''); setMorada(''); setObservacoes('');
      carregarClientes();
    }
  }

  const clientesFiltrados = clientes.filter(c => 
    c.nome.toLowerCase().includes(busca.toLowerCase()) || 
    (c.contacto && c.contacto.includes(busca))
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 flex gap-8">
      
      {/* COLUNA ESQUERDA: LISTA E NOVO CLIENTE */}
      <div className="w-1/3 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-black text-orange-500">👥 Cadastro de Clientes</h2>
          <p className="text-xs text-zinc-400 mt-1">Gestão de moradas e fichas de clientes.</p>
        </div>

        <input 
          type="text" 
          placeholder="Pesquisar por nome ou telemóvel..." 
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-orange-500"
        />

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <p className="text-xs text-zinc-500 text-center py-6">A carregar clientes...</p>
          ) : clientesFiltrados.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-6">Nenhum cliente encontrado.</p>
          ) : (
            clientesFiltrados.map(c => (
              <div 
                key={c.id} 
                onClick={() => selecionarCliente(c)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${clienteSelecionado?.id === c.id ? 'bg-orange-600/20 border-orange-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'}`}
              >
                <div className="font-bold text-sm">{c.nome}</div>
                <div className="text-xs text-zinc-400 mt-0.5">📞 {c.contacto || 'Sem contacto'} | 📍 {c.morada || 'Sem morada'}</div>
              </div>
            ))
          )}
        </div>

        {/* FORMULÁRIO RÁPIDO NOVO CLIENTE */}
        <form onSubmit={salvarCliente} className="border-t border-zinc-800 pt-4 space-y-3">
          <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest">Novo Cliente</h3>
          <input type="text" placeholder="Nome Completo" value={nome} onChange={e => setNome(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-orange-500" />
          <input type="text" placeholder="Telemóvel" value={contacto} onChange={e => setContacto(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-orange-500" />
          <input type="text" placeholder="Morada (Rua, Nº, Andar)" value={morada} onChange={e => setMorada(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-orange-500" />
          <button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all">Guardar Cliente</button>
        </form>
      </div>

      {/* COLUNA DIREITA: DETALHES E HISTÓRICO DE PEDIDOS */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col">
        {clienteSelecionado ? (
          <div className="flex-1 flex flex-col gap-6">
            <div className="border-b border-zinc-800 pb-4 flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded uppercase">Ficha do Cliente</span>
                <h2 className="text-2xl font-black text-white mt-1">{clienteSelecionado.nome}</h2>
                <p className="text-xs text-zinc-400 mt-1">📍 Morada: {clienteSelecionado.morada || 'Não informada'} ({clienteSelecionado.localidade})</p>
                <p className="text-xs text-zinc-400">📞 Contacto: {clienteSelecionado.contacto || 'Não informado'}</p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3">Histórico de Pedidos Realizados ({historicoPedidos.length})</h3>
              
              {historicoPedidos.length === 0 ? (
                <div className="bg-zinc-950 p-8 rounded-2xl border border-zinc-800 text-center text-zinc-500 text-xs">
                  Nenhum pedido registado para este cliente até ao momento.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] text-zinc-500 uppercase border-b border-zinc-800">
                      <tr>
                        <th className="py-2">Nº Pedido</th>
                        <th className="py-2">Data</th>
                        <th className="py-2">Canal</th>
                        <th className="py-2">Pagamento</th>
                        <th className="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {historicoPedidos.map(ped => (
                        <tr key={ped.id} className="hover:bg-zinc-950/50">
                          <td className="py-3 font-bold text-orange-400">#{ped.numero_pedido}</td>
                          <td className="py-3 text-zinc-300">{new Date(ped.criado_em).toLocaleDateString('pt-PT')}</td>
                          <td className="py-3 text-zinc-400">{ped.canal}</td>
                          <td className="py-3 text-zinc-400">{ped.forma_pagamento}</td>
                          <td className="py-3 text-right font-mono font-black text-white">{Number(ped.total_geral).toFixed(2)}€</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-center space-y-2">
            <span className="text-4xl">👈</span>
            <p className="text-sm">Selecione um cliente na lista à esquerda para ver a morada e o histórico completo de pedidos.</p>
          </div>
        )}
      </div>

    </div>
  );
}