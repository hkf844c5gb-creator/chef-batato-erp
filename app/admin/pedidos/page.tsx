'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================================
// IMPRESSÃO TÉRMICA
// ============================================================================
export const imprimirReciboTermico = (pedido: any) => {
  const taxaEntrega = Number(pedido.taxa_entrega || 0);
  const desconto = Number(pedido.desconto || 0);
  const totalGeral = Number(pedido.total_geral || 0);
  const subtotal = totalGeral - taxaEntrega + desconto;
  const itensDoPedido = pedido.itens || pedido.itens_pedido || [];

  const moeda = (valor: number) => {
    return Number(valor || 0).toFixed(2).replace('.', ',');
  };

  const escaparHtml = (texto: any) => {
    return String(texto ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const linhasItens = itensDoPedido.map((item: any) => {
    const quantidade = Number(item.quantidade || 1);
    const precoUnitario = Number(item.preco_unitario || 0);
    const precoTotal = quantidade * precoUnitario;
    const nomeOriginal = String(item.nome_produto || '');
    const ehCombo = item.codigo_produto === 'COMBO' || nomeOriginal.toLowerCase().includes('combo');

    if (ehCombo) {
      const match = nomeOriginal.match(/^(.*?)\s*\((.*)\)\s*$/);
      const nomeCombo = match ? match[1].trim() : nomeOriginal;
      const componentes = match && match[2] ? match[2].split(',').map((nome: string) => nome.trim()).filter(Boolean) : [];
      const componentesHtml = componentes.map((nome: string) => `
        <div class="subitem">
          <span class="subitem-qtd">1x</span>
          <span class="subitem-nome">${escaparHtml(nome)}</span>
        </div>
      `).join('');

      return `
        <div class="produto">
          <div class="linha-produto">
            <div class="qtd">${quantidade}x</div>
            <div class="descricao">${escaparHtml(nomeCombo)}</div>
            <div class="preco">${moeda(precoTotal)} &#8364;</div>
          </div>
          ${componentesHtml}
        </div>
      `;
    }

    return `
      <div class="produto">
        <div class="linha-produto">
          <div class="qtd">${quantidade}x</div>
          <div class="descricao">${escaparHtml(nomeOriginal)}</div>
          <div class="preco">${moeda(precoTotal)} &#8364;</div>
        </div>
      </div>
    `;
  }).join('');

  let dataPedido = pedido.data_pedido ? new Date(pedido.data_pedido) : new Date();
  if (Number.isNaN(dataPedido.getTime())) { dataPedido = new Date(); }

  const dataFormatada = dataPedido.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const horaFormatada = dataPedido.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const tipoPedido = taxaEntrega > 0 ? 'ENTREGA' : String(pedido.canal || 'PEDIDO').toUpperCase();

  const html = `
<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="UTF-8">
<style>
@page { margin: 0; }
body { width: 80mm; margin: 0; padding: 0; background: #ffffff; color: #000000; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.2; }
* { box-sizing: border-box; }
#recibo { padding: 4mm 3mm 2mm 3mm; }
.numero-pedido { text-align: center; font-size: 29px; font-weight: 900; margin: 0; }
.conferencia { text-align: center; font-size: 14px; font-weight: 900; }
.tipo-data { margin: 1mm 0 3mm 0; text-align: center; font-size: 11px; font-weight: 800; text-transform: uppercase; }
.cliente { font-size: 12px; }
.nome-cliente { font-size: 14px; font-weight: 900; }
.separador { height: 0; margin: 2mm 0; border-top: 1px dashed #000000; }
.produto { margin: 0 0 1.5mm 0; page-break-inside: avoid; }
.linha-produto { display: grid; grid-template-columns: 7mm minmax(0, 1fr) 18mm; gap: 1mm; align-items: start; }
.qtd { font-weight: 900; }
.descricao { font-weight: 800; }
.preco { font-weight: 900; text-align: right; }
.subitem { margin-left: 8mm; margin-top: 0.5mm; display: flex; font-size: 11px; }
.subitem-qtd { width: 6mm; font-weight: 800; }
.valor { display: flex; justify-content: space-between; font-size: 12px; }
.valor-forte { font-weight: 900; }
.total { margin: 2mm 0; display: flex; justify-content: space-between; font-size: 19px; font-weight: 900; }
.pagamento { padding: 1.5mm 0 0 0; border-top: 1px solid #000000; font-size: 11px; font-weight: 800; }

/* TRUQUE PARA O CORTE MANUAL: ESPAÇO E PONTO INVISÍVEL */
.puxar-papel { margin-top: 40mm; color: #ffffff; text-align: center; font-size: 10px; }
</style>
</head>
<body>
<main id="recibo">
  <div class="numero-pedido">#${pedido.numero_pedido || '---'}</div>
  <div class="conferencia">CONFER&Ecirc;NCIA</div>
  <div class="tipo-data">${tipoPedido} - ${dataFormatada}, ${horaFormatada}</div>
  <div class="cliente">
    <div class="nome-cliente">${escaparHtml(pedido.cliente || 'Consumidor Final')}</div>
    ${pedido.contacto_cliente ? `<div>${escaparHtml(pedido.contacto_cliente)}</div>` : ''}
    ${pedido.endereco || pedido.morada ? `<div>${escaparHtml(pedido.endereco || pedido.morada)}</div>` : ''}
  </div>
  <div class="separador"></div>
  ${linhasItens}
  <div class="separador"></div>
  <div class="valor"><span class="valor-forte">Subtotal</span><span class="valor-forte">${moeda(subtotal)} &#8364;</span></div>
  ${desconto > 0 ? `<div class="valor"><span>Desconto</span><span>-${moeda(desconto)} &#8364;</span></div>` : ''}
  ${taxaEntrega > 0 ? `<div class="valor"><span class="valor-forte">Entrega</span><span class="valor-forte">${moeda(taxaEntrega)} &#8364;</span></div>` : ''}
  <div class="total"><span>TOTAL</span><span>${moeda(totalGeral)} &#8364;</span></div>
  <div class="pagamento">Pagamento: ${escaparHtml(pedido.forma_pagamento || 'Não informado')} (${pedido.pago ? 'Pago' : 'Pendente'})</div>
  
  <!-- O PONTO INVISÍVEL QUE OBRIGA O MOTOR A EMPURRAR O PAPEL -->
  <div class="puxar-papel">.</div>
</main>
</body>
</html>
`;

  if (typeof window !== 'undefined' && (window as any).imprimirSilencioso) {
    (window as any).imprimirSilencioso(html);
  } else {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0';
    iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open(); doc.write(html); doc.close();
      iframe.onload = () => {
        iframe.contentWindow?.focus(); iframe.contentWindow?.print();
        setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 2000);
      };
    }
  }
};

// ============================================================================
// INTERFACES E COMPONENTE
// ============================================================================
interface ItemPedido { id?: string; produto_id?: string; codigo_produto: string; nome_produto: string; quantidade: number; preco_unitario: number; }
interface Pedido { id: string; numero_pedido: number; data_pedido: string; cliente: string; canal: string; forma_pagamento: string; entregador: string; taxa_entrega: number; desconto: number; total_geral: number; pago: boolean; itens?: ItemPedido[]; ids_fragmentados?: string[]; }
interface Combo { id: string; codigo: string; nome: string; descricao: string; tipo_preco: 'fixo' | 'desconto' | 'desconto_fixo' | 'item_gratis'; preco_fixo: number | null; preco_glovo?: number | null; preco_whatsapp?: number | null; desconto_percentual: number; desconto_absoluto: number; item_gratis_categoria: string; combo_grupos: any[]; }

export default function GestaoPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [produtosDB, setProdutosDB] = useState<any[]>([]);
  const [combosDB, setCombosDB] = useState<Combo[]>([]);
  const [listaEstafetas, setListaEstafetas] = useState<{ nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [ordemDirecao, setOrdemDirecao] = useState<'desc' | 'asc'>('desc');
  const [modalEditar, setModalEditar] = useState(false);
  const [pedidoEditando, setPedidoEditando] = useState<Pedido | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [modalComboEdicao, setModalComboEdicao] = useState(false);
  const [comboSelecionadoParaMontar, setComboSelecionadoParaMontar] = useState<Combo | null>(null);
  const [selecoesComboEdicao, setSelecoesComboEdicao] = useState<{ [grupoId: string]: any[] }>({});

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function carregarDadosIniciais() {
    setLoading(true);
    try {
      const { data: dataProds } = await supabase.from('produtos').select('*').eq('ativo', true);
      if (dataProds) setProdutosDB(dataProds);

      const { data: dataEsts } = await supabase.from('estafetas').select('nome').eq('ativo', true).order('nome', { ascending: true });
      if (dataEsts) setListaEstafetas(dataEsts);

      const { data: dataCombos } = await supabase.from('combos').select(`*, combo_grupos (*, combo_grupo_produtos (*, produto:produtos (*)))`).eq('ativo', true).eq('esgotado', false);
      if (dataCombos) {
        const combosOrdenados = dataCombos.map(cb => ({
          ...cb,
          combo_grupos: (cb.combo_grupos || []).sort((a: any, b: any) => a.ordem - b.ordem)
        }));
        setCombosDB(combosOrdenados);
      }

      const { data, error } = await supabase.from('pedidos').select(`*, itens:itens_pedido (*)`).order('numero_pedido', { ascending: false });
      if (error) throw error;

      if (data && data.length > 0) {
        const agrupados = new Map<string, Pedido>();
        data.forEach((linha: any) => {
          const chaveNum = String(linha.numero_pedido);
          const taxa = Number(linha.taxa_entrega || 0);
          const descontoLinha = Number(linha.desconto || 0);
          const dataReal = linha.data_pedido || linha.data_venda || linha.criado_em || new Date().toISOString();

          const itensDestaLinha = (linha.itens || []).map((item: any) => {
            let precoUnitarioCorreto = Number(item.preco_unitario || 0);
            if (linha.canal === 'Revendedores') {
              const nomeProduto = (item.nome_produto || '').toLowerCase();
              if (nomeProduto.includes('fudge') || nomeProduto.includes('new york')) { precoUnitarioCorreto = 1.70; } 
              else { precoUnitarioCorreto = 2.70; }
            }
            return {
              id: item.id, produto_id: item.produto_id, codigo_produto: item.codigo_produto || '',
              nome_produto: item.nome_produto || '', quantidade: Number(item.quantidade || 1), preco_unitario: precoUnitarioCorreto
            };
          });

          if (!agrupados.has(chaveNum)) {
            agrupados.set(chaveNum, {
              ...linha, numero_pedido: Number(linha.numero_pedido), data_pedido: dataReal, taxa_entrega: taxa,
              desconto: descontoLinha, pago: linha.pago === true, itens: [...itensDestaLinha], ids_fragmentados: [linha.id]
            });
          } else {
            const existente = agrupados.get(chaveNum)!;
            existente.itens?.push(...itensDestaLinha);
            existente.ids_fragmentados?.push(linha.id);
            if (!existente.entregador && linha.entregador) existente.entregador = linha.entregador;
            if (!existente.cliente && linha.cliente) existente.cliente = linha.cliente;
            if (linha.pago === true) existente.pago = true;
            existente.taxa_entrega = Math.max(existente.taxa_entrega, taxa);
            existente.desconto = Math.max(existente.desconto, descontoLinha);
          }
        });

        const pedidosFormatados = Array.from(agrupados.values()).map(ped => {
          const subtotalItens = (ped.itens || []).reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
          ped.total_geral = subtotalItens + ped.taxa_entrega - ped.desconto;
          return ped;
        });
        setPedidos(pedidosFormatados);
      } else {
        setPedidos([]);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }

  const liquidarCaderninho = async (pedidoNum: number) => {
    try {
      const { error } = await supabase.from('pedidos').update({ pago: true }).eq('numero_pedido', pedidoNum);
      if (error) throw error;
      setPedidos(prev => prev.map(p => p.numero_pedido === pedidoNum ? { ...p, pago: true } : p));
    } catch (err) { alert('Erro ao liquidar pagamento.'); }
  };

  const excluirPedido = async (pedidoNum: number, ids: string[]) => {
    if (!confirm(`⚠️ Tem a certeza que deseja excluir definitivamente o pedido #${pedidoNum}?`)) return;
    try {
      await supabase.from('itens_pedido').delete().in('pedido_id', ids);
      const { error } = await supabase.from('pedidos').delete().in('id', ids);
      if (error) throw error;
      setPedidos(prev => prev.filter(p => p.numero_pedido !== pedidoNum));
    } catch (err: any) { alert(`Erro ao excluir pedido: ${err.message}`); }
  };

  const calcularPrecoPorCanalEProduto = (canal: string, prod: any) => {
    const nome = (prod.nome || '').toLowerCase();
    if (canal === 'Revendedores') {
      if (nome.includes('fudge') || nome.includes('new york')) return 1.70;
      return 2.70;
    }
    if (canal === 'Glovo') return Number(prod.preco_glovo || prod.preco_cardapio || 0);
    if (canal === 'WhatsApp' || canal === 'Palmbites' || canal === 'Balcão') return Number(prod.preco_cardapio || 0);
    return Number(prod.preco_cardapio || 0);
  };

  const abrirEdicao = (pedido: Pedido) => {
    setPedidoEditando(JSON.parse(JSON.stringify(pedido)));
    setModalEditar(true);
  };

  const alterarCanalEdicao = (novoCanal: string) => {
    if (!pedidoEditando) return;
    const itensAtualizados = (pedidoEditando.itens || []).map(item => {
      if (item.codigo_produto === 'COMBO') {
        const baseName = item.nome_produto.split(' (')[0];
        const comboRef = combosDB.find(c => c.nome === baseName);
        if (comboRef && comboRef.tipo_preco === 'fixo') {
          let novoPreco = Number(comboRef.preco_fixo || 0);
          if (novoCanal === 'Glovo') novoPreco = Number(comboRef.preco_glovo || comboRef.preco_fixo || 0);
          if (novoCanal === 'WhatsApp' || novoCanal === 'Balcão' || novoCanal === 'Palmbites') novoPreco = Number(comboRef.preco_whatsapp || comboRef.preco_fixo || 0);
          return { ...item, preco_unitario: novoPreco };
        }
        return item; 
      }
      const prod = produtosDB.find(p => p.id === item.produto_id || p.nome.toLowerCase() === item.nome_produto.toLowerCase());
      if (prod) { return { ...item, preco_unitario: calcularPrecoPorCanalEProduto(novoCanal, prod) }; }
      return item;
    });

    const subtotalLocal = itensAtualizados.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
    const novoTotal = Math.max(0, subtotalLocal + pedidoEditando.taxa_entrega - (pedidoEditando.desconto || 0));
    setPedidoEditando({ ...pedidoEditando, canal: novoCanal, itens: itensAtualizados, total_geral: novoTotal });
  };

  const alterarQtdItemEdicao = (index: number, novaQtd: number) => {
    if (!pedidoEditando || !pedidoEditando.itens) return;
    const qtd = Math.max(1, novaQtd);
    const novosItens = [...pedidoEditando.itens];
    novosItens[index].quantidade = qtd;
    const subtotalLocal = novosItens.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
    const novoTotal = Math.max(0, subtotalLocal + pedidoEditando.taxa_entrega - (pedidoEditando.desconto || 0));
    setPedidoEditando({ ...pedidoEditando, itens: novosItens, total_geral: novoTotal });
  };

  const removerItemEdicao = (index: number) => {
    if (!pedidoEditando || !pedidoEditando.itens) return;
    const novosItens = pedidoEditando.itens.filter((_, i) => i !== index);
    const subtotalLocal = novosItens.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
    const novoTotal = Math.max(0, subtotalLocal + pedidoEditando.taxa_entrega - (pedidoEditando.desconto || 0));
    setPedidoEditando({ ...pedidoEditando, itens: novosItens, total_geral: novoTotal });
  };

  const adicionarProdutoEdicao = (produtoId: string) => {
    if (!pedidoEditando || !produtoId) return;
    const prod = produtosDB.find(p => p.id === produtoId);
    if (!prod) return;
    const precoUnit = calcularPrecoPorCanalEProduto(pedidoEditando.canal, prod);
    const itensAtuais = pedidoEditando.itens || [];
    const existenteIndex = itensAtuais.findIndex(it => it.produto_id === prod.id && !it.nome_produto.includes('('));
    let novosItens = [...itensAtuais];
    if (existenteIndex >= 0) { novosItens[existenteIndex].quantidade += 1; } 
    else { novosItens.push({ produto_id: prod.id, codigo_produto: prod.codigo || '', nome_produto: prod.nome, quantidade: 1, preco_unitario: precoUnit }); }
    const subtotalLocal = novosItens.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
    const novoTotal = Math.max(0, subtotalLocal + pedidoEditando.taxa_entrega - (pedidoEditando.desconto || 0));
    setPedidoEditando({ ...pedidoEditando, itens: novosItens, total_geral: novoTotal });
  };

  const iniciarMontagemComboEdicao = (comboId: string) => {
    if (!comboId) return;
    const combo = combosDB.find(c => c.id === comboId);
    if (!combo) return;
    setComboSelecionadoParaMontar(combo);
    setSelecoesComboEdicao({});
    setModalComboEdicao(true);
  };

  const toggleSelecaoComboEdicao = (grupo: any, itemVinculado: any) => {
    setSelecoesComboEdicao(prev => {
      const selecoesGrupo = [...(prev[grupo.id] || [])];
      const indexExistente = selecoesGrupo.findIndex(s => s.produto_id === itemVinculado.produto_id);
      const totalSelecionadoNoGrupo = selecoesGrupo.reduce((acc, curr) => acc + (curr.quantidade || 1), 0);

      if (indexExistente >= 0) {
        if (totalSelecionadoNoGrupo < grupo.quantidade_maxima) { selecoesGrupo[indexExistente].quantidade += 1; } 
        else {
          if (selecoesGrupo[indexExistente].quantidade > 1) { selecoesGrupo[indexExistente].quantidade -= 1; } 
          else { selecoesGrupo.splice(indexExistente, 1); }
        }
      } else {
        if (totalSelecionadoNoGrupo < grupo.quantidade_maxima) { selecoesGrupo.push({ ...itemVinculado, quantidade: 1 }); } 
        else if (grupo.quantidade_maxima === 1) { return { ...prev, [grupo.id]: [{ ...itemVinculado, quantidade: 1 }] }; }
      }
      return { ...prev, [grupo.id]: selecoesGrupo };
    });
  };

  const confirmarComboEdicao = () => {
    if (!comboSelecionadoParaMontar || !pedidoEditando) return;
    for (const grupo of comboSelecionadoParaMontar.combo_grupos) {
      const selecoes = selecoesComboEdicao[grupo.id] || [];
      const totalGrupo = selecoes.reduce((acc, s) => acc + (s.quantidade || 1), 0);
      if (grupo.obrigatorio && totalGrupo < grupo.quantidade_minima) {
        return alert(`O grupo "${grupo.nome}" exige no mínimo ${grupo.quantidade_minima} item(ns).`);
      }
    }

    let somaPrecos = 0; let somaAcrescimos = 0; const detalhes: string[] = [];
    Object.values(selecoesComboEdicao).forEach((selGrupo: any) => {
      selGrupo.forEach((item: any) => {
        const qtdItem = item.quantidade || 1;
        for (let i = 0; i < qtdItem; i++) {
          const precoItem = calcularPrecoPorCanalEProduto(pedidoEditando.canal, item.produto);
          somaPrecos += precoItem;
          somaAcrescimos += Number(item.acrescimo_preco || 0);
          detalhes.push(`${item.produto.nome}`);
        }
      });
    });

    let precoComboFinal = somaPrecos;
    if (comboSelecionadoParaMontar.tipo_preco === 'fixo') {
      if (pedidoEditando.canal === 'Glovo') { precoComboFinal = Number(comboSelecionadoParaMontar.preco_glovo || comboSelecionadoParaMontar.preco_fixo || 0); } 
      else if (pedidoEditando.canal === 'WhatsApp' || pedidoEditando.canal === 'Balcão' || pedidoEditando.canal === 'Palmbites') { precoComboFinal = Number(comboSelecionadoParaMontar.preco_whatsapp || comboSelecionadoParaMontar.preco_fixo || 0); } 
      else { precoComboFinal = Number(comboSelecionadoParaMontar.preco_fixo || 0); }
    } else if (comboSelecionadoParaMontar.tipo_preco === 'desconto' || comboSelecionadoParaMontar.nome.toLowerCase().includes('batatô10') || comboSelecionadoParaMontar.nome.toLowerCase().includes('batato10')) {
      const perc = Number(comboSelecionadoParaMontar.desconto_percentual || 10);
      precoComboFinal = somaPrecos * (1 - perc / 100);
    } else if (comboSelecionadoParaMontar.tipo_preco === 'desconto_fixo' || comboSelecionadoParaMontar.nome.toLowerCase().includes('para dois')) {
      const desc = Number(comboSelecionadoParaMontar.desconto_absoluto || 1.70);
      precoComboFinal = Math.max(0, somaPrecos - desc);
    }

    const precoFinalAplicado = precoComboFinal + somaAcrescimos;
    const nomeComboFormatado = `${comboSelecionadoParaMontar.nome} (${detalhes.join(', ')})`;
    const novosItens = [...(pedidoEditando.itens || []), { produto_id: undefined, codigo_produto: 'COMBO', nome_produto: nomeComboFormatado, quantidade: 1, preco_unitario: Number(precoFinalAplicado.toFixed(2)) }];
    const subtotalLocal = novosItens.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
    const novoTotal = Math.max(0, subtotalLocal + pedidoEditando.taxa_entrega - (pedidoEditando.desconto || 0));

    setPedidoEditando({ ...pedidoEditando, itens: novosItens, total_geral: novoTotal });
    setModalComboEdicao(false);
    setComboSelecionadoParaMontar(null);
  };

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedidoEditando) return;
    setSalvando(true);
    try {
      const subtotalItens = pedidoEditando.itens?.reduce((acc, item) => acc + (item.quantidade * item.preco_unitario), 0) || 0;
      const novoTotal = Math.max(0, subtotalItens + Number(pedidoEditando.taxa_entrega) - Number(pedidoEditando.desconto || 0));
      const principalId = pedidoEditando.ids_fragmentados?.[0] || pedidoEditando.id;

      const { error: erroPrincipal } = await supabase.from('pedidos').update({
        cliente: pedidoEditando.cliente, canal: pedidoEditando.canal, forma_pagamento: pedidoEditando.forma_pagamento,
        entregador: pedidoEditando.entregador || null, taxa_entrega: pedidoEditando.taxa_entrega,
        desconto: pedidoEditando.desconto || 0, pago: pedidoEditando.pago, total_geral: novoTotal
      }).eq('id', principalId);
      if (erroPrincipal) throw erroPrincipal;

      const idsRelacionados = pedidoEditando.ids_fragmentados || [pedidoEditando.id];
      await supabase.from('itens_pedido').delete().in('pedido_id', idsRelacionados);

      if (pedidoEditando.itens && pedidoEditando.itens.length > 0) {
        const novosItensDB = pedidoEditando.itens.map(item => ({
          pedido_id: principalId, produto_id: item.produto_id || null, codigo_produto: item.codigo_produto,
          nome_produto: item.nome_produto, quantidade: item.quantidade, preco_unitario: item.preco_unitario
        }));
        const { error: erroItens } = await supabase.from('itens_pedido').insert(novosItensDB);
        if (erroItens) throw erroItens;
      }

      setModalEditar(false);
      carregarDadosIniciais();
    } catch (err: any) { alert(`Erro ao salvar edição: ${err.message}`); } finally { setSalvando(false); }
  };

  useEffect(() => {
    carregarDadosIniciais();
    const canalAtualizacao = supabase.channel('schema-db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => { carregarDadosIniciais(); }).subscribe();
    return () => { supabase.removeChannel(canalAtualizacao); };
  }, []);

  const extrairDataIso = (valor: string) => {
    if (!valor) return '';
    const match = valor.match(/(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  };

  const pedidosFiltrados = useMemo(() => {
    const temFiltroAtivo = dataInicio !== '' || dataFim !== '' || termoPesquisa.trim() !== '';
    if (!temFiltroAtivo) return [];

    return pedidos.filter(pedido => {
      const dataPedidoFormatada = extrairDataIso(pedido.data_pedido);
      if (dataInicio && dataPedidoFormatada < dataInicio) return false;
      if (dataFim && dataPedidoFormatada > dataFim) return false;
      if (termoPesquisa.trim() !== '') {
        const termo = termoPesquisa.toLowerCase().trim();
        const nomeCliente = (pedido.cliente || '').toLowerCase();
        const numPedidoStr = String(pedido.numero_pedido);
        if (!nomeCliente.includes(termo) && !numPedidoStr.includes(termo)) return false;
      }
      return true;
    }).sort((a, b) => {
      if (ordemDirecao === 'desc') return b.numero_pedido - a.numero_pedido;
      return a.numero_pedido - b.numero_pedido;
    });
  }, [pedidos, dataInicio, dataFim, termoPesquisa, ordemDirecao]);

  const limparFiltros = () => { setDataInicio(''); setDataFim(''); setTermoPesquisa(''); };
  const selecionarHoje = () => {
    const hojeIso = new Date().toISOString().split('T')[0];
    setDataInicio(hojeIso); setDataFim(hojeIso);
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
        <button onClick={carregarDadosIniciais} className="bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold px-4 py-2 rounded-xl border border-zinc-700 transition-all">
          🔄 Sincronizar Dados
        </button>
      </header>

      <section className="px-6 pt-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 w-full">
              <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">Pesquisar Pedido</label>
              <input type="text" value={termoPesquisa} onChange={e => setTermoPesquisa(e.target.value)} placeholder="Pesquise por nome do cliente ou número do pedido..." className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">Ordem</label>
              <select value={ordemDirecao} onChange={e => setOrdemDirecao(e.target.value as 'desc' | 'asc')} className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none cursor-pointer">
                <option value="desc">⬇️ Decrescente (Mais Recentes)</option>
                <option value="asc">⬆️ Crescente (Mais Antigos)</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pt-3 border-t border-zinc-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full xl:w-auto">
              <div>
                <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">De (Data Inicial)</label>
                <input type="date" value={dataInicio} max={dataFim || undefined} onChange={e => setDataInicio(e.target.value)} className="w-full sm:w-48 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500 outline-none [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">Até (Data Final)</label>
                <input type="date" value={dataFim} min={dataInicio || undefined} onChange={e => setDataFim(e.target.value)} className="w-full sm:w-48 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500 outline-none [color-scheme:dark]" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={selecionarHoje} className="bg-orange-600 hover:bg-orange-500 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md">Hoje</button>
              <button type="button" onClick={limparFiltros} disabled={!dataInicio && !dataFim && !termoPesquisa} className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold px-4 py-2.5 rounded-xl border border-zinc-700 transition-all">Limpar Filtros</button>
            </div>
          </div>
        </div>
      </section>

      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-xl flex justify-between items-center">
          <div><span className="text-[10px] text-zinc-400 uppercase font-black">Faturamento Bruto</span><p className="text-2xl font-black mt-1">{faturamentoTotal.toFixed(2)}€</p></div><span className="text-2xl">💰</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-xl flex justify-between items-center">
          <div><span className="text-[10px] text-zinc-400 uppercase font-black">Descontos Aplicados</span><p className="text-2xl font-black mt-1 text-red-400">{totalDescontos.toFixed(2)}€</p></div><span className="text-2xl">🎟️</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-xl flex justify-between items-center">
          <div><span className="text-[10px] text-zinc-400 uppercase font-black">Em Falta (Caderninho)</span><p className="text-2xl font-black mt-1 text-orange-400">{pendenteCaderninho.toFixed(2)}€</p></div><span className="text-2xl">✏️</span>
        </div>
      </div>

      <main className="flex-1 px-6 pb-6 overflow-y-auto">
        {loading ? ( <div className="text-center text-zinc-500 py-24">A carregar registos...</div> ) : pedidosFiltrados.length === 0 ? (
          <div className="text-center text-zinc-500 py-24 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl max-w-xl mx-auto space-y-2">
            <p className="text-base font-bold text-zinc-300">Nenhum pedido para exibir</p>
            <p className="text-xs text-zinc-500">Utilize os filtros para visualizar os pedidos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pedidosFiltrados.map(ped => (
              <div key={ped.id} className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-md hover:border-zinc-700/60 transition-all relative group">
                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => imprimirReciboTermico(ped)} className="w-7 h-7 bg-zinc-800 hover:bg-green-600 rounded-lg flex items-center justify-center text-xs transition-colors" title="Imprimir Talão">🖨️</button>
                  <button onClick={() => abrirEdicao(ped)} className="w-7 h-7 bg-zinc-800 hover:bg-blue-600 rounded-lg flex items-center justify-center text-xs transition-colors" title="Editar Informações e Itens/Combos">✏️</button>
                  <button onClick={() => excluirPedido(ped.numero_pedido, ped.ids_fragmentados!)} className="w-7 h-7 bg-zinc-800 hover:bg-red-600 rounded-lg flex items-center justify-center text-xs transition-colors" title="Excluir Pedido">🗑️</button>
                </div>
                <div>
                  <div className="flex justify-between items-start gap-2 border-b border-zinc-800/60 pb-3 mb-3 pr-24">
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500">#{ped.numero_pedido} · {ped.data_pedido}</span>
                      <h3 className="font-bold text-zinc-100 text-sm mt-0.5">{ped.cliente || 'Cliente Anónimo'}</h3>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${getCorCanal(ped.canal)}`}>{ped.canal}</span>
                  </div>
                  <div className="space-y-2 mb-4">
                    {ped.itens && ped.itens.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-zinc-300">
                        <span className="pr-2"><span className="font-bold text-orange-400 mr-1.5">{item.quantidade}x</span>{item.nome_produto}</span>
                        <span className="font-mono text-zinc-500 text-[11px]">{(item.preco_unitario * item.quantidade).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-zinc-800/60 pt-3 mt-2 space-y-2 text-xs text-zinc-400">
                  <div className="flex justify-between text-[11px]">
                    <span>Pagamento: <span className="text-zinc-200">{ped.forma_pagamento}</span></span>
                    {ped.taxa_entrega > 0 && <span>Entrega: {ped.taxa_entrega.toFixed(2)}€</span>}
                  </div>
                  <div className="flex justify-between items-center border-t border-zinc-800/40 pt-2">
                    <span className="text-[11px]">Estafeta: <span className="text-zinc-300">{ped.entregador || 'Nenhum'}</span></span>
                    <span className="text-base font-black text-orange-500">{ped.total_geral.toFixed(2)}€</span>
                  </div>
                  {!ped.pago && (
                    <button onClick={() => liquidarCaderninho(ped.numero_pedido)} className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold py-1.5 rounded-lg">
                      ✓ Recebido
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL EDIÇÃO */}
      {modalEditar && pedidoEditando && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-3xl p-6">
            <button onClick={() => setModalEditar(false)} className="float-right text-zinc-400">✕</button>
            <h2 className="text-xl font-bold mb-5">Editar Pedido #{pedidoEditando.numero_pedido}</h2>
            <form onSubmit={salvarEdicao} className="space-y-4">
              <input value={pedidoEditando.cliente || ''} onChange={e => setPedidoEditando({ ...pedidoEditando, cliente: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3" />
              <div className="space-y-2">
                {pedidoEditando.itens?.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-zinc-950 p-2 rounded-xl">
                    <span className="flex-1">{item.nome_produto}</span>
                    <input type="number" min="1" value={item.quantidade} onChange={e => alterarQtdItemEdicao(idx, Number(e.target.value))} className="w-16 bg-zinc-900 rounded p-1" />
                    <button type="button" onClick={() => removerItemEdicao(idx)}>✕</button>
                  </div>
                ))}
              </div>
              <button type="submit" disabled={salvando} className="bg-orange-600 rounded-xl px-6 py-3 font-bold">
                {salvando ? 'A guardar...' : 'Guardar Alterações'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL COMBO */}
      {modalComboEdicao && comboSelecionadoParaMontar && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-[60] p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-3xl p-6">
            <h2 className="text-xl font-bold text-orange-500">{comboSelecionadoParaMontar.nome}</h2>
            <button onClick={() => setModalComboEdicao(false)}>Fechar</button>
            <button onClick={confirmarComboEdicao} className="bg-orange-600 px-5 py-2 rounded-xl ml-3">Adicionar Combo</button>
          </div>
        </div>
      )}
    </div>
  );
}