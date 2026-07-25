'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface RelatorioBrownie {
  nome: string;
  quantidadeVendida: number;
  faturacaoTotal: number;
  custoInsumosUnitario: number;
  custoTotalProducao: number;
  ganhoLiquido: number;
}

export default function RelatorioBrowniesPage() {
  const [loading, setLoading] = useState(true);
  const [resumoGeral, setResumoGeral] = useState({
    totalVendido: 0,
    faturacaoBruta: 0,
    custoInsumosTotal: 0,
    perdasEstoque: 0,
    ganhoLiquidoReal: 0
  });
  const [rankingBrownies, setRankingBrownies] = useState<RelatorioBrownie[]>([]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function carregarDadosBrownies() {
      setLoading(true);
      try {
        // 1. Buscar todos os produtos que são brownies
        const { data: produtos } = await supabase
          .from('produtos')
          .select('id, nome, categoria, preco_venda')
          .or('categoria.ilike.%brownie%,nome.ilike.%brownie%');

        const idsBrownies = (produtos || []).map(p => p.id);
        const mapaProdutos: Record<string, { nome: string, preco: number }> = {};
        
        (produtos || []).forEach(p => {
          mapaProdutos[p.id] = { nome: p.nome, preco: Number(p.preco_venda || 0) };
        });

        // 2. Buscar itens de pedidos vendidos que correspondam a brownies
        const { data: itensPedidos } = await supabase
          .from('itens_pedido')
          .select('produto_id, nome_produto, quantidade, preco_unitario');

        const vendasBrowniesMap: Record<string, { nome: string, quantidade: number, faturacao: number }> = {};

        (itensPedidos || []).forEach(item => {
          const nomeLower = (item.nome_produto || '').toLowerCase();
          const eBrownie = (item.produto_id && mapaProdutos[item.produto_id]) || nomeLower.includes('brownie');

          if (eBrownie) {
            const nomeOficial = (item.produto_id && mapaProdutos[item.produto_id]?.nome) || item.nome_produto;
            const chave = nomeOficial.toLowerCase().trim();
            const qtd = Number(item.quantidade || 0);
            const totalItem = qtd * Number(item.preco_unitario || (item.produto_id ? mapaProdutos[item.produto_id]?.preco : 0));

            if (!vendasBrowniesMap[chave]) {
              vendasBrowniesMap[chave] = { nome: nomeOficial, quantidade: 0, faturacao: 0 };
            }
            vendasBrowniesMap[chave].quantidade += qtd;
            vendasBrowniesMap[chave].faturacao += totalItem;
          }
        });

        // 3. Buscar lotes de produção e custos de insumos de brownies (tabela lotes_producao)
        const { data: lotesProducao } = await supabase
          .from('lotes_producao')
          .select('*');

        let custoTotalInsumosBrownie = 0;
        let qtdTotalProduzida = 0;

        (lotesProducao || []).forEach(lote => {
          qtdTotalProduzida += Number(lote.quantidade || 0);
          // Se houver um custo associado ao lote ou insumos
          custoTotalInsumosBrownie += Number(lote.custo_total || lote.custo_producao || 0);
        });

        // Estimativa de custo por unidade produzida (se o custo total estiver registado na produção)
        const custoMedioUnitario = qtdTotalProduzida > 0 ? (custoTotalInsumosBrownie / qtdTotalProduzida) : 0.50; // Valor base estimado por unidade se não houver registo de custo fixo

        let faturacaoBrutaBrownies = 0;
        let totalVendidasQty = 0;

        const listaFinal: RelatorioBrownie[] = Object.values(vendasBrowniesMap).map(v => {
          faturacaoBrutaBrownies += v.faturacao;
          totalVendidasQty += v.quantidade;

          const custoItemTotal = v.quantidade * custoMedioUnitario;
          const ganhoItem = v.faturacao - custoItemTotal;

          return {
            nome: v.nome,
            quantidadeVendida: v.quantidade,
            faturacaoTotal: v.faturacao,
            custoInsumosUnitario: custoMedioUnitario,
            custoTotalProducao: custoItemTotal,
            ganhoLiquido: ganhoItem
          };
        }).sort((a, b) => b.quantidadeVendida - a.quantidadeVendida);

        // 4. Buscar perdas registadas na produção/stock de brownies
        const { data: perdasDB } = await supabase
          .from('perdas') // ou registos com motivo quebra/perda se aplicável
          .select('quantidade, custo')
          .maybeSingle();

        const custoPerdas = perdasDB ? Number(perdasDB.custo || 0) : 0;
        const custoInsumosGeral = totalVendidasQty * custoMedioUnitario;
        const lucroLiquidoBrownies = faturacaoBrutaBrownies - custoInsumosGeral - custoPerdas;

        setResumoGeral({
          totalVendido: totalVendidasQty,
          faturacaoBruta: faturacaoBrutaBrownies,
          custoInsumosTotal: custoInsumosGeral,
          perdasEstoque: custoPerdas,
          ganhoLiquidoReal: lucroLiquidoBrownies
        });

        setRankingBrownies(listaFinal);

      } catch (err) {
        console.error("Erro ao carregar relatório de brownies:", err);
      } finally {
        setLoading(false);
      }
    }

    carregarDadosBrownies();
  }, [supabase]);

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto text-white">
      <div className="mb-8 border-b border-zinc-800 pb-4">
        <h1 className="text-3xl font-black text-amber-500 flex items-center gap-3">
          🍫 Painel de Desempenho & Custos: Brownies
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Análise detalhada de insumos, custo de produção, vendas, perdas e lucro líquido da linha de brownies.</p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64 text-zinc-500 font-bold animate-pulse">A calcular custos e margens dos brownies...</div>
      ) : (
        <>
          {/* CARDS DE RESUMO FINANCEIRO DOS BROWNIES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Unidades Vendidas</span>
              <span className="text-2xl font-black text-white">{resumoGeral.totalVendido} <span className="text-xs text-zinc-400">unid.</span></span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Faturação Total</span>
              <span className="text-2xl font-black text-amber-400">{resumoGeral.faturacaoBruta.toFixed(2)}€</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Custo de Insumos</span>
              <span className="text-2xl font-black text-red-400">{resumoGeral.custoInsumosTotal.toFixed(2)}€</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Perdas / Quebras</span>
              <span className="text-2xl font-black text-orange-400">{resumoGeral.perdasEstoque.toFixed(2)}€</span>
            </div>

            <div className="bg-green-950/20 border border-green-900/40 p-5 rounded-2xl shadow-lg">
              <span className="text-[10px] font-black text-green-500 uppercase tracking-widest block mb-1">Ganho Líquido Real</span>
              <span className="text-2xl font-black text-green-400">{resumoGeral.ganhoLiquidoReal.toFixed(2)}€</span>
            </div>
          </div>

          {/* TABELA DETALHADA POR SABOR DE BROWNIE */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-black text-white mb-6 flex items-center gap-2">
              <span>📋</span> Detalhe por Sabor (Insumos, Custos e Lucro)
            </h2>

            {rankingBrownies.length === 0 ? (
              <div className="text-center text-zinc-500 py-12 text-sm italic">Nenhum registo de venda de brownies encontrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase">
                      <th className="py-3 px-4 font-bold">Sabor do Brownie</th>
                      <th className="py-3 px-4 font-bold text-center">Qtd. Vendida</th>
                      <th className="py-3 px-4 font-bold text-right">Custo Insumos (Unit.)</th>
                      <th className="py-3 px-4 font-bold text-right">Custo Total Produção</th>
                      <th className="py-3 px-4 font-bold text-right">Faturação</th>
                      <th className="py-3 px-4 font-bold text-right">Ganho Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-sm">
                    {rankingBrownies.map((b, idx) => (
                      <tr key={idx} className="hover:bg-zinc-950/40 transition-colors">
                        <td className="py-4 px-4 font-bold text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                          {b.nome}
                        </td>
                        <td className="py-4 px-4 text-center font-mono text-zinc-300">{b.quantidadeVendida}</td>
                        <td className="py-4 px-4 text-right font-mono text-red-300">{b.custoInsumosUnitario.toFixed(2)}€</td>
                        <td className="py-4 px-4 text-right font-mono text-red-400">{b.custoTotalProducao.toFixed(2)}€</td>
                        <td className="py-4 px-4 text-right font-mono text-amber-400">{b.faturacaoTotal.toFixed(2)}€</td>
                        <td className="py-4 px-4 text-right font-mono font-bold text-green-400">{b.ganhoLiquido.toFixed(2)}€</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}