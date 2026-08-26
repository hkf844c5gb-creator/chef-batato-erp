'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// =========================================================================
// 🛡️ INTERFACES (TIPAGEM ESTRITA PARA EVITAR ERROS)
// =========================================================================
interface Despesa {
  id: string;
  descricao: string;
  categoria: string;
  valor: number | string; 
  data_despesa: string;
  metodo_pagamento: string;
  status: string; 
}

interface ParseResult {
  qtd: string;
  und: string;
  nome: string;
  fornecedor: string;
  fatura: string;
  nif: string;
}

interface DespesaExtendida extends Despesa {
  parsed: ParseResult;
  valorLimpo: number;
}

interface GrupoDespesa {
  idAgrupado: string;
  data_despesa: string;
  fornecedorLogico: string;
  nif: string;
  faturaRef: string;
  itens: DespesaExtendida[];
  valorTotal: number;
  isAvulsa: boolean;
  todasIds: string[];
}

const categoriasDespesas = [
  '⚠️ Por Classificar', 
  'Ingredientes & Mercadoria',
  'Embalagens & Consumíveis',
  'Frota & Combustível',
  'Estrutura & Fixos',
  'Marketing & Publicidade',
  'Devoluções & Reembolsos',
  'Fatura Física',
  'Extrato Bancário',
  'Taxas e Comissões (Glovo/Uber)',
  'Outros'
];

export default function GestaoDespesas() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const [despesasDB, setDespesasDB] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [modoBulk, setModoBulk] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  
  const [expandidos, setExpandidos] = useState<string[]>([]);
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7)); 
  const [modoRascunhosGlobais, setModoRascunhosGlobais] = useState(false);

  // Filtro de Ordenação
  const [ordenacao, setOrdenacao] = useState<'data_desc' | 'data_asc' | 'fornecedor_asc' | 'fornecedor_desc' | 'valor_desc' | 'valor_asc' | 'categoria_asc' | 'categoria_desc'>('data_desc');

  const [formDespesa, setFormDespesa] = useState<Despesa>({
    id: '', descricao: '', categoria: 'Ingredientes & Mercadoria', valor: 0,
    data_despesa: new Date().toISOString().split('T')[0], metodo_pagamento: 'Conciliação Automática', status: 'Validado' 
  });

  async function carregarDespesas() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('despesas').select('*').order('data_despesa', { ascending: false }).limit(3000); 
      if (error) throw error;
      if (data) setDespesasDB(data);
    } catch (err) { console.error("Erro ao carregar despesas:", err); } finally { setLoading(false); }
  }

  useEffect(() => { carregarDespesas(); }, []);

  // =========================================================================
  // 🧠 SUPER EXTRATOR (Treinado para ler registos novos e formatos antigos!)
  // =========================================================================
  const parseValor = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let str = String(val).replace(/€/g, '').replace(/\s/g, '');
    str = str.replace(',', '.');
    const parts = str.split('.');
    if (parts.length > 2) {
        str = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const parseDescricao = (descOriginal: string): ParseResult => {
    let desc = descOriginal || "";
    let qtd = "1", und = "un", nome = desc, fornecedor = "", fatura = "Registo Manual", nif = "";

    // 1. Extrair Documento/Fatura se existir (Formato Novo)
    if (desc.includes('📄')) {
      const parts = desc.split('📄');
      fatura = parts[1]?.trim() || "Registo Manual";
      desc = parts[0]?.trim() || "";
    }

    // 2. Limpar lixo antigo (ex: "[VALIDADO] Recheio Cash & Carry")
    if (desc.toUpperCase().startsWith('[VALIDADO]')) {
       desc = desc.replace(/\[VALIDADO\]\s*/i, '').trim();
    }

    // 3. Extrair Fornecedor
    if (desc.includes(' | ')) {
      const parts = desc.split(' | ');
      fornecedor = parts.pop()?.trim() || "";
      nome = parts.join(' | ').trim();
    } else {
      const hasQtd = desc.match(/^\[([\d.,]+)\s*([a-zA-Z]*)]/);
      if (hasQtd) {
         if (desc.includes(' - ')) {
            const lastDash = desc.lastIndexOf(' - ');
            if (lastDash > 0) {
                fornecedor = desc.substring(lastDash + 3).trim();
                nome = desc.substring(0, lastDash).trim();
            } else {
                fornecedor = desc;
                nome = desc;
            }
         } else {
            fornecedor = desc;
            nome = desc;
         }
      } else {
         fornecedor = desc;
         nome = desc; 
      }
    }

    // 4. Limpar a Quantidade colada no Nome (ex: "[5 un] Produto")
    const qtdMatch = nome.match(/^\[([\d.,]+)\s*([a-zA-Z]*)]/);
    if (qtdMatch) {
      qtd = qtdMatch[1];
      und = qtdMatch[2] || 'un';
      nome = nome.replace(qtdMatch[0], '').trim();
    }

    // 5. Limpar a Quantidade se tiver ficado acidentalmente no Fornecedor
    if (fornecedor.match(/^\[([\d.,]+)\s*([a-zA-Z]*)]/)) {
       fornecedor = fornecedor.replace(/^\[([\d.,]+)\s*([a-zA-Z]*)]/, '').trim();
    }

    // 6. Extrair NIF
    const nifMatch = fornecedor.match(/(?:NIF|Contribuinte|NIPC)?:?\s*([0-9]{9})/i);
    if (nifMatch) {
      nif = nifMatch[1];
      fornecedor = fornecedor.replace(nifMatch[0], '').replace(/[()\-:]/g, '').trim();
    }

    // 7. Prevenção de campos vazios e limpezas finais
    if (!fornecedor || fornecedor.length < 2 || fornecedor.toUpperCase().includes('FORNECEDOR DIVERSO')) {
       fornecedor = "🏢 Entidade a Definir";
    }
    if (fornecedor.startsWith('- ')) fornecedor = fornecedor.substring(2).trim();
    
    if (!nome) nome = fornecedor; 

    return { qtd, und, nome, fornecedor, fatura, nif };
  };

  const despesasPorClassificarGlobais = despesasDB.filter(d => d.categoria === '⚠️ Por Classificar');
  const despesasFiltradas = modoRascunhosGlobais ? despesasPorClassificarGlobais : despesasDB.filter(d => d.data_despesa && d.data_despesa.startsWith(mesFiltro)); 

  // =========================================================================
  // 🔄 AGRUPAMENTO DE FATURAS E ORDENAÇÃO DINÂMICA
  // =========================================================================
  const despesasAgrupadas = useMemo(() => {
    const grupos = new Map<string, GrupoDespesa>();
    
    despesasFiltradas.forEach(desp => {
      const p = parseDescricao(desp.descricao);
      const valorL = parseValor(desp.valor);

      const itemExt: DespesaExtendida = { ...desp, parsed: p, valorLimpo: valorL };

      const chave = p.fatura !== 'Registo Manual' 
        ? `${p.fornecedor}-${desp.data_despesa}-${p.fatura}` 
        : `avulso-${desp.id}`;

      if (!grupos.has(chave)) {
        grupos.set(chave, {
          idAgrupado: chave,
          data_despesa: desp.data_despesa,
          fornecedorLogico: p.fornecedor,
          nif: p.nif,
          faturaRef: p.fatura,
          itens: [],
          valorTotal: 0,
          isAvulsa: p.fatura === 'Registo Manual',
          todasIds: []
        });
      }
      
      const g = grupos.get(chave)!;
      if (!g.nif && p.nif) g.nif = p.nif;

      g.itens.push(itemExt);
      g.valorTotal += valorL; 
      g.todasIds.push(desp.id);
    });

    const arrayFinal = Array.from(grupos.values());

    const getCategoriaGrupo = (g: GrupoDespesa) => {
      const temRascunhos = g.itens.some(i => i.categoria === '⚠️ Por Classificar');
      if (temRascunhos) return '⚠️ Contém Itens por Classificar';
      const unicas = Array.from(new Set(g.itens.map(i => i.categoria)));
      if (unicas.length > 1) return '📦 Múltiplas Categorias';
      return unicas.length > 0 ? String(unicas[0]) : 'Sem Categoria';
    };

    return arrayFinal.sort((a, b) => {
      if (ordenacao === 'data_desc') {
        if (a.data_despesa !== b.data_despesa) return b.data_despesa.localeCompare(a.data_despesa);
        return b.valorTotal - a.valorTotal; 
      }
      if (ordenacao === 'data_asc') {
        if (a.data_despesa !== b.data_despesa) return a.data_despesa.localeCompare(b.data_despesa);
        return b.valorTotal - a.valorTotal; 
      }
      if (ordenacao === 'fornecedor_asc') {
        return a.fornecedorLogico.localeCompare(b.fornecedorLogico);
      }
      if (ordenacao === 'fornecedor_desc') {
        return b.fornecedorLogico.localeCompare(a.fornecedorLogico);
      }
      if (ordenacao === 'categoria_asc') {
        return getCategoriaGrupo(a).localeCompare(getCategoriaGrupo(b));
      }
      if (ordenacao === 'categoria_desc') {
        return getCategoriaGrupo(b).localeCompare(getCategoriaGrupo(a));
      }
      if (ordenacao === 'valor_desc') {
        return b.valorTotal - a.valorTotal;
      }
      if (ordenacao === 'valor_asc') {
        return a.valorTotal - b.valorTotal;
      }
      return 0;
    });

  }, [despesasFiltradas, ordenacao]); 

  // NOVO: Cálculo das Faturas Únicas Selecionadas
  const faturasSelecionadasCount = useMemo(() => {
    return despesasAgrupadas.filter(g => g.todasIds.some(id => selecionados.includes(id))).length;
  }, [despesasAgrupadas, selecionados]);

  const totalGastoMes = despesasAgrupadas.reduce((sum, g) => sum + g.valorTotal, 0);

  const gastosPorCategoria = despesasFiltradas.reduce((acc, d) => {
    if (d.categoria !== '⚠️ Por Classificar') {
      acc[d.categoria] = (acc[d.categoria] || 0) + parseValor(d.valor);
    }
    return acc;
  }, {} as Record<string, number>);
  const categoriasOrdenadas = Object.entries(gastosPorCategoria).sort((a, b) => b[1] - a[1]);

  const gastosPorFornecedor = despesasFiltradas.reduce((acc, d) => {
    if (d.categoria !== '⚠️ Por Classificar') {
      const forn = parseDescricao(d.descricao).fornecedor;
      acc[forn] = (acc[forn] || 0) + parseValor(d.valor);
    }
    return acc;
  }, {} as Record<string, number>);
  const fornecedoresOrdenados = Object.entries(gastosPorFornecedor).sort((a, b) => b[1] - a[1]).slice(0, 5); 

  const toggleExpandir = (id: string) => { setExpandidos(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]); };
  const toggleSelecionadoIndividual = (id: string) => { setSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };
  const toggleSelecionadoGrupo = (todasIds: string[]) => {
    const todosSelecionados = todasIds.every(id => selecionados.includes(id));
    if (todosSelecionados) {
      setSelecionados(prev => prev.filter(id => !todasIds.includes(id)));
    } else {
      const novos = todasIds.filter(id => !selecionados.includes(id));
      setSelecionados(prev => [...prev, ...novos]);
    }
  };
  const toggleTodos = () => { setSelecionados(selecionados.length === despesasFiltradas.length ? [] : despesasFiltradas.map(d => d.id)); };

  const abrirClassificacaoEmMassa = () => {
    if (selecionados.length === 0) return;
    setModoBulk(true);
    setFormDespesa({ id: '', descricao: '', valor: 0, data_despesa: '', metodo_pagamento: 'Conciliação Automática', categoria: 'Ingredientes & Mercadoria', status: 'Validado' });
    setModalAberto(true);
  };

  const abrirEditarDespesa = (d: DespesaExtendida) => {
    setModoBulk(false);
    const { parsed, valorLimpo, ...despesaPura } = d;
    setFormDespesa({ ...despesaPura, valor: valorLimpo, status: d.status || 'Validado' }); 
    setModalAberto(true);
  };

  const salvarDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessando(true);
    try {
      if (modoBulk) {
        if (formDespesa.categoria === '⚠️ Por Classificar') throw new Error("Escolha uma categoria.");
        const { error } = await supabase.from('despesas').update({ categoria: formDespesa.categoria, status: formDespesa.status }).in('id', selecionados);
        if (error) throw error;
        setSelecionados([]);
      } else {
        if (!formDespesa.descricao.trim() || Number(formDespesa.valor) <= 0) throw new Error('Preencha a descrição e um valor válido.');
        
        const dados = { 
          descricao: formDespesa.descricao, 
          categoria: formDespesa.categoria, 
          valor: formDespesa.valor, 
          data_despesa: formDespesa.data_despesa, 
          metodo_pagamento: formDespesa.metodo_pagamento,
          status: formDespesa.status 
        };

        if (formDespesa.id) {
          const { error } = await supabase.from('despesas').update(dados).eq('id', formDespesa.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('despesas').insert([dados]);
          if (error) throw error;
        }
      }
      setModalAberto(false);
      await carregarDespesas();
      if (modoRascunhosGlobais && despesasPorClassificarGlobais.length <= (modoBulk ? selecionados.length : 1)) setModoRascunhosGlobais(false);
    } catch (error: any) { alert('Erro ao gravar:\n' + error.message); } finally { setProcessando(false); }
  };

  const excluirSelecionados = async () => {
    if (selecionados.length === 0) return;
    if (!confirm(`Deseja excluir as ${selecionados.length} despesas?`)) return;
    await supabase.from('despesas').delete().in('id', selecionados);
    setSelecionados([]); carregarDespesas();
  };

  const renderizarStatus = (status: string) => {
    if (status === 'Validado') return <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">✓ PAGA</span>;
    if (status === 'Falta Fatura') return <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">⚠️ FALTA DOC</span>;
    if (status === 'Falta Pagamento' || status === 'Pendente') return <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">⏳ PENDENTE</span>;
    return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider animate-pulse">📝 CLASSIFICAR</span>;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24">
      <header className="bg-zinc-950/80 border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center">
        <div><h1 className="text-2xl font-black text-white">Gestão Analítica de Despesas</h1></div>
      </header>

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-5 space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-black uppercase text-zinc-300">
              {modoRascunhosGlobais ? '⚠️ A Visualizar Rascunhos' : 'Resumo Financeiro do Mês'}
            </h2>
            {!modoRascunhosGlobais && despesasPorClassificarGlobais.length > 0 && (
              <button onClick={() => { setModoRascunhosGlobais(true); setSelecionados([]); }} className="bg-amber-500 text-zinc-950 text-[10px] font-black px-3 py-1.5 rounded-full animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                🔍 {despesasPorClassificarGlobais.length} rascunhos por classificar!
              </button>
            )}
            {modoRascunhosGlobais && (<button onClick={() => { setModoRascunhosGlobais(false); setSelecionados([]); }} className="bg-zinc-800 text-white text-[10px] font-bold px-3 py-1.5 rounded-full hover:bg-zinc-700">⬅ Voltar ao Resumo Analítico</button>)}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-zinc-500 pl-1">Ordenar:</span>
            <select 
              value={ordenacao} 
              onChange={(e) => setOrdenacao(e.target.value as any)}
              className="bg-zinc-900 border border-zinc-700 text-xs text-white px-3 py-2 rounded-lg outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="data_desc">Data (Mais Recentes)</option>
              <option value="data_asc">Data (Mais Antigas)</option>
              <option value="fornecedor_asc">Fornecedor (A-Z)</option>
              <option value="fornecedor_desc">Fornecedor (Z-A)</option>
              <option value="categoria_asc">Classificação (A-Z)</option>
              <option value="categoria_desc">Classificação (Z-A)</option>
              <option value="valor_desc">Valor (Maior para Menor)</option>
              <option value="valor_asc">Valor (Menor para Maior)</option>
            </select>
            <input type="month" value={mesFiltro} onChange={(e) => { setMesFiltro(e.target.value); setModoRascunhosGlobais(false); setSelecionados([]); }} className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-lg text-sm text-white" />
          </div>
        </div>

        {!modoRascunhosGlobais && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
              <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest">Total Gasto no Mês</span>
              <div className="text-5xl font-black text-white font-mono mt-2 tracking-tighter">{totalGastoMes.toFixed(2)}<span className="text-2xl text-red-500 ml-1">€</span></div>
              <p className="text-xs text-zinc-500 mt-4">Composto por {despesasAgrupadas.length} documentos validados.</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[32px] shadow-xl">
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest block mb-4">Centros de Custo (Top Categorias)</span>
              <div className="space-y-3">
                {categoriasOrdenadas.length === 0 ? <p className="text-zinc-600 italic text-xs">Sem categorias classificadas.</p> : null}
                {categoriasOrdenadas.map(([cat, valor]) => {
                  const percentagem = totalGastoMes > 0 ? (valor / totalGastoMes) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1"><span className="font-bold text-zinc-200">{cat}</span><span className="font-mono text-zinc-400">{valor.toFixed(2)}€</span></div>
                      <div className="w-full bg-zinc-950 rounded-full h-1.5"><div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${percentagem}%` }}></div></div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[32px] shadow-xl">
              <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest block mb-4">Top 5 Fornecedores</span>
              <div className="space-y-3">
                {fornecedoresOrdenados.length === 0 ? <p className="text-zinc-600 italic text-xs">Sem fornecedores identificados.</p> : null}
                {fornecedoresOrdenados.map(([forn, valor]) => {
                  const percentagem = totalGastoMes > 0 ? (valor / totalGastoMes) * 100 : 0;
                  return (
                    <div key={forn}>
                      <div className="flex justify-between text-xs mb-1"><span className="font-bold text-zinc-200 truncate w-3/4">{forn}</span><span className="font-mono text-zinc-400">{valor.toFixed(2)}€</span></div>
                      <div className="w-full bg-zinc-950 rounded-full h-1.5"><div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${percentagem}%` }}></div></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 🛡️ BANNER DE MÚLTIPLAS SELEÇÕES COM CONTAGEM DE FATURAS */}
        {selecionados.length > 0 && (
          <div className="bg-orange-600/20 border border-orange-500 p-4 rounded-2xl flex justify-between items-center shadow-lg sticky top-4 z-10 backdrop-blur-md">
            <span className="text-orange-400 font-bold text-sm">
              {faturasSelecionadasCount} fatura(s) selecionada(s) / <span className="text-zinc-300 font-normal">({selecionados.length} itens no total)</span>
            </span>
            <div className="flex gap-2">
              <button onClick={abrirClassificacaoEmMassa} className="bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-xl">📝 Classificar Em Massa</button>
              <button onClick={excluirSelecionados} className="bg-red-950 text-red-400 border border-red-900 text-xs font-bold px-4 py-2 rounded-xl">🗑️ Eliminar</button>
            </div>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto custom-scrollbar pb-2">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="p-4 w-10"><input type="checkbox" checked={despesasFiltradas.length > 0 && selecionados.length === despesasFiltradas.length} onChange={toggleTodos} className="w-4 h-4 rounded accent-orange-500" /></th>
                  <th className="p-4 w-10"></th>
                  <th className="p-4">Data</th>
                  <th className="p-4 w-[250px] min-w-[200px]">Entidade / Quantidade</th>
                  <th className="p-4 min-w-[250px]">Documento / Detalhe do Item</th>
                  <th className="p-4 min-w-[150px]">Classificação (Custo)</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-right">Valor (€)</th>
                  <th className="p-4 text-center min-w-[120px]">Ações</th>
                </tr>
              </thead>
              <tbody className="text-sm text-zinc-300">
                {despesasAgrupadas.map(grupo => {
                  const isExpandido = expandidos.includes(grupo.idAgrupado);
                  const todosItensSelecionados = grupo.todasIds.every(id => selecionados.includes(id));
                  const algumItemSelecionado = grupo.todasIds.some(id => selecionados.includes(id));
                  
                  const temRascunhos = grupo.itens.some(i => i.categoria === '⚠️ Por Classificar');
                  const categoriasUnicas = Array.from(new Set(grupo.itens.map(i => i.categoria)));
                  
                  let categoriaExibir: string = categoriasUnicas.length > 0 ? String(categoriasUnicas[0]) : 'Sem Categoria';
                  if (temRascunhos) categoriaExibir = '⚠️ Contém Itens por Classificar';
                  else if (categoriasUnicas.length > 1) categoriaExibir = '📦 Múltiplas Categorias';

                  const todosValidados = grupo.itens.every(i => i.status === 'Validado');
                  const statusGeralExibir = todosValidados ? 'Validado' : 'Pendente';

                  return (
                    <React.Fragment key={grupo.idAgrupado}>
                      
                      {/* 🔹 LINHA PRINCIPAL DA FATURA */}
                      <tr className={`border-b border-zinc-800 transition-colors ${isExpandido ? 'bg-zinc-800/40' : 'bg-zinc-900 hover:bg-zinc-800/70'} ${todosItensSelecionados ? 'bg-orange-950/20' : ''}`}>
                        <td className="p-4">
                          <input 
                            type="checkbox" 
                            checked={todosItensSelecionados} 
                            ref={el => { if (el) el.indeterminate = algumItemSelecionado && !todosItensSelecionados; }}
                            onChange={() => toggleSelecionadoGrupo(grupo.todasIds)} 
                            className="w-4 h-4 accent-orange-500 cursor-pointer" 
                          />
                        </td>
                        <td className="p-4 cursor-pointer text-orange-500 hover:text-orange-400" onClick={() => toggleExpandir(grupo.idAgrupado)}>
                          {!grupo.isAvulsa && (
                            <div className="w-6 h-6 rounded-md bg-zinc-950 border border-zinc-700 flex items-center justify-center transition-all">
                              {isExpandido ? '🔽' : '▶️'}
                            </div>
                          )}
                        </td>
                        <td className="p-4 font-mono text-[11px] text-zinc-400">{grupo.data_despesa}</td>
                        <td className="p-4">
                           <div className="font-black uppercase text-zinc-100 truncate max-w-[250px]">{grupo.fornecedorLogico}</div>
                           {grupo.nif && <div className="text-[9px] text-zinc-500 font-mono mt-0.5">NIF: {grupo.nif}</div>}
                        </td>
                        <td className="p-4 cursor-pointer" onClick={() => toggleExpandir(grupo.idAgrupado)}>
                          <div className="flex flex-col whitespace-normal max-w-[300px]">
                            {grupo.isAvulsa ? (
                               <span className="font-medium text-zinc-300 text-[11px]">{grupo.itens[0].parsed.nome}</span>
                            ) : (
                              <>
                                <span className="font-bold text-blue-400">{grupo.faturaRef}</span>
                                <span className="text-[10px] text-zinc-500 font-bold mt-0.5">📦 {grupo.itens.length} itens extraídos</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${temRascunhos ? 'bg-amber-500/20 text-amber-400 animate-pulse' : (categoriasUnicas.length > 1 ? 'bg-purple-500/20 text-purple-400' : 'bg-zinc-800 text-zinc-300')}`}>
                            {categoriaExibir}
                          </span>
                        </td>
                        <td className="p-4 text-center">{renderizarStatus(statusGeralExibir)}</td>
                        <td className="p-4 text-right font-black text-xl text-red-500 tracking-tighter">
                          {grupo.valorTotal.toFixed(2)}€
                        </td>
                        <td className="p-4 text-center">
                          <button onClick={() => { toggleSelecionadoGrupo(grupo.todasIds); abrirClassificacaoEmMassa(); }} className="bg-zinc-950 hover:bg-orange-600 border border-zinc-800 hover:border-orange-500 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-bold transition-all text-white">
                            {temRascunhos ? 'Classificar' : 'Editar Fatura'}
                          </button>
                        </td>
                      </tr>

                      {/* 🔹 SUB-LINHAS DOS ITENS */}
                      {isExpandido && !grupo.isAvulsa && grupo.itens.map((item: DespesaExtendida) => {
                        const isItemRascunho = item.categoria === '⚠️ Por Classificar';
                        
                        return (
                          <tr key={item.id} className={`bg-zinc-950/80 hover:bg-zinc-900 transition-all border-b border-zinc-900 ${selecionados.includes(item.id) ? 'bg-orange-950/10' : ''}`}>
                            <td className="p-3 pl-8 text-center border-l-2 border-orange-500/50">
                              <input type="checkbox" checked={selecionados.includes(item.id)} onChange={() => toggleSelecionadoIndividual(item.id)} className="w-3.5 h-3.5 accent-orange-500 cursor-pointer" />
                            </td>
                            <td className="p-3"></td>
                            <td className="p-3 text-right text-zinc-600 font-black">↳</td>
                            <td className="p-3 font-mono text-[11px] text-zinc-400">
                              <span className="bg-zinc-800/80 px-2 py-1 rounded border border-zinc-700 text-zinc-200">
                                {item.parsed.qtd} {item.parsed.und}
                              </span>
                            </td>
                            <td className="p-3 text-[11px] font-medium text-zinc-300 whitespace-normal max-w-sm">
                              {item.parsed.nome}
                            </td>
                            <td className="p-3">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${isItemRascunho ? 'bg-amber-500/10 text-amber-500' : 'text-zinc-500 border border-zinc-800'}`}>
                                {item.categoria}
                              </span>
                            </td>
                            <td className="p-3 text-center opacity-80">{renderizarStatus(item.status)}</td>
                            <td className="p-3 text-right font-mono font-bold text-red-400/80 text-xs">
                              {item.valorLimpo.toFixed(2)}€
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => abrirEditarDespesa(item)} className="text-zinc-500 hover:text-orange-400 text-[10px] font-bold underline transition-colors">
                                Editar Item
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
                
                {despesasAgrupadas.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-zinc-600 font-bold">Nenhum registo encontrado para este período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL DE EDIÇÃO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]">
          <div className="bg-zinc-900 w-full max-w-xl rounded-3xl p-6 flex flex-col max-h-[90vh] shadow-2xl border border-zinc-800">
            <h2 className="text-xl font-black mb-4 flex items-center justify-between text-white">
              {modoBulk ? '📦 Classificação em Massa da Fatura' : '✏️ Editar Item Específico'}
              <button onClick={() => setModalAberto(false)} className="text-zinc-500 hover:text-white bg-zinc-950 w-8 h-8 rounded-full flex items-center justify-center transition-colors">✕</button>
            </h2>
            
            <form onSubmit={salvarDespesa} className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
              {!modoBulk && (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Descrição do Item</label>
                    <input required type="text" value={formDespesa.descricao} onChange={e => setFormDespesa({...formDespesa, descricao: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-300 mt-1" />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Valor Unitário (€)</label>
                      <input required type="number" step="0.01" value={formDespesa.valor || ''} onChange={e => setFormDespesa({...formDespesa, valor: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-red-400 font-bold mt-1" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Data</label>
                      <input type="date" required value={formDespesa.data_despesa} onChange={e => setFormDespesa({...formDespesa, data_despesa: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs font-bold text-white mt-1" />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-orange-500 mt-4 mb-2">Classificar no Centro de Custo:</label>
                <select value={formDespesa.categoria} onChange={e => setFormDespesa({...formDespesa, categoria: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-orange-500 outline-none">
                  {categoriasDespesas.filter(c => c !== '⚠️ Por Classificar' || !modoBulk).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mt-4 mb-2">Estado do Pagamento da Fatura:</label>
                <select value={formDespesa.status} onChange={e => setFormDespesa({...formDespesa, status: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-green-400 font-bold focus:border-green-500 outline-none">
                  <option value="Validado">✓ Sim, Fatura Paga na Integra</option>
                  <option value="Pendente">⏳ Não, Pagamento Pendente</option>
                  <option value="Falta Fatura">⚠️ Paga, mas Falta Anexar Fatura Físca</option>
                </select>
              </div>
              
              <button type="submit" disabled={processando || formDespesa.categoria === '⚠️ Por Classificar'} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-4 rounded-xl mt-6 disabled:opacity-50 uppercase tracking-widest shadow-[0_0_15px_rgba(234,88,12,0.3)] transition-all">
                {processando ? 'A Gravar...' : (modoBulk ? 'Confirmar Fatura Inteira' : 'Gravar Alteração no Item')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}