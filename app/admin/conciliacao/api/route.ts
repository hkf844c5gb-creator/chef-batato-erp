import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
    const { fileBase64, tipoArquivo, periodoRef } = await req.json();

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
    if (!geminiKey) throw new Error("Chave de API não configurada.");

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const promptContexto = `
      És um auditor financeiro. Analisa este documento (tipo: ${tipoArquivo}).
      Devolve APENAS um objeto JSON válido, sem \`\`\`json.
      Fatura: { "fornecedor": string, "data": "YYYY-MM-DD", "valorTotal": number }
      Extrato: { "movimentos": [{ "data": "YYYY-MM-DD", "descricao": string, "valor": number, "tipo": "entrada" | "saida" }] }
      Mantém números de telefone MBWAY na descrição.
    `;

    const imageParts = [{ inlineData: { data: base64Data, mimeType: detectedMimeType } }];
    const result = await model.generateContent([promptContexto, ...imageParts]);
    const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const dadosExtraidos = JSON.parse(cleanJson);

    const divergencias: any[] = [];
    const retiradasSocios: any[] = [];
    const conciliacoes: any[] = [];

    // --- LÓGICA DE CRUZAMENTO AUTOMÁTICO E STATUS ---

    if (tipoArquivo === 'Fatura') {
      // Procura se já existe um registo bancário para esta fatura
      const { data: despesaExistente } = await supabase
        .from('despesas')
        .select('*')
        .gte('valor', dadosExtraidos.valorTotal - 1)
        .lte('valor', dadosExtraidos.valorTotal + 1)
        .maybeSingle();

      if (!despesaExistente) {
        // Não existe no banco ainda -> Insere como Falta Pagamento
        const novoId = crypto.randomUUID();
        await supabase.from('despesas').insert([{
          id: novoId,
          data_despesa: dadosExtraidos.data,
          descricao: dadosExtraidos.fornecedor,
          categoria: 'Fatura Física',
          valor: dadosExtraidos.valorTotal,
          status: 'Falta Pagamento'
        }]);
        conciliacoes.push({ detalhe: `Fatura de ${dadosExtraidos.fornecedor} registada aguardando pagamento.`, status: 'Inserida' });
      
      } else {
        // A despesa já existe (provavelmente veio do extrato primeiro) -> CRUZA E VALIDA
        await supabase.from('despesas').update({ 
          status: 'Validado',
          descricao: `[VALIDADO] ${dadosExtraidos.fornecedor}` 
        }).eq('id', despesaExistente.id);
        
        conciliacoes.push({ detalhe: `Fatura de ${dadosExtraidos.fornecedor} cruzada com movimento bancário!`, status: 'Validado' });
      }
    } 
    else if (['Extrato', 'Glovo', 'Palmbites'].includes(tipoArquivo)) {
      if (dadosExtraidos.movimentos) {
        for (const mov of dadosExtraidos.movimentos) {
          if (mov.tipo === 'saida') {
            let socioEncontrado = false;
            const descLimpa = mov.descricao.replace(/\s+/g, '');

            // Caça ao MBWAY dos Sócios
            for (const [numero, nome] of Object.entries(SOCIOS_MBWAY)) {
              if (descLimpa.includes(numero)) {
                retiradasSocios.push({
                  data: mov.data, socio: nome, numero_mbway: numero, valor: mov.valor, descricao: mov.descricao
                });
                socioEncontrado = true;
                break;
              }
            }

            if (!socioEncontrado) {
              // Procura se já existe uma Fatura no ERP para este movimento
              const { data: despesaCorresp } = await supabase
                .from('despesas')
                .select('*')
                .gte('valor', mov.valor - 0.5)
                .lte('valor', mov.valor + 0.5)
                .maybeSingle();

              if (despesaCorresp) {
                // A Fatura já estava no sistema -> CRUZA E VALIDA
                await supabase.from('despesas').update({ status: 'Validado' }).eq('id', despesaCorresp.id);
                conciliacoes.push({ detalhe: `Pagamento de ${mov.valor}€ validou a fatura ${despesaCorresp.descricao}`, status: 'Validado' });
              } else {
                // Dinheiro saiu mas não há Fatura inserida -> Insere como Falta Fatura
                const novoId = crypto.randomUUID();
                await supabase.from('despesas').insert([{
                  id: novoId,
                  data_despesa: mov.data,
                  descricao: mov.descricao,
                  categoria: 'Extrato Bancário',
                  valor: mov.valor,
                  status: 'Falta Fatura'
                }]);
                divergencias.push({ alerta: 'Saída bancária sem fatura correspondente.', detalhe: mov.descricao, tipo: 'Falta Fatura' });
              }
            }
          }
        }
      }
    }

    const resumo: any = { 
      status: `Auditoria Concluída`, 
      dadosExtraidos,
      relatorio_socios: retiradasSocios.length > 0 ? retiradasSocios : "Nenhuma retirada detetada.",
      conciliacoes: conciliacoes.length > 0 ? conciliacoes : "Nenhum cruzamento exato encontrado."
    };

    const { data: sessao, error } = await supabase.from('auditoria_sessoes').insert([{
      tipo_arquivo: tipoArquivo,
      periodo_ref: periodoRef,
      resumo,
      divergencias
    }]).select().single();

    if (error) throw error;

    return NextResponse.json({ sucesso: true, sessao });

  } catch (error: unknown) {
    console.error("🔥 ERRO NA API:", error);
    const erroMsg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ error: erroMsg }, { status: 500 });
  }
}
