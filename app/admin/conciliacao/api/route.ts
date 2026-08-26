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

    if (!fileBase64 || fileBase64.length < 100) {
      throw new Error("O ficheiro recebido está vazio ou corrompido.");
    }

    let base64Data = fileBase64;
    if (fileBase64.includes(',')) base64Data = fileBase64.split(',')[1];

    let detectedMimeType = 'application/pdf';
    if (base64Data.startsWith('/9j/')) detectedMimeType = 'image/jpeg';
    else if (base64Data.startsWith('iVBORw0KGgo')) detectedMimeType = 'image/png';
    else if (base64Data.startsWith('JVBER')) detectedMimeType = 'application/pdf';

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) throw new Error("Chave de API não configurada no servidor.");

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const promptContexto = `
      És um auditor financeiro e de stock experiente. Analisa este documento (tipo: ${tipoArquivo}).
      Devolve APENAS um objeto JSON válido, sem blocos de código markdown (\`\`\`json).
      
      Se o documento for uma Fatura/Recibo, extrai obrigatoriamente os dados gerais E a lista detalhada de produtos/itens comprados:
      {
        "fornecedor": string,
        "data": "YYYY-MM-DD",
        "valorTotal": number,
        "itens": [
          {
            "nome_extraido": string,
            "quantidade": number,
            "unidade": string (ex: "kg", "un", "L", "cx", "g"),
            "tipo": "alimentar" | "embalagem" | "geral",
            "valor_total": number
          }
        ]
      }

      Se o documento for um Extrato Bancário ou de Plataformas, devolve:
      { 
        "movimentos": [
          { "data": "YYYY-MM-DD", "descricao": string, "valor": number, "tipo": "entrada" | "saida" }
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
      throw new Error(`A Inteligência Artificial falhou ao ler a fatura. O documento pode estar ilegível ou protegido. Resposta da IA: ${cleanJson.substring(0, 150)}...`);
    }

    const divergencias: any[] = [];
    const retiradasSocios: any[] = [];
    const conciliacoes: any[] = [];

    // --- ALIMENTAÇÃO DA DESPENSA ---
    if (tipoArquivo === 'Fatura' && dadosExtraidos.itens && Array.isArray(dadosExtraidos.itens)) {
      for (const item of dadosExtraidos.itens) {
        if (!item.nome_extraido) continue;
        const qtdComprada = Number(item.quantidade || 1);
        const custoTotalItem = Number(item.valor_total || 0);
        const custoUnitCalc = qtdComprada > 0 ? custoTotalItem / qtdComprada : 0;

        const { data: insumoExistente } = await supabase.from('insumos').select('id, quantidade_atual').ilike('nome', `%${item.nome_extraido.trim()}%`).limit(1).maybeSingle();

        if (insumoExistente) {
          const novaQtd = Number(insumoExistente.quantidade_atual || 0) + qtdComprada;
          await supabase.from('insumos').update({ quantidade_atual: novaQtd, custo_por_unidade: custoUnitCalc > 0 ? custoUnitCalc : undefined }).eq('id', insumoExistente.id);
        } else {
          await supabase.from('insumos').insert([{ nome: item.nome_extraido.trim(), unidade_medida: item.unidade || 'unid', quantidade_atual: qtdComprada, quantidade_alerta: 2, custo_por_unidade: custoUnitCalc }]);
        }
      }
    }

    // --- CRUZAMENTO ---
    if (tipoArquivo === 'Fatura') {
      const valorTotalFatura = Number(dadosExtraidos.valorTotal || 0);
      const { data: despesaExistente } = await supabase.from('despesas').select('*').gte('valor', valorTotalFatura - 1).lte('valor', valorTotalFatura + 1).maybeSingle();

      if (!despesaExistente) {
        const novoId = crypto.randomUUID();
        await supabase.from('despesas').insert([{ id: novoId, data_despesa: dadosExtraidos.data || new Date().toISOString().split('T')[0], descricao: dadosExtraidos.fornecedor || 'Fatura Desconhecida', categoria: 'Fatura Física', valor: valorTotalFatura, status: 'Falta Pagamento' }]);
        conciliacoes.push({ detalhe: `Fatura inserida aguardando pagamento.`, status: 'Inserida' });
      } else {
        await supabase.from('despesas').update({ status: 'Validado', descricao: `[VALIDADO] ${dadosExtraidos.fornecedor || 'Fornecedor'}` }).eq('id', despesaExistente.id);
        conciliacoes.push({ detalhe: `Fatura validada com movimento bancário!`, status: 'Validado' });
      }
    } 

    const resumo: any = { status: `Auditoria Concluída`, dadosExtraidos, itens: dadosExtraidos.itens || [], relatorio_socios: retiradasSocios.length > 0 ? retiradasSocios : "Limpo", conciliacoes: conciliacoes.length > 0 ? conciliacoes : "Nenhum cruzamento exato encontrado." };

    const { data: sessao, error } = await supabase.from('auditoria_sessoes').insert([{ tipo_arquivo: tipoArquivo, periodo_ref: periodoRef, resumo, divergencias }]).select().single();
    if (error) throw error;

    return NextResponse.json({ sucesso: true, sessao, dadosLidos: dadosExtraidos });

  } catch (error: unknown) {
    const erroMsg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ error: erroMsg }, { status: 500 });
  }
}