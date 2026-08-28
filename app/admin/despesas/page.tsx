'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface Despesa {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data_despesa: string;
}

interface SessaoAuditoria {
  id: string; 
  tipo_arquivo: string;
  periodo_ref: string;
  resumo: any;
  created_at: string;
}

export default function DespesasPage() {
  // Estados
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [historicoFaturas, setHistoricoFaturas] = useState<SessaoAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  
  const getMesAtual = () => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  };

  const [filtroMes, setFiltroMes] = useState(getMesAtual());
  const [sessaoDetalhe, setSessaoDetalhe] = useState<SessaoAuditoria | null>(null);

  // Carregar todos os dados (Gráficos + Lista de Faturas)
  async function carregarTudo() {
    setLoading(true);
    const inicioMes = `${filtroMes}-01`;
    const fimMes = `${filtroMes}-31`; 

    // 1. Carregar Despesas (Para calcular os Gráficos e Totais)
    const { data: dData } = await supabase
      .from('despesas')
      .select('*')
      .gte('data_despesa', inicioMes)
      .lte('data_despesa', fimMes);
    
    if (dData) setDespesas(dData);

    // 2. Carregar Faturas (Para a lista detalhada clicável)
    const { data: fData } = await supabase
      .from('auditoria_sessoes')
      .select('*')
      .eq('periodo_ref', filtroMes)
      .order('id', { ascending: false });

    if (fData) setHistoricoFaturas(fData);

    setLoading(false);
  }

  useEffect(() => {
    carregarTudo();
  }, [filtroMes]);

  // Função para Extrair Itens da Fatura
  const extrairListaItens = (dados: any) => {
    if (!dados) return [];
    if (Array.isArray(dados)) return dados;
    if (Array.isArray(dados.itens)) return dados.itens;
    return [];
  };

  // Função para Apagar Fatura
  const apagarFatura = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Tem a certeza que deseja eliminar esta fatura do histórico?')) return;
    await supabase.from('auditoria_sessoes').delete().eq('id', id);
    setHistoricoFaturas(prev => prev.filter(item => item.id !== id));
    if (sessaoDetalhe?.id === id) setSessaoDetalhe(null);
  };

  // 📊 CÁLCULOS DOS GRÁFICOS
  const totalDespesas = despesas.reduce((acc, d) => acc + Number(d.valor), 0);

  const totaisPorCategoria = despesas.reduce((acc, desp) => {
    const cat = desp.categoria || 'Sem Categoria';
    acc[cat] = (acc[cat] || 0) + Number(desp.valor);
    return acc;
  }, {} as Record<string, number>);

  const categoriasOrdenadas = Object.entries(totaisPorCategoria)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);

  const totaisPorFornecedor = despesas.reduce((acc, desp) => {
    let fornecedor = 'Diversos';
    if (desp.descricao.includes('|')) {
      const parteFornecedor = desp.descricao.split('|')[1];
      if (parteFornecedor) {
        fornecedor = parteFornecedor.split('NIF')[0].split('📄')[0].trim();
      }
    }
    acc[fornecedor] = (acc[fornecedor] || 0) + Number(desp.valor);
    return acc;
  }, {} as Record<string, number>);

  const fornecedoresOrdenados = Object.entries(totaisPorFornecedor)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5); // Top 5

  const maxCategoria = categoriasOrdenadas.length > 0 ? categoriasOrdenadas[0].total : 1;
  const maxFornecedor = fornecedoresOrdenados.length > 0 ? fornecedoresOrdenados[0].total : 1;

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto relative min-h-screen">
      
      {/* CABEÇALHO */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
          Gestão de Despesas <span className="text-xl">💸</span>
        </h1>
        <div className="flex items-center gap-4">
          <input 
            type="month" 
            value={filtroMes} 
            onChange={(e) => setFiltroMes(e.target.value)} 
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-4 py-2.5 rounded-xl text-sm outline-none focus:border-orange-500 shadow-xl font-medium" 
          />
        </div>
      </div>

      {/* BLOCOS DE ANÁLISE GRÁFICA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        
        {/* Box: Centros de Custo */}
        <div className="bg-[#121214] border border-zinc-800/80 p-6 rounded-[24px] shadow-xl">
          <h3 className="text-[11px] font-black text-orange-500 uppercase tracking-widest mb-6">Centros de Custo (Top Categorias)</h3>
          <div className="space-y-5">
            {categoriasOrdenadas.map(cat => (
              <div key={cat.nome}>
                <div className="flex justify-between text-sm font-bold text-zinc-200 mb-2">
                  <span>{cat.nome}</span>
                  <span>{cat.total.toFixed(2)}€</span>
                </div>
                <div className="w-full bg-zinc-800/50 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-orange-500 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${(cat.total / maxCategoria) * 100}%` }}></div>
                </div>
              </div>
            ))}
            {categoriasOrdenadas.length === 0 && <div className="text-zinc-600 text-sm">Sem dados para o mês selecionado.</div>}
          </div>
        </div>

        {/* Box: Top Fornecedores */}
        <div className="bg-[#121214] border border-zinc-800/80 p-6 rounded-[24px] shadow-xl">
          <h3 className="text-[11px] font-black text-green-500 uppercase tracking-widest mb-6">Top 5 Fornecedores</h3>
          <div className="space-y-5">
            {fornecedoresOrdenados.map(forn => (
              <div key={forn.nome}>
                <div className="flex justify-between text-sm font-bold text-zinc-200 mb-2">
                  <span className="truncate pr-4">{forn.nome}</span>
                  <span>{forn.total.toFixed(2)}€</span>
                </div>
                <div className="w-full bg-zinc-800/50 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-green-500 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${(forn.total / maxFornecedor) * 100}%` }}></div>
                </div>
              </div>
            ))}
            {fornecedoresOrdenados.length === 0 && <div className="text-zinc-600 text-sm">Sem dados para o mês selecionado.</div>}
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-zinc-900/90 border border-zinc-800/80 p-6 rounded-[20px] flex flex-col justify-center shadow-xl">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Gasto no Mês</span>
          <div className="text-4xl font-black text-red-500 font-mono mt-2 tracking-tighter">
            {totalDespesas.toFixed(2)}<span className="text-2xl ml-1 text-zinc-600">€</span>
          </div>
        </div>
        <div className="bg-zinc-900/90 border border-zinc-800/80 p-6 rounded-[20px] flex flex-col justify-center shadow-xl">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Faturas Lidas</span>
          <div className="text-3xl font-bold text-white mt-2">
            {historicoFaturas.length} <span className="text-sm text-zinc-500 font-normal">documentos</span>
          </div>
        </div>
      </div>

      {/* LISTAGEM DAS FATURAS (A LISTA QUE ABRE A JANELA) */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-[24px] overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-zinc-800/80 bg-zinc-950/40 flex justify-between items-center">
          <h3 className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">📄 Listagem de Faturas (Clique para Detalhes)</h3>
        </div>
        
        <div className="p-5">
          {loading ? (
            <div className="text-center text-zinc-500 py-12 font-bold uppercase tracking-widest text-xs">A carregar faturas...</div>
          ) : historicoFaturas.length === 0 ? (
            <div className="text-center text-zinc-600 py-12 italic text-sm">Nenhuma fatura registada para este mês.</div>
          ) : (
            <div className="space-y-3">
              {historicoFaturas.map((sessao) => {
                const dados = sessao.resumo || {};
                const dadosExtraidos = dados.dadosExtraidos || dados;
                const listaItens = extrairListaItens(dadosExtraidos);
                const nomeFicheiro = dados.fileName || dados.nome_arquivo || 'Fatura';
                const fornecedor = dadosExtraidos?.fornecedor || 'Desconhecido';
                const nif = dadosExtraidos?.nif_fornecedor ? ` (NIF: ${dadosExtraidos.nif_fornecedor})` : '';
                const valorTotal = Number(dadosExtraidos?.valorTotal || 0).toFixed(2);

                return (
                  <div key={sessao.id} onClick={() => setSessaoDetalhe(sessao)} className="bg-[#121214] border border-zinc-800/60 p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all hover:bg-zinc-800 hover:border-zinc-700 shadow-sm">
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-white line-clamp-1">🧾 {nomeFicheiro}</h4>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
                        {fornecedor}{nif} | <span className="text-zinc-200 font-bold">{valorTotal}€</span> | ✓ {listaItens.length} itens lidos
                      </p>
                    </div>
                    <button onClick={(e) => apagarFatura(sessao.id, e)} className="ml-4 w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-red-950 hover:border-red-900 flex items-center justify-center text-zinc-400 hover:text-red-400 transition-colors shadow-sm" title="Eliminar Fatura">
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* JANELA POP-UP: DETALHE ITEM A ITEM E QUANTIDADES */}
      {sessaoDetalhe && (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 w-full max-w-2xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] border border-zinc-800">
            <div className="flex justify-between items-start border-b border-zinc-800 pb-4 mb-4">
              <h3 className="text-xl font-black text-white">Detalhes do Extrato / Fatura</h3>
              <button onClick={() => setSessaoDetalhe(null)} className="bg-zinc-800 hover:bg-zinc-700 text-white w-8 h-8 rounded-full font-bold transition-colors">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Itens Detalhados</h4>
              {(() => {
                const dados = sessaoDetalhe.resumo || {};
                const dadosExtraidos = dados.dadosExtraidos || dados;
                const listaItens = extrairListaItens(dadosExtraidos);
                
                if (listaItens.length === 0) return <p className="text-zinc-500 text-sm py-4">Nenhum item detalhado encontrado.</p>;
                
                return (
                  <div className="space-y-2">
                    {listaItens.map((item: any, idx: number) => (
                      <div key={idx} className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl flex justify-between items-center hover:border-zinc-700 transition-colors">
                        <div>
                          <h4 className="text-sm font-bold text-zinc-200">{item.nome_extraido || item.nome || 'Item Descrito'}</h4>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[10px] font-bold text-zinc-400">Qtd: {item.quantidade || 1} {item.unidade || 'un'}</span>
                             {item.categoria_sugerida && (
                               <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30 uppercase tracking-wider font-bold">
                                 {item.categoria_sugerida}
                               </span>
                             )}
                          </div>
                        </div>
                        <span className="text-sm font-black text-orange-400">{(Number(item.valor_total || item.valor || 0)).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            
            <div className="border-t border-zinc-800 pt-4 flex justify-end">
              <button onClick={(e) => apagarFatura(sessaoDetalhe.id, e)} className="bg-red-950 border border-red-900 hover:bg-red-900 text-red-400 hover:text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors shadow-lg">
                🗑️ Eliminar Esta Fatura
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}