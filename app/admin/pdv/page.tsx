'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================================
// 🖨️ MOTOR DE IMPRESSÃO TÉRMICA (MODO ESC/POS DIRETO - MODO PALMBITES)
// ============================================================================
export const imprimirReciboTermico = (pedido: any) => {
  if (typeof window !== 'undefined' && (window as any).imprimirSilencioso) {
    (window as any).imprimirSilencioso(JSON.stringify(pedido));
  } else {
    alert("ERRO: O Motor ESC/POS profissional só funciona dentro do sistema instalado no Windows.");
  }
};
// ============================================================================

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
  itensBaseId?: string[]; 
}

type CategoriaFiltro = 'todos' | 'batatas' | 'adicionais' | 'sobremesas' | 'bebidas' | 'combos';

export default function CaixaPDV() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [listaEstafetas, setListaEstafetas] = useState<{ nome: string }[]>([]);
  const [listaClientesCadastrados, setListaClientesCadastrados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroCaixa, setErroCaixa] = useState<string | null>(null);
  const [categoriaAtiva, setCategoriaAtiva] = useState<CategoriaFiltro>('todos');

  const [cliente, setCliente] = useState('');
  const [contactoCliente, setContactoCliente] = useState('');
  const [moradaCliente, setMoradaCliente] = useState('');
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

  const [dataPedido, setDataPedido] = useState(() => new Date().toISOString().split('T')[0]);
  const [canal, setCanal] = useState<'Balcão' | 'WhatsApp' | 'Glovo' | 'Palmbites'>('Balcão');
  const [formaPagamento, setFormaPagamento] = useState('Dinheiro');
  const [entregador, setEntregador] = useState('');
  const [taxaEntrega, setTaxaEntrega] = useState('0.00');
  const [descontoManual, setDescontoManual] = useState('0.00');
  
  const [imprimirAtivado, setImprimirAtivado] = useState(false);
  const [isProcessando, setIsProcessando] = useState(false);

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
      { value: 'Stripe', label: '💳 Stripe (Cartão/Online)' },
      { value: 'Caderninho', label: '📓 Caderninho (Pagar depois)' }
    ],
    'Palmbites': [
      { value: 'Dinheiro', label: 'Dinheiro' },
      { value: 'MBWay', label: 'MBWay' },
      { value: 'Multibanco', label: 'Multibanco' },
      { value: 'Stripe', label: '💳 Stripe (Cartão/Online)' }
    ],
    'Balcão': [
      { value: 'Dinheiro', label: 'Dinheiro' },
      { value: 'MBWay', label: 'MBWay' },
      { value: 'Multibanco', label: 'Multibanco' },
      { value: 'Stripe', label: '💳 Stripe (Cartão/Online)' },
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
      
      if (errorProds) throw errorProds;

      const produtosFormatados = (dataProds || []).map((p: any) => ({
        id: p.id, codigo: p.codigo || '', nome: p.nome || '',
        precoCardapio: Number(p.preco_cardapio || 0),
        precoWhatsapp: Number(p.preco_whatsapp || p.preco_cardapio || 0),
        precoGlovo: Number(p.preco_glovo || p.preco_cardapio || 0),
        custoUnitario: Number(p.custo_unitario || 0),
        categoria: (p.categoria || p.tipo || '').toLowerCase().trim(),
        ativo: true
      })).filter((p: any) => 
        p.codigo !== 'ADI001' && p.categoria !== 'embalagem' && p.categoria !== 'material' && p.categoria !== 'uso interno'
      );

      setProdutos(produtosFormatados);

      // ⚠️ OTIMIZAÇÃO: Removemos a leitura pesada da tabela de Pedidos aqui.
      // Vamos ler APENAS a tabela de clientes cadastrados, que é muito mais leve e rápida.
      const clientesMap = new Map();
      const { data: dataClientesTable } = await supabase.from('clientes').select('*');
      if (dataClientesTable) {
        dataClientesTable.forEach((c: any) => {
          const nome = c.nome || c.cliente || '';
          if (nome) {
            clientesMap.set(nome.trim().toLowerCase(), { id: c.id, nome: nome.trim(), contacto: c.contacto || c.telefone || c.telemovel || '', morada: c.morada || c.endereco || '' });
          }
        });
      }

      setListaClientesCadastrados(Array.from(clientesMap.values()));

      const { data: dataCombos, error: errCombos } = await supabase
        .from('combos')
        .select(`
          id, codigo, nome, descricao, tipo_preco, preco_fixo, desconto_percentual, desconto_absolute:desconto_absoluto, item_gratis_categoria,
          combo_grupos (
            id, nome, quantidade_minima, quantidade_maxima, obrigatorio, ordem,
            combo_grupo_produtos (produto_id, acrescimo_preco, ativo, produto:produtos (id, codigo, nome, categoria, preco_cardapio, preco_whatsapp, preco_glovo))
          )
        `)
        .eq('ativo', true)
        .eq('esgotado', false);

      if (errCombos) throw errCombos;

      const combosCarregados = (dataCombos || []).map((cb: any) => ({
        ...cb, desconto_absoluto: cb.desconto_absolute || 0,
        combo_grupos: (cb.combo_grupos || []).sort((a: any, b: any) => a.ordem - b.ordem)
      }));

      setCombos(combosCarregados);

      const { data: dataEsts } = await supabase.from('estafetas').select('nome').order('nome', { ascending: true });
      setListaEstafetas(dataEsts || []);

    } catch (err: any) {
      setErroCaixa(`Falha crítica de carregamento: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  // Só corre 1 vez ao abrir a página (ou mudar de canal), poupando muita memória!
  useEffect(() => { carregarMenuCompleto(); }, [canal]);

  const getPrecoPorCanal = (prod: any) => {
    const precoGlovo = prod.precoGlovo !== undefined ? prod.precoGlovo : prod.preco_glovo;
    const precoWhatsapp = prod.precoWhatsapp !== undefined ? prod.precoWhatsapp : prod.preco_whatsapp;
    const precoCardapio = prod.precoCardapio !== undefined ? prod.precoCardapio : prod.preco_cardapio;

    if (canal === 'Glovo') return Number(precoGlovo || precoCardapio || 0);
    if (canal === 'WhatsApp') return Number(precoWhatsapp || precoCardapio || 0);
    return Number(precoCardapio || 0);
  };

  const selecionarClienteSugerido = (c: any) => {
    setCliente(c.nome || c.Nome || c.nome_cliente || c.cliente || c.NOME || '');
    setContactoCliente(c.contacto || c.telefone || c.telemovel || c.Contacto || '');
    setMoradaCliente(c.morada || c.endereco || c.Morada || '');
    setMostrarSugestoes(false); 
  };

  const adicionarAoCarrinho = (produto: Produto) => {
    const precoAtual = getPrecoPorCanal(produto);
    setCarrinho((prev) => {
      const itemExistente = prev.find((item) => item.produto.id === produto.id && !item.isCombo);
      if (itemExistente) {
        return prev.map((item) => item.produto.id === produto.id && !item.isCombo ? { ...item, quantidade: item.quantidade + 1 } : item);
      }
      return [...prev, { produto, quantidade: 1, precoAplicado: precoAtual }];
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
      if (grupo.quantidade_maxima === 1) {
        const jaSelecionado = selecoesDoGrupo.some(s => s.produto_id === item.produto_id);
        if (jaSelecionado) return { ...prev, [grupo.id]: [] };
        else return { ...prev, [grupo.id]: [item] };
      }
      const currentCount = selecoesDoGrupo.filter(s => s.produto_id === item.produto_id).length;
      const remainingSpace = grupo.quantidade_maxima - selecoesDoGrupo.length;
      const maxAllowedForThisItem = Math.min(grupo.quantidade_maxima, currentCount + remainingSpace);

      let newCount = currentCount + 1;
      if (newCount > maxAllowedForThisItem) newCount = 0; 
      const otherItems = selecoesDoGrupo.filter(s => s.produto_id !== item.produto_id);
      const newItemsToAdd = Array(newCount).fill(item);
      return { ...prev, [grupo.id]: [...otherItems, ...newItemsToAdd] };
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

    let somaPrecosOriginais = 0, somaAcrescimos = 0;
    const itensComDetalhes: any[] = [], idsDosProdutosBase: string[] = [];

    Object.values(selecoesCombo).forEach(selecoesGrupo => {
      selecoesGrupo.forEach(item => {
        const precoItem = getPrecoPorCanal(item.produto);
        somaPrecosOriginais += precoItem;
        somaAcrescimos += Number(item.acrescimo_preco);
        idsDosProdutosBase.push(item.produto_id);
        
        itensComDetalhes.push({
          id: item.produto_id, nome: item.produto.nome,
          categoria: (item.produto.categoria || '').toLowerCase().trim(),
          precoBase: precoItem, acrescimo: Number(item.acrescimo_preco), isGratis: false
        });
      });
    });

    let precoBaseCombo = 0, detalheDesconto = '';

    if (comboSelecionado.nome.toLowerCase().includes('para dois')) {
      const descontoComboForcado = canal === 'Glovo' ? 1.70 : 1.50;
      precoBaseCombo = Math.max(0, somaPrecosOriginais - descontoComboForcado);
      detalheDesconto = `🔻 Desconto Combo (-${descontoComboForcado.toFixed(2)}€)`;
    } else if (comboSelecionado.tipo_preco === 'fixo') {
      precoBaseCombo = Number(comboSelecionado.preco_fixo);
      detalheDesconto = `🏷️ Preço Fixo Especial`;
    } else if (comboSelecionado.tipo_preco === 'desconto') {
      const percentual = Number(comboSelecionado.desconto_percentual) || 0;
      precoBaseCombo = somaPrecosOriginais * (1 - percentual / 100);
      detalheDesconto = `🔻 Desconto Combo (-${percentual}%)`;
    } else if (comboSelecionado.tipo_preco === 'desconto_fixo') {
      const descontoFx = Number(comboSelecionado.desconto_absoluto) || 0;
      precoBaseCombo = Math.max(0, somaPrecosOriginais - descontoFx);
      detalheDesconto = `🔻 Desconto Combo (-${descontoFx.toFixed(2)}€)`;
    } else if (comboSelecionado.tipo_preco === 'item_gratis') {
      const catGratis = (comboSelecionado.item_gratis_categoria || '').toLowerCase().trim();
      let itemParaFicarGratis = null;

      if (catGratis === 'mais_barato') {
        if (itensComDetalhes.length > 0) itemParaFicarGratis = itensComDetalhes.reduce((prev, curr) => prev.precoBase < curr.precoBase ? prev : curr);
      } else {
        const itensDaCat = itensComDetalhes.filter(it => it.categoria === catGratis || (catGratis === 'sobremesa' && it.categoria === 'brownie'));
        if (itensDaCat.length > 0) itemParaFicarGratis = itensDaCat[0];
      }

      if (itemParaFicarGratis) {
        itemParaFicarGratis.isGratis = true;
        precoBaseCombo = Math.max(0, somaPrecosOriginais - itemParaFicarGratis.precoBase);
      } else precoBaseCombo = somaPrecosOriginais;
    }

    const detalhesFormatados = itensComDetalhes.map(it => {
      if (it.isGratis) {
         const txtAcrescimo = it.acrescimo > 0 ? ` (+${it.acrescimo.toFixed(2)}€ tx)` : '';
         return `${it.nome} (🎁 Grátis${txtAcrescimo})`;
      } else {
         return `${it.nome} (${(it.precoBase + it.acrescimo).toFixed(2)}€)`;
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
        precoAplicado: Number(precoFinalAplicado.toFixed(2)),
        itensBaseId: idsDosProdutosBase 
      }
    ]);

    setMostrarModalCombo(false);
  };

  const descontarStockAutomaticamente = async (itensDoCarrinho: ItemCarrinho[], numeroDaFatura: string) => {
    try {
      const consumos = new Map<string, number>();
      let quantidadePratos = 0; 

      for (const item of itensDoCarrinho) {
        const cat = (item.produto.categoria || '').toLowerCase();
        
        let qtdPratosDesteItem = item.quantidade;
        if (cat === 'combo' && (item.produto.nome.toLowerCase().includes('dois') || item.produto.nome.toLowerCase().includes('duplo'))) {
          qtdPratosDesteItem = item.quantidade * 2;
        }

        if (cat === 'batata' || cat === 'combo') {
          quantidadePratos += qtdPratosDesteItem;
        }

        const idsParaProcessar = item.isCombo && item.itensBaseId && item.itensBaseId.length > 0 ? item.itensBaseId : [item.produto.id];
        
        for (const produtoBaseId of idsParaProcessar) {
          if (!produtoBaseId) continue;
          const qtdAtual = consumos.get(produtoBaseId) || 0;
          consumos.set(produtoBaseId, qtdAtual + item.quantidade);
        }
      }

      for (const [produtoId, qtdGasta] of consumos.entries()) {
        const { data: prodData, error: errSelect } = await supabase.from('produtos').select('id, nome, estoque_atual').eq('id', produtoId).single();
        
        if (prodData && !errSelect) {
          const stockAtual = Number(prodData.estoque_atual) || 0;
          const novoStockProduto = Math.max(0, stockAtual - qtdGasta);
          
          await supabase.from('produtos').update({ estoque_atual: novoStockProduto }).eq('id', produtoId);

          await supabase.from('movimentos_estoque').insert([{
            produto_id: produtoId, nome_produto: prodData.nome, tipo_movimento: 'SAÍDA', quantidade: qtdGasta,
            saldo_atualizado: novoStockProduto, origem: 'VENDA PDV', observacoes: `Pedido #${numeroDaFatura}`
          }]);
        }
      }

      if (quantidadePratos > 0) {
        const { data: todasEmbalagens } = await supabase.from('produtos').select('id, nome, estoque_atual, categoria');

        if (todasEmbalagens) {
          const embsParaDescontar = todasEmbalagens.filter(e => {
            const cat = (e.categoria || '').toLowerCase();
            return cat.includes('embalagem') || cat.includes('material') || cat.includes('uso');
          });

          for (const emb of embsParaDescontar) {
            const nomeEmb = emb.nome.toLowerCase();
            if (nomeEmb.includes('saco') || nomeEmb.includes('garfo') || nomeEmb.includes('pote') || nomeEmb.includes('embalagem')) {
              const stockAtualEmb = Number(emb.estoque_atual) || 0;
              const novoStockEmb = Math.max(0, stockAtualEmb - quantidadePratos);

              await supabase.from('produtos').update({ estoque_atual: novoStockEmb }).eq('id', emb.id);
              await supabase.from('movimentos_estoque').insert([{
                produto_id: emb.id, nome_produto: emb.nome, tipo_movimento: 'SAÍDA', quantidade: quantidadePratos,
                saldo_atualizado: novoStockEmb, origem: 'VENDA PDV (Automático)', observacoes: `Acompanhamento Pedido #${numeroDaFatura}`
              }]);
            }
          }
        }
      }

    } catch (err) {
      console.error("Erro fatal ao descontar stock:", err);
    }
  };

  const subtotalProdutos = carrinho.reduce((acc, item) => acc + item.precoAplicado * item.quantidade, 0);
  const totalGeral = Math.max(0, subtotalProdutos - (parseFloat(descontoManual) || 0)) + (parseFloat(taxaEntrega) || 0);

  const finalizarVenda = async () => {
    if (carrinho.length === 0) return alert('O carrinho está vazio!');
    if (!cliente.trim()) return alert('Insira o nome do cliente!');
    
    setIsProcessando(true);
    const estaPago = formaPagamento !== 'Caderninho';
    const agora = new Date();
    const dataHoraCriacaoCompleta = `${dataPedido}T${agora.toTimeString().split(' ')[0]}`;

    try {
      const nomeDoCliente = cliente.trim();
      
      const { data: clienteExistente } = await supabase.from('clientes').select('id').eq('nome', nomeDoCliente).single();
        
      if (clienteExistente) {
        await supabase.from('clientes').update({ contacto: contactoCliente.trim(), morada: moradaCliente.trim() }).eq('id', clienteExistente.id);
      } else {
        await supabase.from('clientes').insert([{ nome: nomeDoCliente, contacto: contactoCliente.trim(), morada: moradaCliente.trim() }]);
      }

      // ⚠️ OTIMIZAÇÃO DE ALTA PERFORMANCE (Evita Travamentos): 
      // Busca apenas os últimos 50 pedidos em vez da base inteira, para descobrir o maior número.
      const { data: ultimosPedidos } = await supabase
        .from('pedidos')
        .select('numero_pedido')
        .order('id', { ascending: false })
        .limit(50);
        
      let maiorNumero = 365;
      if (ultimosPedidos) {
        ultimosPedidos.forEach(p => {
          const num = parseInt(p.numero_pedido, 10);
          if (!isNaN(num) && num > maiorNumero) maiorNumero = num;
        });
      }

      const novoNumeroStr = String(maiorNumero + 1);

      const { data: pedidoGravado, error: erroPedido } = await supabase.from('pedidos').insert([{ 
          numero_pedido: novoNumeroStr, 
          cliente: nomeDoCliente, 
          contacto_cliente: contactoCliente.trim(),
          endereco: moradaCliente.trim(),
          canal: canal, 
          forma_pagamento: formaPagamento, 
          entregador: entregador || null, 
          taxa_entrega: parseFloat(taxaEntrega), 
          desconto: parseFloat(descontoManual) || 0,
          total_geral: totalGeral,
          total_liquido: totalGeral,
          pago: estaPago,
          data_pedido: dataPedido, 
          criado_em: dataHoraCriacaoCompleta
        }]).select().single();
      
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
        
        const { error: errItens } = await supabase.from('itens_pedido').insert(itensDB);
        if (errItens) throw errItens;
        
        await descontarStockAutomaticamente(carrinho, novoNumeroStr);

        // ============================================================================
        // 💳 AUTOMAÇÃO: LANÇAR TAXA STRIPE NAS DESPESAS (0.25€ + 1.5%)
        // ============================================================================
        if (formaPagamento === 'Stripe') {
          const taxaFixa = 0.25;
          const taxaVariavel = totalGeral * 0.015;
          const custoStripeFinal = Number((taxaFixa + taxaVariavel).toFixed(2));

          const { error: errStripe } = await supabase.from('despesas').insert([{
            descricao: `Comissão Stripe | Stripe 📄 Pedido #${novoNumeroStr}`,
            categoria: 'Taxas e Comissões (Glovo/Uber)',
            valor: custoStripeFinal,
            data_despesa: dataPedido,
            metodo_pagamento: 'Débito Automático Stripe',
            status: 'Validado' // A taxa já foi cobrada na fonte!
          }]);
          
          if (errStripe) console.error("Aviso: Falha ao lançar despesa Stripe, mas pedido foi salvo:", errStripe);
        }

        if (imprimirAtivado) {
          const dadosRecibo = {
            numero_pedido: novoNumeroStr,
            canal: canal,
            cliente: nomeDoCliente,
            contacto_cliente: contactoCliente.trim(),
            endereco: moradaCliente.trim(),
            itens_pedido: carrinho.map(item => ({
              quantidade: item.quantidade,
              nome_produto: item.isCombo ? `${item.produto.nome} (${item.detalhesCombo?.join(', ')})` : item.produto.nome,
              preco_unitario: item.precoAplicado
            })),
            taxa_entrega: parseFloat(taxaEntrega),
            desconto: parseFloat(descontoManual) || 0,
            total_geral: totalGeral,
            forma_pagamento: formaPagamento,
            pago: estaPago
          };

          imprimirReciboTermico(dadosRecibo);
        }
      }
      
      // ⚠️ OTIMIZAÇÃO: Limpa a tela localmente sem precisar de puxar a base de dados toda de novo!
      setCarrinho([]); 
      setCliente(''); 
      setContactoCliente(''); 
      setMoradaCliente('');
      setTaxaEntrega('0.00'); 
      setDescontoManual('0.00');
      
      // Adiciona o cliente novo à lista de sugestões imediatamente na memória (se não existir)
      setListaClientesCadastrados(prev => {
        if (!prev.some(c => c.nome.toLowerCase() === nomeDoCliente.toLowerCase())) {
          return [...prev, { id: 'novo', nome: nomeDoCliente, contacto: contactoCliente.trim(), morada: moradaCliente.trim() }];
        }
        return prev;
      });

    } catch (err: any) { 
      alert(`Erro ao gravar pedido: ${err.message}`); 
    } finally {
      setIsProcessando(false);
    }
  };

  const renderBotaoCombo = (combo: Combo) => (
    <button key={combo.id} onClick={() => iniciarMontagemCombo(combo)} className="bg-zinc-900 hover:bg-zinc-800 border border-orange-500/20 p-5 rounded-2xl text-left h-40 flex flex-col justify-between transition-all">
      <div><span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">COMBO DINÂMICO</span><h3 className="font-bold mt-2 text-zinc-100">{combo.nome}</h3><p className="text-xs text-zinc-400 mt-1 line-clamp-2">{combo.descricao}</p></div>
      <div className="text-xs font-semibold text-orange-500">Montar Opções ➜</div>
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative font-sans">
      
      <div className="bg-zinc-900 border-b border-zinc-800 px-5 py-3 flex justify-between items-center">
        <div className="flex gap-2">
          <span className="px-4 py-1.5 rounded-lg text-xs font-bold bg-orange-600 text-white">PDV</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl">🥔</span>
          <span className="text-xs font-bold text-orange-500 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Caixa Aberta
          </span>
        </div>
      </div>

      {erroCaixa && (
        <div className="m-6 bg-red-950/50 border border-red-900 p-5 rounded-2xl z-50">
          <h2 className="text-red-500 font-bold text-sm uppercase tracking-wider mb-2">⚠️ Bloqueio de Sincronização POS</h2>
          <code className="block bg-black/50 p-3 rounded-lg text-red-400 font-mono text-xs">{erroCaixa}</code>
        </div>
      )}

      {!erroCaixa && (
        <div className="bg-zinc-900 border-b border-zinc-800 p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4 shadow-xl relative">
          
          <div className="relative col-span-2">
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Cliente / Nome</label>
            <input 
              type="text" 
              value={cliente} 
              onChange={(e) => { setCliente(e.target.value); setMostrarSugestoes(true); }} 
              onFocus={() => setMostrarSugestoes(true)}
              onBlur={() => setTimeout(() => setMostrarSugestoes(false), 200)}
              placeholder="Nome ou Telemóvel..." 
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:border-orange-500 outline-none text-white font-bold transition-all"
              autoComplete="off" 
            />

            {mostrarSugestoes && cliente.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-[100] max-h-60 overflow-y-auto custom-scrollbar">
                {listaClientesCadastrados
                  .filter(c => {
                    const termoBusca = cliente.toLowerCase().trim();
                    return Object.values(c).some(val => val && String(val).toLowerCase().includes(termoBusca));
                  })
                  .map(c => {
                    const nomeExibicao = c.nome || c.Nome || c.nome_cliente || c.cliente || c.NOME || 'Sem Nome';
                    const telExibicao = c.contacto || c.telefone || c.telemovel || c.Contacto || 'S/N';
                    const moradaExibicao = c.morada || c.endereco || c.Morada || '';

                    return (
                      <div key={c.id} onMouseDown={(e) => { e.preventDefault(); selecionarClienteSugerido(c); }} className="p-3 hover:bg-orange-600/20 cursor-pointer border-b border-zinc-800/50 text-xs flex justify-between items-center transition-all">
                        <span className="font-bold text-white">{nomeExibicao}</span>
                        <span className="text-zinc-400 text-[10px] truncate max-w-[150px] text-right">📞 {telExibicao} {moradaExibicao ? `| 📍 ${moradaExibicao}` : ''}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Contacto</label>
            <input type="text" value={contactoCliente} onChange={(e) => setContactoCliente(e.target.value)} placeholder="Telemóvel" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:border-orange-500 outline-none" />
          </div>

          <div className="col-span-2">
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Morada de Entrega</label>
            <input type="text" value={moradaCliente} onChange={(e) => setMoradaCliente(e.target.value)} placeholder="Rua, Número, Andar..." className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:border-orange-500 outline-none text-zinc-200" />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Data</label>
            <input type="date" value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 outline-none cursor-pointer" />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Canal</label>
            <select value={canal} onChange={(e) => { const nc = e.target.value as any; setCanal(nc); setFormaPagamento(regrasPagamento[nc as keyof typeof regrasPagamento][0].value); }} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 outline-none">
              <option value="Balcão">Balcão</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Glovo">Glovo</option>
              <option value="Palmbites">Palmbites</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Pagamento</label>
            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 outline-none">
              {regrasPagamento[canal as keyof typeof regrasPagamento]?.map(opcao => (
                <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Estafeta</label>
            <select value={entregador} onChange={(e) => setEntregador(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 outline-none">
              <option value="">-- Nenhum --</option>
              {listaEstafetas.map(est => (<option key={est.nome} value={est.nome}>{est.nome}</option>))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Taxa Entr. (€)</label>
            <input type="number" step="0.10" min="0" value={taxaEntrega} onChange={(e) => setTaxaEntrega(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-orange-400 outline-none" />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Desconto (€)</label>
            <input type="number" step="0.50" min="0" value={descontoManual} onChange={(e) => setDescontoManual(e.target.value)} className="w-full bg-zinc-950 border border-red-900/50 rounded-xl px-3 py-2 text-sm font-bold text-red-400 outline-none" />
          </div>

        </div>
      )}

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
                  {produtos.filter((prod) => {
                    if (categoriaAtiva === 'todos') return true;
                    if (categoriaAtiva === 'batatas') return prod.categoria === 'batata';
                    if (categoriaAtiva === 'adicionais') return prod.categoria === 'adicional' || prod.categoria === 'extra';
                    if (categoriaAtiva === 'sobremesas') return prod.categoria === 'brownie' || prod.categoria === 'sobremesa';
                    if (categoriaAtiva === 'bebidas') return prod.categoria === 'bebida';
                    return false;
                  }).map((prod) => (
                    <button key={prod.id} onClick={() => adicionarAoCarrinho(prod)} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-4 rounded-xl text-left flex flex-col justify-between h-32 transition-all">
                      <div><span className="text-[9px] font-bold uppercase text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">{prod.categoria}</span><h3 className="font-semibold mt-2 text-zinc-200 text-sm">{prod.nome}</h3></div>
                      <span className="text-base font-bold text-white mt-1">{getPrecoPorCanal(prod).toFixed(2)}€</span>
                    </button>
                  ))}
                  {categoriaAtiva === 'todos' && combos.map(renderBotaoCombo)}
                </>
              )}
            </div>
          </main>

          <aside className="w-96 bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl z-10">
            <div className="p-4 border-b border-zinc-800 font-semibold text-zinc-300 flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-xs text-zinc-500">Pedido de:</span>
                <span className="text-white font-bold">{cliente || '---'}</span>
              </div>
              <span className="text-xs text-zinc-400 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">{canal}</span>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar">
              {carrinho.map((item, idx) => (
                <div key={idx} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 pr-2">
                      {item.isCombo && <span className="inline-block text-[9px] font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded mb-1.5 uppercase">COMBO</span>}
                      <h4 className="text-xs font-bold text-zinc-200">{item.produto.nome}</h4>
                      {item.isCombo && item.detalhesCombo && (
                        <ul className="mt-1 space-y-0.5">
                          {item.detalhesCombo.map((d, i) => (<li key={i} className="text-[10px] text-zinc-400">↳ {d}</li>))}
                        </ul>
                      )}
                      <div className="text-xs text-zinc-400 mt-1">{item.precoAplicado.toFixed(2)}€ × {item.quantidade}</div>
                    </div>
                    <button onClick={() => removerDoCarrinho(idx)} className="text-zinc-500 text-lg hover:text-red-400 px-2">✕</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-zinc-950 border-t border-zinc-800 space-y-3">
              <label className="flex items-center gap-2 text-xs font-bold text-zinc-300 cursor-pointer bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
                <input 
                  type="checkbox" 
                  checked={imprimirAtivado} 
                  onChange={(e) => setImprimirAtivado(e.target.checked)} 
                  className="accent-orange-600 w-4 h-4 cursor-pointer" 
                />
                Imprimir talão automaticamente
              </label>

              <div className="flex justify-between items-center text-zinc-400 text-xs"><span>Subtotal:</span><span className="text-white font-medium">{subtotalProdutos.toFixed(2)}€</span></div>
              {parseFloat(descontoManual) > 0 && <div className="flex justify-between items-center text-red-400 text-xs"><span>Desconto:</span><span>-{parseFloat(descontoManual).toFixed(2)}€</span></div>}
              <div className="flex justify-between items-center text-zinc-400 text-xs"><span>Taxa de Entrega:</span><span className="text-white font-medium">{parseFloat(taxaEntrega).toFixed(2)}€</span></div>
              
              {/* ALERTA DE TAXA STRIPE NO PDV */}
              {formaPagamento === 'Stripe' && (
                <div className="flex justify-between items-center text-amber-500/80 text-[10px] border-t border-zinc-800/50 pt-2">
                  <span>Custo Stripe (Auto):</span>
                  <span>- {((totalGeral * 0.015) + 0.25).toFixed(2)}€</span>
                </div>
              )}

              <div className="flex justify-between items-center border-t border-zinc-800 pt-2 text-zinc-300 text-sm"><span>Total a Cobrar:</span><span className="text-orange-500 font-black text-xl">{totalGeral.toFixed(2)}€</span></div>
              
              <button 
                onClick={finalizarVenda} 
                disabled={isProcessando}
                className="w-full font-bold py-3.5 rounded-xl text-center text-sm shadow-lg bg-orange-600 hover:bg-orange-700 text-white transition-all disabled:opacity-50 uppercase tracking-widest mt-2"
              >
                {isProcessando ? 'A Processar...' : 'Confirmar e Imprimir'}
              </button>
            </div>
          </aside>

        </div>
      )}

      {mostrarModalCombo && comboSelecionado && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl p-6 flex flex-col max-h-[90vh] relative shadow-2xl">
            <button onClick={() => setMostrarModalCombo(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-white bg-zinc-800 w-8 h-8 rounded-full flex items-center justify-center">✕</button>
            <h2 className="text-xl font-bold text-orange-500">{comboSelecionado.nome}</h2>
            <p className="text-xs text-zinc-400 mt-1">Selecione os sabores clicando nas caixas abaixo.</p>
            
            <div className="flex-1 overflow-y-auto space-y-6 mt-6 pr-1 custom-scrollbar">
              {comboSelecionado.combo_grupos.map((grupo) => {
                const selecoesDesteGrupo = selecoesCombo[grupo.id] || [];
                return (
                  <div key={grupo.id}>
                    <h3 className="text-xs font-bold text-zinc-300 uppercase mb-3 flex items-center justify-between border-b border-zinc-800 pb-2">
                      <span>{grupo.nome}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] ${selecoesDesteGrupo.length >= grupo.quantidade_maxima ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                        ({selecoesDesteGrupo.length}/{grupo.quantidade_maxima})
                      </span>
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {grupo.combo_grupo_produtos.filter(i => i.ativo).map((item) => {
                        const qtdSelecionadaDesteItem = selecoesDesteGrupo.filter(s => s.produto_id === item.produto_id).length;
                        const estaSelecionado = qtdSelecionadaDesteItem > 0;
                        
                        return (
                          <button 
                            key={item.produto_id} type="button" onClick={() => toggleSelecaoCombo(grupo, item)} 
                            className={`p-4 text-left rounded-xl text-xs border transition-all ${estaSelecionado ? 'bg-orange-600/20 border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.15)]' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                          >
                            <div className="flex justify-between items-center gap-2">
                              <span className="block font-medium">{item.produto.nome}</span>
                              {qtdSelecionadaDesteItem > 1 && (
                                <span className="bg-orange-500 text-white px-2 py-0.5 rounded text-[10px] font-black shadow-md">
                                  x{qtdSelecionadaDesteItem}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-zinc-800 mt-6">
              <button type="button" onClick={confirmarMontagemCombo} className="w-full bg-orange-600 hover:bg-orange-700 py-3.5 rounded-xl text-sm font-bold text-white uppercase tracking-widest shadow-lg">Adicionar Combo ao Carrinho</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}