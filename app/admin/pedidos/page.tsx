'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================================
// 🖨️ MOTOR DE IMPRESSÃO TÉRMICA (CHEF BATATÔ) - 80mm Perfeito
// ============================================================================
export const imprimirReciboTermico = (pedido: any) => {
  const subtotal = (pedido.total_geral || 0) - (pedido.taxa_entrega || 0) + (pedido.desconto || 0);
  const itensDoPedido = pedido.itens || pedido.itens_pedido || [];

  const linhasItens = itensDoPedido.map((item: any) => `
    <tr>
      <td style="width: 25px; vertical-align: top; font-weight: bold; font-size: 13px;">${item.quantidade}x</td>
      <td style="vertical-align: top; padding-bottom: 6px; padding-right: 4px; font-size: 13px; line-height: 1.1;">${item.nome_produto}</td>
      <td style="vertical-align: top; text-align: right; white-space: nowrap; font-size: 13px; font-weight: bold;">
        ${((item.quantidade || 0) * (item.preco_unitario || 0)).toFixed(2).replace('.', ',')} &euro;
      </td>
    </tr>
  `).join('') || '';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Recibo #${pedido.numero_pedido || '---'}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0mm;
          }
          body {
            margin: 0;
            padding: 4mm 6mm;
            width: 72mm;
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            color: #000;
            background: #fff;
            line-height: 1.2;
          }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .font-black { font-weight: 900; }
          .uppercase { text-transform: uppercase; }
          .border-b { border-bottom: 2px solid black; padding-bottom: 4px; margin-bottom: 6px; }
          .border-b-dashed { border-bottom: 1px dashed black; padding-bottom: 4px; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; }
          .flex-between { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="text-center font-black" style="font-size: 24px; margin-bottom: 2px;">#${pedido.numero_pedido || '---'}</div>
        <div class="text-center font-bold" style="font-size: 13px;">CONFERENCIA</div>
        <div class="text-center uppercase font-bold" style="font-size: 11px; margin-bottom: 8px;">
          ${pedido.canal} - ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', {hour: '2-digit', minute:'2-digit'})}
        </div>
        <div style="margin-bottom: 8px;">
          <div class="font-bold" style="font-size: 13px;">${pedido.cliente || 'Consumidor Final'}</div>
          ${pedido.contacto_cliente ? `<div>${pedido.contacto_cliente}</div>` : ''}
          ${pedido.endereco || pedido.morada ? `<div>${pedido.endereco || pedido.morada}</div>` : ''}
        </div>
        <div class="border-b-dashed"></div>
        <table style="margin-bottom: 6px;">${linhasItens}</table>
        <div class="border-b-dashed"></div>
        <div class="flex-between font-bold"><span>Subtotal</span><span>${subtotal.toFixed(2).replace('.', ',')} &euro;</span></div>
        ${(pedido.desconto > 0) ? `<div class="flex-between font-bold" style="color: #444;"><span>Desconto</span><span>-${Number(pedido.desconto).toFixed(2).replace('.', ',')} &euro;</span></div>` : ''}
        ${(pedido.taxa_entrega > 0) ? `<div class="flex-between font-bold"><span>Entrega</span><span>${Number(pedido.taxa_entrega).toFixed(2).replace('.', ',')} &euro;</span></div>` : ''}
        <div class="flex-between font-black" style="font-size: 18px; margin-top: 6px; margin-bottom: 6px;"><span>TOTAL</span><span>${Number(pedido.total_geral).toFixed(2).replace('.', ',')} &euro;</span></div>
        <div class="font-bold" style="border-top: 1px solid black; padding-top: 4px; font-size: 11px;">Pagamento: ${pedido.forma_pagamento} (${pedido.pago ? 'Pago' : 'Pendente'})</div>
      </body>
    </html>
  `;

  if (typeof window !== 'undefined' && (window as any).imprimirSilencioso) {
    (window as any).imprimirSilencioso(html);
  } else {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open(); doc.write(html); doc.close();
      iframe.onload = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 2000); };
    }
  }
};
// ============================================================================

interface ItemPedido {
  id?: string;
  produto_id?: string;
  codigo_produto: string;
  nome_produto: string;
  quantidade: number;
  preco_unitario: number;
}

interface Pedido {
  id: string;
  numero_pedido: number;
  data_pedido: string;
  cliente: string;
  canal: string;
  forma_pagamento: string;
  entregador: string;
  taxa_entrega: number;
  desconto: number;
  total_geral: number;
  pago: boolean;
  itens?: ItemPedido[];
  ids_fragmentados?: string[]; 
}

interface Combo {
  id: string; codigo: string; nome: string; descricao: string;
  tipo_preco: 'fixo' | 'desconto' | 'desconto_fixo' | 'item_gratis';
  preco_fixo: number | null;
  preco_glovo?: number | null;
  preco_whatsapp?: number | null;
  desconto_percentual: number;
  desconto_absoluto: number;
  item_gratis_categoria: string;
  combo_grupos: any[];
}

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

      const { data: dataCombos } = await supabase
        .from('combos')
        .select(`
          *,
          combo_grupos (
            *,
            combo_grupo_produtos (
              *,
              produto:produtos (*)
            )
          )
        `)
        .eq('ativo', true)
        .eq('esgotado', false);

      if (dataCombos) {
        const combosOrdenados = dataCombos.map(cb => ({
          ...cb,
          combo_grupos: (cb.combo_grupos || []).sort((a: any, b: any) => a.ordem - b.ordem)
        }));
        setCombosDB(combosOrdenados);
      }

      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          *,
          itens:itens_pedido (*)
        `)
        .order('numero_pedido', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const agrupados = new Map<string, Pedido>();

        data.forEach((linha: any) => {
          const chaveNum = String(linha.numero_pedido); 
          const taxa = Number(linha.taxa_entrega || 0);
          const desconto = Number(linha.desconto || 0);
          const dataReal = linha.data_pedido || linha.data_venda || linha.criado_em || new Date().toISOString();

          const itensDestaLinha = (linha.itens || []).map((item: any) => {
            let precoUnitarioCorreto = Number(item.preco_unitario || 0);

            if (linha.canal === 'Revendedores') {
              const nomeProduto = (item.nome_produto || '').toLowerCase();
              if (nomeProduto.includes('fudge') || nomeProduto.includes('new york')) {
                precoUnitarioCorreto = 1.70;
              } else {
                precoUnitarioCorreto = 2.70;
              }
            }

            return {
              id: item.id,
              produto_id: item.produto_id,
              codigo_produto: item.codigo_produto || '',
              nome_produto: item.nome_produto || '',
              quantidade: Number(item.quantidade || 1),
              preco_unitario: precoUnitarioCorreto
            };
          });

          if (!agrupados.has(chaveNum)) {
            agrupados.set(chaveNum, {
              ...linha,
              numero_pedido: Number(linha.numero_pedido),
              data_pedido: dataReal,
              taxa_entrega: taxa,
              desconto: desconto,
              pago: linha.pago === true,
              itens: [...itensDestaLinha],
              ids_fragmentados: [linha.id] 
            });
          } else {
            const existente = agrupados.get(chaveNum)!;
            existente.itens?.push(...itensDestaLinha);
            existente.ids_fragmentados?.push(linha.id);
            
            if (!existente.entregador && linha.entregador) existente.entregador = linha.entregador;
            if (!existente.cliente && linha.cliente) existente.cliente = linha.cliente;
            if (linha.pago === true) existente.pago = true;

            existente.taxa_entrega = Math.max(existente.taxa_entrega, taxa);
            existente.desconto = Math.max(existente.desconto, desconto);
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
      const { error } = await supabase
        .from('pedidos')
        .update({ pago: true })
        .eq('numero_pedido', pedidoNum);

      if (error) throw error;
      setPedidos(prev => prev.map(p => p.numero_pedido === pedidoNum ? { ...p, pago: true } : p));
    } catch (err) {
      console.error(err);
      alert('Erro ao liquidar pagamento.');
    }
  };

  const excluirPedido = async (pedidoNum: number, ids: string[]) => {
    if (!confirm(`⚠️ Tem a certeza que deseja excluir definitivamente o pedido #${pedidoNum}?`)) return;
    
    try {
      await supabase.from('itens_pedido').delete().in('pedido_id', ids);
      const { error } = await supabase.from('pedidos').delete().in('id', ids);
      if (error) throw error;
      
      setPedidos(prev => prev.filter(p => p.numero_pedido !== pedidoNum));
    } catch (err: any) {
      alert(`Erro ao excluir pedido: ${err.message}`);
    }
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
         
         if (comboRef) {
             if (comboRef.tipo_preco === 'fixo') {
                 let novoPreco = Number(comboRef.preco_fixo || 0);
                 if (novoCanal === 'Glovo') novoPreco = Number(comboRef.preco_glovo || comboRef.preco_fixo || 0);
                 if (novoCanal === 'WhatsApp' || novoCanal === 'Balcão' || novoCanal === 'Palmbites') {
                   novoPreco = Number(comboRef.preco_whatsapp || comboRef.preco_fixo || 0);
                 }
                 return { ...item, preco_unitario: novoPreco };
             }
         }
         return item; 
      }

      const prod = produtosDB.find(p => p.id === item.produto_id || p.nome.toLowerCase() === item.nome_produto.toLowerCase());
      if (prod) {
        const novoPreco = calcularPrecoPorCanalEProduto(novoCanal, prod);
        return { ...item, preco_unitario: novoPreco };
      }
      return item;
    });

    const subtotal = itensAtualizados.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
    const novoTotal = Math.max(0, subtotal + pedidoEditando.taxa_entrega - (pedidoEditando.desconto || 0));

    setPedidoEditando({
      ...pedidoEditando,
      canal: novoCanal,
      itens: itensAtualizados,
      total_geral: novoTotal
    });
  };

  const alterarQtdItemEdicao = (index: number, novaQtd: number) => {
    if (!pedidoEditando || !pedidoEditando.itens) return;
    const qtd = Math.max(1, novaQtd);
    const novosItens = [...pedidoEditando.itens];
    novosItens[index].quantidade = qtd;
    
    const subtotal = novosItens.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
    const novoTotal = Math.max(0, subtotal + pedidoEditando.taxa_entrega - (pedidoEditando.desconto || 0));

    setPedidoEditando({ ...pedidoEditando, itens: novosItens, total_geral: novoTotal });
  };

  const removerItemEdicao = (index: number) => {
    if (!pedidoEditando || !pedidoEditando.itens) return;
    const novosItens = pedidoEditando.itens.filter((_, i) => i !== index);
    
    const subtotal = novosItens.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
    const novoTotal = Math.max(0, subtotal + pedidoEditando.taxa_entrega - (pedidoEditando.desconto || 0));

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
    if (existenteIndex >= 0) {
      novosItens[existenteIndex].quantidade += 1;
    } else {
      novosItens.push({
        produto_id: prod.id,
        codigo_produto: prod.codigo || '',
        nome_produto: prod.nome,
        quantidade: 1,
        preco_unitario: precoUnit
      });
    }

    const subtotal = novosItens.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
    const novoTotal = Math.max(0, subtotal + pedidoEditando.taxa_entrega - (pedidoEditando.desconto || 0));

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
        if (totalSelecionadoNoGrupo < grupo.quantidade_maxima) {
          selecoesGrupo[indexExistente].quantidade += 1;
        } else {
          if (selecoesGrupo[indexExistente].quantidade > 1) {
            selecoesGrupo[indexExistente].quantidade -= 1;
          } else {
            selecoesGrupo.splice(indexExistente, 1);
          }
        }
      } else {
        if (totalSelecionadoNoGrupo < grupo.quantidade_maxima) {
          selecoesGrupo.push({ ...itemVinculado, quantidade: 1 });
        } else if (grupo.quantidade_maxima === 1) {
          return { ...prev, [grupo.id]: [{ ...itemVinculado, quantidade: 1 }] };
        }
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

    let somaPrecos = 0;
    let somaAcrescimos = 0;
    const detalhes: string[] = [];

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
      if (pedidoEditando.canal === 'Glovo') {
        precoComboFinal = Number(comboSelecionadoParaMontar.preco_glovo || comboSelecionadoParaMontar.preco_fixo || 0);
      } else if (pedidoEditando.canal === 'WhatsApp' || pedidoEditando.canal === 'Balcão' || pedidoEditando.canal === 'Palmbites') {
        precoComboFinal = Number(comboSelecionadoParaMontar.preco_whatsapp || comboSelecionadoParaMontar.preco_fixo || 0);
      } else {
        precoComboFinal = Number(comboSelecionadoParaMontar.preco_fixo || 0);
      }
    } 
    else if (comboSelecionadoParaMontar.tipo_preco === 'desconto' || comboSelecionadoParaMontar.nome.toLowerCase().includes('batatô10') || comboSelecionadoParaMontar.nome.toLowerCase().includes('batato10')) {
      const perc = Number(comboSelecionadoParaMontar.desconto_percentual || 10);
      precoComboFinal = somaPrecos * (1 - perc / 100);
    } 
    else if (comboSelecionadoParaMontar.tipo_preco === 'desconto_fixo' || comboSelecionadoParaMontar.nome.toLowerCase().includes('para dois')) {
      const desc = Number(comboSelecionadoParaMontar.desconto_absoluto || 1.70);
      precoComboFinal = Math.max(0, somaPrecos - desc);
    }

    const precoFinalAplicado = precoComboFinal + somaAcrescimos;
    const nomeComboFormatado = `${comboSelecionadoParaMontar.nome} (${detalhes.join(', ')})`;

    const novosItens = [
      ...(pedidoEditando.itens || []),
      {
        produto_id: undefined,
        codigo_produto: 'COMBO',
        nome_produto: nomeComboFormatado,
        quantidade: 1,
        preco_unitario: Number(precoFinalAplicado.toFixed(2))
      }
    ];

    const subtotal = novosItens.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0);
    const novoTotal = Math.max(0, subtotal + pedidoEditando.taxa_entrega - (pedidoEditando.desconto || 0));

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
      const { error: erroPrincipal } = await supabase
        .from('pedidos')
        .update({
          cliente: pedidoEditando.cliente,
          canal: pedidoEditando.canal,
          forma_pagamento: pedidoEditando.forma_pagamento,
          entregador: pedidoEditando.entregador || null,
          taxa_entrega: pedidoEditando.taxa_entrega,
          desconto: pedidoEditando.desconto || 0,
          pago: pedidoEditando.pago,
          total_geral: novoTotal
        })
        .eq('id', principalId);

      if (erroPrincipal) throw erroPrincipal;

      const idsRelacionados = pedidoEditando.ids_fragmentados || [pedidoEditando.id];
      await supabase.from('itens_pedido').delete().in('pedido_id', idsRelacionados);

      if (pedidoEditando.itens && pedidoEditando.itens.length > 0) {
        const novosItensDB = pedidoEditando.itens.map(item => ({
          pedido_id: principalId,
          produto_id: item.produto_id || null,
          codigo_produto: item.codigo_produto,
          nome_produto: item.nome_produto,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario
        }));

        const { error: erroItens } = await supabase.from('itens_pedido').insert(novosItensDB);
        if (erroItens) throw erroItens;
      }

      setModalEditar(false);
      carregarDadosIniciais(); 
    } catch (err: any) {
      alert(`Erro ao salvar edição: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  useEffect(() => {
    carregarDadosIniciais();

    const canalAtualizacao = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        carregarDadosIniciais();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canalAtualizacao);
    };
  }, []);

  const extrairDataIso = (valor: string) => {
    if (!valor) return '';
    const match = valor.match(/(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  };

  const pedidosFiltrados = useMemo(() => {
    const temFiltroAtivo = dataInicio !== '' || dataFim !== '' || termoPesquisa.trim() !== '';

    if (!temFiltroAtivo) {
      return []; 
    }

    return pedidos.filter((pedido) => {
      const dataPedidoFormatada = extrairDataIso(pedido.data_pedido);
      
      if (dataInicio && dataPedidoFormatada < dataInicio) return false;
      if (dataFim && dataPedidoFormatada > dataFim) return false;

      if (termoPesquisa.trim() !== '') {
        const termo = termoPesquisa.toLowerCase().trim();
        const nomeCliente = (pedido.cliente || '').toLowerCase();
        const numPedidoStr = String(pedido.numero_pedido);

        const correspondeNome = nomeCliente.includes(termo);
        const correspondeNumero = numPedidoStr.includes(termo);

        if (!correspondeNome && !correspondeNumero) return false;
      }

      return true;
    }).sort((a, b) => {
      if (ordemDirecao === 'desc') {
        return b.numero_pedido - a.numero_pedido;
      } else {
        return a.numero_pedido - b.numero_pedido;
      }
    });
  }, [pedidos, dataInicio, dataFim, termoPesquisa, ordemDirecao]);

  const limparFiltros = () => { 
    setDataInicio(''); 
    setDataFim(''); 
    setTermoPesquisa('');
  };

  const selecionarHoje = () => {
    const hojeIso = new Date().toISOString().split('T')[0];
    setDataInicio(hojeIso);
    setDataFim(hojeIso);
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

      {/* PESQUISA E FILTROS */}
      <section className="px-6 pt-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 w-full">
              <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">Pesquisar Pedido</label>
              <input 
                type="text" 
                value={termoPesquisa}
                onChange={e => setTermoPesquisa(e.target.value)}
                placeholder="Pesquise por nome do cliente ou número do pedido..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">Ordem</label>
              <select 
                value={ordemDirecao} 
                onChange={(e) => setOrdemDirecao(e.target.value as 'desc' | 'asc')}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none cursor-pointer"
              >
                <option value="desc">⬇️ Decrescente (Mais Recentes)</option>
                <option value="asc">⬆️ Crescente (Mais Antigos)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pt-3 border-t border-zinc-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full xl:w-auto">
              <div>
                <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">De (Data Inicial)</label>
                <input type="date" value={dataInicio} max={dataFim || undefined} onChange={(e) => setDataInicio(e.target.value)} className="w-full sm:w-48 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500 outline-none [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1.5">Até (Data Final)</label>
                <input type="date" value={dataFim} min={dataInicio || undefined} onChange={(e) => setDataFim(e.target.value)} className="w-full sm:w-48 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500 outline-none [color-scheme:dark]" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={selecionarHoje} className="bg-orange-600 hover:bg-orange-500 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md">Hoje</button>
              <button type="button" onClick={limparFiltros} disabled={!dataInicio && !dataFim && !termoPesquisa} className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold px-4 py-2.5 rounded-xl border border-zinc-700 transition-all">Limpar Filtros</button>
            </div>
          </div>
        </div>
      </section>

      {/* MÉTRICAS */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-xl flex justify-between items-center">
          <div><span className="text-[10px] text-zinc-400 uppercase font-black">Faturamento Bruto</span><p className="text-2xl font-black mt-1">{faturamentoTotal.toFixed(2)}€</p></div>
          <span className="text-2xl">💰</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-xl flex justify-between items-center">
          <div><span className="text-[10px] text-zinc-400 uppercase font-black">Descontos Aplicados</span><p className="text-2xl font-black mt-1 text-red-400">{totalDescontos.toFixed(2)}€</p></div>
          <span className="text-2xl">🎟️</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-xl flex justify-between items-center">
          <div><span className="text-[10px] text-zinc-400 uppercase font-black">Em Falta (Caderninho)</span><p className="text-2xl font-black mt-1 text-orange-400">{pendenteCaderninho.toFixed(2)}€</p></div>
          <span className="text-2xl">✏️</span>
        </div>
      </div>

      <main className="flex-1 px-6 pb-6 overflow-y-auto">
        {loading ? (
          <div className="text-center text-zinc-500 py-24">A carregar registos...</div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="text-center text-zinc-500 py-24 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl max-w-xl mx-auto space-y-2">
            <p className="text-base font-bold text-zinc-300">Nenhum pedido para exibir</p>
            <p className="text-xs text-zinc-500">Utilize os filtros de data ou pesquise pelo nome do cliente / número do pedido para visualizar os registos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pedidosFiltrados.map((ped) => (
              <div key={ped.id} className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-md hover:border-zinc-700/60 transition-all relative group">
                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* BOTÃO DE IMPRIMIR 2ª VIA SILENCIOSO */}
                  <button onClick={() => imprimirReciboTermico(ped)} className="w-7 h-7 bg-zinc-800 hover:bg-green-600 rounded-lg flex items-center justify-center text-xs transition-colors" title="Imprimir 2ª Via (Talão)">🖨️</button>
                  <button onClick={() => abrirEdicao(ped)} className="w-7 h-7 bg-zinc-800 hover:bg-blue-600 rounded-lg flex items-center justify-center text-xs transition-colors" title="Editar Informações e Itens/Combos">✏️</button>
                  <button onClick={() => excluirPedido(ped.numero_pedido, ped.ids_fragmentados!)} className="w-7 h-7 bg-zinc-800 hover:bg-red-600 rounded-lg flex items-center justify-center text-xs transition-colors" title="Excluir Pedido">🗑️</button>
                </div>

                <div>
                  <div className="flex justify-between items-start gap-2 border-b border-zinc-800/60 pb-3 mb-3 pr-24">
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500">#{ped.numero_pedido} · {ped.data_pedido}</span>
                      <h3 className="font-bold text-zinc-100 text-sm mt-0.5">{ped.cliente || 'Cliente Anónimo'}</h3>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${getCorCanal(ped.canal)}`}>{ped.canal}</span>
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${ped.pago ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>{ped.pago ? 'Pago' : 'Pendente'}</span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {ped.itens && ped.itens.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-zinc-300">
                        <span className="line-clamp-1 pr-2">
                          <span className="font-bold text-orange-400 mr-1.5">{item.quantidade}x</span>
                          {item.nome_produto}
                        </span>
                        <span className="font-mono text-zinc-500 text-[11px]">{(item.preco_unitario * item.quantidade).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-800/60 pt-3 mt-2 space-y-2 text-xs text-zinc-400">
                  <div className="flex justify-between text-[11px]">
                    <span>Pagamento: <span className="text-zinc-200 font-medium">{ped.forma_pagamento}</span></span>
                    {ped.taxa_entrega > 0 && <span>Entrega: {ped.taxa_entrega.toFixed(2)}€</span>}
                  </div>
                  
                  {ped.desconto > 0 && (
                    <div className="flex justify-between text-[11px] text-red-400">
                      <span>Desconto Aplicado:</span>
                      <span>-{ped.desconto.toFixed(2)}€</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t border-zinc-800/40 pt-2">
                    <span className="text-[11px]">Estafeta: <span className="text-zinc-300 font-medium">{ped.entregador || 'Nenhum'}</span></span>
                    <span className="text-base font-black text-orange-500">{ped.total_geral.toFixed(2)}€</span>
                  </div>

                  {!ped.pago && (
                    <button onClick={() => liquidarCaderninho(ped.numero_pedido)} className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold py-1.5 rounded-lg transition-all">
                      ✓ Recebido (Confirmar Pagamento)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL DE EDIÇÃO */}
      {modalEditar && pedidoEditando && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-3xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button onClick={() => setModalEditar(false)} className="absolute top-5 right-5 text-zinc-400 hover:text-white">✕</button>
            
            <h2 className="text-xl font-bold text-white mb-4 border-b border-zinc-800 pb-3">
              Editar Pedido #{pedidoEditando.numero_pedido}
            </h2>

            <form onSubmit={salvarEdicao} className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Cliente</label>
                  <input type="text" required value={pedidoEditando.cliente || ''} onChange={e => setPedidoEditando({...pedidoEditando, cliente: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Canal (Assume Preços Automáticos)</label>
                  <select 
                    value={pedidoEditando.canal} 
                    onChange={e => alterarCanalEdicao(e.target.value)} 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-amber-400 font-bold outline-none cursor-pointer"
                  >
                    <option value="Balcão">Balcão</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Glovo">Glovo</option>
                    <option value="Palmbites">Palmbites</option>
                    <option value="Revendedores">Revendedores</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Pagamento</label>
                  <select value={pedidoEditando.forma_pagamento} onChange={e => setPedidoEditando({...pedidoEditando, forma_pagamento: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none">
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="MBWay">MBWay</option>
                    <option value="Multibanco">Multibanco</option>
                    <option value="Dinheiro Glovo">Dinheiro Glovo</option>
                    <option value="Glovo">Faturamento Glovo</option>
                    <option value="Caderninho">Caderninho</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Estado do Pagamento</label>
                  <select value={pedidoEditando.pago ? 'true' : 'false'} onChange={e => setPedidoEditando({...pedidoEditando, pago: e.target.value === 'true'})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none">
                    <option value="true">Pago</option>
                    <option value="false">Pendente</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Entregador</label>
                  <select 
                    value={pedidoEditando.entregador || ''} 
                    onChange={e => setPedidoEditando({...pedidoEditando, entregador: e.target.value})} 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none cursor-pointer"
                  >
                    <option value="">-- Nenhum --</option>
                    {listaEstafetas.map(est => (
                      <option key={est.nome} value={est.nome}>{est.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Taxa de Entrega (€)</label>
                  <input type="number" step="0.01" min="0" value={pedidoEditando.taxa_entrega} onChange={e => {
                    const taxa = parseFloat(e.target.value) || 0;
                    const subtotal = pedidoEditando.itens?.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0) || 0;
                    const novoTotal = Math.max(0, subtotal + taxa - (pedidoEditando.desconto || 0));
                    setPedidoEditando({...pedidoEditando, taxa_entrega: taxa, total_geral: novoTotal});
                  }} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-orange-400 font-bold outline-none" />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Desconto (€)</label>
                  <input type="number" step="0.01" min="0" value={pedidoEditando.desconto ?? ''} onChange={e => {
                    const desc = e.target.value === '' ? 0 : parseFloat(e.target.value);
                    const subtotal = pedidoEditando.itens?.reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0) || 0;
                    const novoTotal = Math.max(0, subtotal + pedidoEditando.taxa_entrega - desc);
                    setPedidoEditando({...pedidoEditando, desconto: desc, total_geral: novoTotal});
                  }} className="w-full bg-zinc-950 border border-red-900/50 rounded-xl px-3 py-2 text-sm text-red-400 font-bold outline-none" />
                </div>
              </div>

              {/* ITENS E COMBOS */}
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3 mt-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <h3 className="text-xs font-bold uppercase text-zinc-400">Itens e Combos do Pedido</h3>
                  
                  <div className="flex gap-2 w-full sm:w-auto">
                    <select 
                      onChange={e => { adicionarProdutoEdicao(e.target.value); e.target.value = ''; }}
                      defaultValue=""
                      className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer flex-1 sm:flex-none"
                    >
                      <option value="" disabled>+ Adicionar Produto...</option>
                      {produtosDB.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>

                    <select 
                      onChange={e => { iniciarMontagemComboEdicao(e.target.value); e.target.value = ''; }}
                      defaultValue=""
                      className="bg-orange-600/20 border border-orange-500/40 rounded-xl px-3 py-1.5 text-xs text-orange-400 font-bold outline-none cursor-pointer flex-1 sm:flex-none"
                    >
                      <option value="" disabled>+ Adicionar Combo...</option>
                      {combosDB.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  {pedidoEditando.itens && pedidoEditando.itens.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 text-xs gap-2">
                      <span className="font-bold text-white flex-1 truncate">{item.nome_produto}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-zinc-400">{(item.preco_unitario * item.quantidade).toFixed(2)}€</span>
                        <input 
                          type="number" 
                          min="1" 
                          value={item.quantidade} 
                          onChange={e => alterarQtdItemEdicao(idx, parseInt(e.target.value) || 1)}
                          className="w-16 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-center font-bold text-white outline-none" 
                        />
                        <button type="button" onClick={() => removerItemEdicao(idx)} className="text-red-400 hover:text-red-300 px-1 font-bold">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-sm font-bold text-zinc-300">Total Geral Atualizado:</span>
                <span className="text-xl font-black text-orange-500 font-mono">{pedidoEditando.total_geral.toFixed(2)}€</span>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex justify-end gap-3">
                <button type="button" onClick={() => setModalEditar(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-400 hover:text-white">Cancelar</button>
                <button type="submit" disabled={salvando} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg disabled:opacity-50">
                  {salvando ? 'A Guardar...' : 'Guardar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE COMBO */}
      {modalComboEdicao && comboSelecionadoParaMontar && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex justify-center items-center z-[60] p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-3xl p-6 flex flex-col max-h-[90vh] shadow-2xl relative">
            <button onClick={() => setModalComboEdicao(false)} className="absolute top-5 right-5 text-zinc-400 hover:text-white font-bold">✕</button>
            <h2 className="text-xl font-bold text-orange-500 mb-1">Montar Combo: {comboSelecionadoParaMontar.nome}</h2>
            <p className="text-xs text-zinc-400 mb-4">{comboSelecionadoParaMontar.descricao}</p>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1">
              {comboSelecionadoParaMontar.combo_grupos.map((grupo: any) => {
                const selecoesDesteGrupo = selecoesComboEdicao[grupo.id] || [];
                const totalGrupo = selecoesDesteGrupo.reduce((acc, s) => acc + (s.quantidade || 1), 0);
                const atingiuMaximo = totalGrupo >= grupo.quantidade_maxima;

                return (
                  <div key={grupo.id} className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                    <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2.5 flex justify-between">
                      <span>{grupo.nome} ({totalGrupo}/{grupo.quantidade_maxima})</span>
                      {grupo.obrigatorio && <span className="text-orange-500">Obrigatório</span>}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {grupo.combo_grupo_produtos.filter((i: any) => i.ativo).map((itemVinculado: any) => {
                        const selItem = selecoesDesteGrupo.find((s: any) => s.produto_id === itemVinculado.produto_id);
                        const qtdSelecionada = selItem ? selItem.quantidade : 0;
                        const selecionado = qtdSelecionada > 0;

                        return (
                          <button
                            key={itemVinculado.produto_id}
                            type="button"
                            onClick={() => toggleSelecaoComboEdicao(grupo, itemVinculado)}
                            className={`p-3 text-left rounded-xl text-xs border transition-all relative ${
                              selecionado 
                                ? 'bg-orange-600/20 border-orange-500 text-white shadow' 
                                : atingiuMaximo 
                                  ? 'bg-zinc-900/40 border-zinc-800/40 text-zinc-600 opacity-50' 
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                            }`}
                          >
                            <span className="font-medium block">{itemVinculado.produto?.nome}</span>
                            {qtdSelecionada > 0 && (
                              <span className="absolute top-2 right-2 bg-orange-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                                {qtdSelecionada}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-zinc-800 mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setModalComboEdicao(false)} className="px-5 py-2.5 text-xs font-bold text-zinc-400 hover:text-white">Cancelar</button>
              <button type="button" onClick={confirmarComboEdicao} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg">Adicionar Combo ao Pedido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}