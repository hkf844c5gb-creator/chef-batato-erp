'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';

interface Produto {
  id: string; codigo: string; nome: string; 
  precoCardapio: number; precoWhatsapp: number; precoGlovo: number; 
  custoUnitario: number; categoria: string; ativo: boolean;
}

interface ProdutoVinculado {
  produto_id: string;
  acrescimo_preco: number;
  ativo: boolean;
  produto: {
    id: string; codigo: string; nome: string; categoria: string;
    preco_cardapio: number; preco_whatsapp: number; preco_glovo: number;
  };
}

interface GrupoCombo {
  id: string; nome: string; quantidade_minima: number; quantidade_maxima: number;
  obrigatorio: boolean; ordem: number;
  combo_grupo_produtos: ProdutoVinculado[];
}

interface Combo {
  id: string; codigo: string; nome: string; descricao: string;
  tipo_preco: 'fixo' | 'desconto' | 'desconto_fixo' | 'item_gratis';
  preco_fixo: number | null;
  desconto_percentual: number;
  desconto_absoluto: number;
  item_gratis_categoria: string;
  combo_grupos: GrupoCombo[];
}

interface ItemCarrinho {
  produto: Produto;
  quantidade: number;
  isCombo?: boolean;
  comboNome?: string;
  detalhesCombo?: string[];
  precoOriginal?: number;
  precoAplicado: number;
}

type CategoriaFiltro = 'todos' | 'batatas' | 'adicionais' | 'sobremesas' | 'bebidas' | 'combos';

export default function CaixaPDV() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [listaEstafetas, setListaEstafetas] = useState<{ nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroCaixa, setErroCaixa] = useState<string | null>(null);
  const [categoriaAtiva, setCategoriaAtiva] = useState<CategoriaFiltro>('todos');

  // CABEÇALHO DO PEDIDO (Com data do pedido adicionada)
  const [cliente, setCliente] = useState('');
  const [contactoCliente, setContactoCliente] = useState('');
  const [dataPedido, setDataPedido] = useState(() => new Date().toISOString().split('T')[0]); // Data Padrão: Hoje (AAAA-MM-DD)
  const [canal, setCanal] = useState<'Balcão' | 'WhatsApp' | 'Glovo' | 'Palmbites'>('Balcão');
  const [formaPagamento, setFormaPagamento] = useState('Dinheiro');
  const [entregador, setEntregador] = useState('');
  const [taxaEntrega, setTaxaEntrega] = useState('0.00');
  const [descontoManual, setDescontoManual] = useState('0.00');

  // MONTADOR DINÂMICO DE COMBOS
  const [mostrarModalCombo, setMostrarModalCombo] = useState(false);
  const [comboSelecionado, setComboSelecionado] = useState<Combo | null>(null);
  const [selecoesCombo, setSelecoesCombo] = useState<{ [grupoId: string]: ProdutoVinculado[] }>({});

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const regrasPagamento = {
    'Glovo': [
      { value: 'Dinheiro Glovo', label: '💰 Dinheiro Glovo (Pago na recolha)' },
      { value: 'Glovo', label: 'Faturamento Glovo' }
    ],
    'WhatsApp': [
      { value: 'Dinheiro', label: 'Dinheiro' },
      { value: 'MBWay', label: 'MBWay' },
      { value: 'Multibanco', label: 'Multibanco' },
      { value: 'Caderninho', label: '📓 Caderninho (Pagar depois)' }
    ],
    'Palmbites': [
      { value: 'Dinheiro', label: 'Dinheiro' },
      { value: 'MBWay', label: 'MBWay' },
      { value: 'Multibanco', label: 'Multibanco' }
    ],
    'Balcão': [
      { value: 'Dinheiro', label: 'Dinheiro' },
      { value: 'MBWay', label: 'MBWay' },
      { value: 'Multibanco', label: 'Multibanco' },
      { value: 'Caderninho', label: '📓 Caderninho (Pagar depois)' }
    ]
  };

  async function carregarMenuCompleto() {
    setLoading(true);
    setErroCaixa(null);
    try {
      const { data: dataProds, error: errorProds } = await supabase
        .from('produtos')
        .select('*')
        .eq('ativo', true)
        .eq('esgotado', false);
      
      if (errorProds) {
        setErroCaixa(`Erro nos Produtos: ${errorProds.message}`);
        setLoading(false);
        return;
      }

      const produtosFormatados = (dataProds || []).map((p: any) => ({
        id: p.id, codigo: p.codigo || '', nome: p.nome || '',
        precoCardapio: Number(p.preco_cardapio || 0),
        precoWhatsapp: Number(p.preco_whatsapp || p.preco_cardapio || 0),
        precoGlovo: Number(p.preco_glovo || p.preco_cardapio || 0),
        custoUnitario: Number(p.custo_unitario || 0),
        categoria: (p.categoria || p.tipo || '').toLowerCase().trim(),
        ativo: true
      })).filter((p: any) => p.codigo !== 'ADI001');

      setProdutos(produtosFormatados);

      const { data: dataCombos, error: errCombos } = await supabase
        .from('combos')
        .select(`
          id, codigo, nome, descricao, tipo_preco, preco_fixo, desconto_percentual, desconto_absolute:desconto_absoluto, item_gratis_categoria,
          combo_grupos (
            id, nome, quantidade_minima, quantidade_maxima, obrigatorio, ordem,
            combo_grupo_produtos (
              produto_id, acrescimo_preco, ativo,
              produto:produtos (id, codigo, nome, categoria, preco_cardapio, preco_whatsapp, preco_glovo)
            )
          )
        `)
        .eq('ativo', true)
        .eq('esgotado', false);

      if (errCombos) {
        setErroCaixa(`Erro nos Combos: ${errCombos.message}. Vá ao backoffice de combos e salve as regras de novo.`);
        setLoading(false);
        return;
      }

      const combosCarregados = (dataCombos || []).map((cb: any) => ({
        ...cb,
        desconto_absoluto: cb.desconto_absolute || 0,
        combo_grupos: (cb.combo_grupos || []).sort((a: any, b: any) => a.ordem - b.ordem)
      }));

      setCombos(combosCarregados);

      const { data: dataEsts, error: errEsts } = await supabase
        .from('estafetas')
        .select('nome')
        .eq('ativo', true)
        .order('nome', { ascending: true });

      if (errEsts) {
        setErroCaixa(`Erro nos Estafetas: ${errEsts.message}`);
        setLoading(false);
        return;
      }

      const ests = dataEsts || [];
      setListaEstafetas(ests);
      
      if (ests.length > 0 && !entregador) {
        // Se o canal inicial for Glovo, garante a pré-seleção correta
        if (canal === 'Glovo' && ests.some(e => e.nome === 'Estafeta Glovo')) {
          setEntregador('Estafeta Glovo');
        } else {
          setEntregador(ests[0].nome);
        }
      }

    } catch (err: any) {
      setErroCaixa(`Falha crítica de carregamento: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarMenuCompleto(); }, [canal]);

  const getPrecoPorCanal = (prod: any) => {
    const precoGlovo = prod.precoGlovo !== undefined ? prod.precoGlovo : prod.preco_glovo;
    const precoWhatsapp = prod.precoWhatsapp !== undefined ? prod.precoWhatsapp : prod.preco_whatsapp;
    const precoCardapio = prod.precoCardapio !== undefined ? prod.precoCardapio : prod.preco_cardapio;

    if (canal === 'Glovo') return Number(precoGlovo || precoCardapio || 0);
    if (canal === 'WhatsApp') return Number(precoWhatsapp || precoCardapio || 0);
    return Number(precoCardapio || 0);
  };

  const getOrdemCategoria = (cat: string) => {
    if (cat === 'batata') return 1;
    if (cat === 'adicional' || cat === 'extra' || cat === 'outro') return 2;
    if (cat === 'bebida') return 3;
    if (cat === 'brownie' || cat === 'sobremesa') return 4;
    return 5;
  };

  const produtosFiltrados = produtos
    .filter((prod) => {
      if (categoriaAtiva === 'todos') return true;
      if (categoriaAtiva === 'batatas') return prod.categoria === 'batata';
      if (categoriaAtiva === 'adicionais') return prod.categoria === 'adicional' || prod.categoria === 'extra' || prod.categoria === 'outro';
      if (categoriaAtiva === 'sobremesas') return prod.categoria === 'brownie' || prod.categoria === 'sobremesa';
      if (categoriaAtiva === 'bebidas') return prod.categoria === 'bebida';
      return false;
    })
    .sort((a, b) => getOrdemCategoria(a.categoria) - getOrdemCategoria(b.categoria));

  const adicionarAoCarrinho = (produto: Produto) => {
    const precoAtual = getPrecoPorCanal(produto);
    setCarrinho((prev) => {
      const itemExistente = prev.find((item) => item.produto.id === produto.id && !item.isCombo);
      if (itemExistente) {
        return prev.map((item) =>
          item.produto.id === produto.id && !item.isCombo ? { ...item, quantidade: item.quantidade + 1 } : item
        );
      }
      return [...prev, { produto, quantity: 1, quantidade: 1, precoAplicado: precoAtual }];
    });
  };

  const removerDoCarrinho = (indexParaRemover: number) => {
    setCarrinho((prev) => prev.map((item, idx) => (idx === indexParaRemover ? { ...item, quantidade: item.quantidade - 1 } : item)).filter((item) => item.quantidade > 0));
  };

  const iniciarMontagemCombo = (combo: Combo) => {
    setComboSelecionado(combo);
    setSelecoesCombo({});
    setMostrarModalCombo(true);
  };

  const toggleSelecaoCombo = (grupo: GrupoCombo, item: ProdutoVinculado) => {
    setSelecoesCombo(prev => {
      const selecoesDoGrupo = prev[grupo.id] || [];
      const jaSelecionado = selecoesDoGrupo.some(s => s.produto_id === item.produto_id);
      
      if (jaSelecionado) {
        return { ...prev, [grupo.id]: selecoesDoGrupo.filter(s => s.produto_id !== item.produto_id) };
      } else {
        if (selecoesDoGrupo.length < grupo.quantidade_maxima) {
          return { ...prev, [grupo.id]: [...selecoesDoGrupo, item] };
        } else if (grupo.quantidade_maxima === 1) {
          return { ...prev, [grupo.id]: [item] };
        }
        return prev;
      }
    });
  };

  const confirmarMontagemCombo = () => {
    if (!comboSelecionado) return;

    for (const grupo of comboSelecionado.combo_grupos) {
      const selecoes = selecoesCombo[grupo.id] || [];
      if (grupo.obrigatorio && selecoes.length < grupo.quantidade_minima) {
        return alert(`O grupo "${grupo.nome}" exige no mínimo ${grupo.quantidade_minima} item(ns).`);
      }
    }

    let somaPrecosOriginais = 0;
    let somaAcrescimos = 0;
    const itensComDetalhes: any[] = [];

    Object.values(selecoesCombo).forEach(selecoesGrupo => {
      selecoesGrupo.forEach(item => {
        const precoItem = getPrecoPorCanal(item.produto);
        somaPrecosOriginais += precoItem;
        somaAcrescimos += Number(item.acrescimo_preco);
        
        itensComDetalhes.push({
          id: item.produto_id,
          nome: item.produto.nome,
          categoria: (item.produto.categoria || '').toLowerCase().trim(),
          precoBase: precoItem,
          acrescimo: Number(item.acrescimo_preco),
          isGratis: false
        });
      });
    });

    let precoBaseCombo = 0;
    let detalheDesconto = '';

    if (comboSelecionado.tipo_preco === 'fixo') {
      precoBaseCombo = Number(comboSelecionado.preco_fixo);
      detalheDesconto = `🏷️ Preço Fixo Especial`;
    } 
    else if (comboSelecionado.tipo_preco === 'desconto') {
      const percentual = Number(comboSelecionado.desconto_percentual) || 0;
      precoBaseCombo = somaPrecosOriginais * (1 - percentual / 100);
      detalheDesconto = `🔻 Desconto Combo (-${percentual}%)`;
    } 
    else if (comboSelecionado.tipo_preco === 'desconto_fixo') {
      const descontoFx = Number(comboSelecionado.desconto_absoluto) || 0;
      precoBaseCombo = Math.max(0, somaPrecosOriginais - descontoFx);
      detalheDesconto = `🔻 Desconto Combo (-${descontoFx.toFixed(2)}€)`;
    } 
    else if (comboSelecionado.tipo_preco === 'item_gratis') {
      const catGratis = (comboSelecionado.item_gratis_categoria || '').toLowerCase().trim();
      let itemParaFicarGratis = null;

      if (catGratis === 'mais_barato') {
        if (itensComDetalhes.length > 0) {
          itemParaFicarGratis = itensComDetalhes.reduce((prev, curr) => prev.precoBase < curr.precoBase ? prev : curr);
        }
      } else {
        const itensDaCat = itensComDetalhes.filter(it => it.categoria === catGratis || (catGratis === 'sobremesa' && it.categoria === 'brownie'));
        if (itensDaCat.length > 0) {
          itemParaFicarGratis = itensDaCat[0];
        }
      }

      if (itemParaFicarGratis) {
        itemParaFicarGratis.isGratis = true;
        precoBaseCombo = Math.max(0, somaPrecosOriginais - itemParaFicarGratis.precoBase);
      } else {
        precoBaseCombo = somaPrecosOriginais;
      }
    }

    const detalhesFormatados = itensComDetalhes.map(it => {
      if (it.isGratis) {
         const txtAcrescimo = it.acrescimo > 0 ? ` (+${it.acrescimo.toFixed(2)}€ tx)` : '';
         return `${it.nome} (🎁 Grátis${txtAcrescimo})`;
      } else {
         const precoTotalDesteItem = it.precoBase + it.acrescimo;
         return `${it.nome} (${precoTotalDesteItem.toFixed(2)}€)`;
      }
    });

    if (detalheDesconto) detalhesFormatados.push(detalheDesconto);

    const precoFinalAplicado = precoBaseCombo + somaAcrescimos;
    const precoSemDesconto = somaPrecosOriginais + somaAcrescimos;

    setCarrinho((prev) => [
      ...prev,
      {
        produto: {
          id: `${comboSelecionado.id}_${Date.now()}`, codigo: 'COMBO', nome: comboSelecionado.nome,
          precoCardapio: precoFinalAplicado, precoWhatsapp: precoFinalAplicado, precoGlovo: precoFinalAplicado, 
          custoUnitario: 0, categoria: 'combo', ativo: true
        },
        quantidade: 1, isCombo: true, comboNome: comboSelecionado.nome, 
        detalhesCombo: detalhesFormatados, 
        precoOriginal: Number(precoSemDesconto.toFixed(2)), 
        precoAplicado: Number(precoFinalAplicado.toFixed(2))
      }
    ]);

    setMostrarModalCombo(false);
  };

  const subtotalProdutos = carrinho.reduce((acc, item) => acc + item.precoAplicado * item.quantidade, 0);
  const totalGeral = Math.max(0, subtotalProdutos - (parseFloat(descontoManual) || 0)) + (parseFloat(taxaEntrega) || 0);

  const finalizarVenda = async () => {
    if (carrinho.length === 0) return alert('O carrinho está vazio!');
    if (!cliente.trim()) return alert('Insira o nome do cliente!');
    
    const estaPago = formaPagamento !== 'Caderninho';

    // 🕒 MONTA A DATA RETROATIVA: Junta o dia escolhido com o horário do relógio atual
    const agora = new Date();
    const tempoAtual = agora.toTimeString().split(' ')[0]; // Formato HH:MM:SS
    const dataHoraCriacaoCompleta = `${dataPedido}T${tempoAtual}`;

    try {
      const { data: pedidoGravado, error: erroPedido } = await supabase
        .from('pedidos')
        .insert([{ 
          cliente: cliente.trim(), 
          contacto_cliente: contactoCliente.trim(),
          canal: canal, 
          forma_pagamento: formaPagamento, 
          entregador: entregador, 
          taxa_entrega: parseFloat(taxaEntrega), 
          desconto: parseFloat(descontoManual) || 0,
          total_geral: totalGeral,
          pago: estaPago,
          criado_em: dataHoraCriacaoCompleta // Força a data escolhida no topo
        }])
        .select().single();
      
      if (erroPedido) throw erroPedido;
      
      if (pedidoGravado) {
        const itensDB = carrinho.map(item => ({ 
          pedido_id: pedidoGravado.id, 
          produto_id: item.isCombo ? null : item.produto.id, 
          codigo_produto: item.produto.codigo, 
          nome_produto: item.isCombo ? `${item.produto.nome} (${item.detalhesCombo?.join(', ')})` : item.produto.nome, 
          quantidade: item.quantidade, 
          preco_unitario: item.precoAplicado 
        }));
        const { error: erroItens } = await supabase.from('itens_pedido').insert(itensDB);
        if (erroItens) throw erroItens;
      }
      
      alert(`Pedido registado com sucesso!`);
      setCarrinho([]); setCliente(''); setContactoCliente(''); setTaxaEntrega('0.00'); setDescontoManual('0.00');
      setDataPedido(new Date().toISOString().split('T')[0]); // Reseta a data para hoje
    } catch (err: any) { 
      alert(`Erro ao gravar pedido: ${err.message || JSON.stringify(err)}`); 
    }
  };

  const renderBotaoCombo = (combo: Combo) => (
    <button key={combo.id} onClick={() => iniciarMontagemCombo(combo)} className="bg-zinc-900 hover:bg-zinc-800 border border-orange-500/20 p-5 rounded-2xl text-left h-40 flex flex-col justify-between">
      <div><span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">COMBO DINÂMICO</span><h3 className="font-bold mt-2 text-zinc-100">{combo.nome}</h3><p className="text-xs text-zinc-400 mt-1 line-clamp-2">{combo.descricao}</p></div>
      <div className="text-xs font-semibold text-orange-500">Montar Opções ➜</div>
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative font-sans">
      
      {/* ========================================== */}
      {/* NOVA BARRA DE TOPO COM BOTÃO DE VOLTAR     */}
      {/* ========================================== */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-5 py-3 flex justify-between items-center">
        <Link href="/admin" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors">
          ⬅️ Voltar ao Menu Principal
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xl">🥔</span>
          <span className="text-xs font-bold text-orange-500 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Caixa Aberta
          </span>
        </div>
      </div>
      {/* ========================================== */}

      {erroCaixa && (
        <div className="m-6 bg-red-950/50 border border-red-900 p-5 rounded-2xl z-50">
          <h2 className="text-red-500 font-bold text-sm uppercase tracking-wider mb-2">⚠️ Bloqueio de Sincronização POS</h2>
          <code className="block bg-black/50 p-3 rounded-lg text-red-400 font-mono text-xs">{erroCaixa}</code>
        </div>
      )}

      {/* 📊 GRELA DO CABEÇALHO EXPANDIDA PARA 8 COLUNAS */}
      {!erroCaixa && (
        <div className="bg-zinc-900 border-b border-zinc-800 p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 shadow-xl">
          <div><label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Cliente</label><input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:border-orange-500 outline-none" /></div>
          <div><label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Contacto</label><input type="text" value={contactoCliente} onChange={(e) => setContactoCliente(e.target.value)} placeholder="Telemóvel" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:border-orange-500 outline-none" /></div>
          
          {/* 📅 NOVO CAMPO: DATA OPERACIONAL */}
          <div><label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Data do Pedido</label><input type="date" value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:border-orange-500 outline-none cursor-pointer" /></div>
          
          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Canal</label>
            <select 
              value={canal} 
              onChange={(e) => {
                const novoCanal = e.target.value as any;
                setCanal(novoCanal);
                setFormaPagamento(regrasPagamento[novoCanal as keyof typeof regrasPagamento][0].value);
                
                // ✨ SELEÇÃO AUTOMÁTICA DO ESTAFETA GLOVO
                if (novoCanal === 'Glovo') {
                  setEntregador('Estafeta Glovo');
                }
              }} 
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:border-orange-500 outline-none"
            >
              <option value="Balcão">Balcão</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Glovo">Glovo</option>
              <option value="Palmbites">Palmbites</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Pagamento</label>
            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:border-orange-500 outline-none">
              {regrasPagamento[canal].map(opcao => (
                <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Estafeta</label>
            <select value={entregador} onChange={(e) => setEntregador(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:border-orange-500 outline-none">
              {listaEstafetas.map(est => (
                <option key={est.nome} value={est.nome}>{est.nome}</option>
              ))}
            </select>
          </div>
          <div><label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Taxa Entrega (€)</label><input type="number" step="0.10" min="0" value={taxaEntrega} onChange={(e) => setTaxaEntrega(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-orange-400 focus:border-orange-500 outline-none" /></div>
          <div><label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Desconto (€)</label><input type="number" step="0.50" min="0" value={descontoManual} onChange={(e) => setDescontoManual(e.target.value)} className="w-full bg-zinc-950 border border-red-900/50 rounded-xl px-3 py-2 text-sm font-bold text-red-400 focus:border-red-500 outline-none" /></div>
        </div>
      )}

      {/* ÁREA CENTRAL */}
      {!erroCaixa && (
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 p-6 overflow-y-auto flex flex-col gap-6">
            <div className="flex flex-wrap gap-2 bg-zinc-900/60 p-2 rounded-2xl border border-zinc-800/80">
              {[
                { id: 'todos', label: 'Todos' }, 
                { id: 'batatas', label: '🥔 Batatas' }, 
                { id: 'adicionais', label: '🥓 Adicionais' }, 
                { id: 'sobremesas', label: '🍫 Sobremesas' }, 
                { id: 'bebidas', label: '🥤 Bebidas' }, 
                { id: 'combos', label: '🎁 Combos' }
              ].map((cat) => (
                <button key={cat.id} onClick={() => setCategoriaAtiva(cat.id as CategoriaFiltro)} className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${categoriaAtiva === cat.id ? 'bg-orange-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200'}`}>{cat.label}</button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start flex-1">
              {loading ? (
                <div className="col-span-full text-center text-zinc-500 py-12">A sincronizar com a base de dados...</div>
              ) : categoriaAtiva === 'combos' ? (
                combos.map(renderBotaoCombo)
              ) : (
                <>
                  {produtosFiltrados.map((prod) => (
                    <button key={prod.id} onClick={() => adicionarAoCarrinho(prod)} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-4 rounded-xl text-left flex flex-col justify-between h-32">
                      <div><div className="flex justify-between items-start"><span className="text-[9px] font-bold uppercase text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">{prod.categoria}</span></div><h3 className="font-semibold mt-2 text-zinc-200 text-sm">{prod.nome}</h3></div>
                      <span className="text-base font-bold text-white mt-1">{getPrecoPorCanal(prod).toFixed(2)}€</span>
                    </button>
                  ))}
                  {categoriaAtiva === 'todos' && combos.map(renderBotaoCombo)}
                </>
              )}
            </div>
          </main>

          <aside className="w-96 bg-zinc-900 border-l border-zinc-800 flex flex-col">
            <div className="p-4 border-b border-zinc-800 font-semibold text-zinc-300 flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-xs text-zinc-500">Pedido de:</span>
                <span className="text-white font-bold">{cliente || '---'}</span>
                {contactoCliente && <span className="text-[10px] text-zinc-400 mt-0.5">📞 {contactoCliente}</span>}
              </div>
              <span className="text-xs text-zinc-400 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">{canal}</span>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {carrinho.map((item, idx) => (
                <div key={idx} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex flex-col gap-1 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 pr-2">
                      {item.isCombo && <span className="inline-block text-[9px] font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded mb-1.5 uppercase">COMBO</span>}
                      <h4 className={`text-xs font-bold text-zinc-200 ${item.isCombo ? '' : 'truncate'}`}>{item.produto.nome}</h4>
                      
                      {item.isCombo && item.detalhesCombo && item.detalhesCombo.length > 0 && (
                        <ul className="mt-2 mb-1.5 space-y-1">
                          {item.detalhesCombo.map((detalhe, i) => {
                            const isSpecial = detalhe.includes('Grátis') || detalhe.includes('Desconto') || detalhe.includes('Especial');
                            return (
                              <li key={i} className={`text-[10px] flex items-start gap-1.5 ${isSpecial ? 'text-green-400 font-bold' : 'text-zinc-400'}`}>
                                <span className="text-zinc-600 mt-0.5">↳</span> {detalhe}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      <div className="text-xs text-zinc-400 mt-1"><span className="font-semibold text-zinc-300">{item.precoAplicado.toFixed(2)}€ × {item.quantidade}</span></div>
                    </div>
                    <button onClick={() => removerDoCarrinho(idx)} className="bg-zinc-900 hover:bg-red-950 hover:text-red-400 w-6 h-6 rounded flex items-center justify-center text-zinc-400 text-xs transition-colors">✕</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-zinc-950 border-t border-zinc-800 space-y-3">
              <div className="flex justify-between items-center text-zinc-400 text-xs"><span>Subtotal:</span><span className="text-white font-medium">{subtotalProdutos.toFixed(2)}€</span></div>
              {parseFloat(descontoManual) > 0 && <div className="flex justify-between items-center text-red-400 text-xs"><span>Desconto:</span><span>-{parseFloat(descontoManual).toFixed(2)}€</span></div>}
              <div className="flex justify-between items-center text-zinc-400 text-xs"><span>Taxa de Entrega:</span><span className="text-white font-medium">{parseFloat(taxaEntrega).toFixed(2)}€</span></div>
              <div className="flex justify-between items-center border-t border-zinc-800 pt-2 text-zinc-300 text-sm"><span>Total a Cobrar:</span><span className="text-orange-500 font-black text-xl">{totalGeral.toFixed(2)}€</span></div>
              <button onClick={finalizarVenda} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl text-center text-sm shadow-lg">Confirmar & Lançar Pedido</button>
            </div>
          </aside>
        </div>
      )}

      {/* MODAL DO CONSTRUTOR DE COMBOS */}
      {mostrarModalCombo && comboSelecionado && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl p-6 flex flex-col max-h-[90vh] shadow-2xl">
            <button onClick={() => setMostrarModalCombo(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-white">✕</button>
            <h2 className="text-xl font-bold text-orange-500">{comboSelecionado.nome}</h2>
            
            <div className="flex-1 overflow-y-auto space-y-6 pr-1 mt-6">
              {comboSelecionado.combo_grupos.length === 0 ? (
                <div className="text-center text-zinc-500 py-8">Não há grupos configurados para este combo. Vá ao Backoffice.</div>
              ) : (
                comboSelecionado.combo_grupos.map((grupo) => {
                  const selecoesDesteGrupo = selecoesCombo[grupo.id] || [];
                  const atingiuMaximo = selecoesDesteGrupo.length >= grupo.quantidade_maxima;

                  return (
                    <div key={grupo.id}>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex justify-between">
                        <span>{grupo.nome} ({selecoesDesteGrupo.length}/{grupo.quantidade_maxima})</span>
                        {grupo.obrigatorio && <span className="text-orange-500">Obrigatório</span>}
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {grupo.combo_grupo_produtos
                          .filter(item => item.ativo)
                          .map((item) => {
                            const estaSelecionado = selecoesDesteGrupo.some(s => s.produto_id === item.produto_id);
                            const labelAcrescimo = item.acrescimo_preco > 0 ? ` (+${item.acrescimo_preco.toFixed(2)}€ tx)` : '';
                            
                            return (
                              <button 
                                key={item.produto_id} 
                                type="button" 
                                onClick={() => toggleSelecaoCombo(grupo, item)} 
                                className={`p-3 text-left rounded-xl text-xs border transition-all ${
                                  estaSelecionado 
                                    ? 'bg-orange-600/20 border-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.15)]' 
                                    : atingiuMaximo 
                                      ? 'bg-zinc-950/50 border-zinc-800/50 text-zinc-600 opacity-50 cursor-not-allowed'
                                      : 'bg-zinc-950 border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300'
                                }`}
                              >
                                <span className="block font-medium truncate">{item.produto.nome}</span>
                                {labelAcrescimo && <span className="block text-[10px] text-orange-400 font-mono mt-0.5">{labelAcrescimo}</span>}
                              </button>
                            );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-zinc-800 mt-6">
              <button type="button" onClick={confirmarMontagemCombo} className="flex-1 bg-orange-600 hover:bg-orange-700 py-3 rounded-xl text-sm font-bold shadow-lg text-white transition-all">
                Adicionar Combo ao Carrinho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
