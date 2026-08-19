// app/utils/imprimirRecibo.ts

export const imprimirReciboTermico = (pedido: any) => {
  // 1. Cria um ecrã invisível (iframe) para não desconfigurar o site atual
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  const subtotal = (pedido.total_geral || 0) - (pedido.taxa_entrega || 0);

  // 2. Gera as linhas dos itens dinamicamente
  const linhasItens = pedido.itens_pedido?.map((item: any) => `
    <tr>
      <td style="width: 25px; vertical-align: top; font-weight: bold; font-size: 13px;">${item.quantidade}x</td>
      <td style="vertical-align: top; padding-bottom: 6px; padding-right: 4px; font-size: 13px; line-height: 1.1;">${item.nome_produto}</td>
      <td style="vertical-align: top; text-align: right; white-space: nowrap; font-size: 13px;">
        ${((item.quantidade || 0) * (item.preco_unitario || 0)).toFixed(2).replace('.', ',')} €
      </td>
    </tr>
  `).join('') || '';

  // 3. Desenha o Talão em HTML puro com o tamanho exato da Eurosys (80mm)
  const html = `
    <html>
      <head>
        <title>Recibo #${pedido.numero_pedido || '---'}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          body { 
            margin: 0; 
            padding: 4mm; /* Margem de segurança para não cortar nas bordas */
            width: 72mm;  /* Largura imprimível de uma impressora de 80mm */
            font-family: 'Courier New', Courier, monospace; /* Fonte clássica de talão */
            color: black; 
            background: white;
          }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .font-black { font-weight: 900; }
          .uppercase { text-transform: uppercase; }
          .mb-1 { margin-bottom: 4px; }
          .mb-2 { margin-bottom: 8px; }
          .mb-4 { margin-bottom: 16px; }
          .mt-2 { margin-top: 8px; }
          .border-b { border-bottom: 2px solid black; }
          .border-b-dashed { border-bottom: 1px dashed black; padding-bottom: 6px; margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; }
          .flex-between { display: flex; justify-content: space-between; align-items: end; }
        </style>
      </head>
      <body>
        <div class="text-center mb-2 border-b pb-1">
          <h1 class="font-black margin-0 uppercase" style="font-size: 22px; margin: 0;">CHEF BATATÔ</h1>
        </div>
        
        <h2 class="text-center font-black mb-1" style="font-size: 32px; margin: 0;">#${pedido.numero_pedido || '---'}</h2>
        <h3 class="text-center font-bold mb-1" style="font-size: 16px; margin: 0;">CONFERENCIA</h3>
        
        <p class="text-center uppercase font-bold mb-4 mt-2" style="font-size: 12px;">
          ${pedido.canal} - ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', {hour: '2-digit', minute:'2-digit'})}
        </p>

        <div class="mb-4" style="font-size: 13px; line-height: 1.3;">
          <div class="font-bold" style="font-size: 15px;">${pedido.cliente || 'Consumidor Final'}</div>
          ${pedido.contacto_cliente ? `<div>${pedido.contacto_cliente}</div>` : ''}
          ${pedido.endereco ? `<div>${pedido.endereco}</div>` : ''}
        </div>

        <div class="border-b-dashed"></div>

        <table class="mb-2">
          ${linhasItens}
        </table>

        <div class="border-b-dashed"></div>

        <div class="flex-between font-bold mb-1" style="font-size: 13px;">
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2).replace('.', ',')} €</span>
        </div>
        ${pedido.taxa_entrega > 0 ? `
        <div class="flex-between font-bold mb-2" style="font-size: 13px;">
          <span>Entrega</span>
          <span>${Number(pedido.taxa_entrega).toFixed(2).replace('.', ',')} €</span>
        </div>
        ` : ''}

        <div class="flex-between mt-2 mb-4">
          <span class="font-black" style="font-size: 26px;">TOTAL</span>
          <span class="font-black" style="font-size: 22px;">${Number(pedido.total_geral).toFixed(2).replace('.', ',')} €</span>
        </div>

        <div class="font-bold" style="border-top: 1px solid black; padding-top: 8px; font-size: 12px;">
          Pagamento: ${pedido.forma_pagamento} (${pedido.pago ? 'Pago' : 'Pendente'})
        </div>
        
        <!-- Espaço em branco para a Eurosys conseguir cortar o papel no sítio certo -->
        <div style="height: 30px;">.</div>
      </body>
    </html>
  `;

  // 4. Injeta o HTML, chama a impressão e depois limpa o ecrã invisível
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Remove o iframe após 1 segundo para não acumular lixo no navegador
      setTimeout(() => document.body.removeChild(iframe), 1000);
    };
  }
};