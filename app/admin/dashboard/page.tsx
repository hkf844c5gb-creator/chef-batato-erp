'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface RankingVenda {
  nome: string;
  quantidade: number;
  categoria: string;
}

export default function DashboardPage() {
  const [dataInicio, setDataInicio] = useState(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    return `${ano}-${mes}-01`;
  });

  const [dataFim, setDataFim] = useState(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  });

  const [loading, setLoading] = useState(true);
  const [metricas, setMetricas] = useState({
    faturacaoBruta: 0,
    faturacaoLiquida: 0, 
    custosOperacionais: 0,
    repasseEstafetas: 0,
    custoTotalItens: 0,
    totalTaxasEntrega: 0,
    totalDescontos: 0,
    lucroLiquido: 0,
    margemLucro: 0,
    totalPedidos: 0,
    entregasEfetuadas: 0,
    volumeTakeaway: 0,
    ticketMedio: 0
  });

  const [dadosCanal, setDadosCanal] = useState<any[]>([]);
  const [dadosPagamento, setDadosPagamento] = useState<any[]>([]);

  const [topBatatas, setTopBatatas] = useState<RankingVenda[]>([]);
  const [topSobremesas, setTopSobremesas] = useState<RankingVenda[]>([]);
  const [topBebidas, setTopBebidas] = useState<RankingVenda[]>([]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function carregarDados() {
    try {
      const { data: todosPedidos, error: erroPedidos } = await supabase
        .from('pedidos')
        .select('id, total_geral, canal, taxa_entrega, criado_em, forma_pagamento, pago, desconto');

      if (erroPedidos) console.error("Erro pedidos:", erroPedidos);

      const { data: todasDespesas } = await supabase
        .from('despesas')
        .select('valor, criado_em, data_despesa');

      // Filtrar pedidos estritamente pelo período selecionado
      const pedidosValidos = (todosPedidos || []).filter(p => {
        if (!p.criado_em) return true;
        const dataPedidoStr = p.criado_em.split('T')[0];
        const pagoOk = p.pago === true || p.pago === null;
        return dataPedidoStr >= dataInicio && dataPedidoStr <= dataFim && pagoOk;
      });

      // Filtrar despesas estritamente pelo período selecionado
      const despesasValidas = (todasDespesas || []).filter(d => {
        const campoData = d.data_despesa || d.criado_em;
        if (!campoData) return false;
        const dataDespesaStr = campoData.split('T')[0];
        return dataDespesaStr >= dataInicio && dataDespesaStr <= dataFim;
      });

      let faturacaoBruta = 0;
      let totalTaxasEntrega = 0;
      let totalDescontos = 0;
      let repasse = 0;
      let entregas = 0;
      let takeaway = 0;

      const canaisAgrupados: Record<string, number> = {};
      const pagamentosAgrupados: Record<string, number> = {};
      const idsPedidosPeriodo: string[] = [];

      pedidosValidos.forEach(p => {
        idsPedidosPeriodo.push(p.id);
        const valorPedido = Number(p.total_geral || 0);
        const taxaEnt = Number(p.taxa_entrega || 0);
        const desc = Number(p.desconto || 0);

        faturacaoBruta += valorPedido;
        totalTaxasEntrega += taxaEnt;
        totalDescontos += desc;
        repasse += taxaEnt;
        
        if (taxaEnt > 0 || (p.canal || '').toLowerCase() === 'glovo') {
          entregas++;
        } else {
          takeaway++;
        }

        // --- NORMALIZAÇÃO DE CANAIS (Unifica Balcão e Balcã num só) ---
        let canalBruto = (p.canal || 'Outros').trim();
        let canalNormalizado = canalBruto;
        const canalLower = canalBruto.toLowerCase();

        if (canalLower.startsWith('balc') || canalLower.includes('balca')) {
          canalNormalizado = 'Balcão';
        } else if (canalLower.includes('glovo')) {
          canalNormalizado = 'Glovo';
        } else if (canalLower.includes('whats')) {
          canalNormalizado = 'WhatsApp';
        } else if (canalLower.includes('palm')) {
          canalNormalizado = 'Palmbites';
        } else if (canalLower.includes('revend')) {
          canalNormalizado = 'Revendedores';
        }

        const pagamento = p.forma_pagamento || 'Não Informado'; 

        canaisAgrupados[canalNormalizado] = (canaisAgrupados[canalNormalizado] || 0) + valorPedido;
        pagamentosAgrupados[pagamento] = (pagamentosAgrupados[pagamento] || 0) + valorPedido;
      });

      const { data: produtosDB } = await supabase.from('produtos').select('id, nome, categoria, custo_unitario');
      const mapaProdutos: Record<string, { nome: string, categoria: string, custo: number }> = {};
      
      (produtosDB || []).forEach(prod => {
        let cat = (prod.categoria || '').toLowerCase().trim();
        if (cat === 'brownie') cat = 'sobremesa';
        
        const nomeProd = prod.nome || '';
        const nomeLower = nomeProd.toLowerCase();
        const custoUn = Number(prod.custo_unitario || 0);

        if (cat === 'batata' || nomeLower.includes('calabresa') || nomeLower.includes('costela') || nomeLower.includes('frango cremoso') || nomeLower.includes('gratinado') || nomeLower.includes('strogonoff') || nomeLower.includes('misto')) {
          cat = 'batata';
        } else if (cat === 'sobremesa' || nomeLower.includes('brownie') || nomeLower.includes('mousse')) {
          cat = 'sobremesa';
        } else if (cat === 'bebida' || nomeLower.includes('coca') || nomeLower.includes('água') || nomeLower.includes('sumo') || nomeLower.includes('fanta') || nomeLower.includes('ice tea')) {
          cat = 'bebida';
        }

        mapaProdutos[prod.id] = { nome: nomeProd, categoria: cat, custo: custoUn };
      });

      let custoTotalItens = 0;

      if (idsPedidosPeriodo.length > 0) {
        const { data: itensPedido } = await supabase
          .from('itens_pedido')
          .select('produto_id, nome_produto, quantidade, pedido_id')
          .in('pedido_id', idsPedidosPeriodo);

        const agregacao: Record<string, RankingVenda> = {};

        (itensPedido || []).forEach(item => {
          let nomeFinal = item.nome_produto || 'Produto';
          let categoriaItem = 'outros';
          let custoItem = 0;
          const qtd = Number(item.quantidade || 0);

          if (item.produto_id && mapaProdutos[item.produto_id]) {
            nomeFinal = mapaProdutos[item.produto_id].nome;
            categoriaItem = mapaProdutos[item.produto_id].categoria;
            custoItem = mapaProdutos[item.produto_id].custo;
          } else {
            const matchProd = Object.values(mapaProdutos).find(p => p.nome.toLowerCase() === nomeFinal.toLowerCase());
            if (matchProd) {
              custoItem = matchProd.custo;
            }

            const nomeLower = nomeFinal.toLowerCase();
            if (nomeLower.includes('calabresa') || nomeLower.includes('costela') || nomeLower.includes('frango') || nomeLower.includes('gratinado') || nomeLower.includes('strogonoff') || nomeLower.includes('misto') || nomeLower.includes('batata')) {
              categoriaItem = 'batata';
            } else if (nomeLower.includes('brownie') || nomeLower.includes('mousse') || nomeLower.includes('sobremesa')) {
              categoriaItem = 'sobremesa';
            } else if (nomeLower.includes('coca') || nomeLower.includes('água') || nomeLower.includes('sumo') || nomeLower.includes('bebida') || nomeLower.includes('fanta')) {
              categoriaItem = 'bebida';
            }
          }

          custoTotalItens += (qtd * custoItem);

          const chave = nomeFinal.toLowerCase().trim();
          if (!agregacao[chave]) {
            agregacao[chave] = { nome: nomeFinal, quantidade: 0, categoria: categoriaItem };
          }
          agregacao[chave].quantidade += qtd;
        });

        const listaRankeada = Object.values(agregacao).sort((a, b) => b.quantidade - a.quantidade);

        setTopBatatas(listaRankeada.filter(i => i.categoria === 'batata').slice(0, 5));
        setTopSobremesas(listaRankeada.filter(i => i.categoria === 'sobremesa').slice(0, 5));
        setTopBebidas(listaRankeada.filter(i => i.categoria === 'bebida').slice(0, 5));
      } else {
        setTopBatatas([]);
        setTopSobremesas([]);
        setTopBebidas([]);
      }

      const custosOps = despesasValidas.reduce((acc, d) => acc + Number(d.valor || 0), 0);
      const faturacaoLiquida = faturacaoBruta - totalTaxasEntrega;
      const lucro = faturacaoLiquida - custoTotalItens - custosOps - repasse;
      const margem = faturacaoLiquida > 0 ? (lucro / faturacaoLiquida) * 100 : 0;
      const ticket = pedidosValidos.length > 0 ? faturacaoBruta / pedidosValidos.length : 0;

      const arrayCanais = Object.entries(canaisAgrupados)
        .map(([nome, valor]) => ({ nome, valor }))
        .sort((a, b) => b.valor - a.valor);
        
      const arrayPagamentos = Object.entries(pagamentosAgrupados)
        .map(([nome, valor]) => ({ nome, valor }))
        .sort((a, b) => b.valor - a.valor);

      setMetricas({
        faturacaoBruta,
        faturacaoLiquida,
        custosOperacionais: custosOps,
        repasseEstafetas: repasse,
        custoTotalItens,
        totalTaxasEntrega,
        totalDescontos,
        lucroLiquido: lucro,
        margemLucro: margem,
        totalPedidos: pedidosValidos.length,
        entregasEfetuadas: entregas,
        volumeTakeaway: takeaway,
        ticketMedio: ticket
      });

      setDadosCanal(arrayCanais);
      setDadosPagamento(arrayPagamentos);

    } catch (err) {
      console.error('Erro ao carregar métricas:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (dataInicio && dataFim) {
      carregarDados();
    }

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => { carregarDados(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itens_pedido' }, () => { carregarDados(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'despesas' }, () => { carregarDados(); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dataInicio, dataFim]);

  const calcularPorcentagem = (valor: number, arrayDados: any[]) => {
    if (arrayDados.length === 0) return 0;
    const max = Math.max(...arrayDados.map(d => d.valor));
    return max > 0 ? (valor / max) * 100 : 0;
  };

  const TopList = ({ titulo, icone, dados, cor }: { titulo: string, icone: string, dados: RankingVenda[], cor: string }) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col h-full">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-zinc-800">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-lg ${cor}`}>
          {icone}
        </div>
        <h3 className="text-lg font-black text-white">{titulo}</h3>
      </div>

      <div className="flex-1 space-y-3">
        {dados.length === 0 ? (
          <div className="text-center text-zinc-500 text-xs py-6 italic">Sem vendas registadas neste período.</div>
        ) : (
          dados.map((item, index) => (
            <div key={index} className="flex items-center gap-3 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800">
              <span className="text-xs font-mono text-zinc-500 font-bold">#{index + 1}</span>
              <span className="flex-1 text-sm font-bold text-zinc-200 truncate">{item.nome}</span>
              <div className="text-right">
                <span className="text-base font-black text-orange-500">{item.quantidade}</span>
                <span className="text-[9px] font-bold text-zinc-500 uppercase block leading-none">unid.</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="p-8 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-orange-500 flex items-center gap-2">
            Dashboard Financeiro 
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping inline-block" title="Tempo Real Ativo"></span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Cruzamento de resultados em tempo real com canais unificados e despesas filtradas</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-xl flex items-center shadow-sm">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mx-2">De:</label>
            <input 
              type="date" 
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm font-bold text-zinc-200 focus:border-orange-500 outline-none cursor-pointer [color-scheme:dark]"
            />
          </div>
          
          <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-xl flex items-center shadow-sm">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mx-2">Até:</label>
            <input 
              type="date" 
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm font-bold text-zinc-200 focus:border-orange-500 outline-none cursor-pointer [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64 text-zinc-500 animate-pulse font-bold">A sincronizar dados em tempo real...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden shadow-lg">
              <div className="absolute -right-4 -top-4 text-6xl opacity-5">💰</div>
              <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Faturação Bruta</h3>
              <p className="text-3xl font-black text-white">{metricas.faturacaoBruta.toFixed(2)}€</p>
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden shadow-lg">
              <div className="absolute -right-4 -top-4 text-6xl opacity-5">📈</div>
              <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Faturação Líquida (Sem Entregas)</h3>
              <p className="text-3xl font-black text-orange-400">{metricas.faturacaoLiquida.toFixed(2)}€</p>
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl relative overflow-hidden shadow-lg">
              <div className="absolute -right-4 -top-4 text-6xl opacity-5">🛒</div>
              <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Custo Total dos Itens</h3>
              <p className="text-3xl font-black text-red-400">{metricas.custoTotalItens.toFixed(2)}€</p>
            </div>
            
            <div className={`border p-6 rounded-2xl relative overflow-hidden shadow-lg ${metricas.lucroLiquido >= 0 ? 'bg-green-950/20 border-green-900/50' : 'bg-red-950/20 border-red-900/50'}`}>
              <div className="absolute -right-4 -top-4 text-6xl opacity-5">💎</div>
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${metricas.lucroLiquido >= 0 ? 'text-green-500' : 'text-red-500'}`}>Lucro Líquido Real</h3>
              <div className="flex items-end gap-3">
                <p className={`text-3xl font-black ${metricas.lucroLiquido >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {metricas.lucroLiquido.toFixed(2)}€
                </p>
                <span className={`text-sm font-bold mb-1 ${metricas.lucroLiquido >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
                  ({metricas.margemLucro.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center justify-between shadow-md">
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Custos Operacionais</p>
                <p className="text-xl font-bold text-red-400 font-mono mt-1">{metricas.custosOperacionais.toFixed(2)}€</p>
              </div>
              <span className="text-3xl">📉</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center justify-between shadow-md">
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Repasse / Taxa Estafetas</p>
                <p className="text-xl font-bold text-orange-400 font-mono mt-1">{metricas.repasseEstafetas.toFixed(2)}€</p>
              </div>
              <span className="text-3xl">🛵</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center justify-between shadow-md">
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Total Taxas de Entrega</p>
                <p className="text-xl font-bold text-white font-mono mt-1">{metricas.totalTaxasEntrega.toFixed(2)}€</p>
              </div>
              <span className="text-3xl">📦</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center justify-between shadow-md">
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Total de Descontos</p>
                <p className="text-xl font-bold text-red-400 font-mono mt-1">-{metricas.totalDescontos.toFixed(2)}€</p>
              </div>
              <span className="text-3xl">🏷️</span>
            </div>
          </div>

          <h2 className="text-lg font-bold text-zinc-300 mb-4 flex items-center gap-2"><span className="text-orange-500">⚡</span> Performance Operacional</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4 shadow-md">
              <div className="bg-zinc-800 w-12 h-12 rounded-xl flex items-center justify-center text-xl">📦</div>
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Total Pedidos</p>
                <p className="text-xl font-bold text-white">{metricas.totalPedidos}</p>
              </div>
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4 shadow-md">
              <div className="bg-orange-500/10 border border-orange-500/20 w-12 h-12 rounded-xl flex items-center justify-center text-xl">🎫</div>
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Ticket Médio</p>
                <p className="text-xl font-bold text-orange-400">{metricas.ticketMedio.toFixed(2)}€</p>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4 shadow-md">
              <div className="bg-blue-500/10 border border-blue-500/20 w-12 h-12 rounded-xl flex items-center justify-center text-xl">🛵</div>
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Entregas</p>
                <p className="text-xl font-bold text-blue-400">{metricas.entregasEfetuadas}</p>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex items-center gap-4 shadow-md">
              <div className="bg-purple-500/10 border border-purple-500/20 w-12 h-12 rounded-xl flex items-center justify-center text-xl">🛍️</div>
              <div>
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Takeaway/Balcão</p>
                <p className="text-xl font-bold text-purple-400">{metricas.volumeTakeaway}</p>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-lg font-bold text-zinc-300 mb-4 flex items-center gap-2">
              <span className="text-orange-500">🏆</span> Top Produtos Mais Vendidos no Período
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <TopList titulo="Top 5 Batatas" icone="🥔" dados={topBatatas} cor="bg-amber-500 text-zinc-950" />
              <TopList titulo="Top 5 Sobremesas" icone="🍫" dados={topSobremesas} cor="bg-amber-800 text-white" />
              <TopList titulo="Top 5 Bebidas" icone="🥤" dados={topBebidas} cor="bg-blue-500 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-lg">
              <h3 className="text-lg font-bold text-zinc-300 mb-6 flex items-center gap-2">
                <span className="text-orange-500">📱</span> Faturação por Canal
              </h3>
              {dadosCanal.length === 0 ? (
                <p className="text-zinc-500 text-sm">Sem dados para este período.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {dadosCanal.map((item, index) => (
                    <div key={index}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-300 font-medium">{item.nome}</span>
                        <span className="text-white font-bold">{item.valor.toFixed(2)}€</span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-2.5">
                        <div className="bg-orange-500 h-2.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${calcularPorcentagem(item.valor, dadosCanal)}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-lg">
              <h3 className="text-lg font-bold text-zinc-300 mb-6 flex items-center gap-2">
                <span className="text-green-500">💳</span> Formas de Pagamento
              </h3>
              {dadosPagamento.length === 0 ? (
                <p className="text-zinc-500 text-sm">Sem dados para este período.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {dadosPagamento.map((item, index) => (
                    <div key={index}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-300 font-medium">{item.nome}</span>
                        <span className="text-white font-bold">{item.valor.toFixed(2)}€</span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-2.5">
                        <div className="bg-green-500 h-2.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${calcularPorcentagem(item.valor, dadosPagamento)}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}