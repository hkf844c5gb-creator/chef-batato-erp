import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Em alguns contextos server-side os cookies podem ser apenas de leitura.
          }
        },
      },
    }
  );
}

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SOCIOS_MBWAY = {
  '912385232': 'Rafael',
  '912385130': 'Caroline',
};

function normalizarTextoDuplicidade(valor: unknown) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function normalizarFornecedorDuplicidade(valor: unknown) {
  const nome = normalizarTextoDuplicidade(valor);

  if (nome.includes('continente')) return 'continente';
  if (nome.includes('recheio')) return 'recheio';

  if (
    nome.includes('mercadona') ||
    nome.includes('irmadona')
  ) {
    return 'mercadona';
  }

  if (
    nome.includes('azurva') ||
    nome.includes('ingredientesaliente')
  ) {
    return 'talhodeazurva';
  }

  if (nome.includes('action')) return 'action';
  if (nome.includes('staples')) return 'staples';
  if (nome.includes('360imprimir')) return '360imprimir';

  if (
    nome.includes('maxchina') ||
    nome.includes('cestadalua')
  ) {
    return 'maxchinaacestadalua';
  }

  if (
    nome.includes('vitoriafrutaria') ||
    (nome.includes('seducao') &&
      nome.includes('aromas'))
  ) {
    return 'vitoriafrutarias';
  }

  return nome;
}

function dadosDaSessao(resumo: unknown) {
  if (
    !resumo ||
    typeof resumo !== 'object' ||
    Array.isArray(resumo)
  ) {
    return {};
  }

  const objeto = resumo as Record<string, unknown>;
  const extraidos = objeto.dadosExtraidos;

  return extraidos &&
    typeof extraidos === 'object' &&
    !Array.isArray(extraidos)
    ? (extraidos as Record<string, unknown>)
    : objeto;
}

function mesmaFatura(
  atual: Record<string, unknown>,
  anterior: Record<string, unknown>
) {
  const fornecedorAtual =
    normalizarFornecedorDuplicidade(atual.fornecedor);

  const fornecedorAnterior =
    normalizarFornecedorDuplicidade(anterior.fornecedor);

  const dataAtual = String(
    atual.data || atual.data_fatura || ''
  ).slice(0, 10);

  const dataAnterior = String(
    anterior.data || anterior.data_fatura || ''
  ).slice(0, 10);

  const valorAtual = Math.round(
    Number(
      atual.valorTotal ||
        atual.valor_total ||
        0
    ) * 100
  );

  const valorAnterior = Math.round(
    Number(
      anterior.valorTotal ||
        anterior.valor_total ||
        0
    ) * 100
  );

  return Boolean(
    fornecedorAtual &&
      dataAtual &&
      valorAtual > 0 &&
      fornecedorAtual === fornecedorAnterior &&
      dataAtual === dataAnterior &&
      valorAtual === valorAnterior
  );
}

export async function POST(req: Request) {
  try {
    // Confirma se existe um utilizador autenticado
    const authSupabase =
      await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error:
            'Sessão inválida ou expirada.',
        },
        { status: 401 }
      );
    }

    // Recebe o documento enviado pela página
    const body = await req.json();

    const {
      fileBase64,
      tipoArquivo,
      periodoRef,
      fileName,
    } = body;

    if (
      !fileBase64 ||
      fileBase64.length < 100
    ) {
      throw new Error(
        'O ficheiro recebido está vazio ou corrompido.'
      );
    }

    // Limite aproximado de 15 MB
    if (fileBase64.length > 20_000_000) {
      return NextResponse.json(
        {
          error:
            'O ficheiro é demasiado grande. O limite é aproximadamente 15 MB.',
        },
        { status: 413 }
      );
    }

    // Remove o cabeçalho do Base64
    let base64Data = fileBase64;

    if (fileBase64.includes(',')) {
      base64Data =
        fileBase64.split(',')[1];
    }

    // Identifica o tipo de documento
    let detectedMimeType =
      'application/pdf';

    if (base64Data.startsWith('/9j/')) {
      detectedMimeType = 'image/jpeg';
    } else if (
      base64Data.startsWith('iVBORw0KGgo')
    ) {
      detectedMimeType = 'image/png';
    } else if (
      base64Data.startsWith('JVBER')
    ) {
      detectedMimeType =
        'application/pdf';
    }

    // Obtém a chave do Gemini
    const geminiKey =
      process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      throw new Error(
        'Chave da API do Gemini não configurada no servidor.'
      );
    }

    const genAI =
      new GoogleGenerativeAI(geminiKey);

    /*
     * Modelo atualizado.
     * Este é o modelo indicado para a sua conta.
     */
    const model =
      genAI.getGenerativeModel({
        model: 'gemini-3.6-flash',
      });

    const promptContexto = `
És um auditor financeiro e Diretor Financeiro (CFO) em Portugal.

Analisa este documento, cujo tipo é: ${tipoArquivo}.

Extrai todos os dados com precisão absoluta.

Devolve APENAS um objeto JSON válido.
Não escrevas explicações.
Não utilizes formatação Markdown.
Não coloques o JSON entre três acentos graves.

REGRAS OBRIGATÓRIAS:

1. Extrai:
   - fornecedor
   - nif_fornecedor
   - numero_fatura
   - data
   - valorTotal

2. Se não existir número da fatura, utiliza "S/N".

3. A data deve estar sempre no formato YYYY-MM-DD.

4. Na propriedade "itens", cria uma lista com TODOS
   os produtos e serviços cobrados.

5. Não inventes produtos, quantidades, unidades ou valores.

6. Mantém as quantidades e unidades apresentadas:
   - un
   - kg
   - g
   - l
   - ml
   - outro

7. O valor_total de cada item corresponde ao subtotal
   desse item depois dos descontos aplicáveis.

8. Se existir IVA apresentado como cobrança separada,
   também deve ser extraído.

9. Identifica corretamente o fornecedor. Exemplos:
   - Recheio Cash & Carry
   - Talho D'Azurva
   - CONTINENTE HIPERMERCADOS S.A.
   - MERCADONA
   - Action Storeops Portugal Lda
   - 360imprimir
   - Staples Portugal
   - Copopalhinhas, Unipessoal Lda
   - Meta Pay

REGRAS DE CATEGORIZAÇÃO:

- Ads, Facebook, Meta Platforms, Facebk ou Instagram:
  "Marketing (Meta/Facebook)"

- Promoções, campanhas ou marketing promocional da Glovo:
  "Marketing (Glovo)"

- Comissão, uso da plataforma, taxa de ativação
  ou taxa de serviço da Glovo/Uber:
  "Taxas e Comissões (Glovo/Uber)"

- Carnes, talho, bife, frango, porco ou vaca:
  "Carnes & Proteínas"

- Produtos alimentares e ingredientes:
  "Ingredientes & Mercadoria"

- Embalagens, sacos, recipientes, caixas,
  autocolantes ou talheres:
  "Embalagens & Consumíveis"

- Toucas, luvas, aventais ou proteção:
  "Toucas, Luvas & EPI"

- Produtos de limpeza:
  "Higiene & Limpeza"

- IVA ou imposto:
  utiliza a categoria do produto relacionado.

- Quando não existir uma classificação segura:
  utiliza categoria_sugerida como "".

FORMATO JSON EXIGIDO:

{
  "fornecedor": "Nome completo do fornecedor",
  "nif_fornecedor": "123456789",
  "numero_fatura": "FS 2026/1",
  "data": "YYYY-MM-DD",
  "valorTotal": 100.50,
  "itens": [
    {
      "nome_extraido": "Nome do produto ou serviço",
      "quantidade": 1,
      "unidade": "un",
      "valor_total": 50.00,
      "categoria_sugerida": "Categoria"
    }
  ],
  "movimentos": [
    {
      "data": "YYYY-MM-DD",
      "descricao": "Descrição do movimento",
      "valor": 10.00,
      "tipo": "entrada",
      "categoria_sugerida": ""
    }
  ]
}
`;

    // Prepara o documento para o Gemini
    const imageParts = [
      {
        inlineData: {
          data: base64Data,
          mimeType: detectedMimeType,
        },
      },
    ];

    // Envia o documento para leitura
    const result =
      await model.generateContent([
        promptContexto,
        ...imageParts,
      ]);

    const respostaTexto =
      result.response.text();

    const cleanJson = respostaTexto
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    let dadosExtraidos;

    try {
      dadosExtraidos =
        JSON.parse(cleanJson);
    } catch {
      throw new Error(
        `A IA não devolveu um resultado válido. Resposta recebida: ${cleanJson.substring(
          0,
          150
        )}...`
      );
    }

    /*
     * Verifica faturas repetidas.
     * Uma fatura é repetida quando fornecedor,
     * data e valor total são iguais.
     */
    if (tipoArquivo === 'Fatura') {
      const {
        data: sessoesExistentes,
        error: erroPesquisa,
      } = await adminSupabase
        .from('auditoria_sessoes')
        .select('id,resumo')
        .eq('tipo_arquivo', 'Fatura')
        .eq('periodo_ref', periodoRef)
        .limit(5000);

      if (erroPesquisa) {
        throw erroPesquisa;
      }

      const repetida = (
        sessoesExistentes || []
      ).find((sessao) =>
        mesmaFatura(
          dadosExtraidos as Record<
            string,
            unknown
          >,
          dadosDaSessao(sessao.resumo)
        )
      );

      if (repetida) {
        return NextResponse.json({
          sucesso: true,
          duplicada: true,
          motivo:
            'Já existe uma fatura com o mesmo fornecedor, data e valor.',
          sessaoExistenteId:
            repetida.id,
          dadosLidos:
            dadosExtraidos,
        });
      }
    }

    const divergencias: Record<
      string,
      unknown
    >[] = [];

    const retiradasSocios: Record<
      string,
      unknown
    >[] = [];

    const conciliacoes: Record<
      string,
      unknown
    >[] = [];

    /*
     * Alimenta automaticamente a despensa.
     */
    if (
      tipoArquivo === 'Fatura' &&
      dadosExtraidos.itens &&
      Array.isArray(
        dadosExtraidos.itens
      )
    ) {
      for (
        const item of
        dadosExtraidos.itens
      ) {
        const nomeItem = String(
          item.nome_extraido || ''
        ).trim();

        if (!nomeItem) {
          continue;
        }

        const nomeMaiusculo =
          nomeItem.toUpperCase();

        if (
          nomeMaiusculo.includes(
            'IVA'
          ) ||
          nomeMaiusculo.includes(
            'DESCONTO'
          )
        ) {
          continue;
        }

        // Serviços não entram no stock físico
        if (
          (item.categoria_sugerida &&
            item.categoria_sugerida.includes(
              'Marketing'
            )) ||
          item.categoria_sugerida ===
            'Taxas e Comissões (Glovo/Uber)'
        ) {
          continue;
        }

        const qtdComprada = Number(
          item.quantidade || 1
        );

        const custoTotalItem = Number(
          item.valor_total || 0
        );

        const custoUnitCalc =
          qtdComprada > 0
            ? custoTotalItem /
              qtdComprada
            : 0;

        const {
          data: insumoExistente,
          error: erroInsumo,
        } = await adminSupabase
          .from('insumos')
          .select(
            'id, quantidade_atual'
          )
          .ilike(
            'nome',
            `%${nomeItem}%`
          )
          .limit(1)
          .maybeSingle();

        if (erroInsumo) {
          throw erroInsumo;
        }

        if (insumoExistente) {
          const novaQtd =
            Number(
              insumoExistente.quantidade_atual ||
                0
            ) + qtdComprada;

          const atualizacao: Record<
            string,
            unknown
          > = {
            quantidade_atual:
              novaQtd,
          };

          if (custoUnitCalc > 0) {
            atualizacao.custo_por_unidade =
              custoUnitCalc;
          }

          const {
            error:
              erroAtualizacao,
          } = await adminSupabase
            .from('insumos')
            .update(atualizacao)
            .eq(
              'id',
              insumoExistente.id
            );

          if (erroAtualizacao) {
            throw erroAtualizacao;
          }
        } else {
          const {
            error: erroCriacao,
          } = await adminSupabase
            .from('insumos')
            .insert([
              {
                nome: nomeItem,
                unidade_medida:
                  item.unidade ||
                  'un',
                quantidade_atual:
                  qtdComprada,
                quantidade_alerta: 2,
                custo_por_unidade:
                  custoUnitCalc,
              },
            ]);

          if (erroCriacao) {
            throw erroCriacao;
          }
        }
      }
    }

    /*
     * Processa extratos bancários.
     */
    if (
      [
        'Extrato',
        'Glovo',
        'Palmbites',
      ].includes(tipoArquivo) &&
      Array.isArray(
        dadosExtraidos.movimentos
      )
    ) {
      for (
        const mov of
        dadosExtraidos.movimentos
      ) {
        if (mov.tipo !== 'saida') {
          continue;
        }

        let socioEncontrado = false;

        const descricaoMovimento =
          String(
            mov.descricao || ''
          );

        const descLimpa =
          descricaoMovimento.replace(
            /\s+/g,
            ''
          );

        for (
          const [numero, nome] of
          Object.entries(
            SOCIOS_MBWAY
          )
        ) {
          if (
            descLimpa.includes(numero)
          ) {
            retiradasSocios.push({
              data: mov.data,
              socio: nome,
              numero_mbway: numero,
              valor: mov.valor,
              descricao:
                descricaoMovimento,
            });

            socioEncontrado = true;
            break;
          }
        }

        if (!socioEncontrado) {
          const valorMovimento =
            Number(mov.valor || 0);

          const {
            data: despesaCorresp,
            error: erroDespesa,
          } = await adminSupabase
            .from('despesas')
            .select('*')
            .gte(
              'valor',
              valorMovimento - 0.5
            )
            .lte(
              'valor',
              valorMovimento + 0.5
            )
            .limit(1)
            .maybeSingle();

          if (erroDespesa) {
            throw erroDespesa;
          }

          const catMovimento =
            mov.categoria_sugerida ||
            'Extrato Bancário';

          if (despesaCorresp) {
            const {
              error:
                erroValidacao,
            } = await adminSupabase
              .from('despesas')
              .update({
                status: 'Validado',
              })
              .eq(
                'id',
                despesaCorresp.id
              );

            if (erroValidacao) {
              throw erroValidacao;
            }

            conciliacoes.push({
              detalhe:
                `Pagamento validou a fatura ${despesaCorresp.descricao}`,
              status: 'Validado',
            });
          } else {
            const {
              error:
                erroInsercaoDespesa,
            } = await adminSupabase
              .from('despesas')
              .insert([
                {
                  id:
                    crypto.randomUUID(),
                  data_despesa:
                    mov.data,
                  descricao:
                    descricaoMovimento,
                  categoria:
                    catMovimento,
                  valor:
                    valorMovimento,
                  status:
                    'Falta Fatura',
                },
              ]);

            if (
              erroInsercaoDespesa
            ) {
              throw erroInsercaoDespesa;
            }

            divergencias.push({
              alerta:
                'Saída bancária sem fatura.',
              detalhe:
                descricaoMovimento,
              tipo: 'Falta Fatura',
            });
          }
        }
      }
    }

    /*
     * Guarda a leitura completa da fatura.
     */
    const resumo: Record<
      string,
      unknown
    > = {
      status:
        'Auditoria Concluída',

      fileName:
        typeof fileName === 'string'
          ? fileName
          : '',

      dadosExtraidos,

      itens:
        dadosExtraidos.itens || [],

      relatorio_socios:
        retiradasSocios.length > 0
          ? retiradasSocios
          : 'Limpo',

      conciliacoes:
        conciliacoes.length > 0
          ? conciliacoes
          : 'Nenhuma conciliação bancária direta.',
    };

    const {
      data: sessao,
      error: erroSessao,
    } = await adminSupabase
      .from('auditoria_sessoes')
      .insert([
        {
          tipo_arquivo:
            tipoArquivo,
          periodo_ref:
            periodoRef,
          resumo,
          divergencias,
        },
      ])
      .select()
      .single();

    if (erroSessao) {
      throw erroSessao;
    }

    return NextResponse.json({
      sucesso: true,
      sessao,
      dadosLidos:
        dadosExtraidos,
    });
  } catch (error: unknown) {
    const erroMsg =
      error instanceof Error
        ? error.message
        : JSON.stringify(error);

    console.error(
      'Erro ao processar documento:',
      erroMsg
    );

    return NextResponse.json(
      { error: erroMsg },
      { status: 500 }
    );
  }
}