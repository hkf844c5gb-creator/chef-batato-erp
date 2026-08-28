import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SOCIOS_MBWAY = {
  "912385232": "Rafael",
  "912385130": "Caroline",
  "924408493": "Marcelo",
  "924408480": "Thatiane"
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fileBase64, tipoArquivo, periodoRef } = body;

    if (!fileBase64 || fileBase64.length < 100) throw new Error("O ficheiro recebido está vazio ou corrompido.");

    let base64Data = fileBase64;
    if (fileBase64.includes(',')) base64Data = fileBase64.split(',')[1];

    let detectedMimeType = 'application/pdf';
    if (base64Data.startsWith('/9j/')) detectedMimeType = 'image/jpeg';
    else if (base64Data.startsWith('iVBORw0KGgo')) detectedMimeType = 'image/png';
    else if (base64Data.startsWith('JVBER')) detectedMimeType = 'application/pdf';

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) throw new Error("Chave de API não configurada no servidor.");

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 🧠 NOVO CÉREBRO: INSTRUÇÕES CIRÚRGICAS PARA O GOOGLE GEMINI
    const promptContexto = `
      És um auditor financeiro especialista em Portugal. Analisa este documento (tipo: ${tipoArquivo}).
      A tua tarefa é extrair os dados com precisão absoluta, replicando a exatidão de um contabilista.
      Devolve APENAS um objeto JSON válido, sem formatação markdown.
      
      Regras de Extração OBRIGATÓRIAS (Faturas):
      1. Extrai o "fornecedor" (Nome da Empresa emissora).
      2. Extrai o "nif_fornecedor" (Apenas os 9 números do NIF/Contribuinte. Se não houver, envia vazio "").
      3. Extrai o "numero_fatura" (A Referência exata, ex: FS 123/45, FR 2026/1). Se não houver, usa "S/N".
      4. Extrai a "data" no formato "YYYY-MM-DD".
      5. Extrai o "valorTotal" (o valor final cobrado no documento).
      6. Na chave "itens", cria uma lista com TODOS os produtos.
      7. SEGREGAÇÃO DE IMPOSTOS E TAXAS: É OBRIGATÓRIO adicionar itens individuais para o IVA (ex: "IVA 23%"), Taxas (ex: "Saco Plástico", "Valor de Depósito"), e Descontos (com valor negativo). A soma de todos os "valor_total" dos itens DEVE bater matematicamente certo com o "valorTotal".

      Formato JSON exigido para Faturas:
      {
        "fornecedor": "Nome da Empresa",
        "nif_fornecedor": "123456789",
        "numero_fatura": "FS 2024/1",
        "data": "YYYY-MM-DD",
        "valorTotal": 100.50,
        "itens": [
          { "nome_extraido": "Nome do Produto ou Imposto", "quantidade": 1, "unidade": "un", "valor_total": 50.00 }
        ]
      }

      Formato JSON exigido para Extratos/Glovo/Uber:
      { 
        "movimentos": [
          { "data": "YYYY-MM-DD", "descricao": "Descrição do Movimento", "valor": 10.00, "tipo": "entrada" | "saida" }
        ] 
      }
    `;

    const imageParts = [{ inlineData: { data: base64Data, mimeType: detectedMimeType } }];
    const result = await model.generateContent([promptContexto, ...imageParts]);
    const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    let dadosExtraidos;
    try {
      dadosExtraidos = JSON.parse(cleanJson);
    } catch (parseError) {
      throw new Error(`A Inteligência Artificial falhou ao ler o JSON. A conta Google pode ter atingido o limite ou o formato falhou.`);
    }

    const divergencias: any[] = [];
    const retiradasSocios: any[] = [];
    const conciliacoes: any[] = [];

    // --- ALIMENTAÇÃO DA DESPENSA (Insumos) ---
    if (tipoArquivo === 'Fatura' && dadosExtraidos.itens && Array.isArray(dadosExtraidos.itens)) {
      for (const item of dadosExtraidos.itens) {
        if (!item.nome_extraido || item.nome_extraido.toUpperCase().includes('IVA') || item.nome_extraido.toUpperCase().includes('DESCONTO')) continue;
        
        const qtdComprada = Number(item.quantidade || 1);
        const custoTotalItem = Number(item.valor_total || 0);
        const custoUnitCalc = qtdComprada > 0 ? custoTotalItem / qtdComprada : 0;

        const { data: insumoExistente } = await supabase.from('insumos').select('id, quantidade_atual').ilike('nome', `%${item.nome_extraido.trim()}%`).limit(1).maybeSingle();

        if (insumoExistente) {
          const novaQtd = Number(insumoExistente.quantidade_atual || 0) + qtdComprada;
          await supabase.from('insumos').update({ quantidade_atual: novaQtd, custo_por_unidade: custoUnitCalc > 0 ? custoUnitCalc : undefined }).eq('id', insumoExistente.id);
        } else {
          await supabase.from('insumos').insert([{ nome: item.nome_extraido.trim(), unidade_medida: item.unidade || 'un', quantidade_atual: qtdComprada, quantidade_alerta: 2, custo_por_unidade: custoUnitCalc }]);
        }
      }
    }

    // --- EXTRATOS BANCÁRIOS (MBWAY) ---
    if (['Extrato', 'Glovo', 'Palmbites'].includes(tipoArquivo) && dadosExtraidos.movimentos) {
      for (const mov of dadosExtraidos.movimentos) {
        if (mov.tipo === 'saida') {
          let socioEncontrado = false;
          const descLimpa = mov.descricao.replace(/\s+/g, '');
          for (const [numero, nome] of Object.entries(SOCIOS_MBWAY)) {
            if (descLimpa.includes(numero)) {
              retiradasSocios.push({ data: mov.data, socio: nome, numero_mbway: numero, valor: mov.valor, descricao: mov.descricao });
              socioEncontrado = true;
              break;
            }
          }
          if (!socioEncontrado) {
            const { data: despesaCorresp } = await supabase.from('despesas').select('*').gte('valor', mov.valor - 0.5).lte('valor', mov.valor + 0.5).maybeSingle();
            if (despesaCorresp) {
              await supabase.from('despesas').update({ status: 'Validado' }).eq('id', despesaCorresp.id);
              conciliacoes.push({ detalhe: `Pagamento validou a fatura ${despesaCorresp.descricao}`, status: 'Validado' });
            } else {
              await supabase.from('despesas').insert([{ id: crypto.randomUUID(), data_despesa: mov.data, descricao: mov.descricao, categoria: 'Extrato Bancário', valor: mov.valor, status: 'Falta Fatura' }]);
              divergencias.push({ alerta: 'Saída bancária sem fatura.', detalhe: mov.descricao, tipo: 'Falta Fatura' });
            }
          }
        }
      }
    }

    const resumo: any = { status: `Auditoria Concluída`, dadosExtraidos, itens: dadosExtraidos.itens || [], relatorio_socios: retiradasSocios.length > 0 ? retiradasSocios : "Limpo", conciliacoes: conciliacoes.length > 0 ? conciliacoes : "Nenhuma conciliação bancária direta." };

    const { data: sessao, error } = await supabase.from('auditoria_sessoes').insert([{ tipo_arquivo: tipoArquivo, periodo_ref: periodoRef, resumo, divergencias }]).select().single();
    if (error) throw error;

    return NextResponse.json({ sucesso: true, sessao, dadosLidos: dadosExtraidos });

  } catch (error: unknown) {
    const erroMsg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ error: erroMsg }, { status: 500 });
  }
}