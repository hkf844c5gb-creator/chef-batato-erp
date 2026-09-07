// app/utils/imprimirRecibo.ts

export const imprimirReciboTermico = (pedido: any) => {
  if (typeof window === 'undefined') return;

  const iframe = document.createElement('iframe');

  // Mantém o iframe fora do ecrã sem usar display:none,
  // porque alguns navegadores podem não imprimir corretamente elementos ocultos.
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

  // Compatível tanto com a página de Pedidos (pedido.itens)
  // quanto com outras páginas que usem pedido.itens_pedido.
  const itens = Array.isArray(pedido?.itens)
    ? pedido.itens
    : Array.isArray(pedido?.itens_pedido)
      ? pedido.itens_pedido
      : [];

  const subtotal = itens.reduce(
    (acc: number, item: any) =>
      acc +
      Number(item?.quantidade || 0) *
        Number(item?.preco_unitario || 0),
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
          <td
            style="
              width:25px;
              vertical-align:top;
              font-weight:bold;
              font-size:13px;
            "
          >
            ${quantidade}x
          </td>

          <td
            style="
              vertical-align:top;
              padding-bottom:6px;
              padding-right:4px;
              font-size:13px;
              line-height:1.1;
              word-break:break-word;
            "
          >
            ${escaparHtml(item?.nome_produto)}
          </td>

          <td
            style="
              vertical-align:top;
              text-align:right;
              white-space:nowrap;
              font-size:13px;
            "
          >
            ${valorFormatado(totalItem)}
          </td>
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
          @page {
            margin: 0;
            size: 80mm auto;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            background: white;
            color: black;
          }

          body {
            width: 72mm;
            padding: 4mm;
            font-family: "Courier New", Courier, monospace;
          }

          .text-center {
            text-align: center;
          }

          .font-bold {
            font-weight: bold;
          }

          .font-black {
            font-weight: 900;
          }

          .uppercase {
            text-transform: uppercase;
          }

          .mb-1 {
            margin-bottom: 4px;
          }

          .mb-2 {
            margin-bottom: 8px;
          }

          .mb-4 {
            margin-bottom: 16px;
          }

          .mt-2 {
            margin-top: 8px;
          }

          .border-b {
            border-bottom: 2px solid black;
          }

          .border-b-dashed {
            border-bottom: 1px dashed black;
            padding-bottom: 6px;
            margin-bottom: 6px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          .flex-between {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 8px;
          }
        </style>
      </head>

      <body>
        <div class="text-center mb-2 border-b">
          <h1
            class="font-black uppercase"
            style="
              font-size:22px;
              margin:0;
              padding-bottom:3px;
            "
          >
            CHEF BATATÔ
          </h1>
        </div>

        <h2
          class="text-center font-black"
          style="
            font-size:32px;
            margin:0;
          "
        >
          #${escaparHtml(pedido?.numero_pedido || '---')}
        </h2>

        <h3
          class="text-center font-bold"
          style="
            font-size:16px;
            margin:0;
          "
        >
          CONFERÊNCIA
        </h3>

        <p
          class="text-center uppercase font-bold mb-4 mt-2"
          style="font-size:12px;"
        >
          ${escaparHtml(pedido?.canal || '')}
          -
          ${agora.toLocaleDateString('pt-PT')}
          ${agora.toLocaleTimeString('pt-PT', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>

        <div
          class="mb-4"
          style="
            font-size:13px;
            line-height:1.3;
          "
        >
          <div
            class="font-bold"
            style="font-size:15px;"
          >
            ${escaparHtml(pedido?.cliente || 'Consumidor Final')}
          </div>

          ${
            pedido?.contacto_cliente
              ? `<div>${escaparHtml(pedido.contacto_cliente)}</div>`
              : ''
          }

          ${
            pedido?.endereco
              ? `<div>${escaparHtml(pedido.endereco)}</div>`
              : ''
          }
        </div>

        <div class="border-b-dashed"></div>

        <table class="mb-2">
          ${
            linhasItens ||
            `
              <tr>
                <td
                  style="
                    text-align:center;
                    font-size:12px;
                  "
                >
                  Sem itens
                </td>
              </tr>
            `
          }
        </table>

        <div class="border-b-dashed"></div>

        <div
          class="flex-between font-bold mb-1"
          style="font-size:13px;"
        >
          <span>Subtotal</span>
          <span>${valorFormatado(subtotal)}</span>
        </div>

        ${
          desconto > 0
            ? `
          <div
            class="flex-between font-bold mb-1"
            style="font-size:13px;"
          >
            <span>Desconto</span>
            <span>-${valorFormatado(desconto)}</span>
          </div>
        `
            : ''
        }

        ${
          taxaEntrega > 0
            ? `
          <div
            class="flex-between font-bold mb-2"
            style="font-size:13px;"
          >
            <span>Entrega</span>
            <span>${valorFormatado(taxaEntrega)}</span>
          </div>
        `
            : ''
        }

        <div class="flex-between mt-2 mb-4">
          <span
            class="font-black"
            style="font-size:26px;"
          >
            TOTAL
          </span>

          <span
            class="font-black"
            style="font-size:22px;"
          >
            ${valorFormatado(totalGeral)}
          </span>
        </div>

        <div
          class="font-bold"
          style="
            border-top:1px solid black;
            padding-top:8px;
            font-size:12px;
          "
        >
          Pagamento:
          ${escaparHtml(pedido?.forma_pagamento || '---')}
          (${pedido?.pago ? 'Pago' : 'Pendente'})
        </div>

        ${
          pedido?.entregador
            ? `
          <div
            style="
              font-size:12px;
              margin-top:4px;
            "
          >
            Estafeta:
            <strong>${escaparHtml(pedido.entregador)}</strong>
          </div>
        `
            : ''
        }

        <div
          style="
            height:30px;
            font-size:1px;
          "
        >
          &nbsp;
        </div>
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
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1500);
    }
  }, 300);
};
