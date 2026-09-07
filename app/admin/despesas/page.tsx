'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type AbaAtiva = 'painel' | 'documentos' | 'fornecedores' | 'categorias';
type Ordenacao =
  | 'fornecedor_asc'
  | 'fornecedor_desc'
  | 'data_desc'
  | 'data_asc'
  | 'valor_desc'
  | 'valor_asc';

interface DespesaRow {
  id: string;
  descricao: string;
  categoria: string;
  valor: number | string;
  data_despesa: string;
  metodo_pagamento: string | null;
  status: string | null;
}

interface Gasto {
  id: string;
  nome: string;
  fornecedor: string;
  nifFornecedor: string;
  numeroDocumento: string;
  quantidade: number;
  unidade: string;
  valor: number;
  data: string;
  categoria: string;
  metodoPagamento: string;
  status: string;
  estruturado: boolean;
  chaveDocumento: string;
}

interface DocumentoGasto {
  chave: string;
  fornecedor: string;
  numeroDocumento: string;
  data: string;
  itens: Gasto[];
  valorTotal: number;
  tipo: 'Fatura importada' | 'Gasto avulso';
}

interface ResumoFornecedor {
  nome: string;
  total: number;
  quantidadeItens: number;
  quantidadeDocumentos: number;
  principalCategoria: string;
}

interface ResumoCategoria {
  nome: string;
  total: number;
  quantidadeItens: number;
  quantidadeFornecedores: number;
  principalFornecedor: string;
}

interface FormularioGasto {
  nome: string;
  fornecedor: string;
  nifFornecedor: string;
  numeroDocumento: string;
  quantidade: number;
  unidade: string;
  valor: number;
  data: string;
  categoria: string;
  metodoPagamento: string;
  status: string;
}

const CATEGORIAS_BASE = [
  '⚠️ Por Classificar',
  'Mercados & Ingredientes',
  'Carnes & Proteínas',
  'Laticínios & Molhos',
  'Hortícolas & Frescos',
  'Embalagens & Consumíveis',
  'Higiene & Limpeza',
  'Toucas, Luvas & EPI',
  'Marketing & Publicidade',
  'Plataformas & Comissões',
  'Entregas & Estafetas',
  'Frota & Combustível',
  'Equipamentos & Manutenção',
  'Estrutura & Fixos',
  'Impostos & Taxas',
  'Serviços Profissionais',
  'Outros / Diversos',
];

const METODOS_PAGAMENTO = [
  'Transferência',
  'Cartão',
  'Dinheiro',
  'Débito direto',
  'MB Way',
  'Conciliação Automática',
  'Outro',
];

const moeda = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
});

const quantidadeFormatada = new Intl.NumberFormat('pt-PT', {
  maximumFractionDigits: 3,
});

const collation = new Intl.Collator('pt-PT', {
  sensitivity: 'base',
  numeric: true,
});

const campoClasse =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-orange-500';

function numero(valor: unknown) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (typeof valor !== 'string') return 0;

  const limpo = valor.trim().replace(/\s/g, '');
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  const convertido = Number(normalizado);
  return Number.isFinite(convertido) ? convertido : 0;
}

function normalizarTexto(valor: string) {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-PT');
}

function dataPT(data: string) {
  if (!data) return 'Sem data';
  return new Date(data.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-PT');
}

function mesAtual() {
  const hoje = new Date();
  return hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
}

function intervaloMes(mes: string) {
  const partes = mes.split('-').map(Number);
  const ano = partes[0];
  const numeroMes = partes[1];
  const proximoAno = numeroMes === 12 ? ano + 1 : ano;
  const proximoMes = numeroMes === 12 ? 1 : numeroMes + 1;

  return {
    inicio: ano + '-' + String(numeroMes).padStart(2, '0') + '-01',
    fimExclusivo:
      proximoAno + '-' + String(proximoMes).padStart(2, '0') + '-01',
  };
}

function obterMesAnterior(mes: string) {
  const partes = mes.split('-').map(Number);
  const data = new Date(partes[0], partes[1] - 2, 1);
  return data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0');
}

function categoriaCor(categoria: string) {
  const cat = normalizarTexto(categoria);
  if (cat.includes('classificar')) return 'border-yellow-600/40 bg-yellow-500/15 text-yellow-300';
  if (cat.includes('marketing')) return 'border-purple-500/30 bg-purple-500/15 text-purple-300';
  if (cat.includes('plataformas') || cat.includes('comissoes') || cat.includes('taxas')) {
    return 'border-orange-500/30 bg-orange-500/15 text-orange-300';
  }
  if (
    cat.includes('ingredientes') ||
    cat.includes('mercado') ||
    cat.includes('carnes') ||
    cat.includes('laticinios') ||
    cat.includes('horticolas')
  ) {
    return 'border-blue-500/30 bg-blue-500/15 text-blue-300';
  }
  if (cat.includes('embalagens') || cat.includes('toucas') || cat.includes('luvas')) {
    return 'border-amber-500/30 bg-amber-500/15 text-amber-300';
  }
  if (cat.includes('higiene') || cat.includes('limpeza')) {
    return 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300';
  }
  if (cat.includes('frota') || cat.includes('combustivel') || cat.includes('entregas')) {
    return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
  }
  if (cat.includes('estrutura') || cat.includes('fixos') || cat.includes('equipamentos')) {
    return 'border-rose-500/30 bg-rose-500/15 text-rose-300';
  }
  return 'border-zinc-700 bg-zinc-800 text-zinc-300';
}

function ehPorClassificar(categoria: string) {
  const cat = normalizarTexto(categoria);
  return !cat || cat === 'geral' || cat === 'sem categoria' || cat.includes('classificar');
}

function chaveNegocio(fornecedor: string, numeroDocumento: string, data: string) {
  return [
    normalizarTexto(fornecedor),
    normalizarTexto(numeroDocumento),
    data.slice(0, 10),
  ].join('|');
}

function converterDespesaEmGasto(registo: DespesaRow): Gasto {
  const descricao = registo.descricao?.trim() || 'Gasto sem descrição';
  const marcadorFatura = ' 📄 ';
  const posicaoFatura = descricao.lastIndexOf(marcadorFatura);

  if (posicaoFatura >= 0) {
    const antesDaFatura = descricao.slice(0, posicaoFatura).trim();
    const numeroDocumento =
      descricao.slice(posicaoFatura + marcadorFatura.length).trim() || 'Sem documento';
    const posicaoFornecedor = antesDaFatura.lastIndexOf(' | ');

    if (posicaoFornecedor >= 0) {
      const blocoItem = antesDaFatura.slice(0, posicaoFornecedor).trim();
      const fornecedorComNif = antesDaFatura.slice(posicaoFornecedor + 3).trim();
      const correspondenciaItem = blocoItem.match(/^\[([^\]]+)\]\s*(.+)$/u);

      if (correspondenciaItem) {
        const partesQuantidade = correspondenciaItem[1].trim().split(/\s+/);
        const quantidadeLida = numero(partesQuantidade.shift() || '1');
        const quantidade = quantidadeLida > 0 ? quantidadeLida : 1;
        const unidade = partesQuantidade.join(' ') || 'un';
        const correspondenciaNif = fornecedorComNif.match(/^(.*?)\s+NIF\s+(.+)$/iu);
        const fornecedor = (
          correspondenciaNif ? correspondenciaNif[1] : fornecedorComNif
        ).trim();
        const nifFornecedor = correspondenciaNif ? correspondenciaNif[2].trim() : '';
        const data = registo.data_despesa?.slice(0, 10) || '';

        if (fornecedor && correspondenciaItem[2].trim()) {
          return {
            id: registo.id,
            nome: correspondenciaItem[2].trim(),
            fornecedor,
            nifFornecedor,
            numeroDocumento,
            quantidade,
            unidade,
            valor: numero(registo.valor),
            data,
            categoria: registo.categoria || '⚠️ Por Classificar',
            metodoPagamento: registo.metodo_pagamento || 'Não indicado',
            status: registo.status || 'Não indicado',
            estruturado: true,
            chaveDocumento: 'fatura:' + chaveNegocio(fornecedor, numeroDocumento, data),
          };
        }
      }
    }
  }

  return {
    id: registo.id,
    nome: descricao,
    fornecedor: 'Sem fornecedor',
    nifFornecedor: '',
    numeroDocumento: 'Gasto avulso',
    quantidade: 1,
    unidade: 'un',
    valor: numero(registo.valor),
    data: registo.data_despesa?.slice(0, 10) || '',
    categoria: registo.categoria || '⚠️ Por Classificar',
    metodoPagamento: registo.metodo_pagamento || 'Não indicado',
    status: registo.status || 'Não indicado',
    estruturado: false,
    chaveDocumento: 'avulso:' + registo.id,
  };
}

function agruparDocumentos(gastos: Gasto[]) {
  const grupos = new Map<string, DocumentoGasto>();

  for (const gasto of gastos) {
    const existente = grupos.get(gasto.chaveDocumento);
    if (existente) {
      existente.itens.push(gasto);
      existente.valorTotal += gasto.valor;
      continue;
    }

    grupos.set(gasto.chaveDocumento, {
      chave: gasto.chaveDocumento,
      fornecedor: gasto.fornecedor,
      numeroDocumento: gasto.numeroDocumento,
      data: gasto.data,
      itens: [gasto],
      valorTotal: gasto.valor,
      tipo: gasto.estruturado ? 'Fatura importada' : 'Gasto avulso',
    });
  }

  return [...grupos.values()];
}

function ordenarDocumentos(documentos: DocumentoGasto[], ordenacao: Ordenacao) {
  return [...documentos].sort((a, b) => {
    if (ordenacao === 'fornecedor_asc') return collation.compare(a.fornecedor, b.fornecedor);
    if (ordenacao === 'fornecedor_desc') return collation.compare(b.fornecedor, a.fornecedor);
    if (ordenacao === 'data_asc') return a.data.localeCompare(b.data);
    if (ordenacao === 'data_desc') return b.data.localeCompare(a.data);
    if (ordenacao === 'valor_asc') return a.valorTotal - b.valorTotal;
    return b.valorTotal - a.valorTotal;
  });
}

function filtrarGastos(gastos: Gasto[], busca: string, categoria: string) {
  const termo = normalizarTexto(busca);

  return gastos.filter((gasto) => {
    const correspondeCategoria =
      categoria === 'todas' || gasto.categoria === categoria;
    const textoPesquisa = normalizarTexto(
      [
        gasto.nome,
        gasto.fornecedor,
        gasto.numeroDocumento,
        gasto.categoria,
        gasto.metodoPagamento,
      ].join(' ')
    );
    return correspondeCategoria && (!termo || textoPesquisa.includes(termo));
  });
}

function resumirFornecedores(gastos: Gasto[]) {
  const grupos = new Map<
    string,
    {
      total: number;
      itens: number;
      documentos: Set<string>;
      categorias: Map<string, number>;
    }
  >();

  for (const gasto of gastos) {
    const atual = grupos.get(gasto.fornecedor) || {
      total: 0,
      itens: 0,
      documentos: new Set<string>(),
      categorias: new Map<string, number>(),
    };
    atual.total += gasto.valor;
    atual.itens += 1;
    atual.documentos.add(gasto.chaveDocumento);
    atual.categorias.set(
      gasto.categoria,
      (atual.categorias.get(gasto.categoria) || 0) + gasto.valor
    );
    grupos.set(gasto.fornecedor, atual);
  }

  return [...grupos.entries()]
    .map(([nome, grupo]): ResumoFornecedor => {
      const categorias = [...grupo.categorias.entries()].sort((a, b) => b[1] - a[1]);
      return {
        nome,
        total: grupo.total,
        quantidadeItens: grupo.itens,
        quantidadeDocumentos: grupo.documentos.size,
        principalCategoria: categorias[0]?.[0] || 'Sem categoria',
      };
    })
    .sort((a, b) => b.total - a.total);
}

function resumirCategorias(gastos: Gasto[]) {
  const grupos = new Map<
    string,
    {
      total: number;
      itens: number;
      fornecedores: Map<string, number>;
    }
  >();

  for (const gasto of gastos) {
    const nomeCategoria = gasto.categoria || '⚠️ Por Classificar';
    const atual = grupos.get(nomeCategoria) || {
      total: 0,
      itens: 0,
      fornecedores: new Map<string, number>(),
    };
    atual.total += gasto.valor;
    atual.itens += 1;
    atual.fornecedores.set(
      gasto.fornecedor,
      (atual.fornecedores.get(gasto.fornecedor) || 0) + gasto.valor
    );
    grupos.set(nomeCategoria, atual);
  }

  return [...grupos.entries()]
    .map(([nome, grupo]): ResumoCategoria => {
      const fornecedores = [...grupo.fornecedores.entries()].sort((a, b) => b[1] - a[1]);
      return {
        nome,
        total: grupo.total,
        quantidadeItens: grupo.itens,
        quantidadeFornecedores: grupo.fornecedores.size,
        principalFornecedor: fornecedores[0]?.[0] || 'Sem fornecedor',
      };
    })
    .sort((a, b) => b.total - a.total);
}

function percentagem(valor: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (valor / total) * 100));
}

function construirDescricao(formulario: FormularioGasto) {
  const nome = formulario.nome.trim();
  const fornecedor = formulario.fornecedor.trim();

  if (!fornecedor) return nome;

  const quantidade = formulario.quantidade > 0 ? formulario.quantidade : 1;
  const unidade = formulario.unidade.trim() || 'un';
  const nif = formulario.nifFornecedor.trim();
  const documento = formulario.numeroDocumento.trim() || 'Sem documento';

  return (
    '[' +
    quantidade +
    ' ' +
    unidade +
    '] ' +
    nome +
    ' | ' +
    fornecedor +
    (nif ? ' NIF ' + nif : '') +
    ' 📄 ' +
    documento
  );
}

function opcoesCategorias(categoriasEncontradas: string[]) {
  const resultado = [...CATEGORIAS_BASE];
  for (const categoria of categoriasEncontradas) {
    if (categoria && !resultado.includes(categoria)) resultado.push(categoria);
  }
  return resultado;
}

function escaparCsv(valor: string | number) {
  return '"' + String(valor).replace(/"/g, '""') + '"';
}

export default function DespesasPage() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('painel');
  const [filtroMes, setFiltroMes] = useState(mesAtual());
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('fornecedor_asc');
  const [registos, setRegistos] = useState<DespesaRow[]>([]);
  const [registosMesAnterior, setRegistosMesAnterior] = useState<DespesaRow[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [categoriaEmMassa, setCategoriaEmMassa] = useState('');
  const [idsAtualizando, setIdsAtualizando] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [idEmEdicao, setIdEmEdicao] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<FormularioGasto>({
    nome: '',
    fornecedor: '',
    nifFornecedor: '',
    numeroDocumento: '',
    quantidade: 1,
    unidade: 'un',
    valor: 0,
    data: mesAtual() + '-01',
    categoria: '⚠️ Por Classificar',
    metodoPagamento: 'Transferência',
    status: 'Pago',
  });

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setErro('');

    const atual = intervaloMes(filtroMes);
    const anterior = intervaloMes(obterMesAnterior(filtroMes));
    const colunas =
      'id,descricao,categoria,valor,data_despesa,metodo_pagamento,status';

    try {
      const [resultadoAtual, resultadoAnterior] = await Promise.all([
        supabase
          .from('despesas')
          .select(colunas)
          .gte('data_despesa', atual.inicio)
          .lt('data_despesa', atual.fimExclusivo)
          .order('data_despesa', { ascending: false })
          .limit(5000),
        supabase
          .from('despesas')
          .select(colunas)
          .gte('data_despesa', anterior.inicio)
          .lt('data_despesa', anterior.fimExclusivo)
          .limit(5000),
      ]);

      if (resultadoAtual.error) throw resultadoAtual.error;
      if (resultadoAnterior.error) throw resultadoAnterior.error;

      setRegistos((resultadoAtual.data || []) as DespesaRow[]);
      setRegistosMesAnterior((resultadoAnterior.data || []) as DespesaRow[]);
      setSelecionados(new Set());
      setExpandidos(new Set());
    } catch (error: unknown) {
      const mensagem = error instanceof Error ? error.message : 'Erro desconhecido';
      setErro('Não foi possível carregar os gastos: ' + mensagem);
    } finally {
      setLoading(false);
    }
  }, [filtroMes, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregarDados();
  }, [carregarDados]);

  const gastos = useMemo(
    () => registos.map(converterDespesaEmGasto),
    [registos]
  );
  const gastosMesAnterior = useMemo(
    () => registosMesAnterior.map(converterDespesaEmGasto),
    [registosMesAnterior]
  );
  const categoriasDisponiveis = useMemo(
    () => opcoesCategorias(registos.map((registo) => registo.categoria)),
    [registos]
  );
  const gastosFiltrados = useMemo(
    () => filtrarGastos(gastos, busca, filtroCategoria),
    [busca, filtroCategoria, gastos]
  );
  const gastosAnterioresFiltrados = useMemo(
    () => filtrarGastos(gastosMesAnterior, busca, filtroCategoria),
    [busca, filtroCategoria, gastosMesAnterior]
  );
  const documentos = useMemo(
    () => ordenarDocumentos(agruparDocumentos(gastosFiltrados), ordenacao),
    [gastosFiltrados, ordenacao]
  );
  const fornecedores = useMemo(
    () => resumirFornecedores(gastosFiltrados),
    [gastosFiltrados]
  );
  const categorias = useMemo(
    () => resumirCategorias(gastosFiltrados),
    [gastosFiltrados]
  );
  const totalAnalisado = useMemo(
    () => gastosFiltrados.reduce((total, gasto) => total + gasto.valor, 0),
    [gastosFiltrados]
  );
  const totalMesAnterior = useMemo(
    () => gastosAnterioresFiltrados.reduce((total, gasto) => total + gasto.valor, 0),
    [gastosAnterioresFiltrados]
  );
  const gastosPorClassificar = useMemo(
    () => gastosFiltrados.filter((gasto) => ehPorClassificar(gasto.categoria)),
    [gastosFiltrados]
  );
  const totalPorClassificar = useMemo(
    () => gastosPorClassificar.reduce((total, gasto) => total + gasto.valor, 0),
    [gastosPorClassificar]
  );
  const gastosSelecionados = useMemo(
    () => gastos.filter((gasto) => selecionados.has(gasto.id)),
    [gastos, selecionados]
  );
  const totalSelecionado = useMemo(
    () => gastosSelecionados.reduce((total, gasto) => total + gasto.valor, 0),
    [gastosSelecionados]
  );
  const variacaoMensal =
    totalMesAnterior > 0
      ? ((totalAnalisado - totalMesAnterior) / totalMesAnterior) * 100
      : null;
  const todosVisiveisSelecionados =
    gastosFiltrados.length > 0 &&
    gastosFiltrados.every((gasto) => selecionados.has(gasto.id));

  function alternarItem(id: string) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });
  }

  function alternarDocumento(documento: DocumentoGasto) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      const todosMarcados = documento.itens.every((item) => proximos.has(item.id));
      for (const item of documento.itens) {
        if (todosMarcados) proximos.delete(item.id);
        else proximos.add(item.id);
      }
      return proximos;
    });
  }

  function alternarTodosVisiveis() {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      for (const gasto of gastosFiltrados) {
        if (todosVisiveisSelecionados) proximos.delete(gasto.id);
        else proximos.add(gasto.id);
      }
      return proximos;
    });
  }

  function alternarDetalhes(chave: string) {
    setExpandidos((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(chave)) proximos.delete(chave);
      else proximos.add(chave);
      return proximos;
    });
  }

  function marcarAtualizacao(ids: string[], ativo: boolean) {
    setIdsAtualizando((atuais) => {
      const proximos = new Set(atuais);
      for (const id of ids) {
        if (ativo) proximos.add(id);
        else proximos.delete(id);
      }
      return proximos;
    });
  }

  function atualizarRegistosLocalmente(ids: string[], alteracoes: Partial<DespesaRow>) {
    const conjunto = new Set(ids);
    setRegistos((atuais) =>
      atuais.map((registo) =>
        conjunto.has(registo.id) ? { ...registo, ...alteracoes } : registo
      )
    );
  }

  async function atualizarCategoriaIndividual(id: string, categoria: string) {
    marcarAtualizacao([id], true);
    const { error } = await supabase
      .from('despesas')
      .update({ categoria })
      .eq('id', id);

    if (error) {
      window.alert('Erro ao guardar a categoria: ' + error.message);
    } else {
      atualizarRegistosLocalmente([id], { categoria });
    }
    marcarAtualizacao([id], false);
  }

  async function aplicarCategoriaEmMassa() {
    const ids = [...selecionados];
    if (ids.length === 0 || !categoriaEmMassa) return;

    setProcessando(true);
    marcarAtualizacao(ids, true);

    try {
      const { error } = await supabase
        .from('despesas')
        .update({ categoria: categoriaEmMassa })
        .in('id', ids);
      if (error) throw error;

      atualizarRegistosLocalmente(ids, { categoria: categoriaEmMassa });
      setSelecionados(new Set());
      setCategoriaEmMassa('');
    } catch (error: unknown) {
      const mensagem = error instanceof Error ? error.message : 'Erro desconhecido';
      window.alert('Erro ao categorizar os gastos: ' + mensagem);
    } finally {
      marcarAtualizacao(ids, false);
      setProcessando(false);
    }
  }

  function abrirNovoGasto() {
    const hoje = new Date().toISOString().slice(0, 10);
    setIdEmEdicao(null);
    setFormulario({
      nome: '',
      fornecedor: '',
      nifFornecedor: '',
      numeroDocumento: '',
      quantidade: 1,
      unidade: 'un',
      valor: 0,
      data: hoje.startsWith(filtroMes) ? hoje : filtroMes + '-01',
      categoria: '⚠️ Por Classificar',
      metodoPagamento: 'Transferência',
      status: 'Pago',
    });
    setModalAberto(true);
  }

  function abrirEdicao(gasto: Gasto) {
    setIdEmEdicao(gasto.id);
    setFormulario({
      nome: gasto.nome,
      fornecedor: gasto.fornecedor === 'Sem fornecedor' ? '' : gasto.fornecedor,
      nifFornecedor: gasto.nifFornecedor,
      numeroDocumento:
        gasto.numeroDocumento === 'Gasto avulso' ? '' : gasto.numeroDocumento,
      quantidade: gasto.quantidade,
      unidade: gasto.unidade,
      valor: gasto.valor,
      data: gasto.data,
      categoria: gasto.categoria,
      metodoPagamento: gasto.metodoPagamento,
      status: gasto.status,
    });
    setModalAberto(true);
  }

  async function guardarGasto(evento: React.FormEvent) {
    evento.preventDefault();
    setProcessando(true);

    const payload = {
      descricao: construirDescricao(formulario),
      categoria: formulario.categoria,
      valor: formulario.valor,
      data_despesa: formulario.data,
      metodo_pagamento: formulario.metodoPagamento,
      status: formulario.status,
    };

    try {
      if (idEmEdicao) {
        const { error } = await supabase
          .from('despesas')
          .update(payload)
          .eq('id', idEmEdicao);
        if (error) throw error;
        atualizarRegistosLocalmente([idEmEdicao], payload);
      } else {
        const { data, error } = await supabase
          .from('despesas')
          .insert(payload)
          .select(
            'id,descricao,categoria,valor,data_despesa,metodo_pagamento,status'
          )
          .single();
        if (error) throw error;
        setRegistos((atuais) => [data as DespesaRow, ...atuais]);
      }

      setModalAberto(false);
    } catch (error: unknown) {
      const mensagem = error instanceof Error ? error.message : 'Erro desconhecido';
      window.alert('Erro ao guardar o gasto: ' + mensagem);
    } finally {
      setProcessando(false);
    }
  }

  async function eliminarGasto(gasto: Gasto) {
    const confirmado = window.confirm(
      'Eliminar permanentemente o gasto "' + gasto.nome + '"?'
    );
    if (!confirmado) return;

    marcarAtualizacao([gasto.id], true);
    const { error } = await supabase.from('despesas').delete().eq('id', gasto.id);

    if (error) {
      window.alert('Erro ao eliminar o gasto: ' + error.message);
      marcarAtualizacao([gasto.id], false);
      return;
    }

    setRegistos((atuais) => atuais.filter((registo) => registo.id !== gasto.id));
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      proximos.delete(gasto.id);
      return proximos;
    });
    marcarAtualizacao([gasto.id], false);
  }

  function exportarCsv() {
    if (gastosFiltrados.length === 0) {
      window.alert('Não existem gastos visíveis para exportar.');
      return;
    }

    const cabecalho = [
      'Data',
      'Fornecedor',
      'NIF',
      'Documento',
      'Item',
      'Categoria',
      'Quantidade',
      'Unidade',
      'Valor',
      'Pagamento',
      'Estado',
    ];
    const linhas = gastosFiltrados.map((gasto) =>
      [
        gasto.data,
        gasto.fornecedor,
        gasto.nifFornecedor,
        gasto.numeroDocumento,
        gasto.nome,
        gasto.categoria,
        gasto.quantidade,
        gasto.unidade,
        gasto.valor.toFixed(2).replace('.', ','),
        gasto.metodoPagamento,
        gasto.status,
      ]
        .map(escaparCsv)
        .join(';')
    );
    const conteudo = '\uFEFF' + cabecalho.map(escaparCsv).join(';') + '\n' + linhas.join('\n');
    const url = URL.createObjectURL(
      new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
    );
    const ligacao = document.createElement('a');
    ligacao.href = url;
    ligacao.download = 'gastos-chef-batato-' + filtroMes + '.csv';
    ligacao.click();
    URL.revokeObjectURL(url);
  }

  function abrirFornecedor(nome: string) {
    setBusca(nome);
    setFiltroCategoria('todas');
    setAbaAtiva('documentos');
  }

  function abrirCategoria(nome: string) {
    setBusca('');
    setFiltroCategoria(nome);
    setAbaAtiva('documentos');
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-7xl p-5 font-sans md:p-8">
      <header className="mb-6 border-b border-zinc-800 pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-white">
                Direção de Gastos
              </h1>
              <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-300">
                Controlo completo
              </span>
            </div>
            <p className="max-w-2xl text-sm text-zinc-500">
              Faturas, itens, fornecedores e categorias num só lugar. Tudo o que
              classificares fica guardado na base de dados.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[9px] font-black uppercase text-zinc-500">
                Mês em análise
              </span>
              <input
                type="month"
                value={filtroMes}
                onChange={(evento) => setFiltroMes(evento.target.value)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500"
              />
            </label>
            <button
              type="button"
              onClick={exportarCsv}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-bold text-zinc-200 hover:bg-zinc-800"
            >
              ⬇ Exportar CSV
            </button>
            <button
              type="button"
              onClick={abrirNovoGasto}
              className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white hover:bg-orange-500"
            >
              + Registar gasto
            </button>
          </div>
        </div>
      </header>

      {erro && (
        <div className="mb-5 rounded-2xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {erro}
        </div>
      )}

      <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CartaoResumo
          titulo="Total analisado"
          valor={moeda.format(totalAnalisado)}
          detalhe={gastosFiltrados.length + ' gasto(s)'}
          classe="text-red-400"
        />
        <CartaoResumo
          titulo="Comparação mensal"
          valor={
            variacaoMensal === null
              ? 'Sem histórico'
              : (variacaoMensal > 0 ? '+' : '') + variacaoMensal.toFixed(1) + '%'
          }
          detalhe={'Mês anterior: ' + moeda.format(totalMesAnterior)}
          classe={
            variacaoMensal === null
              ? 'text-zinc-300'
              : variacaoMensal > 0
                ? 'text-red-400'
                : 'text-emerald-400'
          }
        />
        <CartaoResumo
          titulo="Fornecedores"
          valor={String(fornecedores.length)}
          detalhe={documentos.length + ' documento(s)'}
          classe="text-blue-400"
        />
        <CartaoResumo
          titulo="Por classificar"
          valor={moeda.format(totalPorClassificar)}
          detalhe={gastosPorClassificar.length + ' item(ns) pendente(s)'}
          classe={gastosPorClassificar.length > 0 ? 'text-yellow-300' : 'text-emerald-400'}
        />
      </section>

      <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px_210px]">
          <input
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Procurar fornecedor, fatura, item, categoria ou pagamento..."
            className={campoClasse}
          />
          <select
            value={filtroCategoria}
            onChange={(evento) => setFiltroCategoria(evento.target.value)}
            className={campoClasse}
          >
            <option value="todas">Todas as categorias</option>
            {categoriasDisponiveis.map((categoria) => (
              <option key={categoria} value={categoria}>
                {categoria}
              </option>
            ))}
          </select>
          <select
            value={ordenacao}
            onChange={(evento) => setOrdenacao(evento.target.value as Ordenacao)}
            className={campoClasse}
          >
            <option value="fornecedor_asc">Fornecedor (A–Z)</option>
            <option value="fornecedor_desc">Fornecedor (Z–A)</option>
            <option value="data_desc">Data mais recente</option>
            <option value="data_asc">Data mais antiga</option>
            <option value="valor_desc">Maior valor</option>
            <option value="valor_asc">Menor valor</option>
          </select>
        </div>
        {(busca || filtroCategoria !== 'todas') && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              Filtro aplicado: {gastosFiltrados.length} gasto(s), total de{' '}
              <strong className="text-zinc-300">{moeda.format(totalAnalisado)}</strong>
            </p>
            <button
              type="button"
              onClick={() => {
                setBusca('');
                setFiltroCategoria('todas');
              }}
              className="text-xs font-bold text-orange-400 hover:text-orange-300"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </section>

      {selecionados.size > 0 && (
        <section className="mb-5 rounded-2xl border border-orange-500/40 bg-orange-950/25 p-4 shadow-lg">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-black text-orange-200">
                {selecionados.size} gasto(s) selecionado(s)
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Total selecionado: {moeda.format(totalSelecionado)}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={categoriaEmMassa}
                onChange={(evento) => setCategoriaEmMassa(evento.target.value)}
                className="min-w-64 rounded-xl border border-orange-500/30 bg-zinc-950 px-3 py-2.5 text-sm text-white"
              >
                <option value="">Escolher categoria...</option>
                {categoriasDisponiveis.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void aplicarCategoriaEmMassa()}
                disabled={!categoriaEmMassa || processando}
                className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
              >
                {processando ? 'A guardar...' : 'Aplicar categoria'}
              </button>
              <button
                type="button"
                onClick={() => setSelecionados(new Set())}
                className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-bold text-zinc-300"
              >
                Limpar seleção
              </button>
            </div>
          </div>
        </section>
      )}

      <nav className="mb-5 flex gap-2 overflow-x-auto pb-1">
        <BotaoAba
          ativo={abaAtiva === 'painel'}
          onClick={() => setAbaAtiva('painel')}
          texto="📊 Visão geral"
        />
        <BotaoAba
          ativo={abaAtiva === 'documentos'}
          onClick={() => setAbaAtiva('documentos')}
          texto={'🧾 Faturas e gastos (' + documentos.length + ')'}
        />
        <BotaoAba
          ativo={abaAtiva === 'fornecedores'}
          onClick={() => setAbaAtiva('fornecedores')}
          texto={'🏪 Fornecedores (' + fornecedores.length + ')'}
        />
        <BotaoAba
          ativo={abaAtiva === 'categorias'}
          onClick={() => setAbaAtiva('categorias')}
          texto={'🏷️ Categorias (' + categorias.length + ')'}
        />
      </nav>

      {loading ? (
        <EstadoVazio texto="A carregar e organizar todos os gastos..." />
      ) : gastosFiltrados.length === 0 ? (
        <EstadoVazio texto="Não existem gastos para este mês ou para os filtros escolhidos." />
      ) : (
        <>
          {abaAtiva === 'painel' && (
            <PainelDirecao
              fornecedores={fornecedores}
              categorias={categorias}
              gastos={gastosFiltrados}
              total={totalAnalisado}
              onFornecedor={abrirFornecedor}
              onCategoria={abrirCategoria}
            />
          )}

          {abaAtiva === 'documentos' && (
            <ListaDocumentos
              documentos={documentos}
              categorias={categoriasDisponiveis}
              selecionados={selecionados}
              expandidos={expandidos}
              idsAtualizando={idsAtualizando}
              todosVisiveisSelecionados={todosVisiveisSelecionados}
              onAlternarTodos={alternarTodosVisiveis}
              onAlternarDocumento={alternarDocumento}
              onAlternarDetalhes={alternarDetalhes}
              onAlternarItem={alternarItem}
              onCategoria={atualizarCategoriaIndividual}
              onEditar={abrirEdicao}
              onEliminar={eliminarGasto}
            />
          )}

          {abaAtiva === 'fornecedores' && (
            <VistaFornecedores
              fornecedores={fornecedores}
              total={totalAnalisado}
              onAbrir={abrirFornecedor}
            />
          )}

          {abaAtiva === 'categorias' && (
            <VistaCategorias
              categorias={categorias}
              total={totalAnalisado}
              onAbrir={abrirCategoria}
            />
          )}
        </>
      )}

      {modalAberto && (
        <ModalGasto
          formulario={formulario}
          setFormulario={setFormulario}
          categorias={categoriasDisponiveis}
          processando={processando}
          editando={Boolean(idEmEdicao)}
          onFechar={() => setModalAberto(false)}
          onGuardar={guardarGasto}
        />
      )}
    </div>
  );
}

function CartaoResumo({
  titulo,
  valor,
  detalhe,
  classe,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  classe: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">
        {titulo}
      </p>
      <p className={'mt-2 font-mono text-2xl font-black ' + classe}>{valor}</p>
      <p className="mt-1 text-[10px] text-zinc-600">{detalhe}</p>
    </div>
  );
}

function BotaoAba({
  ativo,
  onClick,
  texto,
}: {
  ativo: boolean;
  onClick: () => void;
  texto: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors ' +
        (ativo
          ? 'border-orange-500/50 bg-orange-600/20 text-orange-300'
          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white')
      }
    >
      {texto}
    </button>
  );
}

function PainelDirecao({
  fornecedores,
  categorias,
  gastos,
  total,
  onFornecedor,
  onCategoria,
}: {
  fornecedores: ResumoFornecedor[];
  categorias: ResumoCategoria[];
  gastos: Gasto[];
  total: number;
  onFornecedor: (nome: string) => void;
  onCategoria: (nome: string) => void;
}) {
  // Agrupa somente quando fornecedor, item e unidade são iguais.
  // Assim, o mesmo produto comprado em fornecedores diferentes não é misturado.
  const gruposMaioresGastos = new Map<
    string,
    {
      fornecedor: string;
      nome: string;
      unidade: string;
      quantidade: number;
      valor: number;
      compras: number;
      categorias: Map<string, number>;
      datas: string[];
    }
  >();

  gastos.forEach((gasto) => {
    const fornecedorNormalizado = normalizarTexto(gasto.fornecedor)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const itemNormalizado = normalizarTexto(gasto.nome)
      .replace(/^\[validado\]\s*/i, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const unidadeNormalizada = normalizarTexto(gasto.unidade || 'un');
    const chave = [fornecedorNormalizado, itemNormalizado, unidadeNormalizada].join('|');

    const atual = gruposMaioresGastos.get(chave) || {
      fornecedor: gasto.fornecedor || 'Sem fornecedor',
      nome: gasto.nome,
      unidade: gasto.unidade || 'un',
      quantidade: 0,
      valor: 0,
      compras: 0,
      categorias: new Map<string, number>(),
      datas: [],
    };

    atual.quantidade += numero(gasto.quantidade);
    atual.valor += numero(gasto.valor);
    atual.compras += 1;
    atual.categorias.set(
      gasto.categoria,
      (atual.categorias.get(gasto.categoria) || 0) + numero(gasto.valor)
    );

    const data = gasto.data?.slice(0, 10);
    if (data) atual.datas.push(data);

    gruposMaioresGastos.set(chave, atual);
  });

  const maioresGastos = [...gruposMaioresGastos.values()]
    .map((grupo) => {
      const datas = [...new Set(grupo.datas)].sort();
      const categoria = [...grupo.categorias.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] || '⚠️ Por Classificar';

      return {
        ...grupo,
        categoria,
        periodo:
          datas.length === 0
            ? 'Sem data'
            : datas.length === 1
              ? dataPT(datas[0])
              : `${dataPT(datas[0])} a ${dataPT(datas[datas.length - 1])}`,
      };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 12);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <PainelRanking
          titulo="Custos por fornecedor"
          subtitulo="Onde a empresa gastou mais"
          itens={fornecedores.slice(0, 8).map((fornecedor) => ({
            nome: fornecedor.nome,
            valor: fornecedor.total,
            detalhe:
              fornecedor.quantidadeDocumentos +
              ' documento(s) · ' +
              fornecedor.quantidadeItens +
              ' item(ns)',
          }))}
          total={total}
          onAbrir={onFornecedor}
        />
        <PainelRanking
          titulo="Custos por categoria"
          subtitulo="Em que tipo de gasto o dinheiro foi utilizado"
          itens={categorias.slice(0, 8).map((categoria) => ({
            nome: categoria.nome,
            valor: categoria.total,
            detalhe:
              categoria.quantidadeItens +
              ' item(ns) · ' +
              categoria.quantidadeFornecedores +
              ' fornecedor(es)',
          }))}
          total={total}
          onAbrir={onCategoria}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 p-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-white">
            Maiores gastos do período
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Itens iguais do mesmo fornecedor são unificados, somando quantidades e valores.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-zinc-800 text-[9px] uppercase text-zinc-600">
                <th className="px-5 py-3">Fornecedor</th>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3 text-right">Quantidade total</th>
                <th className="px-5 py-3 text-right">Compras</th>
                <th className="px-5 py-3">Período</th>
                <th className="px-5 py-3 text-right">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {maioresGastos.map((gasto) => (
                <tr
                  key={normalizarTexto(gasto.fornecedor) + '|' + normalizarTexto(gasto.nome) + '|' + gasto.unidade}
                  className="border-b border-zinc-800/70 last:border-0"
                >
                  <td className="px-5 py-3 text-sm font-bold text-zinc-200">{gasto.fornecedor}</td>
                  <td className="px-5 py-3 text-sm text-zinc-400">{gasto.nome}</td>
                  <td className="px-5 py-3">
                    <EtiquetaCategoria categoria={gasto.categoria} />
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-bold text-white">
                    {quantidadeFormatada.format(gasto.quantidade)} {gasto.unidade}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-zinc-400">
                    {gasto.compras}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-500">
                    {gasto.periodo}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-black text-red-400">
                    {moeda.format(gasto.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PainelRanking({
  titulo,
  subtitulo,
  itens,
  total,
  onAbrir,
}: {
  titulo: string;
  subtitulo: string;
  itens: { nome: string; valor: number; detalhe: string }[];
  total: number;
  onAbrir: (nome: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-sm font-black uppercase tracking-wider text-white">{titulo}</h2>
      <p className="mt-1 text-xs text-zinc-500">{subtitulo}</p>
      <div className="mt-5 space-y-4">
        {itens.map((item) => (
          <button
            key={item.nome}
            type="button"
            onClick={() => onAbrir(item.nome)}
            className="block w-full text-left"
          >
            <div className="mb-1.5 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-zinc-200">{item.nome}</p>
                <p className="text-[9px] text-zinc-600">{item.detalhe}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm font-black text-white">{moeda.format(item.valor)}</p>
                <p className="text-[9px] text-zinc-600">
                  {percentagem(item.valor, total).toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-orange-500"
                style={{ width: percentagem(item.valor, total) + '%' }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ListaDocumentos({
  documentos,
  categorias,
  selecionados,
  expandidos,
  idsAtualizando,
  todosVisiveisSelecionados,
  onAlternarTodos,
  onAlternarDocumento,
  onAlternarDetalhes,
  onAlternarItem,
  onCategoria,
  onEditar,
  onEliminar,
}: {
  documentos: DocumentoGasto[];
  categorias: string[];
  selecionados: Set<string>;
  expandidos: Set<string>;
  idsAtualizando: Set<string>;
  todosVisiveisSelecionados: boolean;
  onAlternarTodos: () => void;
  onAlternarDocumento: (documento: DocumentoGasto) => void;
  onAlternarDetalhes: (chave: string) => void;
  onAlternarItem: (id: string) => void;
  onCategoria: (id: string, categoria: string) => Promise<void>;
  onEditar: (gasto: Gasto) => void;
  onEliminar: (gasto: Gasto) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-950/40 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-white">
            Faturas e gastos
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Seleciona a fatura inteira ou abre-a para classificar cada item.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onAlternarTodos}
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-200"
          >
            {todosVisiveisSelecionados ? 'Desmarcar visíveis' : 'Selecionar visíveis'}
          </button>
          <span className="text-xs text-zinc-500">{documentos.length} registo(s)</span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {documentos.map((documento) => {
          const ids = documento.itens.map((item) => item.id);
          const quantidadeSelecionada = ids.filter((id) => selecionados.has(id)).length;
          const todosSelecionados =
            ids.length > 0 && quantidadeSelecionada === ids.length;
          const expandido = expandidos.has(documento.chave);
          const pendentes = documento.itens.filter((item) =>
            ehPorClassificar(item.categoria)
          ).length;

          return (
            <article
              key={documento.chave}
              className={
                'overflow-hidden rounded-2xl border bg-[#121214] transition-colors ' +
                (quantidadeSelecionada > 0
                  ? 'border-orange-500/60'
                  : 'border-zinc-800 hover:border-zinc-700')
              }
            >
              <div className="flex items-center gap-4 p-4">
                <input
                  type="checkbox"
                  checked={todosSelecionados}
                  onChange={() => onAlternarDocumento(documento)}
                  aria-label={'Selecionar ' + documento.numeroDocumento}
                  className="h-5 w-5 shrink-0 cursor-pointer accent-orange-500"
                />
                <button
                  type="button"
                  onClick={() => onAlternarDetalhes(documento.chave)}
                  className="grid min-w-0 flex-1 grid-cols-1 items-center gap-3 text-left md:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">
                      🧾 {documento.fornecedor}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-zinc-400">
                        {documento.numeroDocumento}
                      </span>
                      <span className="rounded border border-zinc-700 px-2 py-0.5 text-[8px] font-bold uppercase text-zinc-500">
                        {documento.tipo}
                      </span>
                      {pendentes > 0 && (
                        <span className="rounded border border-yellow-600/30 bg-yellow-500/10 px-2 py-0.5 text-[8px] font-bold uppercase text-yellow-300">
                          {pendentes} por classificar
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[8px] font-bold uppercase text-zinc-600">Data</p>
                    <p className="mt-1 font-mono text-xs text-zinc-300">
                      {dataPT(documento.data)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[8px] font-bold uppercase text-zinc-600">Itens</p>
                    <p className="mt-1 text-xs text-zinc-300">
                      {documento.itens.length}
                      {quantidadeSelecionada > 0
                        ? ' · ' + quantidadeSelecionada + ' selecionado(s)'
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-4">
                    <span className="whitespace-nowrap font-mono text-lg font-black text-red-400">
                      {moeda.format(documento.valorTotal)}
                    </span>
                    <span className="text-xs text-zinc-500">{expandido ? '▲' : '▼'}</span>
                  </div>
                </button>
              </div>

              {expandido && (
                <DetalhesDocumento
                  documento={documento}
                  categorias={categorias}
                  selecionados={selecionados}
                  idsAtualizando={idsAtualizando}
                  onAlternarItem={onAlternarItem}
                  onCategoria={onCategoria}
                  onEditar={onEditar}
                  onEliminar={onEliminar}
                />
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function DetalhesDocumento({
  documento,
  categorias,
  selecionados,
  idsAtualizando,
  onAlternarItem,
  onCategoria,
  onEditar,
  onEliminar,
}: {
  documento: DocumentoGasto;
  categorias: string[];
  selecionados: Set<string>;
  idsAtualizando: Set<string>;
  onAlternarItem: (id: string) => void;
  onCategoria: (id: string, categoria: string) => Promise<void>;
  onEditar: (gasto: Gasto) => void;
  onEliminar: (gasto: Gasto) => Promise<void>;
}) {
  return (
    <div className="border-t border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-zinc-500">
        <span>
          Documento: <strong className="text-zinc-300">{documento.numeroDocumento}</strong>
        </span>
        <span>
          Data: <strong className="text-zinc-300">{dataPT(documento.data)}</strong>
        </span>
        <span>
          Total: <strong className="text-red-400">{moeda.format(documento.valorTotal)}</strong>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left">
          <thead>
            <tr className="border-b border-zinc-800 text-[8px] uppercase tracking-wider text-zinc-600">
              <th className="w-10 px-2 py-3" />
              <th className="px-3 py-3">Item</th>
              <th className="w-72 px-3 py-3">Categoria</th>
              <th className="px-3 py-3 text-right">Quantidade</th>
              <th className="px-3 py-3 text-right">Preço unitário</th>
              <th className="px-3 py-3 text-right">Subtotal</th>
              <th className="w-24 px-3 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {documento.itens.map((gasto) => {
              const atualizando = idsAtualizando.has(gasto.id);
              const precoUnitario =
                gasto.quantidade > 0 ? gasto.valor / gasto.quantidade : gasto.valor;
              return (
                <tr
                  key={gasto.id}
                  className={
                    'border-b border-zinc-900 last:border-0 ' +
                    (selecionados.has(gasto.id) ? 'bg-orange-950/15' : '')
                  }
                >
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selecionados.has(gasto.id)}
                      onChange={() => onAlternarItem(gasto.id)}
                      className="h-4 w-4 accent-orange-500"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <p className="max-w-sm text-sm font-bold text-zinc-200">{gasto.nome}</p>
                    <p className="mt-1 text-[9px] text-zinc-600">
                      {gasto.metodoPagamento} · {gasto.status}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={gasto.categoria}
                      disabled={atualizando}
                      onChange={(evento) =>
                        void onCategoria(gasto.id, evento.target.value)
                      }
                      className={
                        'w-full rounded-lg border px-2 py-2 text-xs font-bold outline-none disabled:opacity-50 ' +
                        categoriaCor(gasto.categoria)
                      }
                    >
                      {categorias.map((categoria) => (
                        <option key={categoria} value={categoria} className="bg-zinc-950 text-white">
                          {categoria}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs text-zinc-300">
                    {quantidadeFormatada.format(gasto.quantidade)} {gasto.unidade}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs text-zinc-400">
                    {moeda.format(precoUnitario)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm font-black text-white">
                    {moeda.format(gasto.valor)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEditar(gasto)}
                        disabled={atualizando}
                        title="Editar todos os detalhes"
                        className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => void onEliminar(gasto)}
                        disabled={atualizando}
                        title="Eliminar gasto"
                        className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-red-900 hover:bg-red-950 disabled:opacity-40"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VistaFornecedores({
  fornecedores,
  total,
  onAbrir,
}: {
  fornecedores: ResumoFornecedor[];
  total: number;
  onAbrir: (nome: string) => void;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-white">
          Análise por fornecedor
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Clica num fornecedor para consultar todas as respetivas faturas e compras.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fornecedores.map((fornecedor) => (
          <button
            key={fornecedor.nome}
            type="button"
            onClick={() => onAbrir(fornecedor.nome)}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left transition-colors hover:border-orange-500/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{fornecedor.nome}</p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  {fornecedor.quantidadeDocumentos} documento(s) ·{' '}
                  {fornecedor.quantidadeItens} item(ns)
                </p>
              </div>
              <p className="shrink-0 font-mono text-lg font-black text-red-400">
                {moeda.format(fornecedor.total)}
              </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-orange-500"
                style={{ width: percentagem(fornecedor.total, total) + '%' }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <EtiquetaCategoria categoria={fornecedor.principalCategoria} />
              <span className="text-[10px] font-bold text-zinc-500">
                {percentagem(fornecedor.total, total).toFixed(1)}% do total
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function VistaCategorias({
  categorias,
  total,
  onAbrir,
}: {
  categorias: ResumoCategoria[];
  total: number;
  onAbrir: (nome: string) => void;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-white">
          Análise por categoria
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Clica numa categoria para consultar todos os itens classificados nela.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categorias.map((categoria) => (
          <button
            key={categoria.nome}
            type="button"
            onClick={() => onAbrir(categoria.nome)}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left transition-colors hover:border-orange-500/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <EtiquetaCategoria categoria={categoria.nome} />
                <p className="mt-2 text-[10px] text-zinc-500">
                  {categoria.quantidadeItens} item(ns) ·{' '}
                  {categoria.quantidadeFornecedores} fornecedor(es)
                </p>
              </div>
              <p className="shrink-0 font-mono text-lg font-black text-red-400">
                {moeda.format(categoria.total)}
              </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-orange-500"
                style={{ width: percentagem(categoria.total, total) + '%' }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-zinc-500">
              <span className="truncate">Principal: {categoria.principalFornecedor}</span>
              <span className="shrink-0 font-bold">
                {percentagem(categoria.total, total).toFixed(1)}%
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function EtiquetaCategoria({ categoria }: { categoria: string }) {
  return (
    <span
      className={
        'inline-block max-w-full truncate rounded border px-2.5 py-1 text-[8px] font-black uppercase ' +
        categoriaCor(categoria)
      }
      title={categoria}
    >
      {categoria}
    </span>
  );
}

function ModalGasto({
  formulario,
  setFormulario,
  categorias,
  processando,
  editando,
  onFechar,
  onGuardar,
}: {
  formulario: FormularioGasto;
  setFormulario: React.Dispatch<React.SetStateAction<FormularioGasto>>;
  categorias: string[];
  processando: boolean;
  editando: boolean;
  onFechar: () => void;
  onGuardar: (evento: React.FormEvent) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-3xl overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/60 p-6">
          <div>
            <h2 className="text-xl font-black text-white">
              {editando ? 'Editar gasto' : 'Registar novo gasto'}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Preenche o fornecedor para incluir o gasto na análise por fornecedor.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="h-9 w-9 rounded-full bg-zinc-800 text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form onSubmit={(evento) => void onGuardar(evento)} className="space-y-5 p-6">
          <Campo label="Descrição do item ou gasto">
            <input
              required
              type="text"
              value={formulario.nome}
              onChange={(evento) =>
                setFormulario((atual) => ({ ...atual, nome: evento.target.value }))
              }
              className={campoClasse}
              placeholder="Ex.: Luvas descartáveis"
            />
          </Campo>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Campo label="Fornecedor">
              <input
                type="text"
                value={formulario.fornecedor}
                onChange={(evento) =>
                  setFormulario((atual) => ({
                    ...atual,
                    fornecedor: evento.target.value,
                  }))
                }
                className={campoClasse}
                placeholder="Ex.: Recheio"
              />
            </Campo>
            <Campo label="NIF do fornecedor">
              <input
                type="text"
                value={formulario.nifFornecedor}
                onChange={(evento) =>
                  setFormulario((atual) => ({
                    ...atual,
                    nifFornecedor: evento.target.value,
                  }))
                }
                className={campoClasse}
                placeholder="Opcional"
              />
            </Campo>
            <Campo label="Fatura ou documento">
              <input
                type="text"
                value={formulario.numeroDocumento}
                onChange={(evento) =>
                  setFormulario((atual) => ({
                    ...atual,
                    numeroDocumento: evento.target.value,
                  }))
                }
                className={campoClasse}
                placeholder="Ex.: FT 2026/123"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Campo label="Quantidade">
              <input
                required
                min="0.001"
                step="0.001"
                type="number"
                value={formulario.quantidade}
                onChange={(evento) =>
                  setFormulario((atual) => ({
                    ...atual,
                    quantidade: numero(evento.target.value),
                  }))
                }
                className={campoClasse}
              />
            </Campo>
            <Campo label="Unidade">
              <input
                required
                type="text"
                value={formulario.unidade}
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, unidade: evento.target.value }))
                }
                className={campoClasse}
                placeholder="un, kg, cx..."
              />
            </Campo>
            <Campo label="Valor total (€)">
              <input
                required
                min="0"
                step="0.01"
                type="number"
                value={formulario.valor}
                onChange={(evento) =>
                  setFormulario((atual) => ({
                    ...atual,
                    valor: numero(evento.target.value),
                  }))
                }
                className={campoClasse + ' font-mono font-black text-red-400'}
              />
            </Campo>
            <Campo label="Data">
              <input
                required
                type="date"
                value={formulario.data}
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, data: evento.target.value }))
                }
                className={campoClasse}
              />
            </Campo>
          </div>

          <Campo label="Categoria">
            <select
              required
              value={formulario.categoria}
              onChange={(evento) =>
                setFormulario((atual) => ({
                  ...atual,
                  categoria: evento.target.value,
                }))
              }
              className={campoClasse}
            >
              {categorias.map((categoria) => (
                <option key={categoria} value={categoria}>
                  {categoria}
                </option>
              ))}
            </select>
          </Campo>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Campo label="Forma de pagamento">
              <select
                value={formulario.metodoPagamento}
                onChange={(evento) =>
                  setFormulario((atual) => ({
                    ...atual,
                    metodoPagamento: evento.target.value,
                  }))
                }
                className={campoClasse}
              >
                {METODOS_PAGAMENTO.map((metodo) => (
                  <option key={metodo} value={metodo}>
                    {metodo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Estado">
              <select
                value={formulario.status}
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, status: evento.target.value }))
                }
                className={campoClasse}
              >
                <option value="Pago">Pago</option>
                <option value="Pendente">Pendente</option>
                <option value="Validado">Validado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </Campo>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-zinc-800 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-bold text-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={processando}
              className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {processando ? 'A guardar...' : editando ? 'Guardar alterações' : 'Registar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function EstadoVazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 py-16 text-center text-sm text-zinc-600">
      {texto}
    </div>
  );
}
