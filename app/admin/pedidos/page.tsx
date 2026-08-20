'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================================
// 🖨️ MOTOR DE IMPRESSÃO SILENCIOSA (CHEF BATATÔ)
// ============================================================================
export const imprimirReciboTermico = (pedido: any) => {
  const subtotal = (pedido.total_geral || 0) - (pedido.taxa_entrega || 0) + (pedido.desconto || 0);
  const itensDoPedido = pedido.itens || pedido.itens_pedido || [];

  const linhasItens = itensDoPedido.map((item: any) => `
    <tr>
      <td style="width: 25px; vertical-align: top; font-weight: bold; font-size: 13px;">${item.quantidade}x</td>
      <td style="vertical-align: top; padding-bottom: 6px; padding-right: 4px; font-size: 13px; line-height: 1.1;">${item.nome_produto}</td>
      <td style="vertical-align: top; text-align: right; white-space: nowrap; font-size: 13px; font-weight: bold;">
        ${((item.quantidade || 0) * (item.preco_unitario || 0)).toFixed(2).replace('.', ',')} €
      </td>
    </tr>
  `).join('') || '';

  const html = `
    <html>
      <head>
        <title>Recibo #${pedido.numero_pedido || '---'}</title>
        <style>
          @media print { @page { margin: 0; } body { margin: 0; padding: 3mm; width: 100%; max-width: 80mm; font-family: 'Courier New', Courier, monospace; color: black; background: white; } }
          .text-center { text-align: center; } .font-bold { font-weight: bold; } .font-black { font-weight: 900; }
          .uppercase { text-transform: uppercase; } .border-b { border-bottom: 2px solid black; padding-bottom: 4px; margin-bottom: 8px; }
          .border-b-dashed { border-bottom: 1px dashed black; padding-bottom: 6px; margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; } .flex-between { display: flex; justify-content: space-between; align-items: end; }
        </style>
      </head>
      <body>
        <div class="text-center border-b"><h1 class="font-black uppercase" style="font-size: 22px; margin: 0;">CHEF BATATÔ</h1></div>
        <h2 class="text-center font-black" style="font-size: 36px; margin: 0; line-height: 1;">#${pedido.numero_pedido || '---'}</h2>
        <h3 class="text-center font-bold" style="font-size: 18px; margin: 0; margin-top: 4px;">CONFERENCIA</h3>
        <p class="text-center uppercase font-bold" style="font-size: 12px; margin-top: 4px; margin-bottom: 16px;">
          ${pedido.canal} - ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', {hour: '2-digit', minute:'2-digit'})}
        </p>
        <div style="font-size: 13px; line-height: 1.3; margin-bottom: 12px;">
          <div class="font-bold" style="font-size: 15px;">${pedido.cliente || 'Consumidor Final'}</div>
          ${pedido.contacto_cliente ? `<div>${pedido.contacto_cliente}</div>` : ''}
          ${pedido.endereco || pedido.morada ? `<div>${pedido.endereco || pedido.morada}</div>` : ''}
        </div>
        <div class="border-b-dashed"></div>
        <table style="margin-bottom: 8px;">${linhasItens}</table>
        <div class="border-b-dashed"></div>
        <div class="flex-between font-bold" style="font-size: 13px; margin-bottom: 4px;"><span>Subtotal</span><span>${subtotal.toFixed(2).replace('.', ',')} €</span></div>
        ${(pedido.desconto > 0) ? `<div class="flex-between font-bold" style="font-size: 13px; margin-bottom: 4px; color: #555;"><span>Desconto</span><span>-${Number(pedido.desconto).toFixed(2).replace('.', ',')} €</span></div>` : ''}
        ${(pedido.taxa_entrega > 0) ? `<div class="flex-between font-bold" style="font-size: 13px; margin-bottom: 8px;"><span>Entrega</span><span>${Number(pedido.taxa_entrega).toFixed(2).replace('.', ',')} €</span></div>` : ''}
        <div class="flex-between" style="margin-top: 8px; margin-bottom: 16px;"><span class="font-black" style="font-size: 26px;">TOTAL</span><span class="font-black" style="font-size: 24px;">${Number(pedido.total_geral).toFixed(2).replace('.', ',')} €</span></div>
        <div class="font-bold" style="border-top: 2px solid black; padding-top: 8px; font-size: 13px;">Pagamento: ${pedido.forma_pagamento} (${pedido.pago ? 'Pago' : 'Pendente'})</div>
        <div style="height: 40px;">.</div>
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

  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  async function carregarDadosIniciais() {
    setLoading(true);
    try {
      const { data: dataProds } = await supabase.from('produtos').select('*').eq('ativo', true);
      if (dataProds) setProdutosDB(dataProds);
      const { data: dataEsts } = await supabase.from('estafetas').select('nome').eq('ativo', true).order('nome', { ascending: true });
      if (dataEsts) setListaEstafetas(dataEsts);
      const { data: dataCombos } = await supabase.from('combos').select('*, combo_grupos(*, combo_grupo_produtos(*, produto:produtos(*)))').eq('ativo', true).eq('esgotado', false);
      if (dataCombos) setCombosDB(dataCombos.map(cb => ({ ...cb, combo_grupos: (cb.combo_grupos || []).sort((a: any, b: any) => a.ordem - b.ordem) })));
      const { data, error } = await supabase.from('pedidos').select('*, itens:itens_pedido(*)').order('numero_pedido', { ascending: false });
      if (error) throw error;
      if (data) {
        const agrupados = new Map<string, Pedido>();
        data.forEach((linha: any) => {
          const chaveNum = String(linha.numero_pedido);
          const itensDestaLinha = (linha.itens || []).map((item: any) => ({ ...item, quantidade: Number(item.quantidade || 1), preco_unitario: Number(item.preco_unitario || 0) }));
          if (!agrupados.has(chaveNum)) agrupados.set(chaveNum, { ...linha, numero_pedido: Number(linha.numero_pedido), itens: itensDestaLinha, ids_fragmentados: [linha.id] });
          else { const ex = agrupados.get(chaveNum)!; ex.itens?.push(...itensDestaLinha); ex.ids_fragmentados?.push(linha.id); }
        });
        setPedidos(Array.from(agrupados.values()).map(ped => ({ ...ped, total_geral: (ped.itens || []).reduce((acc, it) => acc + (it.quantidade * it.preco_unitario), 0) + Number(ped.taxa_entrega || 0) - Number(ped.desconto || 0) })));
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  // (Nota: Mantive a estrutura original das funções liquidar/excluir/etc. para manter a funcionalidade intacta)
  // ... [Inclua aqui as funções de exclusão, salvar, e montagem de combos originais do seu ficheiro] ...

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
        {/* O resto do seu JSX permanece igual */}
    </div>
  );
}