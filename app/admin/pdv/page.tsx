'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// --- MENU RÁPIDO DO CHEF BATATÔ (Pode adaptar depois para puxar da BD se quiser) ---
const menuCategorias = [
  {
    nome: 'Batatas Recheadas',
    itens: [
      { id: 'b1', nome: 'Batatô Clássica', preco: 7.50, emoji: '🥔' },
      { id: 'b2', nome: 'Batatô Bacon & Cheddar', preco: 8.90, emoji: '🥓' },
      { id: 'b3', nome: 'Batatô Frango c/ Catupiry', preco: 8.50, emoji: '🍗' },
      { id: 'b4', nome: 'Batatô Bolonhesa', preco: 8.50, emoji: '🍝' },
      { id: 'b5', nome: 'Batatô Vegetariana', preco: 7.90, emoji: '🥦' },
    ]
  },
  {
    nome: 'Bebidas & Extras',
    itens: [
      { id: 'beb1', nome: 'Coca-Cola', preco: 1.50, emoji: '🥤' },
      { id: 'beb2', nome: 'Ice Tea Pêssego', preco: 1.50, emoji: '🧃' },
      { id: 'beb3', nome: 'Água', preco: 1.00, emoji: '💧' },
      { id: 'ext1', nome: 'Extra Bacon', preco: 1.50, emoji: '🥓' },
    ]
  }
];

interface ItemCarrinho {
  id: string;
  nome: string;
  preco: number;
  quantidade: number;
  emoji: string;
}

export default function FrenteDeCaixa() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Estados da Operação
  const [estafetas, setEstafetas] = useState<any[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [processando, setProcessando] = useState(false);

  // Estados do Pedido
  const [cliente, setCliente] = useState('');
  const [canal, setCanal] = useState('WhatsApp');
  const [tipoPedido, setTipoPedido] = useState('Entrega');
  const [entregador, setEntregador] = useState('');
  const [taxaEntrega, setTaxaEntrega] = useState<number>(0);
  const [metodoPagamento, setMetodoPagamento] = useState('MB Way');

  // Carrega os estafetas para o dropdown
  useEffect(() => {
    async function carregarEstafetas() {
      const { data } = await supabase.from('estafetas').select('nome').eq('ativo', true).order('nome');
      if (data) setEstafetas(data);
    }
    carregarEstafetas();
  }, []);

  // Matemáticas do Carrinho
  const subtotal = carrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
  const totalFinal = subtotal + taxaEntrega;

  // Ações do Carrinho
  const adicionarItem = (produto: any) => {
    setCarrinho(prev => {
      const existe = prev.find(i => i.id === produto.id);
      if (existe) {
        return prev.map(i => i.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i);
      }
      return [...prev, { ...produto, quantidade: 1 }];
    });
  };

  const removerItem = (id: string) => {
    setCarrinho(prev => prev.map(i => i.id === id ? { ...i, quantidade: i.quantidade - 1 } : i).filter(i => i.quantidade > 0));
  };

  const limparPedido = () => {
    setCarrinho([]);
    setCliente('');
    setTaxaEntrega(0);
    setEntregador('');
  };

  // Guardar Pedido na BD
  const finalizarPedido = async () => {
    if (carrinho.length === 0) return alert('O carrinho está vazio!');
    if (!cliente.trim()) return alert('Insira o nome ou identificação do cliente/pedido.');
    if (tipoPedido === 'Entrega' && taxaEntrega > 0 && !entregador) {
      return alert('Se está a cobrar taxa de entrega, selecione qual o estafeta que vai fazer a viagem.');
    }

    setProcessando(true);
    try {
      const { error } = await supabase.from('pedidos').insert([{
        cliente: cliente.trim(),
        canal,
        tipo_pedido: tipoPedido,
        itens: carrinho,
        subtotal,
        taxa_entrega: taxaEntrega,
        total_final: totalFinal,
        metodo_pagamento: metodoPagamento,
        entregador: entregador || null,
        status: 'Preparação' // Fica pronto para a cozinha!
      }]);

      if (error) throw error;

      alert('Pedido lançado com sucesso para a cozinha!');
      limparPedido();
    } catch (err: any) {
      alert("Erro ao registar pedido:\n" + (err.message || JSON.stringify(err)));
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col md:flex-row selection:bg-orange-500/30">
      
      {/* LADO ESQUERDO: MENU DE PRODUTOS (70% da largura) */}
      <div className="flex-1 p-5 md:p-8 flex flex-col h-screen overflow-y-auto no-scrollbar border-r border-zinc-800/50">
        
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Frente de Caixa</h1>
            <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest mt-1">Terminal de Registo Rápido</p>
          </div>
          <div className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            Aberto
          </div>
        </header>

        {menuCategorias.map((cat, idx) => (
          <div key={idx} className="mb-8">
            <h2 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-4 pl-1">{cat.nome}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {cat.itens.map(item => (
                <button 
                  key={item.id} 
                  onClick={() => adicionarItem(item)}
                  className="bg-zinc-900 border border-zinc-800/80 hover:border-orange-500/50 hover:bg-zinc-800 transition-all rounded-2xl p-4 flex flex-col items-center justify-center gap-3 text-center group active:scale-95"
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform">{item.emoji}</span>
                  <div>
                    <span className="block text-sm font-bold text-zinc-200 mb-1 leading-tight">{item.nome}</span>
                    <span className="block text-xs font-mono font-black text-orange-400">{item.preco.toFixed(2)}€</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* LADO DIREITO: CARRINHO E CHECKOUT (30% da largura) */}
      <div className="w-full md:w-[420px] bg-zinc-900/40 flex flex-col h-screen shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-10">
        
        {/* CABEÇALHO DO PEDIDO */}
        <div className="p-6 border-b border-zinc-800/80 space-y-4">
          <input 
            type="text" 
            placeholder="Nome do Cliente ou Nº Pedido..." 
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 font-bold placeholder:text-zinc-600"
          />
          
          <div className="grid grid-cols-2 gap-2">
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-bold text-zinc-300 outline-none focus:border-indigo-500">
              <option value="WhatsApp">WhatsApp</option>
              <option value="Balcão">Balcão</option>
              <option value="Instagram">Instagram</option>
              <option value="UberEats">Uber Eats</option>
              <option value="Glovo">Glovo</option>
            </select>
            <select value={tipoPedido} onChange={(e) => setTipoPedido(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-bold text-zinc-300 outline-none focus:border-indigo-500">
              <option value="Entrega">Entrega (Delivery)</option>
              <option value="Takeaway">Takeaway</option>
              <option value="Sala">Consumo no Local</option>
            </select>
          </div>
        </div>

        {/* LISTA DE ITENS DO CARRINHO */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
          {carrinho.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-3 opacity-50">
              <span className="text-5xl">🛒</span>
              <p className="text-xs font-bold uppercase tracking-widest">Carrinho Vazio</p>
            </div>
          ) : (
            carrinho.map(item => (
              <div key={item.id} className="flex justify-between items-center bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1 items-center bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                    <button onClick={() => adicionarItem(item)} className="text-zinc-400 hover:text-white px-2 py-0.5 text-xs font-black">+</button>
                    <span className="text-xs font-black text-white">{item.quantidade}</span>
                    <button onClick={() => removerItem(item.id)} className="text-zinc-400 hover:text-white px-2 py-0.5 text-xs font-black">-</button>
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-zinc-200">{item.nome}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">{(item.preco * item.quantidade).toFixed(2)}€</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ZONA DE ESTAFETA & TAXAS */}
        {tipoPedido === 'Entrega' && (
          <div className="p-5 border-t border-zinc-800/80 bg-zinc-950/30 space-y-3">
            <h3 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest pl-1">Dados de Entrega</h3>
            <div className="flex gap-2">
              <select 
                value={entregador} 
                onChange={(e) => setEntregador(e.target.value)} 
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none focus:border-indigo-500"
              >
                <option value="">S/ Estafeta Atribuído</option>
                {estafetas.map(est => <option key={est.nome} value={est.nome}>{est.nome}</option>)}
              </select>
              <div className="relative w-24">
                <input 
                  type="number" 
                  step="0.10" 
                  value={taxaEntrega || ''} 
                  onChange={(e) => setTaxaEntrega(parseFloat(e.target.value) || 0)}
                  placeholder="Taxa €" 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-bold text-indigo-400 font-mono outline-none focus:border-indigo-500 text-center"
                />
              </div>
            </div>
          </div>
        )}

        {/* ZONA DE TOTAIS E BOTÃO FINALIZAR */}
        <div className="p-6 bg-zinc-950 border-t border-zinc-800 space-y-4">
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-zinc-400 font-bold">
              <span>Subtotal</span>
              <span className="font-mono">{subtotal.toFixed(2)}€</span>
            </div>
            {taxaEntrega > 0 && (
              <div className="flex justify-between text-xs text-indigo-400 font-bold">
                <span>Taxa de Entrega</span>
                <span className="font-mono">+{taxaEntrega.toFixed(2)}€</span>
              </div>
            )}
            <div className="flex justify-between items-end pt-2">
              <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Total</span>
              <span className="text-3xl font-black font-mono text-white tracking-tighter">{totalFinal.toFixed(2)}€</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <select value={metodoPagamento} onChange={(e) => setMetodoPagamento(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 text-xs font-bold text-zinc-300 outline-none">
              <option value="MB Way">MB Way</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="TPA">Multibanco (TPA)</option>
              <option value="Pago na App">Pago na App (Glovo/Uber)</option>
            </select>
            <button 
              onClick={limparPedido}
              className="bg-red-950/20 text-red-500 border border-red-900/30 rounded-xl px-3 py-3 text-xs font-black uppercase tracking-wider hover:bg-red-900/40 transition-colors"
            >
              Cancelar
            </button>
          </div>

          <button 
            onClick={finalizarPedido}
            disabled={processando || carrinho.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-4 rounded-xl text-sm font-black shadow-lg shadow-indigo-900/20 transition-transform active:scale-95 uppercase tracking-wider flex items-center justify-center gap-2"
          >
            {processando ? 'A Processar...' : 'Confirmar Pedido 🚀'}
          </button>
        </div>

      </div>
    </div>
  );
}