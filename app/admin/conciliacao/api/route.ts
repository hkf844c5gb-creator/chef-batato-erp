import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { fileBase64, tipoArquivo, periodoRef, fileType } = await req.json();

    if (!fileBase64 || !tipoArquivo) {
      return NextResponse.json({ error: 'Dados insuficientes.' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    
    if (!geminiKey) {
      throw new Error("Chave de API do Gemini não configurada no servidor.");
    }

    // 🕵️‍♂️ MÓDULO DETETIVE: Descobrir o que a Google permite nesta chave!
    const checkModels = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
    const dataModels = await checkModels.json();
    
    if (dataModels.error) {
      console.error("🔥 ERRO NA CHAVE DA GOOGLE:", dataModels.error);
      throw new Error(`Bloqueio da Google: ${dataModels.error.message}`);
    }

    // Lista todos os modelos disponíveis e guarda no terminal para nós vermos
    const modelosPermitidos = dataModels.models?.map((m: any) => m.name) || [];
    console.log("✅ MODELOS PERMITIDOS NA SUA CONTA:", modelosPermitidos);

    // Escolhe automaticamente o melhor modelo visual que a sua conta tiver!
    let modeloCorreto = "gemini-1.5-flash"; 
    
    if (modelosPermitidos.includes("models/gemini-1.5-flash")) modeloCorreto = "gemini-1.5-flash";
    else if (modelosPermitidos.includes("models/gemini-1.5-flash-latest")) modeloCorreto = "gemini-1.5-flash-latest";
    else if (modelosPermitidos.includes("models/gemini-1.5-pro")) modeloCorreto = "gemini-1.5-pro";
    else if (modelosPermitidos.includes("models/gemini-1.0-pro-vision-latest")) modeloCorreto = "gemini-1.0-pro-vision-latest";
    else if (modelosPermitidos.includes("models/gemini-pro-vision")) modeloCorreto = "gemini-pro-vision";

    console.log("🚀 A ARRANCAR COM O MODELO:", modeloCorreto);

    // 1. CHAMA A INTELIGÊNCIA ARTIFICIAL
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: modeloCorreto });

    const promptContexto = `
      És um auditor financeiro. Analisa este documento (tipo: ${tipoArquivo}).
      Devolve um objeto JSON estrito com os dados extraídos. Não adiciones nenhum texto extra.
      Se for Fatura: { "fornecedor": string, "data": "YYYY-MM-DD", "valorTotal": number, "itens": [{ "nome": string, "total": number }] }
      Se for Extrato: { "movimentos": [{ "data": "YYYY-MM-DD", "descricao": string, "valor": number, "tipo": "entrada" | "saida" }] }
    `;

    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const mimeType = fileType || (fileBase64.includes('pdf') ? 'application/pdf' : 'image/jpeg');

    const imageParts = [
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      }
    ];

    const result = await model.generateContent([promptContexto, ...imageParts]);
    const responseText = result.response.text();
    
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const dadosExtraidos = JSON.parse(cleanJson);

    // 2. CRUZAMENTO DE DADOS COM O SUPABASE (CONCILIAÇÃO)
    const divergencias: any[] = [];
    const resumo: any = { status: `Auditado via ${modeloCorreto}`, dadosExtraidos };

    if (tipoArquivo === 'Fatura') {
      const { data: despesaExistente } = await supabase
        .from('despesas')
        .select('*')
        .eq('data_despesa', dadosExtraidos.data)
        .gte('valor', dadosExtraidos.valorTotal - 1)
        .lte('valor', dadosExtraidos.valorTotal + 1)
        .single();

      if (!despesaExistente) {
        divergencias.push({
          alerta: 'Fatura física lida, mas sem lançamento correspondente no ERP.',
          detalhe: `Fornecedor: ${dadosExtraidos.fornecedor} - Valor: ${dadosExtraidos.valorTotal}€`,
          tipo: 'Erro de Lançamento'
        });
      }
    }

    // 3. GRAVA A AUDITORIA NO SUPABASE
    const { data: sessao, error } = await supabase.from('auditoria_sessoes').insert([{
      tipo_arquivo: tipoArquivo,
      periodo_ref: periodoRef,
      resumo,
      divergencias
    }]).select().single();

    if (error) throw error;

    return NextResponse.json({ sucesso: true, sessao });

  } catch (error: unknown) {
    console.error("🔥 ERRO EXATO DA API:", error);
    const erroMsg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ error: erroMsg }, { status: 500 });
  }
}
