'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface ItemPedido {
  id: string;
  codigo_produto: string;
  nome_produto: string;
  quantidade: number;
  preco_unitario: number;
}

interface Pedido {
  id: string;
  cliente: string | null;
  contacto_cliente: string;
  canal: 'Balcão' | 'WhatsApp' | 'Glovo' | 'Palmbites';
  forma_pagamento: string;
  entregador: string;
  taxa_entrega: number;
  desconto: number;
  total_geral: number;
  pago: boolean;
  criado_em: string;
  itens_pedido?: ItemPedido[];
}

interface RelatorioBrownieConsolidado {
  chave: string;
  nome: string;
  qtdProduzida: number;
  quantidadeVendida: number;
  qtdRevenda: number;
  qtdDescarte: number;
  faturacaoTotal: number;
  custoInsumosUnitario: number;
}

export default function RelatoriosFaturacao() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidosFiltrados, setPedidosFiltrados] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroDB, setErroDB] = useState<string | null>(null);

  // Aba Ativa
  const [abaAtiva, setAbaAtiva] = useState<'geral' | 'brownies'>('geral');

  // Filtros Gerais
  const [filtroCanal, setFiltroCanal] = useState<string>('todos');
  const [filtroPagamento, setFiltroPagamento] = useState<string>('todos');
  const [termoBusca, setTermoBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<'recente' | 'antigo' | 'az' | 'za'>('za');
  const [pedidoExpandidoId, setPedidoExpandidoId] = useState<string | null>(null);

  // Filtros por Período (Totalmente ligados aos inputs visuais)
  const [tipoIntervalo, setTipoIntervalo] = useState<'dia' | 'mes' | 'ano' | 'personalizado'>('personalizado');
  const [dataUnica, setDataUnica] = useState(() => new Date().toISOString().split('T')[0]);
  const [dataInicio, setDataInicio] = useState('2026-07-01');
  const [dataFim, setDataFim] = useState('2026-07-31');
  const [mesSelecionado, setMesSelecionado] = useState(() => new Date().toISOString().substring(0, 7));
  const [anoSelecionado, setAnoSelecionado] = useState(() => String(new Date().getFullYear()));

  // Estados para dados cruzados de Brownies
  const [custosEditaveis, setCustosEditaveis] = useState<Record<string, number>>({});
  const [itensBrutosBrownies, setItensBrutosBrownies] = useState<any[]>([]);
  const [producaoBrutaBrownies, setProducaoBrutaBrownies] = useState<any[]>([]);
  const [revendaBrutaBrownies, setRevendaBrutaBrownies] = useState<any[]>([]);
  const [descarteBrutoBrownies, setDescarteBrutoBrownies] = useState<any[]>([]);

  // Estados para Modal de Registo de Descarte/Perda
  const [modalDescarteAberto, setModalDescarteAberto] = useState(false);
  const [saborDescarte, setSaborDescarte] = useState('');
  const [qtdDescarteInput, setQtdDescarteInput] = useState(1);
  const [motivoDescarte, setMotivoDescarte] = useState('Queima / Validade');

  // Estados para Modal de Edição Geral de Pedidos
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const [pedidoSendoEditado, setPedidoSendoEditado] = useState<Pedido | null>(null);
  const [editCliente, setEditCliente] = useState('');
  const [editTotal, setEditTotal] = useState(0);

  const limparNomeProduto = (nome: string | null | undefined) => {
    if (!nome) return "Produto S/ Nome";
    let limpo = nome.replace(/\s*\([^)]*\)/g, '').trim();
    return limpo || nome;
  };

  const limparNomePedido = (nome: string | null | undefined) => {
    if (!nome) return "S/ Nome";
    const match = nome.match(/Pedido\s*#?(\d+)/i);
    if (match) return match[1]; 
    return nome;
  };

  async function carregarRelatorios() {
    setLoading(true);
    setErroDB(null);

    try {
      const { data: pedidosData, error: errPed } = await supabase.from('pedidos').select('*').order('criado_em', { ascending: false });
      if (errPed) throw new Error(`Falha na tabela 'pedidos': ${errPed.message}`);

      const { data: itensData, error: errItens } = await supabase.from('itens_pedido').select('*');
      if (errItens) throw new Error(`Falha na tabela 'itens_pedido': ${errItens.message}`);

      const pedidosMapeados = (pedidosData || []).map((p: any) => ({
        ...p,
        itens_pedido: (itensData || []).filter((i: any) => i.pedido_id === p.id)
      }));
      setPedidos(pedidosMapeados);

      const itensComData = (itensData || []).map((item: any) => {
        const pedidoPai = (pedidosData || []).find((p: any) => p.id === item.pedido_id);
        return { ...item, criado_em: pedidoPai ? pedidoPai.criado_em : null };
      });
      setItensBrutosBrownies(itensComData);

      const { data: prodData } = await supabase.from('producao_brownie').select('*');
      setProducaoBrutaBrownies(prodData || []);

      const { data: revData } = await supabase.from('revenda').select('*');
      setRevendaBrutaBrownies(revData || []);

      const { data: descData } = await supabase.from('perdas').select('*');
      setDescarteBrutoBrownies(descData || []);

    } catch (err: any) {
      setErroDB(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarRelatorios();
  }, []);

  const registarDescarte = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('perdas').insert([{
        nome_produto: saborDescarte,
        quantidade: Number(qtdDescarteInput),
        motivo: motivoDescarte,
        data: new Date().toISOString()
      }]);

      if (error) throw error;
      alert('Descarte registado com sucesso!');
      setModalDescarteAberto(false);
      setQtdDescarteInput(1);
      carregarRelatorios();
    } catch (err: any) {
      alert(`Erro ao registar descarte: ${err.message}`);
    }
  };

  // Validador exato por intervalo de datas baseado na string do Supabase
  const validarIntervaloData = (dataStr: string | null) => {
    if (!dataStr) return false;
    const itemDate = dataStr.split('T')[0]; // Formato YYYY-MM-DD
    const itemMes = itemDate.substring(0, 7); // Formato YYYY-MM
    const itemAno = itemDate.substring(0, 4); // Formato YYYY

    if (tipoIntervalo === 'dia') {
      return itemDate === dataUnica;
    }
    if (tipoIntervalo === 'mes') {
      return itemMes === mesSelecionado;
    }
    if (tipoIntervalo === 'ano') {
      return itemAno === anoSelecionado;
    }
    if (tipoIntervalo === 'personalizado') {
      return itemDate >= dataInicio && itemDate <= dataFim;
    }
    return true;
  };

  // Filtros Faturação Geral
  useEffect(() => {
    let resultado = [...pedidos];
    resultado = resultado.filter(p => validarIntervaloData(p.criado_em));

    if (filtroCanal !== 'todos') resultado = resultado.filter(p => p.canal === filtroCanal);
    if (filtroPagamento !== 'todos') resultado = resultado.filter(p => p.forma_pagamento === filtroPagamento);

    if (termoBusca.trim() !== '') {
      const termo = termoBusca.toLowerCase();
      resultado = resultado.filter(p => {
        const nomeLimpo = limparNomePedido(p.cliente).toLowerCase();
        const nomeOriginal = p.cliente ? p.cliente.toLowerCase() : '';
        return nomeLimpo.includes(termo) || nomeOriginal.includes(termo);
      });
    }

    resultado.sort((a, b) => {
      if (ordenacao === 'recente') return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
      if (ordenacao === 'antigo') return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
      if (ordenacao === 'az') return limparNomePedido(a.cliente).localeCompare(limparNomePedido(b.cliente), undefined, { numeric: true });
      if (ordenacao === 'za') return limparNomePedido(b.cliente).localeCompare(limparNomePedido(a.cliente), undefined, { numeric: true });
      return 0;
    });

    setPedidosFiltrados(resultado);
  }, [pedidos, tipoIntervalo, dataUnica, dataInicio, dataFim, mesSelecionado, anoSelecionado, filtroCanal, filtroPagamento, termoBusca, ordenacao]);

  // Top de Vendas cruzado com os pedidos filtrados no período exato
  const topProdutosVendas = useMemo(() => {
    const mapa: Record<string, { nome: string; quantidade: number; faturacao: number }> = {};
    
    pedidosFiltrados.forEach(p => {
      (p.itens_pedido || []).forEach(item => {
        const nomeLimpo = limparNomeProduto(item.nome_produto);
        const chave = nomeLimpo.toLowerCase().trim();
        const qtd = Number(item.quantidade || 0);
        const fat = qtd * Number(item.preco_unitario || 0);

        if (!mapa[chave]) {
          mapa[chave] = { nome: nomeLimpo, quantidade: 0, faturacao: 0 };
        }
        mapa[chave].quantidade += qtd;
        mapa[chave].faturacao += fat;
      });
    });

    return Object.values(mapa).sort((a, b) => b.quantidade - a.quantidade);
  }, [pedidosFiltrados]);

  // Cruzamento Brownies
  const mapaConsolidadoBrownies: Record<string, { nome: string, quantidadeVendida: number, faturacao: number, qtdRevenda: number, qtdProduzida: number, qtdDescarte: number }> = {};

  itensBrutosBrownies.filter(i => (i.nome_produto || '').toLowerCase().includes('brownie') && validarIntervaloData(i.criado_em)).forEach(item => {
    const nomeLimpo = limparNomeProduto(item.nome_produto);
    const chave = nomeLimpo.toLowerCase().trim();
    const qtd = Number(item.quantidade || 0);
    const fat = qtd * Number(item.preco_unitario || 0);

    if (!mapaConsolidadoBrownies[chave]) {
      mapaConsolidadoBrownies[chave] = { nome: nomeLimpo, quantidadeVendida: 0, faturacao: 0, qtdRevenda: 0, qtdProduzida: 0, qtdDescarte: 0 };
    }
    mapaConsolidadoBrownies[chave].quantidadeVendida += qtd;
    mapaConsolidadoBrownies[chave].faturacao += fat;
  });

  revendaBrutaBrownies.filter(r => validarIntervaloData(r.criado_em || r.data)).forEach(rev => {
    const nomeLimpo = limparNomeProduto(rev.nome_produto || rev.sabor || 'Brownie Revenda');
    const chave = nomeLimpo.toLowerCase().trim();
    const qtd = Number(rev.quantidade || rev.qtd || 0);
    if (!mapaConsolidadoBrownies[chave]) mapaConsolidadoBrownies[chave] = { nome: nomeLimpo, quantidadeVendida: 0, faturacao: 0, qtdRevenda: 0, qtdProduzida: 0, qtdDescarte: 0 };
    mapaConsolidadoBrownies[chave].qtdRevenda += qtd;
  });

  producaoBrutaBrownies.filter(prod => validarIntervaloData(prod.criado_em || prod.data)).forEach(prod => {
    const nomeLimpo = limparNomeProduto(prod.nome_produto || prod.sabor || 'Brownie Produzido');
    const chave = nomeLimpo.toLowerCase().trim();
    const qtd = Number(prod.quantidade || prod.qtd || 0);
    if (!mapaConsolidadoBrownies[chave]) mapaConsolidadoBrownies[chave] = { nome: nomeLimpo, quantidadeVendida: 0, faturacao: 0, qtdRevenda: 0, qtdProduzida: 0, qtdDescarte: 0 };
    mapaConsolidadoBrownies[chave].qtdProduzida += qtd;
  });

  descarteBrutoBrownies.filter(desc => validarIntervaloData(desc.criado_em || desc.data)).forEach(desc => {
    const nomeLimpo = limparNomeProduto(desc.nome_produto || desc.sabor || 'Brownie Descartado');
    const chave = nomeLimpo.toLowerCase().trim();
    const qtd = Number(desc.quantidade || desc.qtd || 0);
    if (!mapaConsolidadoBrownies[chave]) mapaConsolidadoBrownies[chave] = { nome: nomeLimpo, quantidadeVendida: 0, faturacao: 0, qtdRevenda: 0, qtdProduzida: 0, qtdDescarte: 0 };
    mapaConsolidadoBrownies[chave].qtdDescarte += qtd;
  });

  const rankingBrownies: RelatorioBrownieConsolidado[] = Object.entries(mapaConsolidadoBrownies).map(([chave, v]) => {
    const custoUnit = custosEditaveis[chave] !== undefined ? custosEditaveis[chave] : 0.50;
    return {
      chave, nome: v.nome, qtdProduzida: v.qtdProduzida, quantidadeVendida: v.quantidadeVendida,
      qtdRevenda: v.qtdRevenda, qtdDescarte: v.qtdDescarte, faturacaoTotal: v.faturacao, custoInsumosUnitario: custoUnit
    };
  }).sort((a, b) => b.quantidadeVendida - a.quantidadeVendida);

  const resumoBrownies = rankingBrownies.reduce((acc, b) => {
    const totalSaidas = b.quantidadeVendida + b.qtdRevenda + b.qtdDescarte;
    const custoTotalItem = totalSaidas * b.custoInsumosUnitario;
    const custoDescarteItem = b.qtdDescarte * b.custoInsumosUnitario;
    const ganhoLiquidoItem = b.faturacaoTotal - custoTotalItem;
    return {
      totalProduzido: acc.totalProduzido + b.qtdProduzida, totalVendido: acc.totalVendido + b.quantidadeVendida,
      totalRevenda: acc.totalRevenda + b.qtdRevenda, totalDescarte: acc.totalDescarte + b.qtdDescarte,
      faturacaoBruta: acc.faturacaoBruta + b.faturacaoTotal, custoInsumosTotal: acc.custoInsumosTotal + custoTotalItem,
      custoDescarteTotal: acc.custoDescarteTotal + custoDescarteItem, ganhoLiquidoReal: acc.ganhoLiquidoReal + ganhoLiquidoItem
    };
  }, { totalProduzido: 0, totalVendido: 0, totalRevenda: 0, totalDescarte: 0, faturacaoBruta: 0, custoInsumosTotal: 0, custoDescarteTotal: 0, ganhoLiquidoReal: 0 });

  const abrirModalEdicao = (pedido: Pedido) => {
    setPedidoSendoEditado(pedido);
    setEditCliente(pedido.cliente || ''); 
    setEditTotal(pedido.total_geral);
    setModalEdicaoAberto(true);
  };

  const salvarAlteracoesFinanceiras = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedidoSendoEditado) return;
    try {
      const { error } = await supabase.from('pedidos').update({
        cliente: editCliente,
        total_geral: Number(editTotal)
      }).eq('id', pedidoSendoEditado.id);

      if (error) throw error;
      alert('Lançamento corrigido com sucesso!');
      setModalEdicaoAberto(false);
      carregarRelatorios();
    } catch (err: any) {
      alert(`Erro ao atualizar: ${err.message}`);
    }
  };

  const excluirRegistroCaixa = async (id: string) => {
    if (!confirm('Deseja eliminar este registo de forma definitiva?')) return;
    try {
      const { error } = await supabase.from('pedidos').delete().eq('id', id);
      if (error) throw error;
      setPedidoExpandidoId(null);
      carregarRelatorios();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  const totalPedidosCount = pedidosFiltrados.length;
  const totalFaturadoBruto = pedidosFiltrados.reduce((acc, p) => acc + Number(p.total_geral || 0), 0);
  const totalRecebido = pedidosFiltrados.filter(p => p.pago).reduce((acc, p) => acc + Number(p.total_geral || 0), 0);
  const totalPendente = pedidosFiltrados.filter(p => !p.pago).reduce((acc, p) => acc + Number(p.total_geral || 0), 0);
  const totalTaxasEntrega = pedidosFiltrados.reduce((acc, p) => acc + Number(p.taxa_entrega || 0), 0);

  const faturamentoPorMetodo = pedidosFiltrados.reduce((acc: { [key: string]: number }, p) => {
    const metodo = p.forma_pagamento || 'Sem Método';
    acc[metodo] = (acc[metodo] || 0) + Number(p.total_geral || 0);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24">
      
      {/* HEADER & ABAS */}
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
            <span className="text-xl">📊</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Central de Relatórios</h1>
            <p className="text-[10px] text-zinc-400 font-medium">Caixa, Vendas, Revenda, Produção e Descarte</p>
          </div>
        </div>

        <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
          <button 
            onClick={() => setAbaAtiva('geral')} 
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === 'geral' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'}`}
          >
            📋 Faturação Geral
          </button>
          <button 
            onClick={() => setAbaAtiva('brownies')} 
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === 'brownies' ? 'bg-amber-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'}`}
          >
            🍫 Relatório de Brownies (Cruzado)
          </button>
        </div>
      </header>

      {erroDB && (
        <div className="m-5 bg-red-950/40 border border-red-900 p-5 rounded-[24px]">
          <h2 className="text-red-500 font-bold text-sm uppercase tracking-wider mb-2">⚠️ Erro</h2>
          <code className="block bg-black/50 p-3 rounded-lg text-red-400 font-mono text-xs">{erroDB}</code>
        </div>
      )}

      <main className="flex-1 p-5 space-y-6 max-w-7xl mx-auto w-full">
        
        {/* BARRA DE FILTROS SUPERIOR (LIGADA AOS ESTADOS CORRETOS) */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800 w-full md:w-auto">
            <button
              onClick={() => setTipoIntervalo('dia')}
              className={`flex-1 md:flex-initial px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tipoIntervalo === 'dia' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
            >
              Por Dia
            </button>
            <button
              onClick={() => setTipoIntervalo('mes')}
              className={`flex-1 md:flex-initial px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tipoIntervalo === 'mes' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
            >
              Por Mês
            </button>
            <button
              onClick={() => setTipoIntervalo('ano')}
              className={`flex-1 md:flex-initial px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tipoIntervalo === 'ano' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
            >
              Por Ano
            </button>
            <button
              onClick={() => setTipoIntervalo('personalizado')}
              className={`flex-1 md:flex-initial px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tipoIntervalo === 'personalizado' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
            >
              De - Até
            </button>
          </div>

          <div className="w-full md:w-auto flex items-center gap-3 justify-end">
            {tipoIntervalo === 'dia' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Data:</span>
                <input type="date" value={dataUnica} onChange={e => setDataUnica(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none [color-scheme:dark]" />
              </div>
            )}
            {tipoIntervalo === 'mes' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Mês:</span>
                <input type="month" value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none [color-scheme:dark]" />
              </div>
            )}
            {tipoIntervalo === 'ano' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Ano:</span>
                <select value={anoSelecionado} onChange={e => setAnoSelecionado(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none">
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                </select>
              </div>
            )}
            {tipoIntervalo === 'personalizado' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-zinc-500">De:</span>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none [color-scheme:dark]" />
                <span className="text-[10px] uppercase font-bold text-zinc-500">Até:</span>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none [color-scheme:dark]" />
              </div>
            )}
          </div>
        </div>

        {/* ABA 1: FATURAÇÃO GERAL */}
        {abaAtiva === 'geral' && (
          <>
            {/* CARDS DE RESUMO */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Nº de Pedidos</span>
                <span className="text-3xl font-black text-white font-mono mt-2">{totalPedidosCount}</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Faturamento Bruto</span>
                <span className="text-3xl font-black text-amber-400 font-mono mt-2">{totalFaturadoBruto.toFixed(2)}€</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Caixa Realizado</span>
                <span className="text-2xl font-black text-green-400 font-mono mt-2">{totalRecebido.toFixed(2)}€</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between">
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Fiado Pendente</span>
                <span className="text-2xl font-black text-red-400 font-mono mt-2">{totalPendente.toFixed(2)}€</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between col-span-2 md:col-span-1">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Custos Entrega</span>
                <span className="text-2xl font-black text-orange-400 font-mono mt-2">{totalTaxasEntrega.toFixed(2)}€</span>
              </div>
            </div>

            <div className="bg-zinc-900/40 p-5 rounded-3xl border border-zinc-800/60 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Pesquisa</span>
                  <input 
                    type="text" 
                    placeholder="Número do pedido..." 
                    value={termoBusca}
                    onChange={e => setTermoBusca(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs font-bold text-zinc-200 outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none">
                    <option value="todos">Todos Canais</option>
                    <option value="Balcão">Balcão</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Glovo">Glovo</option>
                    <option value="Palmbites">Palmbites</option>
                  </select>
                  <select value={filtroPagamento} onChange={e => setFiltroPagamento(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none">
                    <option value="todos">Pagamentos</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="MBWay">MBWay</option>
                    <option value="Multibanco">Multibanco</option>
                    <option value="Caderninho">Caderninho</option>
                  </select>
                  <select value={ordenacao} onChange={e => setOrdenacao(e.target.value as any)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none">
                    <option value="za">Z-A</option>
                    <option value="az">A-Z</option>
                    <option value="recente">Recentes</option>
                    <option value="antigo">Antigos</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3">
                <h3 className="text-sm font-black uppercase text-zinc-300 tracking-wider">📦 Lançamentos ({pedidosFiltrados.length})</h3>
                {pedidosFiltrados.length === 0 ? (
                  <div className="text-center p-10 bg-zinc-900/30 rounded-3xl border border-zinc-800 text-zinc-500 text-sm">Nenhuma venda encontrada para o período selecionado.</div>
                ) : (
                  pedidosFiltrados.map(p => {
                    const isExpanded = pedidoExpandidoId === p.id;
                    const dataFormatada = new Date(p.criado_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
                    const horaFormatada = new Date(p.criado_em).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <div key={p.id} className="bg-zinc-900/60 border border-zinc-800 rounded-[24px] overflow-hidden">
                        <div onClick={() => setPedidoExpandidoId(isExpanded ? null : p.id)} className="p-4 cursor-pointer hover:bg-zinc-800/40 flex items-center justify-between">
                          <div className="flex gap-4 items-center">
                            <div className="flex flex-col items-center justify-center bg-zinc-950 border border-zinc-800 rounded-xl w-14 h-14">
                              <span className="text-[10px] font-black text-zinc-500 uppercase">{dataFormatada.split(' ')[1]}</span>
                              <span className="text-lg font-black text-zinc-200">{dataFormatada.split(' ')[0]}</span>
                            </div>
                            <div>
                              <p className="font-mono font-black text-white text-lg">{limparNomePedido(p.cliente)}</p>
                              <p className="text-[10px] text-zinc-400 font-mono mt-1 flex gap-2">
                                <span>{horaFormatada}</span> • <span className="text-blue-400 uppercase font-bold">{p.canal}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-black text-white font-mono text-lg">{(p.total_geral || 0).toFixed(2)}€</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${p.pago ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                              {p.pago ? 'Pago' : 'Pendente'}
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="bg-zinc-950 p-4 border-t border-zinc-800 space-y-3">
                            <div className="space-y-1">
                              {p.itens_pedido?.map(item => (
                                <div key={item.id} className="flex justify-between text-xs">
                                  <span className="text-zinc-300"><span className="text-zinc-500 mr-2">{item.quantidade}x</span> {limparNomeProduto(item.nome_produto)}</span>
                                  <span className="text-zinc-500 font-mono">{((item.quantidade || 0) * (item.preco_unitario || 0)).toFixed(2)}€</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                              <button onClick={() => abrirModalEdicao(p)} className="bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-xl text-xs font-bold">✏️ Editar</button>
                              <button onClick={() => excluirRegistroCaixa(p.id)} className="bg-red-950/30 text-red-400 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-900/30">🗑️ Apagar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* COLUNA LATERAL: TOP DE VENDAS E APURAMENTO FÍSICO */}
              <div className="space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6 shadow-xl space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-orange-400">🔥 Top de Vendas (Produtos)</h3>
                  {topProdutosVendas.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">Sem vendas no período.</p>
                  ) : (
                    <div className="space-y-3">
                      {topProdutosVendas.slice(0, 5).map((prod, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-zinc-950 p-3 rounded-2xl border border-zinc-800/80">
                          <div>
                            <p className="font-bold text-xs text-white">{prod.nome}</p>
                            <span className="text-[10px] text-zinc-400 font-mono">{prod.quantidade} unidades vendidas</span>
                          </div>
                          <span className="font-mono font-black text-orange-400 text-sm">{prod.faturacao.toFixed(2)}€</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6 shadow-xl space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200">💰 Apuramento Físico</h3>
                  <div className="divide-y divide-zinc-800">
                    {Object.entries(faturamentoPorMetodo).map(([metodo, valor]) => (
                      <div key={metodo} className="py-3 flex justify-between items-center text-sm">
                        <span className="text-zinc-300 font-bold">{metodo}</span>
                        <span className="font-black font-mono text-white text-base">{valor.toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ABA 2: RELATÓRIO DE BROWNIES */}
        {abaAtiva === 'brownies' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-end">
              <button 
                onClick={() => setModalDescarteAberto(true)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition-colors flex items-center gap-1.5"
              >
                <span>🗑️</span> Registar Descarte
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-lg">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Produzido</span>
                <span className="text-xl font-black text-blue-400">{resumoBrownies.totalProduzido} <span className="text-xs text-zinc-400">unid.</span></span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-lg">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Vendido</span>
                <span className="text-xl font-black text-white">{resumoBrownies.totalVendido} <span className="text-xs text-zinc-400">unid.</span></span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-lg">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Revenda</span>
                <span className="text-xl font-black text-purple-400">{resumoBrownies.totalRevenda} <span className="text-xs text-zinc-400">unid.</span></span>
              </div>
              <div className="bg-red-950/30 border border-red-900/40 p-4 rounded-2xl shadow-lg">
                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest block mb-1">Descarte</span>
                <span className="text-xl font-black text-red-400">{resumoBrownies.totalDescarte} <span className="text-xs text-red-300">unid.</span></span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-lg">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Faturação</span>
                <span className="text-xl font-black text-amber-400">{resumoBrownies.faturacaoBruta.toFixed(2)}€</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-lg">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Prejuízo Descarte</span>
                <span className="text-xl font-black text-red-500">{resumoBrownies.custoDescarteTotal.toFixed(2)}€</span>
              </div>
              <div className="bg-green-950/20 border border-green-900/40 p-4 rounded-2xl shadow-lg">
                <span className="text-[10px] font-black text-green-500 uppercase tracking-widest block mb-1">Ganho Líquido</span>
                <span className="text-xl font-black text-green-400">{resumoBrownies.ganhoLiquidoReal.toFixed(2)}€</span>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                <span>🍫</span> Cruzamento Completo: Produção, Vendas, Revenda e Descarte por Sabor
              </h2>
              <p className="text-xs text-zinc-400 mb-6">Acompanhe detalhadamente o volume que foi comercializado e o que foi descartado no período selecionado.</p>

              {rankingBrownies.length === 0 ? (
                <div className="text-center text-zinc-500 py-12 text-sm italic">Nenhum registo de brownies encontrado para este período.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase">
                        <th className="py-3 px-4 font-bold">Sabor do Brownie</th>
                        <th className="py-3 px-4 font-bold text-center">Produzido</th>
                        <th className="py-3 px-4 font-bold text-center">Vendido</th>
                        <th className="py-3 px-4 font-bold text-center">Revenda</th>
                        <th className="py-3 px-4 font-bold text-center text-red-400">Descarte</th>
                        <th className="py-3 px-4 font-bold text-right">Custo Insumos (Unit.)</th>
                        <th className="py-3 px-4 font-bold text-right">Faturação</th>
                        <th className="py-3 px-4 font-bold text-right">Ganho Líquido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-sm">
                      {rankingBrownies.map((b) => {
                        const totalSaidas = b.quantidadeVendida + b.qtdRevenda + b.qtdDescarte;
                        const custoTotalProd = totalSaidas * b.custoInsumosUnitario;
                        const ganhoLiq = b.faturacaoTotal - custoTotalProd;

                        return (
                          <tr key={b.chave} className="hover:bg-zinc-950/40 transition-colors">
                            <td className="py-4 px-4 font-bold text-white flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              {b.nome}
                            </td>
                            <td className="py-4 px-4 text-center font-mono text-blue-400 font-bold">{b.qtdProduzida}</td>
                            <td className="py-4 px-4 text-center font-mono text-zinc-300">{b.quantidadeVendida}</td>
                            <td className="py-4 px-4 text-center font-mono text-purple-400">{b.qtdRevenda}</td>
                            <td className="py-4 px-4 text-center font-mono text-red-400 font-bold">{b.qtdDescarte}</td>
                            <td className="py-4 px-4 text-right font-mono">
                              <div className="inline-flex items-center gap-1 bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1 focus-within:border-amber-500">
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  min="0"
                                  value={b.custoInsumosUnitario} 
                                  onChange={e => {
                                    const novoValor = parseFloat(e.target.value) || 0;
                                    setCustosEditaveis(prev => ({ ...prev, [b.chave]: novoValor }));
                                  }}
                                  className="w-16 bg-transparent text-right text-red-300 font-bold outline-none font-mono"
                                />
                                <span className="text-xs text-zinc-500">€</span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right font-mono text-amber-400 font-bold">{b.faturacaoTotal.toFixed(2)}€</td>
                            <td className="py-4 px-4 text-right font-mono font-black text-green-400">{ganhoLiq.toFixed(2)}€</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* MODAL DE REGISTO DE DESCARTE */}
      {modalDescarteAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-[32px] p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-black text-white">Registar Descarte / Quebra</h2>
            <form onSubmit={registarDescarte} className="space-y-4 text-sm">
              <div>
                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Sabor do Brownie</label>
                <input required type="text" placeholder="Ex: Brownie Ninho com Nutella" value={saborDescarte} onChange={e => setSaborDescarte(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Quantidade Descartada</label>
                <input required type="number" min="1" value={qtdDescarteInput} onChange={e => setQtdDescarteInput(parseInt(e.target.value) || 1)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono" />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Motivo</label>
                <input required type="text" value={motivoDescarte} onChange={e => setMotivoDescarte(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setModalDescarteAberto(false)} className="flex-1 bg-zinc-800 py-3 rounded-xl font-bold text-xs">Cancelar</button>
                <button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold text-xs">Registar Perda</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE PEDIDO */}
      {modalEdicaoAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-[32px] p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-black text-white">Corrigir Lançamento</h2>
            <form onSubmit={salvarAlteracoesFinanceiras} className="space-y-4 text-sm">
              <div>
                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Pedido</label>
                <input required type="text" value={editCliente} onChange={e => setEditCliente(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 uppercase font-bold mb-1">Valor (€)</label>
                <input required type="number" step="0.01" value={editTotal} onChange={e => setEditTotal(parseFloat(e.target.value) || 0)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setModalEdicaoAberto(false)} className="flex-1 bg-zinc-800 py-3 rounded-xl font-bold text-xs">Cancelar</button>
                <button type="submit" className="flex-1 bg-white text-zinc-950 py-3 rounded-xl font-bold text-xs">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}