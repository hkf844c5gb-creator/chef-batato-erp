import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { fileBase64, tipoArquivo, periodoRef } = await req.json();

    if (!fileBase64 || !tipoArquivo) {
      return NextResponse.json({ error: 'Dados insuficientes.' }, { status: 400 });
    }

    // O token da OpenAI tem de estar configurado nas variáveis de ambiente da Vercel
    const openAiKey = process.env.OPENAI_API_KEY;
    
    if (!openAiKey) {
      throw new Error("Chave de API da OpenAI não configurada no servidor.");
    }

    // 1. CHAMA O MODELO GPT-4o (VISION) PARA EXTRAIR DADOS DA FATURA/EXTRATO
    const promptContexto = `
      És um auditor financeiro. Analisa este documento (tipo: ${tipoArquivo}).
      Devolve um objeto JSON estrito com os dados extraídos.
      Se for Fatura: { "fornecedor": string, "data": "YYYY-MM-DD", "valorTotal": number, "itens": [{ "nome": string, "total": number }] }
      Se for Extrato: { "movimentos": [{ "data": "YYYY-MM-DD", "descricao": string, "valor": number, "tipo": "entrada" | "saida" }] }
    `;

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptContexto },
              { type: 'image_url', image_url: { url: fileBase64 } }
            ]
          }
        ]
      })
    });

    const aiData = await openAiResponse.json();
    if (!openAiResponse.ok) throw new Error(aiData.error?.message || "Erro na IA");

    const dadosExtraidos = JSON.parse(aiData.choices[0].message.content);

    // 2. CRUZAMENTO DE DADOS COM O SUPABASE (CONCILIAÇÃO)
    const divergencias: any[] = [];
    const resumo: any = { status: 'Auditado via GPT-4o', dadosExtraidos };

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
    const erroMsg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ error: erroMsg }, { status: 500 });
  }
}
