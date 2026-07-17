'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

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

interface MovimentoCaixa {
  tipo: 'entrada' | 'saida';
  valor: number;
  descricao: string;
  data: string;
}

export default function CaixaPDV() {
  // --- ESTADOS DO PRODUTO E CARRINHO ---
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [metodoPagamento, setMetodoPagamento] = useState<'dinheiro' | 'multibanco' | 'mbway'>('dinheiro');
  const [desconto, setDesconto] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DA CAIXA ---
  const [caixaAberta, setCaixaAberta] = useState(false);
  const [saldoInicial, setSaldoInicial] = useState<number>(0);
  const [saldoAtual, setSaldoAtual] = useState<number>(0);
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([]);
  const [totalVendasTurno, setTotalVendasTurno] = useState<number>(0);

  // --- MODAIS ---
  const [modalAbrir, setModalAbrir] = useState(true); // Começa aberto se a caixa estiver fechada
  const [modalMovimento, setModalMovimento] = useState(false);
  const [modalFechar, setModalFechar] = useState(false);
  
  // Estados temporários dos modais
  const [inputValor, setInputValor] = useState<number | ''>('');
  const [inputDescricao, setInputDescricao] = useState('');
  const [tipoMovimento, setTipoMovimento] = useState<'entrada' | 'saida'>('saida');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function carregarProdutos() {
      try {
        const { data, error } = await supabase.from('produtos').select('id, nome, preco, categoria').eq('ativo', true);
        if (data) {
          setProdutos(data.map((p: any) => ({ ...p, preco: Number(p.preco) })));
        }
      } catch (err) {
        console.error('Erro ao carregar produtos', err);
      } finally {
        setLoading(false);
      }
    }
    carregarProdutos();
  }, [supabase]);

  // --- LÓGICA DE CAIXA ---
  const abrirCaixa = (e: React.FormEvent) => {
    e.preventDefault();
    const valorInicial = Number(inputValor) || 0;
    setSaldoInicial(valorInicial);
    setSaldoAtual(valorInicial);
    setCaixaAberta(true);
    setModalAbrir(false);
    setInputValor('');
  };

  const registarMovimento = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = Number(inputValor) || 0;
    if (valor <= 0) return alert('O valor deve ser maior que zero.');
    if (!inputDescricao.trim()) return alert('Insira uma descrição (ex: Pagar Fornecedor).');

    const novoMovimento: MovimentoCaixa = {
      tipo: tipoMovimento,
      valor: valor,
      descricao: inputDescricao,
      data: new Date().toISOString()
    };

    setMovimentos([...movimentos, novoMovimento]);
    setSaldoAtual(prev => tipoMovimento === 'entrada' ? prev + valor : prev - valor);
    
    setModalMovimento(false);
    setInputValor('');
    setInputDescricao('');
  };

  const fecharCaixa = () => {
    // Aqui no futuro enviará o resumo do turno para a base de dados
    alert(`Caixa Fechada!\n\nSaldo Final em Gaveta: ${saldoAtual.toFixed(2)}€\nVendas Totais do Turno: ${totalVendasTurno.toFixed(2)}€`);
    setCaixaAberta(false);
    setModalFechar(false);
    setSaldoInicial(0);
    setSaldoAtual(0);
    setTotalVendasTurno(0);
    setMovimentos([]);
    setModalAbrir(true);
  };

  // --- LÓGICA DE VENDAS ---
  const adicionarAoCarrinho = (produto: Produto) => {
    if (!caixaAberta) return alert('Tem de abrir a caixa primeiro!');
    setCarrinho((prev) => {
      const itemExistente = prev.find((item) => item.produto.id === produto.id);
      if (itemExistente) return prev.map((item) => item.produto.id === produto.id ? { ...item, quantidade: item.quantidade + 1 } : item);
      return [...prev, { produto, quantidade: 1 }];
    });
  };

  const removerDoCarrinho = (produtoId: string) => {
    setCarrinho((prev) =>
      prev.map((item) => item.produto.id === produtoId ? { ...item, quantidade: item.quantidade - 1 } : item).filter((item) => item.quantidade > 0)
    );
  };

  const subtotal = carrinho.reduce((acc, item) => acc + item.produto.preco * item.quantidade, 0);
  const totalVenda = Math.max(0, subtotal - (desconto || 0));

  const finalizarVenda = async () => {
    if (!caixaAberta) return alert('A caixa está fechada!');
    if (carrinho.length === 0) return alert('O carrinho está vazio!');

    try {
      // Registo da venda no Supabase (ignorando erros locais de tabelas inexistentes para simulação)
      const { data: venda } = await supabase.from('vendas').insert([{ total: totalVenda, metodo_pagamento: metodoPagamento }]).select().single();
      if (venda) {
        const itens = carrinho.map(item => ({ venda_id: venda.id, produto_id: item.produto.id, quantidade: item.quantidade, preco_unitario: item.produto.preco }));
        await supabase.from('itens_venda').insert(itens);
      }

      // Atualiza o dinheiro físico se o pagamento foi em dinheiro
      if (metodoPagamento === 'dinheiro') {
        setSaldoAtual(prev => prev + totalVenda);
      }
      setTotalVendasTurno(prev => prev + totalVenda);

      alert(`Venda Registada: ${totalVenda.toFixed(2)}€`);
      setCarrinho([]);
      setDesconto(0);
    } catch (err) {
      // Simulação local para a interface continuar a funcionar
      if (metodoPagamento === 'dinheiro') setSaldoAtual(prev => prev + totalVenda);
      setTotalVendasTurno(prev => prev + totalVenda);
      alert(`Venda Processada (Simulação): ${totalVenda.toFixed(2)}€`);
      setCarrinho([]);
      setDesconto(0);
    }
  };

  // --- ECRÃ DE CAIXA FECHADA ---
  if (!caixaAberta) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <form onSubmit={abrirCaixa} className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl w-full max-w-md shadow-2xl">
          <div className="text-center mb-8">
            <span className="text-4xl mb-4 block">🔒</span>
            <h1 className="text-2xl font-black text-white uppercase tracking-wider">Caixa Fechada</h1>
            <p className="text-zinc-400 text-sm mt-2">Abra o turno para iniciar as operações.</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Fundo de Maneio / Trocos (€)</label>
              <input 
                type="number" step="0.01" min="0" required
                value={inputValor} onChange={e => setInputValor(parseFloat(e.target.value))}
                placeholder="Ex: 50.00"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-4 text-center text-2xl font-mono text-orange-400 font-bold outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-transform active:scale-[0.98] shadow-lg">
              Abrir Caixa
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- ECRÃ PRINCIPAL DE VENDAS ---
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* HEADER DE GESTÃO DE CAIXA */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex flex-col sm:flex-row gap-4 justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🥔</span>
          <div>
            <h1 className="text-lg font-bold text-orange-500 tracking-wide leading-none">Chef Batatô Vendas</h1>
            <span className="text-xs font-bold text-green-500 uppercase tracking-widest flex items-center gap-1 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Caixa Aberta
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="bg-zinc-950 border border-zinc-800 px-4 py-2 rounded-xl text-right">
            <span className="block text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Saldo em Gaveta</span>
            <span className="text-lg font-black text-green-400 font-mono">{saldoAtual.toFixed(2)}€</span>
          </div>
          
          <div className="flex gap-2">
            <button onClick={() => setModalMovimento(true)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-xl text-xs font-black uppercase transition-colors">
              Entrada / Saída
            </button>
            <button onClick={() => setModalFechar(true)} className="bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-400 px-4 py-2 rounded-xl text-xs font-black uppercase transition-colors">
              Fechar Caixa
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
        {/* LISTA DE PRODUTOS */}
        <main className="flex-1 p-6 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
          {loading ? (
            <div className="col-span-full text-center text-zinc-500 py-12">A carregar menu...</div>
          ) : produtos.map((prod) => (
            <button
              key={prod.id}
              onClick={() => adicionarAoCarrinho(prod)}
              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-orange-500/50 p-4 rounded-2xl text-left transition-transform active:scale-[0.97] flex flex-col justify-between min-h-[120px] shadow-sm"
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400 bg-orange-500/10 px-2 py-1 rounded-lg">
                  {prod.categoria || 'Geral'}
                </span>
                <h3 className="font-bold mt-3 text-zinc-200 leading-tight">{prod.nome}</h3>
              </div>
              <span className="text-base font-black text-white mt-3 font-mono">{prod.preco.toFixed(2)}€</span>
            </button>
          ))}
        </main>

        {/* CARRINHO LATERAL */}
        <aside className="w-full md:w-96 bg-zinc-900 border-l border-zinc-800 flex flex-col flex-shrink-0 z-20">
          <div className="p-5 border-b border-zinc-800">
            <h2 className="font-black uppercase tracking-wider text-zinc-300 text-sm">Pedido Atual</h2>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 no-scrollbar">
            {carrinho.length === 0 ? (
              <div className="text-center text-zinc-500 mt-10 text-xs uppercase font-bold tracking-widest">Nenhum item adicionado</div>
            ) : (
              carrinho.map((item) => (
                <div key={item.produto.id} className="flex justify-between items-center bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80">
                  <div className="flex-1 min-w-0 pr-3">
                    <h4 className="text-sm font-bold text-zinc-200 truncate">{item.produto.nome}</h4>
                    <span className="text-xs font-mono text-zinc-500">{item.produto.preco.toFixed(2)}€/un</span>
                  </div>
                  <div className="flex items-center gap-3 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                    <button onClick={() => removerDoCarrinho(item.produto.id)} className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">-</button>
                    <span className="text-sm font-black w-4 text-center">{item.quantidade}</span>
                    <button onClick={() => adicionarAoCarrinho(item.produto)} className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">+</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-5 bg-zinc-950 border-t border-zinc-800 space-y-5">
            <div className="space-y-3 pb-4 border-b border-zinc-800/60">
              <div className="flex justify-between items-center text-zinc-400 text-sm font-bold">
                <span>Subtotal:</span>
                <span className="font-mono">{subtotal.toFixed(2)}€</span>
              </div>
              
              <div className="flex justify-between items-center text-zinc-400 text-sm font-bold">
                <span>Desconto Manual:</span>
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg focus-within:border-orange-500 transition-colors overflow-hidden">
                  <span className="pl-3 text-zinc-500">€</span>
                  <input 
                    type="number" min="0" step="0.50"
                    value={desconto === 0 ? '' : desconto}
                    onChange={(e) => setDesconto(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-20 bg-transparent px-2 py-1.5 text-right text-white font-mono text-sm outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-between items-end pt-2">
                <span className="text-xs uppercase tracking-widest font-black text-zinc-300">Total a Cobrar</span>
                <span className="text-3xl font-black text-orange-400 font-mono leading-none">{totalVenda.toFixed(2)}€</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block text-center">Forma de Pagamento</label>
              <div className="grid grid-cols-3 gap-2">
                {(['dinheiro', 'multibanco', 'mbway'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setMetodoPagamento(method)}
                    className={`py-3 px-1 text-[11px] font-black uppercase tracking-wider rounded-xl border text-center transition-all ${
                      metodoPagamento === method
                        ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-600/20'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    {method === 'dinheiro' ? '💵 Num.' : method === 'multibanco' ? '💳 TPA' : '📱 MBW'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={finalizarVenda}
              className="w-full bg-white hover:bg-zinc-200 text-zinc-950 font-black uppercase tracking-widest py-4 rounded-xl transition-transform active:scale-[0.98] shadow-xl"
            >
              Concluir Pedido
            </button>
          </div>
        </aside>
      </div>

      {/* --- MODAL: ENTRADA / SAÍDA DE CAIXA --- */}
      {modalMovimento && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={registarMovimento} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-black text-white uppercase tracking-wider mb-6">Registar Movimento</h2>
            
            <div className="flex gap-2 mb-6">
              <button type="button" onClick={() => setTipoMovimento('saida')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all border ${tipoMovimento === 'saida' ? 'bg-red-950/40 border-red-900/50 text-red-400' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>Saída (Tirar)</button>
              <button type="button" onClick={() => setTipoMovimento('entrada')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all border ${tipoMovimento === 'entrada' ? 'bg-green-950/40 border-green-900/50 text-green-400' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>Entrada (Pôr)</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Valor (€)</label>
                <input type="number" step="0.01" min="0.01" required value={inputValor} onChange={e => setInputValor(parseFloat(e.target.value))} placeholder="0.00" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono font-bold outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Motivo / Descrição</label>
                <input type="text" required value={inputDescricao} onChange={e => setInputDescricao(e.target.value)} placeholder="Ex: Depósito, Embalagens..." className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-blue-500" />
              </div>
            </div>
            
            <div className="flex gap-3 mt-8">
              <button type="button" onClick={() => setModalMovimento(false)} className="flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-wider text-zinc-400 hover:bg-zinc-800">Cancelar</button>
              <button type="submit" className="flex-1 bg-white text-zinc-950 py-4 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg">Confirmar</button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL: FECHAR CAIXA --- */}
      {modalFechar && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl">
            <div className="text-center mb-6">
              <span className="text-3xl mb-3 block">📊</span>
              <h2 className="text-lg font-black text-white uppercase tracking-wider">Fecho de Turno</h2>
            </div>
            
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3 mb-8">
              <div className="flex justify-between text-sm text-zinc-400"><span className="font-bold">Fundo Inicial:</span> <span className="font-mono">{saldoInicial.toFixed(2)}€</span></div>
              <div className="flex justify-between text-sm text-zinc-400"><span className="font-bold">Total Vendas:</span> <span className="font-mono">{totalVendasTurno.toFixed(2)}€</span></div>
              <div className="border-t border-zinc-800 pt-3 flex justify-between items-end">
                <span className="text-xs uppercase tracking-widest font-black text-green-500">Saldo em Gaveta</span>
                <span className="text-2xl font-black font-mono text-green-400">{saldoAtual.toFixed(2)}€</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setModalFechar(false)} className="flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-wider text-zinc-400 hover:bg-zinc-800">Voltar</button>
              <button onClick={fecharCaixa} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-4 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg">Encerrar Caixa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}