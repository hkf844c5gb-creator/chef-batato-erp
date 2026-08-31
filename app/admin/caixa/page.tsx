'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface MovimentoCaixa {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  metodo_pagamento: string;
  pedido_id?: string | null;
  data_dia?: string | null;
  created_at: string;
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
  itens?: Array<{ quantidade: number; preco_unitario: number }>;
}

interface PedidoAuditado {
  numero_pedido: number;
  data_pedido: string;
  cliente: string;
  forma_pagamento: string;
  total_geral: number;
  pago: boolean;
  ids: string[];
}

interface Conferencia {
  esperados: number;
  valorEsperado: number;
  faltantes: number;
  corrigidos: number;
  divergencias: number;
  duplicados: number;
  pendentes: number;
}

const AUDITORIA_V1 = 'AUDITORIA HISTORICA CAIXA V1 CONCLUIDA';
const ABERTURA = 'ABERTURA DE CAIXA AUTOMATICA';
const FECHO = 'FECHO DE CAIXA MANUAL';

const hojeLisboa = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());

const dia = (v?: string | null) => (v ? v.substring(0, 10) : '');

const norm = (v?: string | null) =>
  (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const n = (v: any) => Number(v || 0);
const dinheiro = (v?: string | null) => ['dinheiro', 'dinheiro glovo'].includes(norm(v));
const igualValor = (a: number, b: number) => Math.abs(a - b) < 0.01;

export default function CaixaPage() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [auditando, setAuditando] = useState(false);
  const [dataFiltro, setDataFiltro] = useState(hojeLisboa());
  const [caixaFechado, setCaixaFechado] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [conf, setConf] = useState<Conferencia>({
    esperados: 0,
    valorEsperado: 0,
    faltantes: 0,
    corrigidos: 0,
    divergencias: 0,
    duplicados: 0,
    pendentes: 0,
  });

  const [form, setForm] = useState({
    tipo: 'Saída',
    descricao: '',
    valor: 0,
    metodo_pagamento: 'Dinheiro',
  });

  const buscarTodosCaixa = useCallback(async () => {
    const todos: MovimentoCaixa[] = [];
    let ini = 0;
    while (true) {
      const { data, error } = await supabase
        .from('caixa')
        .select('*')
        .order('created_at', { ascending: true })
        .range(ini, ini + 999);

      if (error) throw error;
      const lote = (data || []) as MovimentoCaixa[];
      todos.push(...lote);
      if (lote.length < 1000) break;
      ini += 1000;
    }
    return todos;
  }, [supabase]);

  const buscarTodosPedidos = useCallback(async () => {
    const todos: PedidoLinha[] = [];
    let ini = 0;
    while (true) {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*, itens:itens_pedido(*)')
        .order('numero_pedido', { ascending: true })
        .range(ini, ini + 999);

      if (error) throw error;
      const lote = (data || []) as PedidoLinha[];
      todos.push(...lote);
      if (lote.length < 1000) break;
      ini += 1000;
    }
    return todos;
  }, [supabase]);

  const agruparPedidos = useCallback((linhas: PedidoLinha[]): PedidoAuditado[] => {
    const mapa = new Map<number, any>();

    for (const l of linhas) {
      const num = Number(l.numero_pedido);
      if (!num) continue;

      if (!mapa.has(num)) {
        mapa.set(num, {
          numero_pedido: num,
          data_pedido: dia(l.data_pedido) || dia(l.criado_em),
          cliente: l.cliente || 'Balcão',
          forma_pagamento: l.forma_pagamento || '',
          pago: l.pago === true,
          ids: [l.id],
          itens: [...(l.itens || [])],
          taxa: n(l.taxa_entrega),
          desconto: n(l.desconto),
          totalBanco: n(l.total_geral),
        });
      } else {
        const p = mapa.get(num);
        p.ids.push(l.id);
        p.itens.push(...(l.itens || []));
        p.taxa = Math.max(p.taxa, n(l.taxa_entrega));
        p.desconto = Math.max(p.desconto, n(l.desconto));
        p.totalBanco = Math.max(p.totalBanco, n(l.total_geral));
        if (l.cliente) p.cliente = l.cliente;
        if (l.forma_pagamento) p.forma_pagamento = l.forma_pagamento;
        if (l.pago === true) p.pago = true;
      }
    }

    return Array.from(mapa.values()).map((p: any) => {
      const subtotal = p.itens.reduce(
        (acc: number, it: any) => acc + n(it.quantidade) * n(it.preco_unitario),
        0
      );

      const total = subtotal > 0 ? subtotal + p.taxa - p.desconto : p.totalBanco;

      return {
        numero_pedido: p.numero_pedido,
        data_pedido: p.data_pedido,
        cliente: p.cliente,
        forma_pagamento: p.forma_pagamento,
        total_geral: Number(Math.max(0, total).toFixed(2)),
        pago: p.pago,
        ids: p.ids,
      };
    });
  }, []);

  const doDia = useCallback(
    (lista: MovimentoCaixa[], data: string) =>
      lista.filter((m) => (dia(m.data_dia) || dia(m.created_at)) === data),
    []
  );

  const movimentosPedido = useCallback((p: PedidoAuditado, caixa: MovimentoCaixa[]) => {
    return caixa.filter((m) => {
      if (m.tipo !== 'Entrada') return false;
      if (m.pedido_id && p.ids.includes(String(m.pedido_id))) return true;

      const desc = norm(m.descricao);
      if (desc.includes(`pedido #${p.numero_pedido}`)) return true;

      return p.ids.some((id) =>
        desc.includes(`pedido #${String(id).substring(0, 6).toLowerCase()}`)
      );
    });
  }, []);

  const inserirComDataDiaFallback = useCallback(
    async (row: any) => {
      const primeira = await supabase.from('caixa').insert([row]);
      if (!primeira.error) return;

      const msg = norm(primeira.error.message);
      const erroDataDia =
        msg.includes('data_dia') &&
        (msg.includes('column') || msg.includes('schema') || msg.includes('cache'));

      if (!erroDataDia) throw primeira.error;

      const { data_dia, ...semDataDia } = row;
      const segunda = await supabase.from('caixa').insert([semDataDia]);
      if (segunda.error) throw segunda.error;
    },
    [supabase]
  );

  const inserirPedidoNoCaixa = useCallback(
    async (p: PedidoAuditado) => {
      await inserirComDataDiaFallback({
        tipo: 'Entrada',
        descricao: `Pedido #${p.numero_pedido} - ${p.cliente || 'Balcão'}`,
        valor: p.total_geral,
        metodo_pagamento: p.forma_pagamento,
        pedido_id: p.ids[0] || null,
        data_dia: p.data_pedido,
        created_at: `${p.data_pedido}T12:00:00.000Z`,
      });
    },
    [inserirComDataDiaFallback]
  );

  const inserirSistema = useCallback(
    async (tipo: string, descricao: string, data: string, valor = 0, hora = '08:00:00') => {
      await inserirComDataDiaFallback({
        tipo,
        descricao,
        valor,
        metodo_pagamento: 'Sistema',
        data_dia: data,
        created_at: `${data}T${hora}.000Z`,
      });
    },
    [inserirComDataDiaFallback]
  );

  const conferir = useCallback(
    async (
      data: string,
      corrigir = true,
      pedidosProntos?: PedidoAuditado[],
      caixaPronto?: MovimentoCaixa[]
    ): Promise<Conferencia> => {
      const pedidos =
        pedidosProntos || agruparPedidos(await buscarTodosPedidos());
      const caixa = caixaPronto ? [...caixaPronto] : await buscarTodosCaixa();

      const pedidosData = pedidos.filter((p) => p.data_pedido === data);
      const pendentes = pedidosData.filter((p) => dinheiro(p.forma_pagamento) && !p.pago).length;
      const esperados = pedidosData.filter((p) => dinheiro(p.forma_pagamento) && p.pago);

      let faltantes = 0;
      let corrigidos = 0;
      let divergencias = 0;
      let duplicados = 0;

      for (const p of esperados) {
        const achados = movimentosPedido(p, caixa);

        if (achados.length === 0) {
          faltantes++;
          if (corrigir) {
            await inserirPedidoNoCaixa(p);
            corrigidos++;
            caixa.push({
              id: `novo-${p.numero_pedido}`,
              tipo: 'Entrada',
              descricao: `Pedido #${p.numero_pedido} - ${p.cliente}`,
              valor: p.total_geral,
              metodo_pagamento: p.forma_pagamento,
              pedido_id: p.ids[0],
              data_dia: p.data_pedido,
              created_at: `${p.data_pedido}T12:00:00.000Z`,
            });
          }
          continue;
        }

        if (achados.length > 1) duplicados++;
        const soma = achados.reduce((acc, m) => acc + n(m.valor), 0);
        if (!igualValor(soma, p.total_geral)) divergencias++;
      }

      return {
        esperados: esperados.length,
        valorEsperado: esperados.reduce((acc, p) => acc + p.total_geral, 0),
        faltantes,
        corrigidos,
        divergencias,
        duplicados,
        pendentes,
      };
    },
    [agruparPedidos, buscarTodosCaixa, buscarTodosPedidos, inserirPedidoNoCaixa, movimentosPedido]
  );

  const auditoriaHistoricaUmaVez = useCallback(async () => {
    setAuditando(true);
    try {
      const caixa = await buscarTodosCaixa();
      if (caixa.some((m) => norm(m.descricao) === norm(AUDITORIA_V1))) return;

      const pedidos = agruparPedidos(await buscarTodosPedidos()).filter(
        (p) => dinheiro(p.forma_pagamento) && p.pago
      );

      let inseridos = 0;
      let divergencias = 0;
      let duplicados = 0;

      for (const p of pedidos) {
        const achados = movimentosPedido(p, caixa);

        if (achados.length === 0) {
          await inserirPedidoNoCaixa(p);
          inseridos++;
          caixa.push({
            id: `audit-${p.numero_pedido}`,
            tipo: 'Entrada',
            descricao: `Pedido #${p.numero_pedido} - ${p.cliente}`,
            valor: p.total_geral,
            metodo_pagamento: p.forma_pagamento,
            pedido_id: p.ids[0],
            data_dia: p.data_pedido,
            created_at: `${p.data_pedido}T12:00:00.000Z`,
          });
        } else {
          if (achados.length > 1) duplicados++;
          const soma = achados.reduce((acc, m) => acc + n(m.valor), 0);
          if (!igualValor(soma, p.total_geral)) divergencias++;
        }
      }

      await inserirSistema('Sistema', AUDITORIA_V1, hojeLisboa(), 0, '07:00:00');

      setMensagem(
        `Auditoria histórica concluída: ${inseridos} entrada(s) corrigida(s)` +
          (divergencias ? ` · ${divergencias} divergência(s)` : '') +
          (duplicados ? ` · ${duplicados} possível(is) duplicado(s)` : '')
      );
    } catch (e: any) {
      console.error(e);
      setMensagem(`Erro na auditoria histórica: ${e?.message || 'erro desconhecido'}`);
    } finally {
      setAuditando(false);
    }
  }, [
    agruparPedidos,
    buscarTodosCaixa,
    buscarTodosPedidos,
    inserirPedidoNoCaixa,
    inserirSistema,
    movimentosPedido,
  ]);

  const garantirAbertura = useCallback(
    async (data: string, caixa: MovimentoCaixa[]) => {
      if (data !== hojeLisboa()) return;

      const lista = doDia(caixa, data);
      const aberta = lista.some((m) => norm(m.descricao) === norm(ABERTURA));
      const fechada = lista.some((m) => norm(m.descricao) === norm(FECHO));

      if (!aberta && !fechada) {
        await inserirSistema('Abertura', ABERTURA, data, 0, '08:00:00');
      }
    },
    [doDia, inserirSistema]
  );

  const carregarCaixa = useCallback(async () => {
    setLoading(true);
    try {
      let caixa = await buscarTodosCaixa();
      await garantirAbertura(dataFiltro, caixa);
      caixa = await buscarTodosCaixa();

      let lista = doDia(caixa, dataFiltro);
      const fechado = lista.some((m) => norm(m.descricao) === norm(FECHO));
      setCaixaFechado(fechado);

      const resultado = await conferir(dataFiltro, !fechado, undefined, caixa);
      setConf(resultado);

      if (resultado.corrigidos > 0) {
        caixa = await buscarTodosCaixa();
        lista = doDia(caixa, dataFiltro);
      }

      setMovimentos(
        lista.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
    } catch (e: any) {
      console.error(e);
      alert(`Erro ao carregar caixa: ${e?.message || 'erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  }, [buscarTodosCaixa, conferir, dataFiltro, doDia, garantirAbertura]);

  useEffect(() => {
    (async () => {
      await auditoriaHistoricaUmaVez();
      await carregarCaixa();
    })();
  }, [auditoriaHistoricaUmaVez]);

  useEffect(() => {
    carregarCaixa();
  }, [dataFiltro]);

  useEffect(() => {
    const ch = supabase
      .channel('caixa-pedidos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, carregarCaixa)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [carregarCaixa, supabase]);

  const movimentosReais = movimentos.filter(
    (m) => !['Fecho', 'Sistema', 'Abertura'].includes(m.tipo)
  );

  const entradas = movimentosReais
    .filter((m) => m.tipo === 'Entrada')
    .reduce((acc, m) => acc + n(m.valor), 0);

  const saidas = movimentosReais
    .filter((m) => m.tipo === 'Saída')
    .reduce((acc, m) => acc + n(m.valor), 0);

  const saldoFinal = entradas - saidas;

  const fecharCaixaManual = async () => {
    if (caixaFechado) return;
    setProcessando(true);

    try {
      const final = await conferir(dataFiltro, true);
      setConf(final);

      if (final.divergencias || final.duplicados || final.faltantes > final.corrigidos) {
        alert(
          `⚠️ Caixa não fechado.\n\nDivergências: ${final.divergencias}\nDuplicados: ${final.duplicados}\nFaltantes não corrigidos: ${Math.max(0, final.faltantes - final.corrigidos)}`
        );
        return;
      }

      if (
        !confirm(
          `CONFERÊNCIA ${dataFiltro}\n\nPedidos Dinheiro/Dinheiro Glovo: ${final.esperados}\nValor esperado: ${final.valorEsperado.toFixed(2)}€\nEntradas totais: ${entradas.toFixed(2)}€\nSaídas: ${saidas.toFixed(2)}€\nSaldo: ${saldoFinal.toFixed(2)}€\n\nConfirma o fechamento manual?`
        )
      )
        return;

      await inserirSistema('Fecho', FECHO, dataFiltro, saldoFinal, '23:55:00');
      alert('🔒 Caixa fechado manualmente com sucesso!');
      await carregarCaixa();
    } catch (e: any) {
      alert(`Erro ao fechar caixa: ${e?.message || 'erro desconhecido'}`);
    } finally {
      setProcessando(false);
    }
  };

  const salvarMovimentoManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (caixaFechado) return alert('Este caixa já está fechado.');

    setProcessando(true);
    try {
      await inserirComDataDiaFallback({
        tipo: form.tipo,
        descricao: form.descricao,
        valor: form.valor,
        metodo_pagamento: form.metodo_pagamento,
        data_dia: dataFiltro,
        created_at: `${dataFiltro}T15:00:00.000Z`,
      });

      setModalAberto(false);
      setForm({
        tipo: 'Saída',
        descricao: '',
        valor: 0,
        metodo_pagamento: 'Dinheiro',
      });
      await carregarCaixa();
    } catch (e: any) {
      alert(`Erro: ${e?.message || 'erro desconhecido'}`);
    } finally {
      setProcessando(false);
    }
  };

  const apagarMovimento = async (mov: MovimentoCaixa) => {
    if (caixaFechado) return alert('Não pode alterar um caixa fechado.');
    if (mov.tipo === 'Entrada' && mov.pedido_id) {
      return alert(
        'Esta entrada está ligada a um pedido e é controlada pela auditoria automática.'
      );
    }
    if (!confirm('Eliminar este movimento manual?')) return;

    const { error } = await supabase.from('caixa').delete().eq('id', mov.id);
    if (error) return alert(error.message);
    await carregarCaixa();
  };

  const status =
    conf.divergencias || conf.duplicados
      ? 'erro'
      : conf.faltantes > conf.corrigidos
      ? 'alerta'
      : 'ok';

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto min-h-screen">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            Gestão de Caixa 💰
            {caixaFechado && (
              <span className="bg-red-500/20 text-red-500 text-xs px-3 py-1 rounded-full border border-red-500/30 uppercase">
                Fechado
              </span>
            )}
          </h1>
          {auditando && <p className="text-xs text-orange-400 mt-2">🔎 Auditoria histórica única em execução...</p>}
          {mensagem && <p className="text-xs text-zinc-400 mt-2">{mensagem}</p>}
        </div>

        <input
          type="date"
          value={dataFiltro}
          onChange={(e) => setDataFiltro(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-4 py-2.5 rounded-xl"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#121214] border border-zinc-800 p-6 rounded-[24px]">
          <span className="text-[10px] font-bold text-zinc-500 uppercase">Entradas</span>
          <div className="text-3xl font-black text-emerald-500 font-mono mt-2">+ {entradas.toFixed(2)}€</div>
        </div>

        <div className="bg-[#121214] border border-zinc-800 p-6 rounded-[24px]">
          <span className="text-[10px] font-bold text-zinc-500 uppercase">Saídas</span>
          <div className="text-3xl font-black text-red-500 font-mono mt-2">- {saidas.toFixed(2)}€</div>
        </div>

        <div className="bg-zinc-900 border border-orange-500/30 p-6 rounded-[24px]">
          <span className="text-[10px] font-bold text-orange-400 uppercase">Saldo em Caixa</span>
          <div className="text-4xl font-black text-white font-mono mt-2">{saldoFinal.toFixed(2)}€</div>
        </div>
      </div>

      <div className={`mb-8 rounded-[24px] border p-5 ${
        status === 'ok'
          ? 'bg-emerald-500/5 border-emerald-500/30'
          : status === 'erro'
          ? 'bg-red-500/5 border-red-500/30'
          : 'bg-orange-500/5 border-orange-500/30'
      }`}>
        <h2 className="text-sm font-black text-white uppercase tracking-widest">
          {status === 'ok' ? '✅ Caixa conciliado' : status === 'erro' ? '🔴 Conferência necessária' : '⚠️ Caixa em correção'}
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3">
            <span className="text-[9px] text-zinc-500 uppercase">Pedidos</span>
            <p className="text-lg font-black text-white">{conf.esperados}</p>
            <p className="text-[10px] text-zinc-500">{conf.valorEsperado.toFixed(2)}€</p>
          </div>
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3">
            <span className="text-[9px] text-zinc-500 uppercase">Corrigidos</span>
            <p className="text-lg font-black text-emerald-400">{conf.corrigidos}</p>
          </div>
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3">
            <span className="text-[9px] text-zinc-500 uppercase">Divergências</span>
            <p className="text-lg font-black text-red-400">{conf.divergencias}</p>
          </div>
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3">
            <span className="text-[9px] text-zinc-500 uppercase">Duplicados</span>
            <p className="text-lg font-black text-red-400">{conf.duplicados}</p>
          </div>
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3">
            <span className="text-[9px] text-zinc-500 uppercase">Pendentes</span>
            <p className="text-lg font-black text-orange-400">{conf.pendentes}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 rounded-xl">
          <span className="text-xs font-bold text-emerald-400 uppercase">Auditoria automática ativa</span>
        </div>

        <button
          onClick={() => setModalAberto(true)}
          disabled={caixaFechado}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-bold px-6 py-3 rounded-xl"
        >
          ➕ Adicionar Movimento
        </button>

        <div className="flex-1" />

        <button
          onClick={fecharCaixaManual}
          disabled={caixaFechado || processando || auditando}
          className="bg-red-950 border border-red-900 disabled:opacity-50 text-red-400 text-sm font-bold px-8 py-3 rounded-xl uppercase"
        >
          🔒 Fechar Caixa Manualmente
        </button>
      </div>

      <div className="bg-zinc-900/90 border border-zinc-800 rounded-[24px] overflow-hidden">
        <div className="p-5 border-b border-zinc-800">
          <h3 className="text-xs font-extrabold text-zinc-400 uppercase">Histórico de Movimentos</h3>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-center text-zinc-500 py-12">A carregar e conferir...</div>
          ) : movimentosReais.length === 0 ? (
            <div className="text-center text-zinc-600 py-12">Sem movimentos neste dia.</div>
          ) : (
            <div className="space-y-3">
              {movimentosReais.map((mov) => (
                <div key={mov.id} className="flex items-center justify-between p-4 bg-[#121214] border border-zinc-800 rounded-2xl gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-zinc-200">{mov.descricao}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-[9px] px-2 py-0.5 border border-zinc-700 rounded uppercase">{mov.tipo}</span>
                      <span className="text-[10px] text-zinc-400">{mov.metodo_pagamento}</span>
                    </div>
                  </div>

                  <div className={`text-xl font-black font-mono ${mov.tipo === 'Entrada' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {mov.tipo === 'Entrada' ? '+' : '-'}{n(mov.valor).toFixed(2)}€
                  </div>

                  {!caixaFechado && (
                    <button
                      onClick={() => apagarMovimento(mov)}
                      className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800"
                      title="Eliminar movimento manual"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex justify-center items-center p-4">
          <div className="bg-zinc-900 w-full max-w-lg rounded-[32px] border border-zinc-800 overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex justify-between">
              <h2 className="text-xl font-black text-white">💰 Registar Movimento</h2>
              <button onClick={() => setModalAberto(false)}>✕</button>
            </div>

            <form onSubmit={salvarMovimentoManual} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  className="bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white"
                >
                  <option value="Entrada">Entrada Manual</option>
                  <option value="Saída">Saída</option>
                </select>

                <select
                  value={form.metodo_pagamento}
                  onChange={(e) => setForm({ ...form, metodo_pagamento: e.target.value })}
                  className="bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white"
                >
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Dinheiro Glovo">Dinheiro Glovo</option>
                </select>
              </div>

              <input
                required
                type="text"
                placeholder="Descrição"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white"
              />

              <input
                required
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: parseFloat(e.target.value) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-3xl font-black text-orange-400"
              />

              <button
                type="submit"
                disabled={processando}
                className="w-full bg-orange-600 py-4 rounded-2xl text-sm font-black uppercase text-white"
              >
                {processando ? 'A Gravar...' : 'Confirmar e Adicionar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
