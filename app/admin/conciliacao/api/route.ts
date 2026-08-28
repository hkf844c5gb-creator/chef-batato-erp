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
    // 🎯 UTILIZANDO O MODELO ESTÁVEL COMPATÍVEL
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const promptContexto = `
      És um auditor financeiro e Diretor Financeiro (CFO) em Portugal. Analisa este documento (tipo: ${tipoArquivo}).
      Extrai os dados com precisão absoluta. Devolve APENAS um objeto JSON válido, sem formatação markdown.
      
      Regras OBRIGATÓRIAS:
      1. Extrai "fornecedor", "nif_fornecedor", "numero_fatura" (Se não houver usa "S/N"), "data" (YYYY-MM-DD) e "valorTotal".
      2. Na chave "itens", cria uma lista com TODOS os serviços/produtos cobrados. O IVA deve ser extraído como um item separado.
      
      🚨 REGRA DE CATEGORIZAÇÃO CIRÚRGICA (CFO):
      - Menções a "Ads", "Facebook", "Meta Platforms", "Facebk" ou "Instagram" -> "Marketing (Meta/Facebook)"
      - Menções a "Promoções", "Marketing promocional", "Campanhas" da Glovo -> "Marketing (Glovo)"
      - Menções a "Comissão", "Uso da plataforma", "Taxa de ativação", "Taxa de serviço" da Glovo/Uber -> "Taxas e Comissões (Glovo/Uber)"
      - Menções a "IVA", "Imposto" -> usar a mesma categoria do produto principal a que se refere.
      - Outros itens genéricos -> enviar vazio "" para usar a categoria padrão do fornecedor.

      Formato JSON exigido:
      {
        "fornecedor": "Nome da Empresa",
        "nif_fornecedor": "123456789",
        "numero_fatura": "FS 2026/1",
        "data": "YYYY-MM-DD",
        "valorTotal": 100.50,
        "itens": [
          { "nome_extraido": "Taxa de serviço da plataforma", "quantidade": 1, "unidade": "un", "valor_total": 50.00, "categoria_sugerida": "Taxas e Comissões (Glovo/Uber)" }
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
      throw new Error(`A IA falhou ao ler o documento. Resposta: ${cleanJson.substring(0, 100)}...`);
    }

    const divergencias: any[] = [];
    const retiradasSocios: any[] = [];
    const conciliacoes: any[] = [];

    const resumo: any = { status: `Auditoria Concluída`, dadosExtraidos, itens: dadosExtraidos.itens || [], relatorio_socios: retiradasSocios, conciliacoes };

    const { data: sessao, error } = await supabase.from('auditoria_sessoes').insert([{ tipo_arquivo: tipoArquivo, periodo_ref: periodoRef, resumo, divergencias }]).select().single();
    if (error) throw error;

    return NextResponse.json({ sucesso: true, sessao, dadosLidos: dadosExtraidos });

  } catch (error: unknown) {
    const erroMsg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ error: erroMsg }, { status: 500 });
  }
}