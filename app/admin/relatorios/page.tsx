'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// --- INTERFACES ---
interface ItemPedido {
  id: string;
  codigo_produto: string;
  nome_produto: string;
  quantidade: number;
  preco_unitario: number;
}

interface Pedido {
  id: string;
  numero_pedido?: number | string;
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
  data_pedido?: string;
  itens_pedido?: ItemPedido[];
}

interface MovimentoCaixa {
  id: string;
  created_at: string;
  data_dia: string;
  tipo: 'Abertura' | 'Entrada' | 'Saida' | 'Fechamento';
  descricao: string;
  valor: number;
}

interface ResumoDia {
  data: string;
  abertura: number;
  entradas: number;
  saidas: number;
  esperado: number;
  fechamento: number | null;
  diferenca: number | null;
  movimentos: MovimentoCaixa[];
}

// --- COMPONENTE PRINCIPAL ---
export default function CentralRelatorios() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ESTADOS - DADOS BRUTOS
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [caixaBruta, setCaixaBruta] = useState<MovimentoCaixa[]>([]);
  const [produtosCatalogo, setProdutosCatalogo] = useState<any[]>([]);

  // ESTADOS - UI E FILTROS globais
  const [loading, setLoading] = useState(true);
  const [erroDB, setErroDB] = useState<string | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<'geral' | 'caixa'>('geral');

  // Filtros de Data
  const [tipoIntervalo, setTipoIntervalo] = useState<'dia' | 'mes' | 'ano' | 'personalizado'>('dia');
  const [dataUnica, setDataUnica] = useState(() => new Date().toISOString().split('T')[0]);
  const [dataInicio, setDataInicio] = useState(() => new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0]);
  const [mesSelecionado, setMesSelecionado] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });
  const [anoSelecionado, setAnoSelecionado] = useState(() => String(new Date().getFullYear()));

  // Filtros e Estados Específicos - FATURAÇÃO
  const [pedidosFiltrados, setPedidosFiltrados] = useState<Pedido[]>([]);
  const [filtroCanal, setFiltroCanal] = useState<string>('todos');
  const [filtroPagamento, setFiltroPagamento] = useState<string>('todos');
  const [termoBusca, setTermoBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<'recente' | 'antigo' | 'az' | 'za'>('za');
  const [pedidoExpandidoId, setPedidoExpandidoId] = useState<string | null>(null);
  
  // Filtro Específico para Categorias de Produtos
  const [filtroCategoriaProduto, setFiltroCategoriaProduto] = useState<string>('todas');

  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const [pedidoSendoEditado, setPedidoSendoEditado] = useState<Pedido | null>(null);
  const [editCliente, setEditCliente] = useState('');
  const [editTotal, setEditTotal] = useState(0);

  // Estados Específicos - CAIXA
  const [relatorioDias, setRelatorioDias] = useState<ResumoDia[]>([]);
  const [diaSelecionado, setDiaSelecionado] = useState<ResumoDia | null>(null);

  // --- UTILITÁRIOS ---
  const limparNomePedido = (nome: string | null | undefined) => {
    if (!nome) return "S/ Nome";
    const match = nome.match(/Pedido\s*#?(\d+)/i);
    if (match) return match[1]; 
    return nome;
  };

  const formatarDataBadge = (dataStr: string) => {
    if (!dataStr) return { dia: '--', mes: '---' };
    const [ano, mes, dia] = dataStr.substring(0, 10).split('-');
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    return { dia, mes: meses[parseInt(mes) - 1] || '---' };
  };

  const obterDataEfetiva = (p: Pedido) => p.data_pedido || p.criado_em || new Date().toISOString();

  const validarIntervaloData = (dataStr: string | null) => {
    if (!dataStr) return false;
    const itemDate = dataStr.substring(0, 10); 
    const itemMes = itemDate.substring(0, 7); 
    const itemAno = itemDate.substring(0, 4); 

    if (tipoIntervalo === 'dia') return itemDate === dataUnica;
    if (tipoIntervalo === 'mes') return itemMes === mesSelecionado;
    if (tipoIntervalo === 'ano') return itemAno === anoSelecionado;
    if (tipoIntervalo === 'personalizado') return itemDate >= dataInicio && itemDate <= dataFim;
    return true;
  };

  // --- CARREGAMENTO DE DADOS (GLOBAL) ---
  async function carregarRelatorios() {
    setLoading(true);
    setErroDB(null);

    try {
      const { data: pedidosData, error: errPed } = await supabase.from('pedidos').select('*').order('data_pedido', { ascending: false });
      if (errPed) throw new Error(`Falha na tabela 'pedidos': ${errPed.message}`);

      const { data: itensData, error: errItens } = await supabase.from('itens_pedido').select('*');
      if (errItens) throw new Error(`Falha na tabela 'itens_pedido': ${errItens.message}`);

      const { data: prodData, error: errProd } = await supabase.from('produtos').select('nome, custo_unitario');
      if (errProd) throw new Error(`Falha na tabela 'produtos': ${errProd.message}`);
      setProdutosCatalogo(prodData || []);

      const pedidosMapeados = (pedidosData || []).map((p: any) => ({
        ...p,
        itens_pedido: (itensData || []).filter((i: any) => i.pedido_id === p.id)
      }));
      setPedidos(pedidosMapeados);

      const { data: cData } = await supabase.from('caixa').select('*');
      setCaixaBruta(cData || []);

    } catch (err: any) {
      setErroDB(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarRelatorios(); }, []);

  // --- PROCESSAMENTO: FATURAÇÃO ---
  useEffect(() => {
    let resultado = [...pedidos];
    resultado = resultado.filter(p => validarIntervaloData(obterDataEfetiva(p)));

    if (filtroCanal !== 'todos') resultado = resultado.filter(p => p.canal === filtroCanal);
    if (filtroPagamento !== 'todos') resultado = resultado.filter(p => p.forma_pagamento === filtroPagamento);

    if (termoBusca.trim() !== '') {
      const termo = termoBusca.toLowerCase();
      resultado = resultado.filter(p => {
        const nomeLimpo = limparNomePedido(p.cliente).toLowerCase();
        const nomeOriginal = p.cliente ? p.cliente.toLowerCase() : '';
        const numPedido = p.numero_pedido ? String(p.numero_pedido) : '';
        return nomeLimpo.includes(termo) || nomeOriginal.includes(termo) || numPedido.includes(termo);
      });
    }

    resultado.sort((a, b) => {
      if (ordenacao === 'recente') return new Date(obterDataEfetiva(b)).getTime() - new Date(obterDataEfetiva(a)).getTime();
      if (ordenacao === 'antigo') return new Date(obterDataEfetiva(a)).getTime() - new Date(obterDataEfetiva(b)).getTime();
      if (ordenacao === 'az') return limparNomePedido(a.cliente).localeCompare(limparNomePedido(b.cliente), undefined, { numeric: true });
      if (ordenacao === 'za') return limparNomePedido(b.cliente).localeCompare(limparNomePedido(a.cliente), undefined, { numeric: true });
      return 0;
    });

    setPedidosFiltrados(resultado);
  }, [pedidos, tipoIntervalo, dataUnica, dataInicio, dataFim, mesSelecionado, anoSelecionado, filtroCanal, filtroPagamento, termoBusca, ordenacao]);

  // --- MOTOR MATEMÁTICO: DESCONSTRUÇÃO E AGRUPAMENTO DE PRODUTOS ---
  const topProdutosVendas = useMemo(() => {
    const mapa: Record<string, { nome: string; quantidade: number; faturacao: number; custoTotal: number; custoUnitario: number; categoria: string }> = {};
    
    // Mapear custos do catálogo
    const mapaCustos: Record<string, number> = {};
    produtosCatalogo.forEach(prod => {
      const nomeLower = (prod.nome || '').toLowerCase().trim();
      mapaCustos[nomeLower] = Number(prod.custo_unitario || 0);
    });

    const determinarCategoria = (nomeItem: string) => {
      const n = nomeItem.toLowerCase();
      if (n.includes('brownie') || n.includes('mousse') || n.includes('pudim') || n.includes('sobremesa') || n.includes('sensação') || n.includes('fudge') || n.includes('brigadeiro')) return 'sobremesa';
      if (n.includes('coca') || n.includes('água') || n.includes('agua') || n.includes('sumo') || n.includes('fanta') || n.includes('guaran') || n.includes('sprite') || n.includes('7up') || n.includes('nestea') || n.includes('ice tea') || n.includes('compal') || n.includes('bebida') || n.includes('cerveja')) return 'bebida';
      if (n.includes('calabresa') || n.includes('costela') || n.includes('frango') || n.includes('gratinado') || n.includes('strogonoff') || n.includes('misto') || n.includes('batata') || n.includes('camarão') || n.includes('camarao') || n.includes('carne') || n.includes('bolonhesa')) return 'batata';
      if (n.includes('combo') || n.includes('para dois') || n.includes('duplo') || n.includes('batatô10') || n.includes('batato10') || n.includes('batatô 10')) return 'combo';
      return 'outros';
    };

    const adicionarProduto = (nome: string, quantidade: number, faturacaoAdicional: number) => {
      let cleanName = nome.replace(/\s*\([^)]*\)/g, '').trim();
      if (!cleanName) cleanName = nome;
      
      const chave = cleanName.toLowerCase().trim();
      
      let custoUnitario = 0;
      if (mapaCustos[chave]) {
        custoUnitario = mapaCustos[chave];
      } else {
        const matchKey = Object.keys(mapaCustos).find(k => chave.includes(k) || k.includes(chave));
        if (matchKey) custoUnitario = mapaCustos[matchKey];
      }

      if (!mapa[chave]) {
        const nomeBonito = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        mapa[chave] = { 
          nome: nomeBonito, 
          quantidade: 0, 
          faturacao: 0,
          custoTotal: 0,
          custoUnitario: custoUnitario,
          categoria: determinarCategoria(cleanName) 
        };
      }
      mapa[chave].quantidade += quantidade;
      mapa[chave].faturacao += faturacaoAdicional;
      mapa[chave].custoTotal += (quantidade * custoUnitario);
    };

    pedidosFiltrados.forEach(p => {
      (p.itens_pedido || []).forEach(item => {
        const nomeOriginal = item.nome_produto || 'Produto';
        const qtdBase = Number(item.quantidade || 0);
        const fatBase = qtdBase * Number(item.preco_unitario || 0);
        const nomeLower = nomeOriginal.toLowerCase();
        
        const isCombo = nomeLower.includes('combo') || 
                        nomeLower.includes('para dois') || 
                        nomeLower.includes('duplo') ||
                        nomeLower.includes('batatô10') ||
                        nomeLower.includes('batato10') ||
                        nomeLower.includes('batatô 10') ||
                        nomeLower.includes('batato 10');

        if (isCombo) {
          let partesValidas: string[] = [];

          if (nomeOriginal.includes('(') && nomeOriginal.trim().endsWith(')')) {
            const firstParen = nomeOriginal.indexOf('(');
            const detailsStr = nomeOriginal.substring(firstParen + 1, nomeOriginal.length - 1);
            
            let depth = 0;
            let safeStr = "";
            for (let i=0; i<detailsStr.length; i++) {
                if(detailsStr[i] === '(') depth++;
                if(detailsStr[i] === ')') depth--;
                if(detailsStr[i] === ',' && depth === 0) safeStr += "|SPLIT|";
                else safeStr += detailsStr[i];
            }
            partesValidas = safeStr.split("|SPLIT|").map((str: string) => str.trim());
          } else if (nomeOriginal.includes(',')) {
            const splitComma = nomeOriginal.split(',');
            partesValidas = splitComma.slice(1).map((str: string) => str.trim());
          }

          partesValidas = partesValidas.filter((str: string) => !str.includes('🔻') && !str.toLowerCase().includes('desconto'));

          if (partesValidas.length > 0) {
            const fatPorItem = fatBase / partesValidas.length;

            partesValidas.forEach((parte: string) => {
              let cleanName = parte.replace(/\s*\([^)]*\)/g, '').trim(); 
              
              let qtdMulti = 1;
              const matchXStart = cleanName.match(/^(\d+)\s*[xX]\s+(.*)$/i);
              const matchXEnd = cleanName.match(/^(.*?)\s+(\d+)\s*[xX]$/i);

              if (matchXStart) {
                  qtdMulti = parseInt(matchXStart[1], 10);
                  cleanName = matchXStart[2].trim();
              } else if (matchXEnd) {
                  cleanName = matchXEnd[1].trim();
                  qtdMulti = parseInt(matchXEnd[2], 10);
              }

              if (!cleanName) cleanName = "Item de Combo";
              adicionarProduto(cleanName, qtdBase * qtdMulti, fatPorItem);
            });
          } else {
            if (nomeLower.includes('para dois') || nomeLower.includes('duplo')) {
              adicionarProduto("Batata (Escolha do Cliente)", qtdBase * 2, fatBase * 0.7);
              adicionarProduto("Bebida 1L (Escolha do Cliente)", qtdBase * 1, fatBase * 0.3);
            } else if (nomeLower.includes('10')) {
              adicionarProduto("Batata Genérica (do Batatô10)", qtdBase * 1, fatBase * 0.8);
              adicionarProduto("Bebida Genérica (do Batatô10)", qtdBase * 1, fatBase * 0.2);
            } else {
              adicionarProduto("Item Genérico (Múltiplo)", qtdBase * 2, fatBase);
            }
          }
        } else {
          // PRODUTO NORMAL AVULSO
          adicionarProduto(nomeOriginal, qtdBase, fatBase);
        }
      });
    });

    return Object.values(mapa).sort((a, b) => b.quantidade - a.quantidade);
  }, [pedidosFiltrados, produtosCatalogo]);

  // APLICA O FILTRO DA UI NA LISTA DE PRODUTOS
  const produtosVendidosFiltrados = useMemo(() => {
    if (filtroCategoriaProduto === 'todas') return topProdutosVendas;
    return topProdutosVendas.filter(p => p.categoria === filtroCategoriaProduto);
  }, [topProdutosVendas, filtroCategoriaProduto]);

  // CÁLCULO DOS TOTAIS ESPECÍFICOS DA CATEGORIA FILTRADA
  const totaisFiltrados = useMemo(() => {
    return produtosVendidosFiltrados.reduce((acc, item) => {
      acc.quantidade += item.quantidade;
      acc.faturacao += item.faturacao;
      acc.custo += item.custoTotal;
      return acc;
    }, { quantidade: 0, faturacao: 0, custo: 0 });
  }, [produtosVendidosFiltrados]);

  // --- TOTAIS RIGOROSOS DA FATURAÇÃO GERAL ---
  const totalFaturadoBruto = pedidosFiltrados.reduce((acc, p) => acc + Number(p.total_geral || 0), 0);
  const totalRecebido = pedidosFiltrados.filter(p => p.pago).reduce((acc, p) => acc + Number(p.total_geral || 0), 0);
  const totalPendente = pedidosFiltrados.filter(p => !p.pago).reduce((acc, p) => acc + Number(p.total_geral || 0), 0);
  const totalTaxasEntrega = pedidosFiltrados.reduce((acc, p) => acc + Number(p.taxa_entrega || 0), 0);
  
  const totalItensVendidosGeral = useMemo(() => {
    return topProdutosVendas.reduce((acc, p) => acc + p.quantidade, 0);
  }, [topProdutosVendas]);

  // --- PROCESSAMENTO: CAIXA ---
  useEffect(() => {
    const movimentosManuais = caixaBruta.filter(c => validarIntervaloData(c.data_dia)).map(m => ({
      ...m, valor: Number(m.valor)
    }));

    const movimentosPDV = pedidos.filter(p => 
      validarIntervaloData(obterDataEfetiva(p)) && 
      p.pago && 
      (p.forma_pagamento === 'Dinheiro' || p.forma_pagamento === 'Dinheiro Glovo')
    ).map(p => ({
      id: p.id,
      created_at: obterDataEfetiva(p),
      data_dia: obterDataEfetiva(p).substring(0, 10),
      tipo: 'Entrada' as const,
      descricao: `Venda PDV #${p.numero_pedido || 'S/N'} (${p.canal}) - ${p.forma_pagamento}`,
      valor: Number(p.total_geral)
    }));

    const caixaUnificada = [...movimentosManuais, ...movimentosPDV];

    const diasMap = new Map<string, ResumoDia>();
    caixaUnificada.forEach(mov => {
      if (!diasMap.has(mov.data_dia)) {
        diasMap.set(mov.data_dia, { data: mov.data_dia, abertura: 0, entradas: 0, saidas: 0, esperado: 0, fechamento: null, diferenca: null, movimentos: [] });
      }
      
      const dia = diasMap.get(mov.data_dia)!;
      dia.movimentos.push(mov);

      if (mov.tipo === 'Abertura') dia.abertura += mov.valor;
      else if (mov.tipo === 'Entrada') dia.entradas += mov.valor;
      else if (mov.tipo === 'Saida') dia.saidas += mov.valor;
      else if (mov.tipo === 'Fechamento') dia.fechamento = mov.valor;
    });

    const arrayFinal = Array.from(diasMap.values()).map(dia => {
      const esperado = dia.abertura + dia.entradas - dia.saidas;
      const diferenca = dia.fechamento !== null ? dia.fechamento - esperado : null;
      return { ...dia, esperado, diferenca };
    });

    arrayFinal.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    setRelatorioDias(arrayFinal);
  }, [caixaBruta, pedidos, tipoIntervalo, dataUnica, dataInicio, dataFim, mesSelecionado, anoSelecionado]);

  const totalEntradasCaixa = relatorioDias.reduce((acc, dia) => acc + dia.entradas, 0);
  const totalDespesasCaixa = relatorioDias.reduce((acc, dia) => acc + dia.saidas, 0);
  const balancoDiferencasCaixa = relatorioDias.reduce((acc, dia) => acc + (dia.diferenca || 0), 0);

  // --- ACÇÕES E EVENTOS ---
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
      const { error } = await supabase.from('pedidos').update({ cliente: editCliente, total_geral: Number(editTotal) }).eq('id', pedidoSendoEditado.id);
      if (error) throw error;
      alert('Atualizado com sucesso!');
      setModalEdicaoAberto(false);
      carregarRelatorios();
    } catch (err: any) { alert(`Erro: ${err.message}`); }
  };

  const excluirRegistroCaixa = async (id: string) => {
    if (!confirm('Deseja eliminar este registo de forma definitiva?')) return;
    try {
      const { error } = await supabase.from('pedidos').delete().eq('id', id);
      if (error) throw error;
      setPedidoExpandidoId(null);
      carregarRelatorios();
    } catch (err: any) { alert(`Erro: ${err.message}`); }
  };

  // Exportação Inteligente NATIVA para Excel (Via CSV Ponto e Vírgula - Sem erros no código)
  const exportarExcelCSV = () => {
    let csv = '\uFEFF'; // BOM tag garante leitura perfeita de acentos e cê-cedilhas no Excel
    const fmtEuros = (valor: number) => valor.toFixed(2).replace('.', ','); // Troca para formato Europeu

    // 1. Resumo
    csv += "=== RESUMO GERAL ===\n";
    csv += "Métrica;Valor\n";
    csv += `Nº Pedidos;${pedidosFiltrados.length}\n`;
    csv += `Itens Totais ${labelPeriodo};${totalItensVendidosGeral}\n`;
    csv += `Faturado Bruto (€);${fmtEuros(totalFaturadoBruto)}\n`;
    csv += `Caixa Realizado (€);${fmtEuros(totalRecebido)}\n`;
    csv += `Fiado Pendente (€);${fmtEuros(totalPendente)}\n`;
    csv += `Custos Entrega (€);${fmtEuros(totalTaxasEntrega)}\n\n`;

    // 2. Produtos
    csv += `=== PRODUTOS PRODUZIDOS / VENDIDOS (Filtro: ${filtroCategoriaProduto.toUpperCase()}) ===\n`;
    csv += "Categoria;Produto;Quantidade;Custo Unitário (€);Custo Total (€);Faturado (€)\n";
    produtosVendidosFiltrados.forEach(p => {
      csv += `${p.categoria.toUpperCase()};${p.nome};${p.quantidade};${fmtEuros(p.custoUnitario)};${fmtEuros(p.custoTotal)};${fmtEuros(p.faturacao)}\n`;
    });
    csv += `TOTAIS FILTRADOS;-;${totaisFiltrados.quantidade};-;${fmtEuros(totaisFiltrados.custo)};${fmtEuros(totaisFiltrados.faturacao)}\n\n`;

    // 3. Pedidos
    csv += "=== LANÇAMENTOS DE PEDIDOS ===\n";
    csv += "Data;Hora;Pedido;Cliente;Canal;Pagamento;Estado;Total (€)\n";
    pedidosFiltrados.forEach(p => {
      const d = new Date(obterDataEfetiva(p));
      csv += `${d.toLocaleDateString('pt-PT')};${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })};${p.numero_pedido || 'S/N'};${limparNomePedido(p.cliente)};${p.canal};${p.forma_pagamento};${p.pago ? 'Pago' : 'Pendente'};${fmtEuros(p.total_geral)}\n`;
    });
    csv += "\n";

    // 4. Caixa
    csv += "=== AUDITORIA DE CAIXA ===\n";
    csv += "Data;Abertura (€);Entradas (€);Saídas (€);Saldo Esperado (€);Contado Gaveta (€);Diferença (€)\n";
    relatorioDias.forEach(dia => {
      const pendente = dia.fechamento === null;
      csv += `${new Date(dia.data).toLocaleDateString('pt-PT')};${fmtEuros(dia.abertura)};${fmtEuros(dia.entradas)};${fmtEuros(dia.saidas)};${fmtEuros(dia.esperado)};${pendente ? 'Em Aberto' : fmtEuros(dia.fechamento!)};${pendente ? '---' : fmtEuros(dia.diferenca!)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const periodoStr = tipoIntervalo === 'dia' ? dataUnica : tipoIntervalo === 'personalizado' ? `${dataInicio}_a_${dataFim}` : 'Relatorio';
    link.setAttribute("download", `ChefBatato_Export_${periodoStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportarPDF = () => {
    window.print();
  };

  const labelPeriodo = tipoIntervalo === 'dia' ? '(Dia)' : 
                       tipoIntervalo === 'mes' ? '(Mês)' : 
                       tipoIntervalo === 'ano' ? '(Ano)' : '(Período)';

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body, html { background-color: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:text-black { color: #000 !important; }
          .print\\:bg-white { background-color: #fff !important; }
          .print\\:border-gray-300 { border-color: #d1d5db !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:overflow-visible { overflow: visible !important; height: auto !important; max-height: none !important; }
        }
      `}} />

      <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24 selection:bg-orange-500/30 print:bg-white print:text-black">
        
        {/* CABEÇALHO COM NOVOS BOTÕES */}
        <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
              <span className="text-xl">📊</span>
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Central de Relatórios</h1>
              <p className="text-[10px] text-zinc-400 font-medium">Faturação e Auditoria de Caixa</p>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full xl:w-auto">
            <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800 overflow-x-auto custom-scrollbar flex-1 xl:flex-none">
              <button onClick={() => setAbaAtiva('geral')} className={`px-5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${abaAtiva === 'geral' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'}`}>
                📋 Faturação Geral
              </button>
              <button onClick={() => setAbaAtiva('caixa')} className={`px-5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${abaAtiva === 'caixa' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'}`}>
                💶 Auditoria de Caixa
              </button>
            </div>
            
            <div className="flex gap-2">
              <button onClick={exportarExcelCSV} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-2 whitespace-nowrap">
                📊 Exportar Excel
              </button>
              <button onClick={exportarPDF} className="bg-white hover:bg-zinc-200 text-zinc-900 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-2 whitespace-nowrap">
                🖨️ Exportar PDF
              </button>
            </div>
          </div>
        </header>

        {/* CABEÇALHO PDF */}
        <div className="hidden print:block mb-8 border-b-2 border-black pb-4 mt-8 px-8">
          <h1 className="text-3xl font-black text-black uppercase tracking-widest">Relatório Chef Batatô</h1>
          <p className="text-sm font-bold text-gray-600">
            Período analisado: {tipoIntervalo === 'dia' ? new Date(dataUnica).toLocaleDateString('pt-PT') : 
                                tipoIntervalo === 'personalizado' ? `${new Date(dataInicio).toLocaleDateString('pt-PT')} a ${new Date(dataFim).toLocaleDateString('pt-PT')}` : 
                                'Filtro Aplicado'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Gerado em: {new Date().toLocaleString('pt-PT')}</p>
        </div>

        {erroDB && (
          <div className="m-5 bg-red-950/40 border border-red-900 p-5 rounded-[24px] print:hidden">
            <h2 className="text-red-500 font-bold text-sm uppercase tracking-wider mb-2">⚠️ Erro de Ligação</h2>
            <code className="block bg-black/50 p-3 rounded-lg text-red-400 font-mono text-xs">{erroDB}</code>
          </div>
        )}

        <main className="flex-1 p-5 space-y-6 max-w-7xl mx-auto w-full print:p-0 print:max-w-full">
          
          {/* BARRA DE FILTROS */}
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl flex flex-col lg:flex-row justify-between items-center gap-4 print:hidden">
            <div className="flex flex-wrap bg-zinc-950 p-1 rounded-2xl border border-zinc-800 w-full lg:w-auto justify-center">
              <button onClick={() => setTipoIntervalo('dia')} className={`flex-1 lg:flex-initial px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tipoIntervalo === 'dia' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>Por Dia</button>
              <button onClick={() => setTipoIntervalo('mes')} className={`flex-1 lg:flex-initial px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tipoIntervalo === 'mes' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>Por Mês</button>
              <button onClick={() => setTipoIntervalo('ano')} className={`flex-1 lg:flex-initial px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tipoIntervalo === 'ano' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>Por Ano</button>
              <button onClick={() => setTipoIntervalo('personalizado')} className={`flex-1 lg:flex-initial px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tipoIntervalo === 'personalizado' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>De - Até</button>
            </div>

            <div className="w-full lg:w-auto flex flex-wrap items-center justify-center lg:justify-end gap-3">
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
                    <option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option>
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

          {abaAtiva === 'geral' && (
            <div className="space-y-6 animate-in fade-in duration-300 print:space-y-8">
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 print:gap-2 print:grid-cols-3">
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between print:bg-white print:border-gray-300 print:shadow-none print:rounded-lg">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest print:text-gray-500">Nº Pedidos</span>
                  <span className="text-3xl font-black text-white font-mono mt-2 print:text-black">{pedidosFiltrados.length}</span>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between print:bg-white print:border-gray-300 print:shadow-none print:rounded-lg">
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest print:text-gray-500">Itens Totais {labelPeriodo}</span>
                  <span className="text-3xl font-black text-white font-mono mt-2 print:text-black">{totalItensVendidosGeral}</span>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between print:bg-white print:border-gray-300 print:shadow-none print:rounded-lg">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest print:text-gray-500">Fatur. Bruto</span>
                  <span className="text-3xl font-black text-amber-400 font-mono mt-2 print:text-black">{totalFaturadoBruto.toFixed(2)}€</span>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between print:bg-white print:border-gray-300 print:shadow-none print:rounded-lg">
                  <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest print:text-gray-500">Caixa Realizado</span>
                  <span className="text-2xl font-black text-green-400 font-mono mt-2 print:text-black">{totalRecebido.toFixed(2)}€</span>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between print:bg-white print:border-gray-300 print:shadow-none print:rounded-lg">
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest print:text-gray-500">Fiado Pendente</span>
                  <span className="text-2xl font-black text-red-400 font-mono mt-2 print:text-black">{totalPendente.toFixed(2)}€</span>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between print:bg-white print:border-gray-300 print:shadow-none print:rounded-lg">
                  <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest print:text-gray-500">Custos Entrega</span>
                  <span className="text-2xl font-black text-orange-400 font-mono mt-2 print:text-black">{totalTaxasEntrega.toFixed(2)}€</span>
                </div>
              </div>

              <div className="bg-zinc-900/40 p-5 rounded-3xl border border-zinc-800/60 space-y-4 print:hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Pesquisa de Pedidos</span>
                    <input type="text" placeholder="Número do pedido ou cliente..." value={termoBusca} onChange={e => setTermoBusca(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs font-bold text-zinc-200 outline-none focus:border-blue-500 font-mono" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <select value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none">
                      <option value="todos">Canais</option><option value="Balcão">Balcão</option><option value="WhatsApp">WhatsApp</option><option value="Glovo">Glovo</option><option value="Palmbites">Palmbites</option>
                    </select>
                    <select value={filtroPagamento} onChange={e => setFiltroPagamento(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none">
                      <option value="todos">Pagamentos</option><option value="Dinheiro">Dinheiro</option><option value="MBWay">MBWay</option><option value="Multibanco">Multibanco</option><option value="Caderninho">Caderninho</option>
                    </select>
                    <select value={ordenacao} onChange={e => setOrdenacao(e.target.value as any)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none">
                      <option value="za">Z-A</option><option value="az">A-Z</option><option value="recente">Recentes</option><option value="antigo">Antigos</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:grid-cols-1 print:gap-8">
                
                {/* LADO ESQUERDO: LISTA DE FATURAS */}
                <div className="lg:col-span-2 space-y-3 print:hidden">
                  <h3 className="text-sm font-black uppercase text-zinc-300 tracking-wider">📦 Lançamentos Brutos ({pedidosFiltrados.length})</h3>
                  {loading ? <div className="text-center p-10 text-zinc-500">A processar...</div> : pedidosFiltrados.length === 0 ? (
                    <div className="text-center p-10 bg-zinc-900/30 rounded-3xl border border-zinc-800 text-zinc-500 text-sm">Nenhuma venda encontrada.</div>
                  ) : (
                    pedidosFiltrados.map(p => {
                      const isExpanded = pedidoExpandidoId === p.id;
                      const dataEfetiva = obterDataEfetiva(p);
                      const badge = formatarDataBadge(dataEfetiva);
                      const horaFormatada = new Date(dataEfetiva).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                      
                      return (
                        <div key={p.id} className="bg-zinc-900/60 border border-zinc-800 rounded-[24px] overflow-hidden">
                          <div onClick={() => setPedidoExpandidoId(isExpanded ? null : p.id)} className="p-4 cursor-pointer hover:bg-zinc-800/40 flex items-center justify-between">
                            <div className="flex gap-4 items-center">
                              <div className="flex flex-col items-center justify-center bg-zinc-950 border border-zinc-800 rounded-xl w-14 h-14">
                                <span className="text-[10px] font-black text-zinc-500 uppercase">{badge.mes}</span>
                                <span className="text-lg font-black text-zinc-200">{badge.dia}</span>
                              </div>
                              <div>
                                <p className="font-mono font-black text-white text-lg">{p.numero_pedido ? `#${p.numero_pedido} - ` : ''}{limparNomePedido(p.cliente)}</p>
                                <p className="text-[10px] text-zinc-400 font-mono mt-1 flex gap-2"><span>{horaFormatada}</span> • <span className="text-blue-400 uppercase font-bold">{p.canal}</span></p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-black text-white font-mono text-lg">{(p.total_geral || 0).toFixed(2)}€</span>
                              <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${p.pago ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{p.pago ? 'Pago' : 'Pendente'}</span>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="bg-zinc-950 p-4 border-t border-zinc-800 space-y-3">
                              <div className="space-y-1">
                                {p.itens_pedido?.map(item => (
                                  <div key={item.id} className="flex justify-between text-xs">
                                    <span className="text-zinc-300"><span className="text-zinc-500 mr-2">{item.quantidade}x</span> {item.nome_produto}</span>
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

                {/* LADO DIREITO: LISTA DE PRODUTOS */}
                <div className="space-y-6 print:col-span-full">
                  <div className="bg-[#111113] border border-zinc-800 rounded-[32px] p-6 shadow-xl flex flex-col h-[700px] print:bg-white print:border-none print:shadow-none print:p-0 print:h-auto print:overflow-visible">
                    
                    <div className="flex items-center gap-2 mb-6">
                      <span className="text-xl">🔥</span>
                      <h3 className="text-lg font-black uppercase tracking-wider text-orange-500 print:text-black">
                        Itens Produzidos / Vendidos
                      </h3>
                    </div>
                    
                    <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 mb-4 flex flex-col gap-4 print:hidden">
                      <div>
                        <label className="block text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2">Filtrar Categoria:</label>
                        <select 
                          value={filtroCategoriaProduto} 
                          onChange={e => setFiltroCategoriaProduto(e.target.value)} 
                          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-sm font-bold text-white outline-none focus:border-orange-500 w-full sm:w-auto min-w-[200px]"
                        >
                          <option value="todas">Todas as Categorias</option>
                          <option value="batata">🥔 Batatas / Recheios</option>
                          <option value="sobremesa">🍫 Sobremesas</option>
                          <option value="bebida">🥤 Bebidas</option>
                          <option value="combo">🎁 Combos (Capas)</option>
                          <option value="outros">📦 Outros</option>
                        </select>
                      </div>

                      <div className="flex gap-2 overflow-x-auto custom-scrollbar">
                        <div className="flex-1 bg-[#1a1a1c] p-3 rounded-xl border border-zinc-800/80 min-w-[100px]">
                          <span className="block text-[9px] text-zinc-500 uppercase font-bold tracking-widest mb-1">QTD Total</span>
                          <span className="text-xl font-black text-white">{totaisFiltrados.quantidade}</span>
                        </div>
                        <div className="flex-1 bg-green-950/20 p-3 rounded-xl border border-green-900/30 min-w-[120px]">
                          <span className="block text-[9px] text-green-500/70 uppercase font-bold tracking-widest mb-1">Faturado</span>
                          <span className="text-xl font-black font-mono text-green-400">{totaisFiltrados.faturacao.toFixed(2)}€</span>
                        </div>
                        <div className="flex-1 bg-red-950/20 p-3 rounded-xl border border-red-900/30 min-w-[120px]">
                          <span className="block text-[9px] text-red-500/70 uppercase font-bold tracking-widest mb-1">Custo Total</span>
                          <span className="text-xl font-black font-mono text-red-400">{totaisFiltrados.custo.toFixed(2)}€</span>
                        </div>
                      </div>
                    </div>

                    <div className="hidden print:block text-sm font-bold text-black border-b border-black pb-2 mb-4">
                      <div className="flex justify-between items-end">
                        <span>Categoria Filtrada: {filtroCategoriaProduto.toUpperCase()}</span>
                        <span className="font-mono text-xs">
                          Qtd: {totaisFiltrados.quantidade} | Custo: {totaisFiltrados.custo.toFixed(2)}€ | Faturado: {totaisFiltrados.faturacao.toFixed(2)}€
                        </span>
                      </div>
                    </div>
                    
                    {produtosVendidosFiltrados.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic print:text-black">Sem vendas para esta categoria no período.</p>
                    ) : (
                      <div className="space-y-3 overflow-y-auto custom-scrollbar pr-2 flex-1 pb-4 print:overflow-visible print:pr-0">
                        {produtosVendidosFiltrados.map((prod, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-zinc-950 p-4 rounded-2xl border border-zinc-800 hover:border-zinc-700 transition-colors gap-3 print:bg-white print:border-b print:border-gray-300 print:rounded-none print:p-2">
                            
                            <div className="flex flex-col flex-1">
                              <span className="font-bold text-sm text-white leading-tight capitalize print:text-black">{prod.nome}</span>
                              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5 print:text-gray-500">{prod.categoria}</span>
                            </div>
                            
                            <div className="flex items-center gap-4 sm:gap-6 justify-between sm:justify-end border-t border-zinc-800/50 pt-3 sm:pt-0 sm:border-0 print:border-0 print:pt-0">
                              
                              <div className="text-left flex flex-col justify-center">
                                <span className="text-[9px] text-zinc-500 uppercase tracking-widest print:text-gray-600">Custo Un./Tot.</span>
                                <span className="font-mono font-bold text-red-400 text-sm print:text-red-600">
                                  {prod.custoUnitario.toFixed(2)}€ <span className="text-zinc-600 font-normal print:text-gray-400">/ {prod.custoTotal.toFixed(2)}€</span>
                                </span>
                              </div>
                              
                              <div className="text-right flex flex-col justify-center print:hidden">
                                <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Faturado</span>
                                <span className="font-mono font-bold text-green-400 text-sm">{prod.faturacao.toFixed(2)}€</span>
                              </div>
                              
                              <div className="text-center flex flex-col justify-center min-w-[2.5rem]">
                                <span className="text-[9px] text-zinc-500 uppercase tracking-widest print:text-gray-600">Qtd</span>
                                <span className="font-black text-lg text-white print:text-black">{prod.quantidade}</span>
                              </div>
                              
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- ABA 2: AUDITORIA DE CAIXA ---------------- */}
          {abaAtiva === 'caixa' && (
            <div className="space-y-6 animate-in fade-in duration-300 print:space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-4">
                <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center print:bg-white print:border-gray-300 print:rounded-lg">
                  <span className="text-[10px] font-bold text-green-500/80 uppercase tracking-widest print:text-gray-500">Total Entradas (Período)</span>
                  <div className="text-3xl font-black text-green-400 font-mono mt-2 tracking-tighter print:text-black">+ {totalEntradasCaixa.toFixed(2)}€</div>
                </div>
                <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center print:bg-white print:border-gray-300 print:rounded-lg">
                  <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest print:text-gray-500">Total Saídas / Despesas</span>
                  <div className="text-3xl font-black text-red-400 font-mono mt-2 tracking-tighter print:text-black">- {totalDespesasCaixa.toFixed(2)}€</div>
                </div>
                <div className={`border p-6 rounded-[32px] shadow-xl flex flex-col justify-center print:bg-white print:border-gray-300 print:rounded-lg ${balancoDiferencasCaixa < 0 ? 'bg-red-950/20 border-red-900/50' : balancoDiferencasCaixa > 0 ? 'bg-emerald-950/20 border-emerald-900/50' : 'bg-zinc-900 border-zinc-800/80'}`}>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex justify-between print:text-gray-500"><span>Balanço de Quebras/Sobras</span></span>
                  <div className={`text-3xl font-black font-mono mt-2 tracking-tighter print:text-black ${balancoDiferencasCaixa < 0 ? 'text-red-400' : balancoDiferencasCaixa > 0 ? 'text-emerald-400' : 'text-white'}`}>
                    {balancoDiferencasCaixa > 0 ? '+' : ''}{balancoDiferencasCaixa.toFixed(2)}€
                  </div>
                  <p className="text-[9px] text-zinc-500 mt-2 print:text-gray-400">Diferença acumulada entre o esperado e o contado na gaveta.</p>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl print:bg-white print:border-none print:shadow-none">
                <div className="p-5 border-b border-zinc-800/80 bg-zinc-950/50 print:bg-white print:border-b-2 print:border-black print:p-0 print:pb-2">
                  <h3 className="text-xs font-black uppercase text-zinc-400 tracking-widest print:text-black print:text-lg">Extrato Diário do Caixa</h3>
                </div>
                <div className="overflow-x-auto print:overflow-visible">
                  {loading ? <div className="p-12 text-center text-zinc-500 font-bold uppercase text-xs animate-pulse">A calcular dados...</div> : relatorioDias.length === 0 ? <div className="p-12 text-center text-zinc-600 italic">Nenhum registo de caixa encontrado nestas datas.</div> : (
                    <table className="w-full text-left text-xs whitespace-nowrap print:text-sm print:w-full">
                      <thead className="bg-zinc-950/80 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800 print:bg-white print:text-black print:border-black">
                        <tr>
                          <th className="p-4 print:px-2">Data</th><th className="p-4 text-right print:px-2">Abertura</th><th className="p-4 text-right text-green-500/70 print:text-black print:px-2">Entradas</th><th className="p-4 text-right text-red-500/70 print:text-black print:px-2">Saídas</th><th className="p-4 text-right bg-indigo-950/20 text-indigo-400 print:bg-white print:text-black print:px-2">Saldo Esperado</th><th className="p-4 text-right text-white print:text-black print:px-2">Contado na Gaveta</th><th className="p-4 text-center print:px-2">Diferença</th><th className="p-4 text-center print:hidden">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50 font-medium print:divide-gray-300">
                        {relatorioDias.map((dia) => {
                          const pendente = dia.fechamento === null;
                          const bateuCerto = dia.diferenca === 0;
                          const quebra = !pendente && dia.diferenca! < 0;

                          return (
                            <tr key={dia.data} className="hover:bg-zinc-800/30 transition-colors print:hover:bg-transparent">
                              <td className="p-4 text-white font-bold print:text-black print:px-2">{new Date(dia.data).toLocaleDateString('pt-PT')}</td>
                              <td className="p-4 text-right font-mono text-zinc-400 print:text-black print:px-2">{dia.abertura.toFixed(2)}€</td>
                              <td className="p-4 text-right font-mono text-green-400 print:text-black print:px-2">{dia.entradas.toFixed(2)}€</td>
                              <td className="p-4 text-right font-mono text-red-400 print:text-black print:px-2">{dia.saidas.toFixed(2)}€</td>
                              <td className="p-4 text-right font-mono font-black text-indigo-400 bg-indigo-950/10 print:bg-white print:text-black print:px-2">{dia.esperado.toFixed(2)}€</td>
                              <td className="p-4 text-right font-mono font-black text-white print:text-black print:px-2">{pendente ? <span className="text-zinc-600 text-[10px] uppercase print:text-gray-500">Em Aberto</span> : `${dia.fechamento?.toFixed(2)}€`}</td>
                              <td className="p-4 text-center print:px-2">
                                {pendente ? <span className="text-zinc-600 print:text-gray-500">---</span> : bateuCerto ? <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded text-[10px] uppercase font-bold tracking-widest print:bg-white print:text-black print:border-none">✅ Exato</span> : quebra ? <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded font-mono font-black print:bg-white print:text-black print:border-none">{dia.diferenca?.toFixed(2)}€</span> : <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded font-mono font-black print:bg-white print:text-black print:border-none">+{dia.diferenca?.toFixed(2)}€</span>}
                              </td>
                              <td className="p-4 text-center print:hidden">
                                <button onClick={() => setDiaSelecionado(dia)} className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors">Ver Extrato</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

        </main>

        {/* MODAIS */}
        {modalEdicaoAberto && (
          <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 print:hidden">
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

        {/* MODAL DE EXTRATO DE CAIXA */}
        {diaSelecionado && (
          <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-end md:justify-center items-center p-0 md:p-4 animate-in fade-in duration-200 print:hidden">
            <div className="bg-zinc-900 w-full md:max-w-2xl rounded-t-[32px] md:rounded-[32px] flex flex-col overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)] border border-zinc-800 max-h-[90vh]">
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
                <div>
                  <h2 className="text-xl font-black text-white">Extrato de Movimentos</h2>
                  <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mt-1">{new Date(diaSelecionado.data).toLocaleDateString('pt-PT')}</p>
                </div>
                <button onClick={() => setDiaSelecionado(null)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white">✕</button>
              </div>
              <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-1">
                {diaSelecionado.movimentos.length === 0 ? <p className="text-center text-zinc-500 py-10 text-sm italic">Sem movimentos detalhados.</p> : (
                  diaSelecionado.movimentos.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map(mov => {
                    const iconMov = mov.tipo === 'Abertura' ? '🔓' : mov.tipo === 'Entrada' ? '💵' : mov.tipo === 'Saida' ? '📉' : '🔒';
                    const corValor = mov.tipo === 'Saida' ? 'text-red-400' : mov.tipo === 'Fechamento' ? 'text-zinc-400' : 'text-green-400';
                    const sinal = mov.tipo === 'Saida' ? '-' : mov.tipo === 'Fechamento' ? '=' : '+';
                    return (
                      <div key={mov.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/60 flex justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-sm">{iconMov}</div>
                          <div>
                            <p className="text-xs font-bold text-white leading-tight">{mov.descricao}</p>
                            <p className="text-[9px] text-zinc-500 font-mono mt-0.5">{new Date(mov.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} • {mov.tipo}</p>
                          </div>
                        </div>
                        <div className={`font-mono font-black text-sm whitespace-nowrap ${corValor}`}>{sinal}{Number(mov.valor).toFixed(2)}€</div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="p-5 border-t border-zinc-800 bg-zinc-950/80">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold text-zinc-400 uppercase tracking-widest text-[10px]">Resultado da Auditoria:</span>
                  {diaSelecionado.fechamento === null ? <span className="font-bold text-zinc-500">Caixa não fechada</span> : diaSelecionado.diferenca === 0 ? <span className="font-black text-green-400">✅ Valores Exatos</span> : diaSelecionado.diferenca! < 0 ? <span className="font-black text-red-500">Falta {Math.abs(diaSelecionado.diferenca!).toFixed(2)}€</span> : <span className="font-black text-emerald-500">Sobra {diaSelecionado.diferenca!.toFixed(2)}€</span>}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}