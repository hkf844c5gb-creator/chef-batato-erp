'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type TipoCaixa = 'Abertura' | 'Entrada' | 'Saida' | 'Fechamento' | string;

interface MovimentoCaixa {
  id: string;
  created_at: string;
  data_dia: string;
  tipo: TipoCaixa;
  descricao: string;
  valor: number;
  pedido_numero?: number | null;
}

interface PedidoLinha {
  id: string;
  numero_pedido: number;
  data_pedido?: string | null;
  cliente?: string | null;
  forma_pagamento?: string | null;
  taxa_entrega?: number | null;
  desconto?: number | null;
  total_geral?: number | null;
  pago?: boolean | null;
  criado_em?: string | null;
  data_recebimento?: string | null;
  itens?: Array<{
    quantidade?: number | null;
    preco_unitario?: number | null;
  }>;
}

interface PagamentoEstafetaLinha {
  id: string;
  entregador: string;
  valor_pago: number;
  data_pagamento: string;
  inicio_periodo?: string | null;
  fim_periodo?: string | null;
  forma_pagamento?: string | null;
}

interface PedidoAuditado {
  numero_pedido: number;
  data_pedido: string;
  cliente: string;
  forma_pagamento: string;
  total_geral: number;
  pago: boolean;
  data_recebimento: string | null;
}

interface ConferenciaDia {
  pedidosDinheiro: number;
  valorPedidosDinheiro: number;
  pedidosEncontrados: number;
  pedidosCorrigidos: number;
  pedidosFaltantes: number;
  divergenciasPedidos: number;
  duplicadosPedidos: number;
  pedidosPendentes: number;

  abertura: number;
  entradas: number;
  saidas: number;
  saldoCalculado: number;

  fechamentoHistorico: number | null;
  diferencaFechamento: number | null;
}

interface ResultadoAuditoriaHistorica {
  totalPedidosDinheiro: number;
  entradasCriadas: number;
  divergenciasPedidos: number;
  duplicadosPedidos: number;
  diasAuditados: number;
  diasComDiferenca: number;
}

const AUDITORIA_LOCAL_V4 = 'chef-batato-caixa-auditoria-historica-v4-sem-duplicidade';

const hojeLisboa = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
  }).format(new Date());

const soData = (v?: string | null) =>
  v ? String(v).substring(0, 10) : '';

const dataBR = (iso?: string | null) => {
  const d = soData(iso);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || '-';
  const [ano, mes, dia] = d.split('-');
  return `${dia}/${mes}/${ano}`;
};

const normalizar = (v?: string | null) =>
  (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const num = (v: any) => Number(v || 0);

const dinheiro = (v?: string | null) => {
  const f = normalizar(v);
  return f === 'dinheiro' || f === 'dinheiro glovo';
};

const valorIgual = (a: number, b: number) =>
  Math.abs(Number(a) - Number(b)) < 0.01;

const ehFechoAutomaticoLegado = (mov: MovimentoCaixa) =>
  normalizar(mov.tipo) === 'fechamento' &&
  normalizar(mov.descricao).includes('automatico');

const ehFechoManual = (mov: MovimentoCaixa) =>
  normalizar(mov.tipo) === 'fechamento' &&
  normalizar(mov.descricao).includes('manual');

const descricaoEntradaPedido = (p: PedidoAuditado) =>
  `[Pedido #${p.numero_pedido}] ${p.forma_pagamento} - ${
    p.cliente || 'Cliente Anónimo'
  }`;

const dataCaixaPedido = (p: PedidoAuditado) =>
  soData(p.data_recebimento) || p.data_pedido;

export default function CaixaPage() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [dataFiltro, setDataFiltro] = useState(hojeLisboa());
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [auditandoHistorico, setAuditandoHistorico] = useState(false);
  const [caixaFechadoManual, setCaixaFechadoManual] = useState(false);
  const [mensagemAuditoria, setMensagemAuditoria] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [movimentoEditando, setMovimentoEditando] = useState<MovimentoCaixa | null>(null);
  const [modalAberturaAberto, setModalAberturaAberto] = useState(false);
  const [valorAberturaManual, setValorAberturaManual] = useState(0);

  const [modalFechamentoAberto, setModalFechamentoAberto] = useState(false);
  const [valorFechamentoManual, setValorFechamentoManual] = useState(0);
  const [resumoFechamento, setResumoFechamento] = useState({
    abertura: 0,
    entradas: 0,
    saidas: 0,
    saldoEsperado: 0,
    pedidosDinheiro: 0,
    valorPedidosDinheiro: 0,
  });

  const [conferencia, setConferencia] = useState<ConferenciaDia>({
    pedidosDinheiro: 0,
    valorPedidosDinheiro: 0,
    pedidosEncontrados: 0,
    pedidosCorrigidos: 0,
    pedidosFaltantes: 0,
    divergenciasPedidos: 0,
    duplicadosPedidos: 0,
    pedidosPendentes: 0,
    abertura: 0,
    entradas: 0,
    saidas: 0,
    saldoCalculado: 0,
    fechamentoHistorico: null,
    diferencaFechamento: null,
  });

  const [form, setForm] = useState({
    tipo: 'Saida',
    motivo: '',
    descricao: '',
    valor: 0,
  });

  const motivosMovimento = [
    'Retirada de Sócio',
    'Sangria / Depósito',
    'Compra de Mercadoria',
    'Pagamento de Entregas / Estafetas',
    'Pagamento de Fornecedor',
    'Despesa Operacional',
    'Reforço de Caixa',
    'Recebimento Manual',
    'Outros',
  ];

  // Evita que a carga normal dispare ao mesmo tempo que a auditoria inicial.
  const inicializacaoConcluidaRef = useRef(false);
  const inicializacaoEmCursoRef = useRef(false);

  // ============================================================
  // LEITURA COMPLETA DO BANCO
  // ============================================================

  const buscarTodosCaixa = useCallback(async (): Promise<MovimentoCaixa[]> => {
    const todos: MovimentoCaixa[] = [];
    let inicio = 0;

    while (true) {
      const { data, error } = await supabase
        .from('caixa')
        .select('id,created_at,data_dia,tipo,descricao,valor,pedido_numero')
        .order('data_dia', { ascending: true })
        .order('created_at', { ascending: true })
        .range(inicio, inicio + 999);

      if (error) throw error;

      const lote = (data || []) as MovimentoCaixa[];
      todos.push(...lote);

      if (lote.length < 1000) break;
      inicio += 1000;
    }

    return todos;
  }, [supabase]);

  const buscarTodosPedidos = useCallback(async (): Promise<PedidoLinha[]> => {
    const todos: PedidoLinha[] = [];
    let inicio = 0;

    while (true) {
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          id,
          numero_pedido,
          data_pedido,
          cliente,
          forma_pagamento,
          taxa_entrega,
          desconto,
          total_geral,
          pago,
          criado_em,
          data_recebimento,
          itens:itens_pedido (
            quantidade,
            preco_unitario
          )
        `)
        .order('numero_pedido', { ascending: true })
        .range(inicio, inicio + 999);

      if (error) throw error;

      const lote = (data || []) as PedidoLinha[];
      todos.push(...lote);

      if (lote.length < 1000) break;
      inicio += 1000;
    }

    return todos;
  }, [supabase]);

  const buscarTodosPagamentosEstafetas = useCallback(
    async (): Promise<PagamentoEstafetaLinha[]> => {
      const todos: PagamentoEstafetaLinha[] = [];
      let inicio = 0;

      while (true) {
        const { data, error } = await supabase
          .from('estafetas_pagamentos')
          .select(
            'id,entregador,valor_pago,data_pagamento,inicio_periodo,fim_periodo,forma_pagamento'
          )
          .order('data_pagamento', { ascending: true })
          .range(inicio, inicio + 999);

        if (error) throw error;

        const lote = (data || []) as PagamentoEstafetaLinha[];
        todos.push(...lote);

        if (lote.length < 1000) break;
        inicio += 1000;
      }

      return todos;
    },
    [supabase]
  );

  // ============================================================
  // AGRUPAMENTO DE PEDIDOS
  // ============================================================

  const agruparPedidos = useCallback((linhas: PedidoLinha[]): PedidoAuditado[] => {
    const mapa = new Map<number, any>();

    for (const linha of linhas) {
      const numeroPedido = Number(linha.numero_pedido);
      if (!numeroPedido) continue;

      const dataPedido =
        soData(linha.data_pedido) || soData(linha.criado_em);

      if (!dataPedido) continue;

      if (!mapa.has(numeroPedido)) {
        mapa.set(numeroPedido, {
          numero_pedido: numeroPedido,
          data_pedido: dataPedido,
          cliente: linha.cliente || 'Cliente Anónimo',
          forma_pagamento: linha.forma_pagamento || '',
          pago: linha.pago === true,
          data_recebimento: linha.data_recebimento || null,
          itens: [...(linha.itens || [])],
          taxa_entrega: num(linha.taxa_entrega),
          desconto: num(linha.desconto),
          total_banco: num(linha.total_geral),
        });
      } else {
        const p = mapa.get(numeroPedido);

        p.itens.push(...(linha.itens || []));
        p.taxa_entrega = Math.max(
          p.taxa_entrega,
          num(linha.taxa_entrega)
        );
        p.desconto = Math.max(
          p.desconto,
          num(linha.desconto)
        );
        p.total_banco = Math.max(
          p.total_banco,
          num(linha.total_geral)
        );

        if (linha.cliente) p.cliente = linha.cliente;
        if (linha.forma_pagamento)
          p.forma_pagamento = linha.forma_pagamento;
        if (linha.pago === true) p.pago = true;
        if (linha.data_recebimento) p.data_recebimento = linha.data_recebimento;
      }
    }

    return Array.from(mapa.values()).map((p: any) => {
      const subtotalItens = p.itens.reduce(
        (acc: number, item: any) =>
          acc + num(item.quantidade) * num(item.preco_unitario),
        0
      );

      // IMPORTANTE:
      // A página Pedidos calcula o total exibido como:
      // subtotal dos itens + taxa de entrega - desconto.
      //
      // Alguns pedidos históricos possuem total_geral antigo/desatualizado
      // na tabela pedidos. Se o Caixa confiar apenas nesse campo, pode mostrar
      // um valor diferente da página Pedidos.
      //
      // Por isso o Caixa usa o MESMO cálculo da página Pedidos sempre que
      // existirem itens. O total_geral do banco fica apenas como fallback.
      const total =
        subtotalItens > 0
          ? subtotalItens + p.taxa_entrega - p.desconto
          : p.total_banco;

      return {
        numero_pedido: p.numero_pedido,
        data_pedido: p.data_pedido,
        cliente: p.cliente,
        forma_pagamento: p.forma_pagamento,
        total_geral: Number(Math.max(0, total).toFixed(2)),
        pago: p.pago,
        data_recebimento: p.data_recebimento || null,
      };
    });
  }, []);

  // ============================================================
  // RECONHECIMENTO DE PEDIDO NO HISTÓRICO DO CAIXA
  //
  // Aceita:
  // [Pedido #415]
  // Pedido #415
  // pedido 415
  // Venda João pedido 415
  //
  // Isso evita duplicar entradas manuais antigas que já citavam
  // o número do pedido.
  // ============================================================

  const entradasDoPedido = useCallback(
    (pedido: PedidoAuditado, caixa: MovimentoCaixa[]) => {
      const regex = new RegExp(
        `\\bpedido\\s*#?\\s*${pedido.numero_pedido}\\b`,
        'i'
      );

      return caixa.filter(
        (mov) =>
          normalizar(mov.tipo) === 'entrada' &&
          regex.test(mov.descricao || '')
      );
    },
    []
  );

  const inserirEntradaPedido = useCallback(
    async (pedido: PedidoAuditado): Promise<boolean> => {
      // TRAVA 1: antes de qualquer INSERT, consulta novamente o banco.
      // Isso evita que auditoria histórica e conferência diária lancem
      // o mesmo pedido quase ao mesmo tempo.
      const { data: entradasAtuais, error: erroConsulta } = await supabase
        .from('caixa')
        .select('id,created_at,data_dia,tipo,descricao,valor,pedido_numero')
        .eq('data_dia', dataCaixaPedido(pedido))
        .eq('tipo', 'Entrada');

      if (erroConsulta) throw erroConsulta;

      const regex = new RegExp(
        `\\bpedido\\s*#?\\s*${pedido.numero_pedido}\\b`,
        'i'
      );

      const jaExiste = ((entradasAtuais || []) as MovimentoCaixa[]).some(
        (mov) => regex.test(mov.descricao || '')
      );

      if (jaExiste) {
        return false;
      }

      // TRAVA 2: descrição padronizada com o número do pedido.
      // A auditoria futura sempre localizará esta entrada por Pedido #N.
      const { error } = await supabase.from('caixa').insert([
        {
          data_dia: dataCaixaPedido(pedido),
          tipo: 'Entrada',
          descricao: descricaoEntradaPedido(pedido),
          valor: pedido.total_geral,
          pedido_numero: pedido.numero_pedido,
        },
      ]);

      if (error) throw error;
      return true;
    },
    [supabase]
  );

  const movimentosDoDia = useCallback(
    (caixa: MovimentoCaixa[], data: string) =>
      caixa.filter((mov) => soData(mov.data_dia) === data),
    []
  );

  // ============================================================
  // CONFERÊNCIA COMPLETA DE UM DIA
  //
  // Tudo entra no cálculo:
  // - Abertura
  // - Entradas de pedidos
  // - Outras entradas
  // - Pagamentos
  // - Pagamentos estafetas
  // - Sangrias / depósitos
  // - Retiradas de sócios
  // - Todas as demais Saidas
  //
  // Fechamento é apenas fotografia do saldo e não é somado.
  // ============================================================

  const conferirDia = useCallback(
    async (
      data: string,
      corrigirPedidos = true,
      pedidosProntos?: PedidoAuditado[],
      caixaPronto?: MovimentoCaixa[]
    ): Promise<ConferenciaDia> => {
      const pedidos =
        pedidosProntos || agruparPedidos(await buscarTodosPedidos());

      const caixa = caixaPronto
        ? [...caixaPronto]
        : await buscarTodosCaixa();

      const pedidosDia = pedidos.filter(
        (p) => dataCaixaPedido(p) === data && dinheiro(p.forma_pagamento)
      );

      const pendentes = pedidosDia.filter((p) => !p.pago);
      const pagos = pedidosDia.filter((p) => p.pago);

      let encontrados = 0;
      let corrigidos = 0;
      let faltantes = 0;
      let divergencias = 0;
      let duplicados = 0;

      for (const pedido of pagos) {
        const encontradosCaixa = entradasDoPedido(pedido, caixa);

        if (encontradosCaixa.length === 0) {
          faltantes++;

          if (corrigirPedidos) {
            const inseriu = await inserirEntradaPedido(pedido);

            if (inseriu) {
              corrigidos++;

              caixa.push({
                id: `novo-${pedido.numero_pedido}`,
                created_at: new Date().toISOString(),
                data_dia: dataCaixaPedido(pedido),
                tipo: 'Entrada',
                descricao: descricaoEntradaPedido(pedido),
                valor: pedido.total_geral,
                pedido_numero: pedido.numero_pedido,
              });
            } else {
              // Outro processo já inseriu entre a leitura e a gravação.
              // Recarrega o estado lógico sem criar duplicidade.
              encontrados++;
            }
          }

          continue;
        }

        encontrados++;

        if (encontradosCaixa.length > 1) {
          duplicados++;
        }

        const soma = encontradosCaixa.reduce(
          (acc, mov) => acc + num(mov.valor),
          0
        );

        if (!valorIgual(soma, pedido.total_geral)) {
          divergencias++;
        }
      }

      const movimentosAtualizados = movimentosDoDia(caixa, data);

      const abertura = movimentosAtualizados
        .filter((m) => normalizar(m.tipo) === 'abertura')
        .reduce((acc, m) => acc + num(m.valor), 0);

      const entradas = movimentosAtualizados
        .filter((m) => normalizar(m.tipo) === 'entrada')
        .reduce((acc, m) => acc + num(m.valor), 0);

      const saidas = movimentosAtualizados
        .filter((m) => normalizar(m.tipo) === 'saida')
        .reduce((acc, m) => acc + num(m.valor), 0);

      const saldoCalculado = abertura + entradas - saidas;

      const fechamentos = movimentosAtualizados
        .filter((m) => normalizar(m.tipo) === 'fechamento')
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );

      const fechamentoHistorico =
        fechamentos.length > 0 ? num(fechamentos[0].valor) : null;

      const diferencaFechamento =
        fechamentoHistorico === null
          ? null
          : Number(
              (saldoCalculado - fechamentoHistorico).toFixed(2)
            );

      return {
        pedidosDinheiro: pagos.length,
        valorPedidosDinheiro: pagos.reduce(
          (acc, p) => acc + p.total_geral,
          0
        ),
        pedidosEncontrados: encontrados,
        pedidosCorrigidos: corrigidos,
        pedidosFaltantes: faltantes,
        divergenciasPedidos: divergencias,
        duplicadosPedidos: duplicados,
        pedidosPendentes: pendentes.length,
        abertura,
        entradas,
        saidas,
        saldoCalculado,
        fechamentoHistorico,
        diferencaFechamento,
      };
    },
    [
      agruparPedidos,
      buscarTodosCaixa,
      buscarTodosPedidos,
      entradasDoPedido,
      inserirEntradaPedido,
      movimentosDoDia,
    ]
  );

  // ============================================================
  // AUDITORIA HISTÓRICA COMPLETA
  //
  // Executa uma vez por versão neste navegador.
  // É idempotente: se executar novamente, não duplica pedidos
  // porque procura o número do pedido nas Entradas existentes.
  //
  // NÃO apaga nem altera nenhuma movimentação histórica.
  // ============================================================

  const auditoriaHistoricaCompleta = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const jaExecutou = localStorage.getItem(AUDITORIA_LOCAL_V4);
    if (jaExecutou === 'sim') return;

    setAuditandoHistorico(true);
    setMensagemAuditoria(
      'A auditar todo o histórico: pedidos, entradas, saídas, estafetas, sangrias, pagamentos e fechamentos...'
    );

    try {
      const pedidos = agruparPedidos(await buscarTodosPedidos());
      let caixa = await buscarTodosCaixa();

      const pedidosDinheiroPagos = pedidos.filter(
        (p) => dinheiro(p.forma_pagamento) && p.pago
      );

      let entradasCriadas = 0;
      let divergenciasPedidos = 0;
      let duplicadosPedidos = 0;

      // 1. Corrige entradas ausentes de pedidos.
      for (const pedido of pedidosDinheiroPagos) {
        const achados = entradasDoPedido(pedido, caixa);

        if (achados.length === 0) {
          const inseriu = await inserirEntradaPedido(pedido);

          if (inseriu) {
            entradasCriadas++;

            caixa.push({
              id: `auditoria-${pedido.numero_pedido}`,
              created_at: new Date().toISOString(),
              data_dia: dataCaixaPedido(pedido),
              tipo: 'Entrada',
              descricao: descricaoEntradaPedido(pedido),
              valor: pedido.total_geral,
              pedido_numero: pedido.numero_pedido,
            });
          }
        } else {
          if (achados.length > 1) duplicadosPedidos++;

          const soma = achados.reduce(
            (acc, mov) => acc + num(mov.valor),
            0
          );

          if (!valorIgual(soma, pedido.total_geral)) {
            divergenciasPedidos++;
          }
        }
      }

      // 2. Recarrega caixa com as correções realmente gravadas.
      caixa = await buscarTodosCaixa();

      // 3. Audita TODOS os dias existentes no caixa/pedidos.
      const dias = Array.from(
        new Set([
          ...caixa.map((m) => soData(m.data_dia)),
          ...pedidos.map((p) => dataCaixaPedido(p)),
        ])
      )
        .filter(Boolean)
        .sort();

      let diasAuditados = 0;
      let diasComDiferenca = 0;

      for (const data of dias) {
        const resultado = await conferirDia(
          data,
          false,
          pedidos,
          caixa
        );

        diasAuditados++;

        if (
          resultado.diferencaFechamento !== null &&
          !valorIgual(resultado.diferencaFechamento, 0)
        ) {
          diasComDiferenca++;
        }
      }

      const resumo: ResultadoAuditoriaHistorica = {
        totalPedidosDinheiro: pedidosDinheiroPagos.length,
        entradasCriadas,
        divergenciasPedidos,
        duplicadosPedidos,
        diasAuditados,
        diasComDiferenca,
      };

      localStorage.setItem(AUDITORIA_LOCAL_V4, 'sim');

      setMensagemAuditoria(
        `Auditoria completa concluída · ` +
          `${resumo.totalPedidosDinheiro} pedido(s) em dinheiro · ` +
          `${resumo.entradasCriadas} entrada(s) histórica(s) corrigida(s) · ` +
          `${resumo.diasAuditados} dia(s) conferido(s) · ` +
          `${resumo.diasComDiferenca} dia(s) com diferença histórica`
      );
    } catch (error: any) {
      console.error('Erro na auditoria histórica completa:', error);

      setMensagemAuditoria(
        `ERRO NA AUDITORIA: ${
          error?.message || 'erro desconhecido'
        }`
      );
    } finally {
      setAuditandoHistorico(false);
    }
  }, [
    agruparPedidos,
    buscarTodosCaixa,
    buscarTodosPedidos,
    conferirDia,
    entradasDoPedido,
    inserirEntradaPedido,
  ]);

  // ============================================================
  // ABERTURA AUTOMÁTICA
  //
  // Somente HOJE.
  // Se já houver abertura, não duplica.
  // A abertura assume SEMPRE o fechamento do DIA ANTERIOR.
  // Se o dia anterior não tiver fechamento, não cria abertura automática.
  // ============================================================

  const garantirAberturaHoje = useCallback(
    async (caixa: MovimentoCaixa[]) => {
      const hoje = hojeLisboa();

      const existeAberturaHoje = caixa.some(
        (m) =>
          soData(m.data_dia) === hoje &&
          normalizar(m.tipo) === 'abertura'
      );

      if (existeAberturaHoje) return false;

      const dataHoje = new Date(`${hoje}T12:00:00`);
      dataHoje.setDate(dataHoje.getDate() - 1);

      const diaAnterior = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Lisbon',
      }).format(dataHoje);

      const fechamentosDiaAnterior = caixa
        .filter(
          (m) =>
            normalizar(m.tipo) === 'fechamento' &&
            soData(m.data_dia) === diaAnterior
        )
        .sort((a, b) => {
          const manualA = ehFechoManual(a) ? 1 : 0;
          const manualB = ehFechoManual(b) ? 1 : 0;

          // Se houver mais de um fechamento no dia anterior,
          // o manual tem prioridade. Dentro do mesmo tipo, usa o mais recente.
          if (manualA !== manualB) return manualB - manualA;

          return (
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
          );
        });

      const fechamentoAnterior = fechamentosDiaAnterior[0];

      if (!fechamentoAnterior) {
        return false;
      }

      const { error } = await supabase.from('caixa').insert([
        {
          data_dia: hoje,
          tipo: 'Abertura',
          descricao: `Fundo de Maneio (Abertura Automática - Fecho ${dataBR(diaAnterior)})`,
          valor: num(fechamentoAnterior.valor),
          pedido_numero: null,
        },
      ]);

      if (error) throw error;

      return true;
    },
    [supabase]
  );

  // ============================================================
  // SINCRONIZAÇÃO CAIXA <-> PEDIDOS
  //
  // Mantém as entradas automáticas de pedidos sempre iguais à tabela pedidos:
  // - cria entrada quando um pedido em dinheiro é pago;
  // - atualiza valor/data/descrição se o pedido for alterado;
  // - remove a entrada automática se o pedido for excluído/cancelado,
  //   deixar de ser pago ou deixar de ser em dinheiro.
  //
  // Entradas manuais continuam intocadas.
  // ============================================================

  const sincronizarCaixaComPedidos = useCallback(async () => {
    const pedidos = agruparPedidos(await buscarTodosPedidos());
    const caixa = await buscarTodosCaixa();

    const pedidosValidos = new Map<number, PedidoAuditado>();

    for (const pedido of pedidos) {
      if (!pedido.pago || !dinheiro(pedido.forma_pagamento)) continue;
      pedidosValidos.set(Number(pedido.numero_pedido), pedido);
    }

    // 1) Remove entradas automáticas órfãs/canceladas.
    for (const mov of caixa) {
      if (normalizar(mov.tipo) !== 'entrada') continue;

      const match = (mov.descricao || '').match(
        /^\[Pedido\s*#?\s*(\d+)\]/i
      );

      const numeroPedido =
        mov.pedido_numero || (match ? Number(match[1]) : null);

      // Só mexe em entradas claramente automáticas de pedido.
      if (!numeroPedido) continue;

      const pedidoAtual = pedidosValidos.get(Number(numeroPedido));

      if (!pedidoAtual) {
        const { error } = await supabase
          .from('caixa')
          .delete()
          .eq('id', mov.id);

        if (error) throw error;
      }
    }

    // Recarrega depois das remoções para evitar trabalhar com lixo antigo.
    let caixaAtual = await buscarTodosCaixa();

    // 2) Cria ou corrige cada pedido válido.
    for (const pedido of pedidosValidos.values()) {
      const regex = new RegExp(
        `\\bpedido\\s*#?\\s*${pedido.numero_pedido}\\b`,
        'i'
      );

      const entradas = caixaAtual.filter(
        (mov) =>
          normalizar(mov.tipo) === 'entrada' &&
          (
            Number(mov.pedido_numero) === Number(pedido.numero_pedido) ||
            regex.test(mov.descricao || '')
          )
      );

      if (entradas.length === 0) {
        const { error } = await supabase.from('caixa').insert([
          {
            data_dia: dataCaixaPedido(pedido),
            tipo: 'Entrada',
            descricao: descricaoEntradaPedido(pedido),
            valor: pedido.total_geral,
            pedido_numero: pedido.numero_pedido,
          },
        ]);

        if (error) throw error;

        caixaAtual = await buscarTodosCaixa();
        continue;
      }

      // Se houver exatamente uma entrada, ela pode ser corrigida automaticamente.
      // Duplicidades continuam sinalizadas para correção manual.
      if (entradas.length === 1) {
        const entrada = entradas[0];

        const precisaAtualizar =
          !valorIgual(num(entrada.valor), pedido.total_geral) ||
          soData(entrada.data_dia) !== dataCaixaPedido(pedido) ||
          entrada.descricao !== descricaoEntradaPedido(pedido) ||
          Number(entrada.pedido_numero || 0) !== Number(pedido.numero_pedido);

        if (precisaAtualizar) {
          const { error } = await supabase
            .from('caixa')
            .update({
              data_dia: dataCaixaPedido(pedido),
              descricao: descricaoEntradaPedido(pedido),
              valor: Number(pedido.total_geral.toFixed(2)),
              pedido_numero: pedido.numero_pedido,
            })
            .eq('id', entrada.id);

          if (error) throw error;

          caixaAtual = caixaAtual.map((m) =>
            m.id === entrada.id
              ? {
                  ...m,
                  data_dia: dataCaixaPedido(pedido),
                  descricao: descricaoEntradaPedido(pedido),
                  valor: Number(pedido.total_geral.toFixed(2)),
                  pedido_numero: pedido.numero_pedido,
                }
              : m
          );
        }
      }
    }
  }, [
    agruparPedidos,
    buscarTodosCaixa,
    buscarTodosPedidos,
    supabase,
  ]);

  // ============================================================
  // SINCRONIZAÇÃO CAIXA <-> PAGAMENTOS DE ESTAFETAS
  //
  // Cada pagamento registado em estafetas_pagamentos vira uma SAÍDA
  // automática no Caixa, na mesma data do pagamento.
  //
  // Se o pagamento for editado, o movimento do Caixa é atualizado.
  // Se o pagamento for apagado, o movimento do Caixa também é removido.
  // ============================================================

  const sincronizarPagamentosEstafetas = useCallback(async () => {
    const pagamentos = await buscarTodosPagamentosEstafetas();
    const caixa = await buscarTodosCaixa();

    const mapaPagamentos = new Map<string, PagamentoEstafetaLinha>();

    for (const pag of pagamentos) {
      mapaPagamentos.set(String(pag.id), pag);
    }

    // 1) Remove saídas órfãs quando o pagamento foi apagado.
    for (const mov of caixa) {
      if (normalizar(mov.tipo) !== 'saida') continue;

      const match = (mov.descricao || '').match(
        /^\[Pagamento Estafeta #([^\]]+)\]/i
      );

      if (!match) continue;

      const pagamentoId = String(match[1]);

      const pagamentoAtual = mapaPagamentos.get(pagamentoId);
      const formaAtual = normalizar(pagamentoAtual?.forma_pagamento || 'Dinheiro');

      // Remove se o pagamento foi apagado OU se passou a ser MB Way,
      // porque MB Way não movimenta dinheiro físico.
      if (!pagamentoAtual || formaAtual === 'mb way' || formaAtual === 'mbway') {
        const { error } = await supabase
          .from('caixa')
          .delete()
          .eq('id', mov.id);

        if (error) throw error;
      }
    }

    let caixaAtual = await buscarTodosCaixa();

    // 2) Cria ou atualiza a saída correspondente a cada pagamento.
    for (const pag of pagamentos) {
      const formaPagamento = normalizar(pag.forma_pagamento || 'Dinheiro');

      // MB Way reduz a dívida do estafeta, mas NÃO sai do caixa físico.
      if (formaPagamento === 'mb way' || formaPagamento === 'mbway') {
        continue;
      }

      const idPagamento = String(pag.id);
      const descricao = `[Pagamento Estafeta #${idPagamento}] ${pag.entregador || 'Estafeta'}`;
      const dataPagamento = soData(pag.data_pagamento);
      const valorPagamento = Number(num(pag.valor_pago).toFixed(2));

      const movimentosPagamento = caixaAtual.filter(
        (mov) =>
          normalizar(mov.tipo) === 'saida' &&
          (mov.descricao || '').startsWith(
            `[Pagamento Estafeta #${idPagamento}]`
          )
      );

      if (movimentosPagamento.length === 0) {
        const { error } = await supabase.from('caixa').insert([
          {
            data_dia: dataPagamento,
            tipo: 'Saida',
            descricao,
            valor: valorPagamento,
            pedido_numero: null,
          },
        ]);

        if (error) throw error;

        caixaAtual = await buscarTodosCaixa();
        continue;
      }

      // Se houver exatamente um, mantém espelhado em tempo real.
      if (movimentosPagamento.length === 1) {
        const mov = movimentosPagamento[0];

        const precisaAtualizar =
          soData(mov.data_dia) !== dataPagamento ||
          !valorIgual(num(mov.valor), valorPagamento) ||
          mov.descricao !== descricao;

        if (precisaAtualizar) {
          const { error } = await supabase
            .from('caixa')
            .update({
              data_dia: dataPagamento,
              descricao,
              valor: valorPagamento,
              pedido_numero: null,
            })
            .eq('id', mov.id);

          if (error) throw error;
        }
      }
    }
  }, [
    buscarTodosCaixa,
    buscarTodosPagamentosEstafetas,
    supabase,
  ]);

  // ============================================================
  // CARREGAMENTO DA TELA
  // ============================================================

  const carregarCaixa = useCallback(async () => {
    setLoading(true);

    try {
      // Antes de desenhar a tela, garante que o Caixa é um espelho atualizado
      // dos pedidos em dinheiro pagos.
      await sincronizarCaixaComPedidos();
      await sincronizarPagamentosEstafetas();

      let caixa = await buscarTodosCaixa();

      if (dataFiltro === hojeLisboa()) {
        const abriu = await garantirAberturaHoje(caixa);

        if (abriu) {
          caixa = await buscarTodosCaixa();
        }
      }

      // Só o fechamento MANUAL bloqueia alterações.
      // Fechos automáticos antigos ficam no histórico, mas não mandam
      // no novo fluxo.
      const listaDia = movimentosDoDia(caixa, dataFiltro);

      const fechadoManual = listaDia.some(ehFechoManual);
      setCaixaFechadoManual(fechadoManual);

      const resultado = await conferirDia(
        dataFiltro,
        !fechadoManual,
        undefined,
        caixa
      );

      setConferencia(resultado);

      const caixaFinal =
        resultado.pedidosCorrigidos > 0
          ? await buscarTodosCaixa()
          : caixa;

      setMovimentos(
        movimentosDoDia(caixaFinal, dataFiltro).sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        )
      );
    } catch (error: any) {
      console.error(error);
      alert(
        `Erro ao carregar caixa: ${
          error?.message || 'erro desconhecido'
        }`
      );
    } finally {
      setLoading(false);
    }
  }, [
    buscarTodosCaixa,
    conferirDia,
    dataFiltro,
    garantirAberturaHoje,
    movimentosDoDia,
    sincronizarCaixaComPedidos,
    sincronizarPagamentosEstafetas,
  ]);

  useEffect(() => {
    let ativo = true;

    const iniciar = async () => {
      // React pode executar efeitos de inicialização mais de uma vez em
      // determinados cenários. Esta trava impede duas auditorias/cargas
      // simultâneas no mesmo navegador.
      if (inicializacaoEmCursoRef.current || inicializacaoConcluidaRef.current) {
        return;
      }

      inicializacaoEmCursoRef.current = true;

      try {
        await auditoriaHistoricaCompleta();

        if (ativo) {
          await carregarCaixa();
          inicializacaoConcluidaRef.current = true;
        }
      } finally {
        inicializacaoEmCursoRef.current = false;
      }
    };

    iniciar();

    return () => {
      ativo = false;
    };
  }, [auditoriaHistoricaCompleta, carregarCaixa]);

  useEffect(() => {
    // IMPORTANTE: no primeiro render, carregarCaixa já é chamado pelo
    // efeito de inicialização acima. Portanto este efeito só reage às
    // mudanças de data DEPOIS que a inicialização terminou.
    if (!inicializacaoConcluidaRef.current) return;

    carregarCaixa();
  }, [dataFiltro, carregarCaixa]);

  // Sincronização automática em tempo real.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const atualizar = () => {
      if (timer) clearTimeout(timer);

      // Pequeno debounce para pedidos que geram várias alterações seguidas
      // (pedido + itens + caixa) não dispararem várias cargas simultâneas.
      timer = setTimeout(() => {
        carregarCaixa();
      }, 250);
    };

    const canal = supabase
      .channel('caixa-tempo-real-v7')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        atualizar
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'itens_pedido' },
        atualizar
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'caixa' },
        atualizar
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'estafetas_pagamentos' },
        atualizar
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(canal);
    };
  }, [carregarCaixa, supabase]);

  // ============================================================
  // FECHAMENTO MANUAL
  // ============================================================

  const fecharCaixaManual = async () => {
    if (caixaFechadoManual) return;

    setProcessando(true);

    try {
      const final = await conferirDia(dataFiltro, true);
      setConferencia(final);

      const faltandoDepoisCorrecao =
        final.pedidosFaltantes - final.pedidosCorrigidos;

      if (
        final.divergenciasPedidos > 0 ||
        final.duplicadosPedidos > 0 ||
        faltandoDepoisCorrecao > 0
      ) {
        alert(
          `⚠️ CAIXA NÃO FECHADO\n\n` +
            `Divergências em pedidos: ${final.divergenciasPedidos}\n` +
            `Possíveis duplicados: ${final.duplicadosPedidos}\n` +
            `Pedidos ainda faltando: ${Math.max(
              0,
              faltandoDepoisCorrecao
            )}\n\n` +
            `Corrija as divergências antes do fechamento.`
        );

        await carregarCaixa();
        return;
      }

      // Recalcula com o banco já corrigido.
      const caixaAtual = await buscarTodosCaixa();
      const movimentosAtualizados = movimentosDoDia(
        caixaAtual,
        dataFiltro
      );

      const abertura = movimentosAtualizados
        .filter((m) => normalizar(m.tipo) === 'abertura')
        .reduce((acc, m) => acc + num(m.valor), 0);

      const entradas = movimentosAtualizados
        .filter((m) => normalizar(m.tipo) === 'entrada')
        .reduce((acc, m) => acc + num(m.valor), 0);

      const saidas = movimentosAtualizados
        .filter((m) => normalizar(m.tipo) === 'saida')
        .reduce((acc, m) => acc + num(m.valor), 0);

      const saldoEsperado = Number((abertura + entradas - saidas).toFixed(2));

      setResumoFechamento({
        abertura,
        entradas,
        saidas,
        saldoEsperado,
        pedidosDinheiro: final.pedidosDinheiro,
        valorPedidosDinheiro: final.valorPedidosDinheiro,
      });

      // Preenche com o esperado para facilitar, mas o utilizador pode alterar
      // para o valor REAL contado no caixa.
      setValorFechamentoManual(saldoEsperado);
      setModalFechamentoAberto(true);
    } catch (error: any) {
      alert(
        `Erro ao preparar fechamento: ${
          error?.message || 'erro desconhecido'
        }`
      );
    } finally {
      setProcessando(false);
    }
  };

  const confirmarFechamentoManual = async (e: React.FormEvent) => {
    e.preventDefault();

    if (caixaFechadoManual) {
      alert('Este caixa já foi fechado manualmente.');
      return;
    }

    if (valorFechamentoManual < 0) {
      alert('Informe um valor de fechamento válido.');
      return;
    }

    const valorReal = Number(valorFechamentoManual.toFixed(2));
    const diferenca = Number(
      (valorReal - resumoFechamento.saldoEsperado).toFixed(2)
    );

    const confirmar = confirm(
      `CONFIRMAR FECHAMENTO - ${dataBR(dataFiltro)}\n\n` +
        `Saldo esperado: ${resumoFechamento.saldoEsperado.toFixed(2)}€\n` +
        `Valor contado: ${valorReal.toFixed(2)}€\n` +
        `Diferença: ${diferenca >= 0 ? '+' : ''}${diferenca.toFixed(2)}€\n\n` +
        `Deseja fechar o caixa com o valor contado?`
    );

    if (!confirmar) return;

    setProcessando(true);

    try {
      const { error } = await supabase.from('caixa').insert([
        {
          data_dia: dataFiltro,
          tipo: 'Fechamento',
          descricao: 'Fecho do Dia (Manual)',
          valor: valorReal,
          pedido_numero: null,
        },
      ]);

      if (error) throw error;

      setModalFechamentoAberto(false);

      alert(
        `🔒 Caixa de ${dataBR(dataFiltro)} fechado manualmente.\n\n` +
          `Esperado: ${resumoFechamento.saldoEsperado.toFixed(2)}€\n` +
          `Contado: ${valorReal.toFixed(2)}€\n` +
          `Diferença: ${diferenca >= 0 ? '+' : ''}${diferenca.toFixed(2)}€`
      );

      await carregarCaixa();
    } catch (error: any) {
      alert(
        `Erro ao fechar caixa: ${
          error?.message || 'erro desconhecido'
        }`
      );
    } finally {
      setProcessando(false);
    }
  };

  // ============================================================
  // ABERTURA MANUAL / AJUSTE DE ABERTURA
  // ============================================================

  const salvarAberturaManual = async (e: React.FormEvent) => {
    e.preventDefault();

    if (caixaFechadoManual) {
      alert('Não pode ajustar a abertura de um caixa fechado manualmente.');
      return;
    }

    if (valorAberturaManual < 0) {
      alert('Informe um valor de abertura válido.');
      return;
    }

    const confirmar = confirm(
      `AJUSTAR ABERTURA - ${dataBR(dataFiltro)}\n\n` +
        `Abertura atual: ${conferencia.abertura.toFixed(2)}€\n` +
        `Nova abertura: ${valorAberturaManual.toFixed(2)}€\n\n` +
        `A abertura existente deste dia será substituída. Deseja continuar?`
    );

    if (!confirmar) return;

    setProcessando(true);

    try {
      const { error: erroApagar } = await supabase
        .from('caixa')
        .delete()
        .eq('data_dia', dataFiltro)
        .eq('tipo', 'Abertura');

      if (erroApagar) throw erroApagar;

      const { error: erroInserir } = await supabase.from('caixa').insert([
        {
          data_dia: dataFiltro,
          tipo: 'Abertura',
          descricao: 'Fundo de Maneio (Abertura Manual / Ajuste)',
          valor: Number(valorAberturaManual.toFixed(2)),
          pedido_numero: null,
        },
      ]);

      if (erroInserir) throw erroInserir;

      setModalAberturaAberto(false);
      const valorConfirmado = Number(valorAberturaManual.toFixed(2));
      setValorAberturaManual(0);

      alert(
        `✅ Abertura de ${dataBR(dataFiltro)} ajustada para ${valorConfirmado.toFixed(2)}€.`
      );

      await carregarCaixa();
    } catch (error: any) {
      alert(
        `Erro ao ajustar abertura: ${
          error?.message || 'erro desconhecido'
        }`
      );
    } finally {
      setProcessando(false);
    }
  };

  // ============================================================
  // CORREÇÃO DE MOVIMENTO / REABERTURA DO DIA
  // ============================================================

  const reabrirCaixaParaCorrecao = async (): Promise<boolean> => {
    if (!caixaFechadoManual) return true;

    const confirmar = confirm(
      `⚠️ CAIXA FECHADO - ${dataBR(dataFiltro)}\n\n` +
        `Para editar ou excluir um movimento deste dia, o fechamento manual atual precisa ser removido.\n\n` +
        `O caixa será REABERTO para correção e depois deverá ser fechado novamente.\n\n` +
        `Deseja continuar?`
    );

    if (!confirmar) return false;

    const { error } = await supabase
      .from('caixa')
      .delete()
      .eq('data_dia', dataFiltro)
      .eq('tipo', 'Fechamento');

    if (error) {
      alert(`Erro ao reabrir caixa: ${error.message}`);
      return false;
    }

    setCaixaFechadoManual(false);
    return true;
  };

  const abrirEdicaoMovimento = async (mov: MovimentoCaixa) => {
    const tipo = normalizar(mov.tipo);

    if (tipo !== 'entrada' && tipo !== 'saida') {
      alert('Somente entradas e saídas manuais podem ser editadas por aqui.');
      return;
    }

    if (
      tipo === 'saida' &&
      /^\[Pagamento Estafeta #[^\]]+\]/i.test(mov.descricao || '')
    ) {
      alert(
        'Este movimento vem automaticamente de Pagamentos de Estafetas. Edite o pagamento na página Estafetas.'
      );
      return;
    }

    // Entradas vinculadas a pedido continuam protegidas.
    if (
      tipo === 'entrada' &&
      (
        mov.pedido_numero ||
        /\bpedido\s*#?\s*\d+\b/i.test(mov.descricao || '')
      )
    ) {
      alert('Entradas automáticas de pedidos não podem ser editadas manualmente.');
      return;
    }

    const podeContinuar = await reabrirCaixaParaCorrecao();
    if (!podeContinuar) return;

    const descricao = mov.descricao || '';
    const matchMotivo = descricao.match(/^\[([^\]]+)\]\s*(.*)$/);

    const motivoAtual = matchMotivo?.[1] || 'Outros';
    const detalheAtual = matchMotivo?.[2] || descricao;

    setMovimentoEditando(mov);
    setForm({
      tipo: mov.tipo,
      motivo: motivosMovimento.includes(motivoAtual)
        ? motivoAtual
        : 'Outros',
      descricao:
        motivosMovimento.includes(motivoAtual)
          ? detalheAtual
          : descricao,
      valor: num(mov.valor),
    });
    setModalAberto(true);
  };

  // ============================================================
  // MOVIMENTO MANUAL
  // ============================================================

  const salvarMovimentoManual = async (e: React.FormEvent) => {
    e.preventDefault();

    // Se estiver criando um movimento novo, caixa fechado continua bloqueado.
    // Para edição, a função abrirEdicaoMovimento já reabre o caixa antes.
    if (caixaFechadoManual && !movimentoEditando) {
      alert('Este caixa já foi fechado manualmente.');
      return;
    }

    if (!form.motivo) {
      alert('Selecione o motivo do movimento.');
      return;
    }

    if (form.motivo === 'Outros' && !form.descricao.trim()) {
      alert('Em "Outros", informe uma descrição para o movimento.');
      return;
    }

    if (form.valor <= 0) {
      alert('Informe um valor maior que zero.');
      return;
    }

    const detalhe = form.descricao.trim();
    const descricaoFinal = detalhe
      ? `[${form.motivo}] ${detalhe}`
      : `[${form.motivo}]`;

    setProcessando(true);

    try {
      if (movimentoEditando) {
        const { error } = await supabase
          .from('caixa')
          .update({
            tipo: form.tipo,
            descricao: descricaoFinal,
            valor: Number(form.valor.toFixed(2)),
          })
          .eq('id', movimentoEditando.id);

        if (error) throw error;

        alert('✅ Movimento atualizado. Confira o saldo e feche o caixa novamente.');
      } else {
        const { error } = await supabase.from('caixa').insert([
          {
            data_dia: dataFiltro,
            tipo: form.tipo,
            descricao: descricaoFinal,
            valor: Number(form.valor.toFixed(2)),
            pedido_numero: null,
          },
        ]);

        if (error) throw error;
      }

      setForm({
        tipo: 'Saida',
        motivo: '',
        descricao: '',
        valor: 0,
      });

      setMovimentoEditando(null);
      setModalAberto(false);
      await carregarCaixa();
    } catch (error: any) {
      alert(`Erro: ${error?.message || 'erro desconhecido'}`);
    } finally {
      setProcessando(false);
    }
  };

  const apagarMovimentoManual = async (mov: MovimentoCaixa) => {
    if (normalizar(mov.tipo) === 'abertura') {
      alert('A abertura não pode ser apagada por aqui. Use "Ajustar Abertura".');
      return;
    }

    if (normalizar(mov.tipo) === 'fechamento') {
      alert('O fechamento não é apagado por este botão.');
      return;
    }

    if (
      normalizar(mov.tipo) === 'saida' &&
      /^\[Pagamento Estafeta #[^\]]+\]/i.test(mov.descricao || '')
    ) {
      alert(
        'Este movimento vem automaticamente de Pagamentos de Estafetas. Apague o pagamento na página Estafetas.'
      );
      return;
    }

    if (
      normalizar(mov.tipo) === 'entrada' &&
      (
        mov.pedido_numero ||
        /\bpedido\s*#?\s*\d+\b/i.test(mov.descricao || '')
      )
    ) {
      const match = (mov.descricao || '').match(
        /\bpedido\s*#?\s*(\d+)\b/i
      );

      const numeroPedido =
        mov.pedido_numero || (match ? Number(match[1]) : null);

      const duplicadosDoMesmoPedido = numeroPedido
        ? movimentos.filter((item) => {
            if (normalizar(item.tipo) !== 'entrada') return false;

            const numeroItem =
              item.pedido_numero ||
              Number(
                (item.descricao || '').match(
                  /\bpedido\s*#?\s*(\d+)\b/i
                )?.[1] || 0
              );

            return Number(numeroItem) === Number(numeroPedido);
          })
        : [];

      if (duplicadosDoMesmoPedido.length <= 1) {
        alert(
          'Esta é a única entrada deste pedido e está protegida pela auditoria.'
        );
        return;
      }

      if (
        !confirm(
          `Foram encontradas ${duplicadosDoMesmoPedido.length} entradas do Pedido #${numeroPedido}.\n\n` +
            `Deseja eliminar SOMENTE esta entrada duplicada de ${num(
              mov.valor
            ).toFixed(2)}€?`
        )
      ) {
        return;
      }
    } else {
      if (
        !confirm(
          `Eliminar este movimento manual?\n\n` +
            `${mov.descricao}\n` +
            `${num(mov.valor).toFixed(2)}€`
        )
      ) {
        return;
      }
    }

    const podeContinuar = await reabrirCaixaParaCorrecao();
    if (!podeContinuar) return;

    const { error } = await supabase
      .from('caixa')
      .delete()
      .eq('id', mov.id);

    if (error) {
      alert(`Erro ao eliminar: ${error.message}`);
      return;
    }

    alert('✅ Movimento eliminado. Confira o saldo e feche o caixa novamente.');
    await carregarCaixa();
  };

  const temDiferencaHistorica =
    conferencia.diferencaFechamento !== null &&
    !valorIgual(conferencia.diferencaFechamento, 0);

  const status =
    conferencia.divergenciasPedidos > 0 ||
    conferencia.duplicadosPedidos > 0 ||
    temDiferencaHistorica
      ? 'erro'
      : conferencia.pedidosFaltantes >
        conferencia.pedidosCorrigidos
      ? 'alerta'
      : 'ok';

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto min-h-screen">
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            Gestão de Caixa 💰

            {caixaFechadoManual && (
              <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] px-3 py-1 rounded-full uppercase tracking-widest">
                Fechado Manualmente
              </span>
            )}
          </h1>

          <p className="text-xs text-zinc-500 mt-2">
            Data em análise: {dataBR(dataFiltro)}
          </p>

          {auditandoHistorico && (
            <p className="text-xs text-orange-400 font-bold mt-2">
              🔎 Auditoria histórica completa em execução. Não feche esta página.
            </p>
          )}

          {mensagemAuditoria && (
            <p className="text-xs text-zinc-300 mt-2">
              {mensagemAuditoria}
            </p>
          )}
        </div>

        <div>
          <label className="block text-[10px] text-zinc-500 uppercase font-black mb-1">
            Selecionar data
          </label>

          <input
            type="date"
            value={dataFiltro}
            onChange={(e) => setDataFiltro(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-4 py-2.5 rounded-xl"
          />

          <p className="text-[10px] text-zinc-600 mt-1 text-center">
            {dataBR(dataFiltro)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <Card
          titulo="Abertura"
          valor={conferencia.abertura}
          prefixo=""
          classe="text-blue-400"
        />

        <Card
          titulo="Entradas"
          valor={conferencia.entradas}
          prefixo="+"
          classe="text-emerald-400"
        />

        <Card
          titulo="Saídas"
          valor={conferencia.saidas}
          prefixo="-"
          classe="text-red-400"
        />

        <Card
          titulo="Saldo Calculado"
          valor={conferencia.saldoCalculado}
          prefixo=""
          classe="text-white"
          destaque
        />
      </div>

      <div
        className={`mb-8 rounded-[24px] border p-5 ${
          status === 'ok'
            ? 'bg-emerald-500/5 border-emerald-500/30'
            : status === 'erro'
            ? 'bg-red-500/5 border-red-500/30'
            : 'bg-orange-500/5 border-orange-500/30'
        }`}
      >
        <div className="flex flex-col xl:flex-row gap-5">
          <div className="flex-1">
            <h2 className="text-sm font-black uppercase tracking-widest text-white">
              {status === 'ok'
                ? '✅ Conferência correta'
                : status === 'erro'
                ? '🔴 Divergência encontrada'
                : '⚠️ Correção em andamento'}
            </h2>

            <p className="text-xs text-zinc-400 mt-2">
              O cálculo considera abertura + TODAS as entradas − TODAS as saídas,
              incluindo pagamentos, estafetas, sangrias, depósitos e retiradas.
            </p>

            {conferencia.fechamentoHistorico !== null && (
              <div className="mt-4 text-xs">
                <span className="text-zinc-500">
                  Fechamento existente:
                </span>{' '}
                <strong className="text-white">
                  {conferencia.fechamentoHistorico.toFixed(2)}€
                </strong>

                <span className="text-zinc-600 mx-2">•</span>

                <span className="text-zinc-500">Diferença:</span>{' '}
                <strong
                  className={
                    temDiferencaHistorica
                      ? 'text-red-400'
                      : 'text-emerald-400'
                  }
                >
                  {conferencia.diferencaFechamento?.toFixed(2)}€
                </strong>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniCard
              titulo="Pedidos dinheiro"
              valor={String(conferencia.pedidosDinheiro)}
              detalhe={`${conferencia.valorPedidosDinheiro.toFixed(2)}€`}
            />

            <MiniCard
              titulo="Corrigidos"
              valor={String(conferencia.pedidosCorrigidos)}
              detalhe="automaticamente"
              classe="text-emerald-400"
            />

            <MiniCard
              titulo="Divergências"
              valor={String(conferencia.divergenciasPedidos)}
              detalhe="pedidos"
              classe={
                conferencia.divergenciasPedidos
                  ? 'text-red-400'
                  : 'text-white'
              }
            />

            <MiniCard
              titulo="Pendentes"
              valor={String(conferencia.pedidosPendentes)}
              detalhe="não pagos"
              classe="text-orange-400"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 rounded-xl">
          <span className="text-xs font-bold text-emerald-400 uppercase">
            ● Auditoria automática ativa · Anti-duplicidade V5
          </span>
        </div>

        <button
          onClick={() => {
            setValorAberturaManual(conferencia.abertura);
            setModalAberturaAberto(true);
          }}
          disabled={caixaFechadoManual || processando || auditandoHistorico}
          className="bg-blue-950 border border-blue-900 hover:bg-blue-900 disabled:opacity-40 text-blue-300 hover:text-white text-sm font-bold px-6 py-3 rounded-xl"
        >
          🟦 Ajustar Abertura
        </button>

        <button
          onClick={() => {
            setMovimentoEditando(null);
            setForm({
              tipo: 'Saida',
              motivo: '',
              descricao: '',
              valor: 0,
            });
            setModalAberto(true);
          }}
          disabled={caixaFechadoManual}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-sm font-bold px-6 py-3 rounded-xl border border-zinc-700"
        >
          ➕ Adicionar Movimento
        </button>

        <div className="flex-1" />

        <button
          onClick={fecharCaixaManual}
          disabled={
            caixaFechadoManual ||
            processando ||
            auditandoHistorico
          }
          className="bg-red-950 border border-red-900 hover:bg-red-900 disabled:opacity-40 text-red-400 hover:text-white text-sm font-black px-8 py-3 rounded-xl uppercase tracking-widest"
        >
          🔒 Fechar Caixa Manualmente
        </button>
      </div>

      <div className="bg-zinc-900/90 border border-zinc-800 rounded-[24px] overflow-hidden">
        <div className="p-5 border-b border-zinc-800">
          <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest">
            Movimentos de {dataBR(dataFiltro)}
          </h3>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-center text-zinc-500 py-12">
              A carregar e conferir todos os movimentos...
            </div>
          ) : movimentos.length === 0 ? (
            <div className="text-center text-zinc-600 py-12">
              Sem movimentos em {dataBR(dataFiltro)}.
            </div>
          ) : (
            <div className="space-y-3">
              {movimentos.map((mov) => {
                const tipo = normalizar(mov.tipo);
                const entrada = tipo === 'entrada';
                const saida = tipo === 'saida';
                const abertura = tipo === 'abertura';
                const fechamento = tipo === 'fechamento';
                const automatico = ehFechoAutomaticoLegado(mov);

                return (
                  <div
                    key={mov.id}
                    className="flex items-center justify-between p-4 bg-[#121214] border border-zinc-800 rounded-2xl gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-200">
                        {/^\[Pagamento Estafeta #[^\]]+\]\s*/i.test(mov.descricao || '')
                          ? `Pagamento Estafeta ${(mov.descricao || '').replace(
                              /^\[Pagamento Estafeta #[^\]]+\]\s*/i,
                              ''
                            )}`
                          : mov.descricao}
                      </p>

                      <div className="flex flex-wrap gap-2 mt-2">
                        <span
                          className={`text-[9px] px-2.5 py-0.5 rounded border uppercase font-bold ${
                            entrada
                              ? 'border-emerald-500/30 text-emerald-400'
                              : saida
                              ? 'border-red-500/30 text-red-400'
                              : abertura
                              ? 'border-blue-500/30 text-blue-400'
                              : 'border-orange-500/30 text-orange-400'
                          }`}
                        >
                          {mov.tipo}
                        </span>

                        <span className="text-[9px] px-2.5 py-0.5 rounded border border-zinc-800 text-zinc-500">
                          {dataBR(mov.data_dia)}
                        </span>

                        {automatico && (
                          <span className="text-[9px] px-2.5 py-0.5 rounded border border-yellow-600/30 text-yellow-500">
                            AUTOMÁTICO LEGADO
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className={`text-xl font-black font-mono ${
                        entrada
                          ? 'text-emerald-400'
                          : saida
                          ? 'text-red-400'
                          : abertura
                          ? 'text-blue-400'
                          : 'text-orange-400'
                      }`}
                    >
                      {entrada ? '+' : saida ? '-' : ''}
                      {num(mov.valor).toFixed(2)}€
                    </div>

                    {!abertura &&
                      !fechamento &&
                      !(
                        entrada &&
                        (
                          mov.pedido_numero ||
                          /\bpedido\s*#?\s*\d+\b/i.test(mov.descricao || '')
                        )
                      ) &&
                      !(
                        saida &&
                        /^\[Pagamento Estafeta #[^\]]+\]/i.test(mov.descricao || '')
                      ) && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => abrirEdicaoMovimento(mov)}
                            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-blue-950"
                            title="Editar movimento manual"
                          >
                            ✏️
                          </button>

                          <button
                            onClick={() => apagarMovimentoManual(mov)}
                            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-red-950"
                            title="Eliminar movimento manual"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modalFechamentoAberto && (
        <div className="fixed inset-0 bg-black/80 z-[110] flex justify-center items-center p-4">
          <div className="bg-zinc-900 w-full max-w-lg rounded-[30px] border border-zinc-800 overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-white">
                  Fechamento Manual do Caixa
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  {dataBR(dataFiltro)}
                </p>
              </div>

              <button
                onClick={() => setModalFechamentoAberto(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={confirmarFechamentoManual}
              className="p-6 space-y-5"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <p className="text-[9px] uppercase text-zinc-500 font-black">
                    Abertura
                  </p>
                  <p className="text-lg font-black text-blue-400 mt-1">
                    {resumoFechamento.abertura.toFixed(2)}€
                  </p>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <p className="text-[9px] uppercase text-zinc-500 font-black">
                    Saldo esperado
                  </p>
                  <p className="text-lg font-black text-white mt-1">
                    {resumoFechamento.saldoEsperado.toFixed(2)}€
                  </p>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <p className="text-[9px] uppercase text-zinc-500 font-black">
                    Entradas
                  </p>
                  <p className="text-lg font-black text-emerald-400 mt-1">
                    +{resumoFechamento.entradas.toFixed(2)}€
                  </p>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <p className="text-[9px] uppercase text-zinc-500 font-black">
                    Saídas
                  </p>
                  <p className="text-lg font-black text-red-400 mt-1">
                    -{resumoFechamento.saidas.toFixed(2)}€
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-zinc-500 font-black mb-2">
                  Valor real contado no caixa (€)
                </label>

                <input
                  autoFocus
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorFechamentoManual}
                  onChange={(e) =>
                    setValorFechamentoManual(parseFloat(e.target.value) || 0)
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-4 text-3xl font-black text-orange-400"
                />

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">
                    Diferença para o esperado:
                  </span>

                  <strong
                    className={
                      Math.abs(
                        valorFechamentoManual -
                          resumoFechamento.saldoEsperado
                      ) < 0.01
                        ? 'text-emerald-400'
                        : 'text-orange-400'
                    }
                  >
                    {valorFechamentoManual -
                      resumoFechamento.saldoEsperado >=
                    0
                      ? '+'
                      : ''}
                    {(
                      valorFechamentoManual -
                      resumoFechamento.saldoEsperado
                    ).toFixed(2)}
                    €
                  </strong>
                </div>
              </div>

              <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
                <p className="text-xs text-zinc-400">
                  Digite aqui o valor que foi realmente contado no dinheiro físico.
                  O sistema guardará este valor como fechamento e mostrará qualquer
                  diferença em relação ao saldo esperado.
                </p>
              </div>

              <button
                type="submit"
                disabled={processando}
                className="w-full bg-red-950 border border-red-900 hover:bg-red-900 disabled:opacity-50 py-4 rounded-xl text-red-300 hover:text-white font-black uppercase"
              >
                {processando
                  ? 'A fechar...'
                  : 'Confirmar fechamento manual'}
              </button>
            </form>
          </div>
        </div>
      )}

      {modalAberturaAberto && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex justify-center items-center p-4">
          <div className="bg-zinc-900 w-full max-w-lg rounded-[30px] border border-zinc-800 overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-white">
                  Ajustar Abertura do Caixa
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  {dataBR(dataFiltro)}
                </p>
              </div>

              <button
                onClick={() => setModalAberturaAberto(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={salvarAberturaManual}
              className="p-6 space-y-5"
            >
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                <p className="text-xs text-zinc-400">
                  Abertura atual:
                  <strong className="text-blue-300 ml-2">
                    {conferencia.abertura.toFixed(2)}€
                  </strong>
                </p>
                <p className="text-[10px] text-zinc-600 mt-2">
                  O ajuste substitui a abertura existente do dia. Não cria uma segunda abertura somada ao caixa.
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-zinc-500 font-black mb-2">
                  Novo valor de abertura (€)
                </label>

                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorAberturaManual}
                  onChange={(e) =>
                    setValorAberturaManual(parseFloat(e.target.value) || 0)
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-3xl font-black text-blue-400"
                />
              </div>

              <button
                type="submit"
                disabled={processando}
                className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 py-4 rounded-xl text-white font-black uppercase"
              >
                {processando
                  ? 'A ajustar...'
                  : 'Confirmar nova abertura'}
              </button>
            </form>
          </div>
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex justify-center items-center p-4">
          <div className="bg-zinc-900 w-full max-w-lg rounded-[30px] border border-zinc-800 overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-white">
                  {movimentoEditando ? 'Editar Movimento' : 'Registar Movimento'}
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  {dataBR(dataFiltro)}
                </p>
              </div>

              <button
                onClick={() => {
                  setModalAberto(false);
                  setMovimentoEditando(null);
                }}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={salvarMovimentoManual}
              className="p-6 space-y-5"
            >
              <div>
                <label className="block text-[10px] uppercase text-zinc-500 font-black mb-2">
                  Tipo
                </label>

                <select
                  value={form.tipo}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      tipo: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white"
                >
                  <option value="Saida">Saída</option>
                  <option value="Entrada">Entrada Manual</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-zinc-500 font-black mb-2">
                  Motivo
                </label>

                <select
                  required
                  value={form.motivo}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      motivo: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white"
                >
                  <option value="">Selecione o motivo...</option>
                  {motivosMovimento.map((motivo) => (
                    <option key={motivo} value={motivo}>
                      {motivo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-zinc-500 font-black mb-2">
                  {form.motivo === 'Outros'
                    ? 'Descrição / Motivo'
                    : 'Observação / Detalhe'}
                </label>

                <input
                  required={form.motivo === 'Outros'}
                  value={form.descricao}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      descricao: e.target.value,
                    })
                  }
                  placeholder={
                    form.motivo === 'Outros'
                      ? 'Descreva o motivo...'
                      : 'Opcional. Ex: Acerto João, Recheio, Makro...'
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white"
                />

                <p className="text-[10px] text-zinc-600 mt-2">
                  O motivo será gravado junto da descrição sem criar novas colunas no banco.
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-zinc-500 font-black mb-2">
                  Valor (€)
                </label>

                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      valor: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-3xl font-black text-orange-400"
                />
              </div>

              <button
                type="submit"
                disabled={processando}
                className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 py-4 rounded-xl text-white font-black uppercase"
              >
                {processando
                  ? 'A gravar...'
                  : movimentoEditando
                  ? 'Guardar alterações'
                  : 'Confirmar movimento'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  titulo,
  valor,
  prefixo,
  classe,
  destaque = false,
}: {
  titulo: string;
  valor: number;
  prefixo: string;
  classe: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`border p-5 rounded-[22px] ${
        destaque
          ? 'bg-zinc-900 border-orange-500/30'
          : 'bg-[#121214] border-zinc-800'
      }`}
    >
      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
        {titulo}
      </span>

      <div
        className={`text-2xl font-black font-mono mt-2 ${classe}`}
      >
        {prefixo}
        {valor.toFixed(2)}€
      </div>
    </div>
  );
}

function MiniCard({
  titulo,
  valor,
  detalhe,
  classe = 'text-white',
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  classe?: string;
}) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3 min-w-[120px]">
      <span className="text-[9px] text-zinc-500 uppercase font-bold">
        {titulo}
      </span>

      <p className={`text-lg font-black ${classe}`}>{valor}</p>

      <p className="text-[10px] text-zinc-600">{detalhe}</p>
    </div>
  );
}
