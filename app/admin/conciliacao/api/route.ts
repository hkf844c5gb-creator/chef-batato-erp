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
    
    // 🎯 A ÚNICA ALTERAÇÃO: UTILIZAR O MODELO ATUALIZADO PARA EVITAR O ERRO 404
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // 🧠 CÉREBRO ATUALIZADO: SEPARAÇÃO ESTRITA DE MARKETING (GLOVO vs META)
    const promptContexto = `
      És um auditor financeiro e Diretor Financeiro (CFO) em Portugal. Analisa este documento (tipo: ${tipoArquivo}).
      Extrai os dados com precisão absoluta. Devolve APENAS um objeto JSON válido, sem formatação markdown.
      
      Regras OBRIGATÓRIAS:
      1. Extrai "fornecedor", "nif_fornecedor", "numero_fatura" (Se não houver usa "S/N"), "data" (YYYY-MM-DD) e "valorTotal".
      2. Na chave "itens", cria uma lista com TODOS os serviços/produtos cobrados. O IVA deve ser extraído como um item separado.
      
      🚨 REGRA DE CATEGORIZAÇÃO CIRÚRGICA (CFO):
      Para cada item extraído, deves criar a propriedade "categoria_sugerida" respeitando rigorosamente estas divisões:
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
          { "nome_extraido": "Taxa de serviço da plataforma", "quantidade": 1, "unidade": "un", "valor_total": 50.00, "categoria_sugerida": "Taxas e Comissões (Glovo/Uber)" },
          { "nome_extraido": "Marketing promocional", "quantidade": 1, "unidade": "un", "valor_total": 30.00, "categoria_sugerida": "Marketing (Glovo)" },
          { "nome_extraido": "Meta Pay / Facebk", "quantidade": 1, "unidade": "un", "valor_total": 20.00, "categoria_sugerida": "Marketing (Meta/Facebook)" }
        ],
        "movimentos": [
          { "data": "YYYY-MM-DD", "descricao": "Movimento extrato", "valor": 10.00, "tipo": "entrada", "categoria_sugerida": "Marketing (Meta/Facebook)" }
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
      throw new Error(`A IA falhou ao ler o documento. Verifique os limites da conta. Resposta: ${cleanJson.substring(0, 100)}...`);
    }

    const divergencias: any[] = [];
    const retiradasSocios: any[] = [];
    const conciliacoes: any[] = [];

    // --- ALIMENTAÇÃO DA DESPENSA (Insumos Físicos) ---
    if (tipoArquivo === 'Fatura' && dadosExtraidos.itens && Array.isArray(dadosExtraidos.itens)) {
      for (const item of dadosExtraidos.itens) {
        if (!item.nome_extraido || item.nome_extraido.toUpperCase().includes('IVA') || item.nome_extraido.toUpperCase().includes('DESCONTO')) continue;
        
        // Impede que serviços de Marketing ou Taxas Glovo entrem na Despensa Física
        if (item.categoria_sugerida && item.categoria_sugerida.includes('Marketing') || item.categoria_sugerida === 'Taxas e Comissões (Glovo/Uber)') continue;

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

    // --- EXTRATOS BANCÁRIOS ---
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
            
            // Atribui categoria diretamente do Extrato se a IA detetou Meta/Facebook
            let catMovimento = mov.categoria_sugerida || 'Extrato Bancário';

            if (despesaCorresp) {
              await supabase.from('despesas').update({ status: 'Validado' }).eq('id', despesaCorresp.id);
              conciliacoes.push({ detalhe: `Pagamento validou a fatura ${despesaCorresp.descricao}`, status: 'Validado' });
            } else {
              await supabase.from('despesas').insert([{ id: crypto.randomUUID(), data_despesa: mov.data, descricao: mov.descricao, categoria: catMovimento, valor: mov.valor, status: 'Falta Fatura' }]);
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