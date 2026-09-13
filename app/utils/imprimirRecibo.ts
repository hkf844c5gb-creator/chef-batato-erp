// app/utils/imprimirRecibo.ts

export const imprimirReciboTermico = (pedido: any) => {
  if (typeof window === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const taxaEntrega = Number(pedido?.taxa_entrega || 0);
  const desconto = Number(pedido?.desconto || 0);
  const totalGeral = Number(pedido?.total_geral || 0);

  const itens = Array.isArray(pedido?.itens)
    ? pedido.itens
    : Array.isArray(pedido?.itens_pedido)
      ? pedido.itens_pedido
      : [];

  const subtotal = itens.reduce(
    (acc: number, item: any) =>
      acc + Number(item?.quantidade || 0) * Number(item?.preco_unitario || 0),
    0
  );

  const escaparHtml = (valor: any) =>
    String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const valorFormatado = (valor: number) =>
    Number(valor || 0).toFixed(2).replace('.', ',') + ' €';

  const linhasItens = itens
    .map((item: any) => {
      const quantidade = Number(item?.quantidade || 0);
      const precoUnitario = Number(item?.preco_unitario || 0);
      const totalItem = quantidade * precoUnitario;

      return `
        <tr>
          <td class="qtd">${quantidade}x</td>
          <td class="item-nome">${escaparHtml(item?.nome_produto)}</td>
          <td class="item-valor">${valorFormatado(totalItem)}</td>
        </tr>
      `;
    })
    .join('');

  const agora = new Date();

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Pedido #${escaparHtml(pedido?.numero_pedido || '---')}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; color: #000; }

          body {
            width: 72mm;
            padding: 3mm;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.25;
            -webkit-font-smoothing: none;
            text-rendering: geometricPrecision;
          }

          .text-center { text-align: center; }
          .font-bold { font-weight: 800; }
          .font-black { font-weight: 900; }
          .uppercase { text-transform: uppercase; }
          .mb-1 { margin-bottom: 4px; }
          .mb-2 { margin-bottom: 8px; }
          .mb-4 { margin-bottom: 14px; }
          .mt-2 { margin-top: 8px; }
          .border-b { border-bottom: 3px solid #000; }
          .border-b-dashed { border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; }
          td { font-size: 15px; font-weight: 800; }

          .qtd {
            width: 28px;
            vertical-align: top;
            font-weight: 900;
            font-size: 16px;
            padding-bottom: 8px;
          }

          .item-nome {
            vertical-align: top;
            padding-bottom: 8px;
            padding-right: 4px;
            font-size: 15px;
            font-weight: 800;
            line-height: 1.15;
            word-break: break-word;
          }

          .item-valor {
            vertical-align: top;
            text-align: right;
            white-space: nowrap;
            padding-bottom: 8px;
            font-size: 15px;
            font-weight: 900;
          }

          .flex-between { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
          .linha-valores { font-size: 15px; font-weight: 800; }
          .total-label { font-size: 28px; font-weight: 900; }
          .total-valor { font-size: 25px; font-weight: 900; }
          .pagamento { border-top: 2px solid #000; padding-top: 8px; font-size: 14px; font-weight: 900; }
          .dados-cliente { font-size: 14px; line-height: 1.35; font-weight: 700; }
          .cliente-nome { font-size: 17px; font-weight: 900; }
        </style>
      </head>
      <body>
        <div class="text-center mb-2 border-b">
          <h1 class="font-black uppercase" style="font-size:27px;margin:0;padding-bottom:4px;letter-spacing:0.3px;">
            CHEF BATATÔ
          </h1>
        </div>

        <h2 class="text-center font-black" style="font-size:38px;margin:0;line-height:1;">
          #${escaparHtml(pedido?.numero_pedido || '---')}
        </h2>

        <h3 class="text-center font-black" style="font-size:19px;margin:4px 0 0 0;">
          CONFERÊNCIA
        </h3>

        <p class="text-center uppercase font-black mb-4 mt-2" style="font-size:13px;">
          ${escaparHtml(pedido?.canal || '')} -
          ${agora.toLocaleDateString('pt-PT')}
          ${agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
        </p>

        <div class="mb-4 dados-cliente">
          <div class="cliente-nome">${escaparHtml(pedido?.cliente || 'Consumidor Final')}</div>
          ${pedido?.contacto_cliente ? `<div>${escaparHtml(pedido.contacto_cliente)}</div>` : ''}
          ${pedido?.endereco ? `<div>${escaparHtml(pedido.endereco)}</div>` : ''}
        </div>

        <div class="border-b-dashed"></div>

        <table class="mb-2">
          ${linhasItens || `<tr><td style="text-align:center;font-size:14px;font-weight:800;">Sem itens</td></tr>`}
        </table>

        <div class="border-b-dashed"></div>

        <div class="flex-between linha-valores mb-1">
          <span>Subtotal</span><span>${valorFormatado(subtotal)}</span>
        </div>

        ${desconto > 0 ? `<div class="flex-between linha-valores mb-1"><span>Desconto</span><span>-${valorFormatado(desconto)}</span></div>` : ''}
        ${taxaEntrega > 0 ? `<div class="flex-between linha-valores mb-2"><span>Entrega</span><span>${valorFormatado(taxaEntrega)}</span></div>` : ''}

        <div class="flex-between mt-2 mb-4">
          <span class="total-label">TOTAL</span>
          <span class="total-valor">${valorFormatado(totalGeral)}</span>
        </div>

        <div class="pagamento">
          Pagamento: ${escaparHtml(pedido?.forma_pagamento || '---')} (${pedido?.pago ? 'Pago' : 'Pendente'})
        </div>

        ${pedido?.entregador ? `<div style="font-size:13px;font-weight:800;margin-top:5px;">Estafeta: <strong>${escaparHtml(pedido.entregador)}</strong></div>` : ''}

        <div style="height:35px;font-size:1px;">&nbsp;</div>
      </body>
    </html>
  `;

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    alert('Não foi possível abrir a impressão.');
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }
  }, 300);
};
