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
  itens?: Array<{
    quantidade?: number | null;
    preco_unitario?: number | null;
  }>;
}

interface PedidoAuditado {
  numero_pedido: number;
  data_pedido: string;
  cliente: string;
  forma_pagamento: string;
  total_geral: number;
  pago: boolean;
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
        .select('id,created_at,data_dia,tipo,descricao,valor')
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
      }
    }

    return Array.from(mapa.values()).map((p: any) => {
      const subtotalItens = p.itens.reduce(
        (acc: number, item: any) =>
          acc + num(item.quantidade) * num(item.preco_unitario),
        0
      );

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
        .select('id,created_at,data_dia,tipo,descricao,valor')
        .eq('data_dia', pedido.data_pedido)
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
          data_dia: pedido.data_pedido,
          tipo: 'Entrada',
          descricao: descricaoEntradaPedido(pedido),
          valor: pedido.total_geral,
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
        (p) => p.data_pedido === data && dinheiro(p.forma_pagamento)
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
                data_dia: pedido.data_pedido,
                tipo: 'Entrada',
                descricao: descricaoEntradaPedido(pedido),
                valor: pedido.total_geral,
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
              data_dia: pedido.data_pedido,
              tipo: 'Entrada',
              descricao: descricaoEntradaPedido(pedido),
              valor: pedido.total_geral,
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
          ...pedidos.map((p) => p.data_pedido),
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
  // Preferência para o último Fechamento MANUAL.
  // Durante a transição, se ainda não existir fechamento manual,
  // usa o fechamento anterior disponível.
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

      const fechamentosAnteriores = caixa
        .filter(
          (m) =>
            normalizar(m.tipo) === 'fechamento' &&
            soData(m.data_dia) < hoje
        )
        .sort((a, b) => {
          const manualA = ehFechoManual(a) ? 1 : 0;
          const manualB = ehFechoManual(b) ? 1 : 0;

          // Primeiro ordena por data; dentro da mesma data, manual ganha.
          const dataCmp = soData(b.data_dia).localeCompare(
            soData(a.data_dia)
          );
          if (dataCmp !== 0) return dataCmp;

          if (manualA !== manualB) return manualB - manualA;

          return (
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
          );
        });

      const ultimo = fechamentosAnteriores[0];

      if (!ultimo) return false;

      const { error } = await supabase.from('caixa').insert([
        {
          data_dia: hoje,
          tipo: 'Abertura',
          descricao: 'Fundo de Maneio (Abertura Automática)',
          valor: num(ultimo.valor),
        },
      ]);

      if (error) throw error;

      return true;
    },
    [supabase]
  );

  // ============================================================
  // CARREGAMENTO DA TELA
  // ============================================================

  const carregarCaixa = useCallback(async () => {
    setLoading(true);

    try {
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

  // Sincronização futura automática.
  useEffect(() => {
    const canal = supabase
      .channel('caixa-pedidos-auditoria-v5')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos',
        },
        () => carregarCaixa()
      )
      .subscribe();

    return () => {
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

      const saldo = abertura + entradas - saidas;

      const confirmar = confirm(
        `FECHAMENTO MANUAL - ${dataBR(dataFiltro)}\n\n` +
          `Abertura: ${abertura.toFixed(2)}€\n` +
          `Entradas totais: ${entradas.toFixed(2)}€\n` +
          `Saídas totais: ${saidas.toFixed(2)}€\n` +
          `-----------------------------\n` +
          `SALDO ESPERADO: ${saldo.toFixed(2)}€\n\n` +
          `Pedidos Dinheiro/Dinheiro Glovo: ${final.pedidosDinheiro}\n` +
          `Valor desses pedidos: ${final.valorPedidosDinheiro.toFixed(
            2
          )}€\n\n` +
          `Confirma que conferiu o dinheiro físico?`
      );

      if (!confirmar) return;

      const { error } = await supabase.from('caixa').insert([
        {
          data_dia: dataFiltro,
          tipo: 'Fechamento',
          descricao: 'Fecho do Dia (Manual)',
          valor: Number(saldo.toFixed(2)),
        },
      ]);

      if (error) throw error;

      alert(
        `🔒 Caixa de ${dataBR(
          dataFiltro
        )} fechado manualmente com sucesso!`
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
  // MOVIMENTO MANUAL
  // ============================================================

  const salvarMovimentoManual = async (e: React.FormEvent) => {
    e.preventDefault();

    if (caixaFechadoManual) {
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
      const { error } = await supabase.from('caixa').insert([
        {
          data_dia: dataFiltro,
          tipo: form.tipo,
          descricao: descricaoFinal,
          valor: Number(form.valor.toFixed(2)),
        },
      ]);

      if (error) throw error;

      setForm({
        tipo: 'Saida',
        motivo: '',
        descricao: '',
        valor: 0,
      });

      setModalAberto(false);
      await carregarCaixa();
    } catch (error: any) {
      alert(`Erro: ${error?.message || 'erro desconhecido'}`);
    } finally {
      setProcessando(false);
    }
  };

  const apagarMovimentoManual = async (mov: MovimentoCaixa) => {
    if (caixaFechadoManual) {
      alert('Não pode alterar um caixa fechado manualmente.');
      return;
    }

    if (normalizar(mov.tipo) === 'abertura') {
      alert('A abertura não pode ser apagada por aqui.');
      return;
    }

    if (normalizar(mov.tipo) === 'fechamento') {
      alert('Fechamentos históricos não são apagados por aqui.');
      return;
    }

    if (
      normalizar(mov.tipo) === 'entrada' &&
      /\bpedido\s*#?\s*\d+\b/i.test(mov.descricao || '')
    ) {
      const match = (mov.descricao || '').match(
        /\bpedido\s*#?\s*(\d+)\b/i
      );

      const numeroPedido = match ? Number(match[1]) : null;

      const duplicadosDoMesmoPedido = numeroPedido
        ? movimentos.filter((item) => {
            if (normalizar(item.tipo) !== 'entrada') return false;

            const itemMatch = (item.descricao || '').match(
              /\bpedido\s*#?\s*(\d+)\b/i
            );

            return itemMatch && Number(itemMatch[1]) === numeroPedido;
          })
        : [];

      // Uma entrada válida de pedido continua protegida.
      if (duplicadosDoMesmoPedido.length <= 1) {
        alert(
          'Esta é a única entrada deste pedido e está protegida pela auditoria.'
        );
        return;
      }

      // Se existem 2 ou mais entradas do MESMO pedido, permite excluir
      // uma delas para corrigir a duplicidade.
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
      if (!confirm('Eliminar este movimento manual?')) return;
    }

    const { error } = await supabase
      .from('caixa')
      .delete()
      .eq('id', mov.id);

    if (error) {
      alert(`Erro ao eliminar: ${error.message}`);
      return;
    }

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
          onClick={() => setModalAberto(true)}
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
                        {mov.descricao}
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

                    {!caixaFechadoManual &&
                      !abertura &&
                      !fechamento && (
                        <button
                          onClick={() =>
                            apagarMovimentoManual(mov)
                          }
                          className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-red-950"
                          title="Eliminar movimento manual"
                        >
                          🗑️
                        </button>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex justify-center items-center p-4">
          <div className="bg-zinc-900 w-full max-w-lg rounded-[30px] border border-zinc-800 overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-white">
                  Registar Movimento
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  {dataBR(dataFiltro)}
                </p>
              </div>

              <button
                onClick={() => setModalAberto(false)}
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
