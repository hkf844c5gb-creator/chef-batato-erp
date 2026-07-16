import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Role de serviço para ler dados cruzados de todas as tabelas
);

export async function POST(req: Request) {
  try {
    const { fileBase64, fileType, tipoArquivo, periodoRef } = await req.json();

    if (!fileBase64 || !tipoArquivo) {
      return NextResponse.json({ error: 'Dados insuficientes.' }, { status: 400 });
    }

    // 1. ENVIO PARA O MODELO DE IA MULTIMODAL COM DIRETRIVA DE JSON ESTRUTURADO
    // Aqui faz-se a chamada à API de IA (ex: Gemini 1.5 Pro ou GPT-4o) que lê nativamente imagens e PDFs.
    // O prompt força o retorno exato das linhas de itens, datas, valores brutos e fornecedores.
    
    let dadosExtraidos: any = {};
    
    // Simulação do retorno de alta fidelidade da IA após processar o documento enviado:
    if (tipoArquivo === 'Extrato') {
      dadosExtraidos = {
        movimentos: [
          { data: '2026-07-10', descricao: 'MBWAY CLIENTE ANÓNIMO', valor: 15.00, tipo: 'entrada' },
          { data: '2026-07-12', descricao: 'TRANSFERENCIA FORNECEDOR BATATAS', valor: -115.00, tipo: 'saida' },
          { data: '2026-07-13', descricao: 'PAGAMENTO GLOVO', valor: 450.30, tipo: 'entrada' }
        ],
        saldoFinal: 1420.50
      };
    } else if (tipoArquivo === 'Fatura') {
      dadosExtraidos = {
        fornecedor: 'Distruidora de Alimentos Aveiro Lda',
        nif: '500123456',
        data: '2026-07-12',
        valorTotal: 115.00,
        itens: [
          { nome: 'Batata Especial Saco 25kg', qtd: 5, total: 75.00 },
          { nome: 'Óleo Alimentar 5L', qtd: 4, total: 40.00 }
        ]
      };
    } else if (tipoArquivo === 'Glovo') {
      dadosExtraidos = {
        totalVendas: 600.00,
        comissaoGlovo: 120.00,
        taxasMarketing: 29.70,
        valorLiquidoAReceber: 450.30
      };
    }

    // 2. SISTEMA DE CRUZAMENTO (CONCILIAÇÃO) EM TEMPO REAL
    const divergencias: any[] = [];
    const resumo: any = { totalProcessado: 0, status: 'Verificado' };

    if (tipoArquivo === 'Fatura') {
      // Procura se esta despesa já foi lançada manualmente no sistema
      const { data: despesaExistente } = await supabase
        .from('despesas')
        .select('*')
        .eq('data_despesa', dadosExtraidos.data)
        .gte('valor', dadosExtraidos.valorTotal - 1)
        .lte('valor', dadosExtraidos.valorTotal + 1)
        .single();

      if (!despesaExistente) {
        divergencias.push({
          alerta: 'Fatura física detetada mas SEM lançamento correspondente no ERP despesas.',
          detalhe: `Fornecedor: ${dadosExtraidos.fornecedor} - Valor: ${dadosExtraidos.valorTotal}€`,
          tipo: 'Erro de Lançamento'
        });
      }
    }

    if (tipoArquivo === 'Extrato') {
      // Cruza saídas do extrato bancário com as despesas e pagamentos a estafetas
      for (const mov of dadosExtraidos.movimentos) {
        if (mov.tipo === 'saida') {
          const { data: custoLocal } = await supabase
            .from('despesas')
            .select('*')
            .eq('valor', Math.abs(mov.valor))
            .single();

          if (!custoLocal) {
            divergencias.push({
              alerta: 'Saída bancária detetada no extrato mas SEM despesa registada no caixa.',
              detalhe: `${mov.descricao} no valor de ${mov.valor}€`,
              tipo: 'Falta de Recibo'
            });
          }
        }
      }
    }

    // 3. GRAVA A SESSÃO DE AUDITORIA
    const { data: sessao, error } = await supabase.from('auditoria_sessoes').insert([{
      tipo_arquivo: tipoArquivo,
      periodo_ref: periodoRef,
      resumo: { ...resumo, dadosExtraidos },
      divergencias
    }]).select().single();

    if (error) throw error;

    return NextResponse.json({ sucesso: true, sessao });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}