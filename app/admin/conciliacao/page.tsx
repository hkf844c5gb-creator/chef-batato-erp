'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface SessaoAuditoria {
  id: string; 
  tipo_arquivo: string;
  periodo_ref: string;
  resumo: any;
  divergencias: any[];
  created_at: string;
}

export default function ConciliacaoPage() {
  const [historico, setHistorico] = useState<SessaoAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [statusTexto, setStatusTexto] = useState('A extrair itens e faturas...'); 

  const [files, setFiles] = useState<File[]>([]);
  const [categoria, setCategoria] = useState('Fatura');
  
  const getMesAtual = () => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  };

  const [periodo, setPeriodo] = useState(getMesAtual);
  const [autoDetectado, setAutoDetectado] = useState(false);
  const [filtroMes, setFiltroMes] = useState(getMesAtual);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  
  // Estado para controlar as linhas expandidas (Acordeão)
  const [linhasExpandidas, setLinhasExpandidas] = useState<string[]>([]);

  async function carregarHistorico() {
    setLoading(true);
    let query = supabase.from('auditoria_sessoes').select('*').order('periodo_ref', { ascending: false }); 
    if (filtroMes) query = query.eq('periodo_ref', filtroMes);

    const { data, error } = await query;
    if (error) alert("Erro ao puxar histórico: " + error.message);
    else if (data) setHistorico([...data].sort((a, b) => b.id.localeCompare(a.id)));
    setLoading(false);
  }

  useEffect(() => { carregarHistorico(); setSelecionados([]); }, [filtroMes]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selecionados = Array.from(e.target.files);
      setFiles(selecionados);
      
      const nome = selecionados[0].name.toLowerCase();
      let detectado = 'Fatura'; 
      if (nome.includes('glovo')) detectado = 'Glovo';
      else if (nome.includes('palm') || nome.includes('palmbites')) detectado = 'Palmbites';
      else if (nome.includes('extrato') || nome.includes('banco') || nome.includes('cgd')) detectado = 'Extrato';
      else if (nome.includes('meta') || nome.includes('facebook') || nome.includes('ads')) detectado = 'Fatura';
      
      setCategoria(detectado);
      setAutoDetectado(true);
    }
  };

  const extrairListaItens = (dados: any) => {
    if (!dados) return [];
    if (Array.isArray(dados)) return dados;
    if (Array.isArray(dados.itens)) return dados.itens;
    return [];
  };

  const processarInsercaoGlobal = async (dadosLidos: any, mesRef: string, arquivoNome: string, tipoArquivo: string, dataFaturaDoc = '') => {
    const itens = extrairListaItens(dadosLidos);
    if (!itens || itens.length === 0) return { inseridos: 0, duplicados: 0 };

    let totalInseridos = 0, totalDuplicados = 0;
    
    const normalizarFornecedor = (nome: string) => {
      if (!nome) return 'Fornecedor Diversos';
      const n = nome.toUpperCase();
      if (n.includes('RECHEIO')) return 'Recheio Cash & Carry';
      if (n.includes('AZURVA') || n.includes('INGREDIENTE SALIENTE')) return 'Talho D\'Azurva';
      if (n.includes('MERCADONA') || n.includes('IRMADONA')) return 'Mercadona';
      if (n.includes('PINGO DOCE')) return 'Pingo Doce';
      if (n.includes('CONTINENTE')) return 'Continente';
      if (n.includes('GLOVO')) return 'Glovo';
      if (n.includes('UBER')) return 'Uber Eats';
      if (n.includes('MAKRO')) return 'Makro';
      return nome.trim();
    };

    const fornecedorBruto = dadosLidos.fornecedor || 'Fornecedor Diversos';
    const fornecedorFormatado = normalizarFornecedor(fornecedorBruto);
    
    const nifFormatado = dadosLidos.nif_fornecedor && dadosLidos.nif_fornecedor !== 'S/N' ? ` NIF ${dadosLidos.nif_fornecedor}` : '';
    const faturaFormatada = dadosLidos.numero_fatura && dadosLidos.numero_fatura !== 'S/N' ? dadosLidos.numero_fatura : (arquivoNome || 'Doc. Extraído');

    let categoriaAutomatica = '⚠️ Por Classificar';
    if (fornecedorFormatado !== 'Fornecedor Diversos') {
       const { data: memoriaFornecedor } = await supabase.from('despesas').select('categoria').ilike('descricao', `%${fornecedorFormatado}%`).neq('categoria', '⚠️ Por Classificar').order('id', { ascending: false }).limit(1).maybeSingle();
       if (memoriaFornecedor && memoriaFornecedor.categoria) categoriaAutomatica = memoriaFornecedor.categoria; 
    }

    let dataDespesaGravar = new Date().toISOString().split('T')[0];
    if (dataFaturaDoc && dataFaturaDoc.length >= 10) {
      try { dataDespesaGravar = new Date(dataFaturaDoc).toISOString().split('T')[0]; } catch(e) {}
    }

    for (const item of itens) {
      const valorReal = Number(item.valor_total || item.valor || item.preco || 0);
      const qtdItem = item.quantidade || item.qtd || 1;
      const unidItem = item.unidade || 'un';

      if (valorReal === 0) continue; 

      const nomeRealDoItem = item.nome_extraido || item.nome || item.descricao || 'Despesa Extraída';
      const descFinal = `[${qtdItem} ${unidItem}] ${nomeRealDoItem} | ${fornecedorFormatado}${nifFormatado} 📄 ${faturaFormatada}`;
      
      const { data: checkDuplicado } = await supabase.from('despesas').select('id').eq('descricao', descFinal).eq('valor', valorReal).eq('data_despesa', dataDespesaGravar).eq('metodo_pagamento', 'Conciliação Automática').limit(1);

      if (checkDuplicado && checkDuplicado.length > 0) {
        totalDuplicados++;
        continue;
      }

      let catItem = categoriaAutomatica;
      if (item.categoria_sugerida && item.categoria_sugerida !== "") {
        catItem = item.categoria_sugerida;
      } else if (nomeRealDoItem.toUpperCase().includes('IVA')) {
        catItem = categoriaAutomatica; 
      }

      await supabase.from('despesas').insert([{
        descricao: descFinal, categoria: catItem, valor: valorReal, data_despesa: dataDespesaGravar, metodo_pagamento: 'Conciliação Automática', status: 'Validado' 
      }]);
      totalInseridos++;
    }
    
    return { inseridos: totalInseridos, duplicados: totalDuplicados };
  };

  const iniciarAuditoria = async () => {
    if (files.length === 0) return alert('Por favor, anexe pelo menos um ficheiro.');
    setProcessando(true); setProgresso({ atual: 1, total: files.length });

    let finalInseridos = 0, finalDuplicados = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgresso({ atual: i + 1, total: files.length });
        setStatusTexto(`A analisar ficheiro ${i + 1} de ${files.length}...`);

        const jaExiste = historico.some(h => h.resumo?.fileName === file.name || JSON.stringify(h.resumo || {}).includes(file.name));
        if (jaExiste) continue; 

        if (file.size > 3.3 * 1024 * 1024) {
          alert(`🚫 O ficheiro "${file.name}" excede os 3.3MB.\nFaça um print/foto da fatura e anexe a imagem.`);
          continue; 
        }

        const nomeFile = file.name.toLowerCase();
        let catIndividual = categoria; 
        if (autoDetectado) {
          if (nomeFile.includes('glovo')) catIndividual = 'Glovo';
          else if (nomeFile.includes('palm') || nomeFile.includes('palmbites')) catIndividual = 'Palmbites';
          else if (nomeFile.includes('extrato') || nomeFile.includes('banco')) catIndividual = 'Extrato';
          else catIndividual = 'Fatura';
        }

        const base64Real = await new Promise((resolve, reject) => {
          const reader = new FileReader(); 
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result); 
          reader.onerror = error => reject(error);
        });

        const res = await fetch('/admin/conciliacao/api', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64Real, fileName: file.name, fileType: file.type, tipoArquivo: catIndividual, periodoRef: periodo })
        });

        if (!res.ok) {
          const erroTexto = await res.text();
          let msgServidor = erroTexto;
          try { const jsonErro = JSON.parse(erroTexto); msgServidor = jsonErro.error || jsonErro.message || erroTexto; } catch(e) {}
          alert(`🚨 FALHA NO DOCUMENTO: ${file.name}\n\nMotivo:\n"${msgServidor}"`);
          continue; 
        }

        const dataAPI = await res.json();
        
        if (dataAPI && dataAPI.dadosLidos) {
           const dataFaturaDoc = dataAPI.dadosLidos.data || dataAPI.dadosLidos.data_fatura || '';
           const resultado = await processarInsercaoGlobal(dataAPI.dadosLidos, periodo, file.name, catIndividual, dataFaturaDoc);
           finalInseridos += resultado.inseridos;
           finalDuplicados += resultado.duplicados;
        }
        
        if (i < files.length - 1) {
          setStatusTexto(`A aguardar IA (15s)...`);
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
      }
      
      alert(`Lote finalizado com sucesso! 🎉\n\n✅ Itens gravados perfeitamente: ${finalInseridos}\n⚠️ Itens ignorados (Duplicados): ${finalDuplicados}`);
      setFiles([]); setAutoDetectado(false); carregarHistorico(); 
    } catch (err: any) { alert(`Aviso no lote: ${err.message}`); } finally { 
      setProcessando(false); setProgresso({ atual: 0, total: 0 }); setStatusTexto('A extrair itens...'); 
    }
  };

  const reprocessarParaDespesas = async () => {
    if (selecionados.length === 0) return;
    if (!confirm(`Deseja desmembrar as ${selecionados.length} faturas selecionadas e enviá-las para as Despesas?`)) return;
    
    setProcessando(true); setProgresso({ atual: 1, total: selecionados.length }); setStatusTexto('A reprocessar faturas antigas...');
    
    let finalInseridos = 0, finalDuplicados = 0;

    try {
      for (let i = 0; i < selecionados.length; i++) {
        const id = selecionados[i];
        const sessao = historico.find(h => h.id === id);
        if (!sessao) continue;
        setProgresso({ atual: i + 1, total: selecionados.length });

        const dados = sessao.resumo || {};
        const dadosExtraidos = dados.dadosExtraidos || dados;
        const dataFaturaDoc = dadosExtraidos.data || dadosExtraidos.data_fatura || '';
        
        const resultado = await processarInsercaoGlobal(dadosExtraidos, sessao.periodo_ref, dados?.fileName || dados?.nome_arquivo || '', sessao.tipo_arquivo, dataFaturaDoc);
        finalInseridos += resultado.inseridos;
        finalDuplicados += resultado.duplicados;
      }
      
      alert(`Mágico! Faturas processadas! 🎉\n\n✅ ${finalInseridos} novos itens inseridos nas Despesas.\n🛡️ ${finalDuplicados} itens repetidos bloqueados.`);
      setSelecionados([]);
    } catch (err: any) { alert(`Erro: ${err.message}`); } finally { setProcessando(false); setProgresso({ atual: 0, total: 0 }); setStatusTexto('A extrair itens...'); }
  };

  const apagarSessaoIndividual = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Tem a certeza que deseja eliminar este documento do histórico?')) return;
    await supabase.from('auditoria_sessoes').delete().eq('id', id);
    setHistorico(prev => prev.filter(item => item.id !== id));
    setSelecionados(prev => prev.filter(itemId => itemId !== id));
  };

  const toggleSelecionado = (id: string) => { setSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };
  const toggleTodos = () => { setSelecionados(selecionados.length === historico.length ? [] : historico.map(h => h.id)); };
  
  const apagarSelecionados = async () => {
    if (selecionados.length === 0) return;
    if (!confirm(`Deseja eliminar ${selecionados.length} documento(s)?`)) return;
    await supabase.from('auditoria_sessoes').delete().in('id', selecionados);
    setHistorico(prev => prev.filter(item => !selecionados.includes(item.id))); setSelecionados([]);
  };

  // 🎯 O BOTÃO QUE FAZ A LISTA EXPANDIR (Igual à imagem)
  const toggleExpand = (id: string) => {
    setLinhasExpandidas(prev => prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]);
  };

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto relative bg-[#09090b] min-h-screen text-zinc-300">
      <div className="mb-8 border-b border-zinc-800 pb-4">
        <h1 className="text-3xl font-bold text-orange-500 flex items-center gap-3">
          Conciliador Inteligente
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#121214] border border-zinc-800/50 p-6 rounded-xl">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">Anexar Lote</h3>
            <div className="border border-dashed border-zinc-700 hover:border-orange-500 bg-[#09090b] rounded-lg p-8 text-center relative mb-4">
              <input type="file" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".pdf,.png,.jpg,.jpeg,.csv" />
              <div className="text-4xl mb-2">📂</div>
              {files.length > 0 ? (<p className="text-sm font-bold text-green-500">{files.length} ficheiro(s)</p>) : (<p className="text-xs text-zinc-500 font-medium">Escolher ficheiros</p>)}
            </div>
            <button onClick={iniciarAuditoria} disabled={processando || files.length === 0} className="w-full py-3 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all disabled:opacity-50">Ler Faturas & Extrair</button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-[#121214] border border-zinc-800/50 rounded-xl flex flex-col h-full min-h-[500px]">
            <div className="p-4 border-b border-zinc-800/50 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <input type="checkbox" checked={selecionados.length === historico.length && historico.length > 0} onChange={toggleTodos} className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 accent-blue-500" />
                {selecionados.length > 0 && (
                  <div className="flex gap-2">
                    <button onClick={reprocessarParaDespesas} className="text-blue-400 hover:text-blue-300 text-xs font-bold transition-all">Reprocessar ({selecionados.length})</button>
                    <button onClick={apagarSelecionados} className="text-red-500 hover:text-red-400 text-xs font-bold transition-all">Eliminar</button>
                  </div>
                )}
              </div>
              <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="bg-[#09090b] px-3 py-1.5 border border-zinc-800 rounded text-xs text-zinc-400 outline-none" />
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {loading ? (<div className="text-center text-zinc-600 text-xs py-10">A carregar...</div>) : historico.length === 0 ? (<div className="text-center text-zinc-600 text-xs py-10">Nenhum documento.</div>) : (
                <div className="flex flex-col">
                  {historico.map((sessao) => {
                    const dados = sessao.resumo || {};
                    const dadosExtraidos = dados.dadosExtraidos || dados;
                    const listaItens = extrairListaItens(dadosExtraidos);
                    const nomeFicheiro = dados.fileName || dados.nome_arquivo || dadosExtraidos.fornecedor || 'Doc. Extraído';
                    
                    const fornecedor = dadosExtraidos?.fornecedor || 'FORNECEDOR DIVERSO';
                    const dataFatura = dadosExtraidos?.data || sessao.created_at?.split('T')[0] || 'S/Data';
                    
                    const isExpanded = linhasExpandidas.includes(sessao.id);

                    return (
                      <div key={sessao.id} className="flex flex-col border-b border-zinc-800/40">
                        {/* 🎯 A LINHA PRINCIPAL DA IMAGEM */}
                        <div className="flex items-center p-3 hover:bg-[#18181b] transition-colors gap-4">
                          <input type="checkbox" checked={selecionados.includes(sessao.id)} onChange={() => toggleSelecionado(sessao.id)} className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 accent-blue-500 ml-1" />
                          
                          {/* Botão Azul de Expandir */}
                          <button onClick={() => toggleExpand(sessao.id)} className="w-6 h-6 rounded flex items-center justify-center bg-[#1e293b] text-blue-400 hover:bg-[#334155] transition-colors flex-shrink-0">
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          
                          <div className="w-24 text-xs text-zinc-400 font-mono tracking-tighter flex-shrink-0">
                            {dataFatura}
                          </div>
                          
                          <div className="flex-1 text-xs font-black text-white uppercase truncate pr-4">
                            {fornecedor}
                          </div>
                          
                          <div className="w-64 flex flex-col items-start flex-shrink-0">
                            <span className="text-xs font-bold text-blue-500 truncate w-full">{nomeFicheiro}</span>
                            <span className="text-[10px] text-zinc-500">{listaItens.length} itens extraídos</span>
                          </div>

                          <button onClick={(e) => apagarSessaoIndividual(sessao.id, e)} className="w-8 h-8 rounded flex items-center justify-center text-zinc-600 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                            🗑️
                          </button>
                        </div>

                        {/* 🎯 OS ITENS EXPANDIDOS ABAIXO DA LINHA */}
                        {isExpanded && (
                          <div className="bg-[#09090b] flex flex-col py-1 border-t border-zinc-800/30">
                            {listaItens.length === 0 ? (
                              <div className="pl-24 py-2 text-[10px] text-zinc-600">Sem itens detalhados.</div>
                            ) : (
                              listaItens.map((item: any, idx: number) => {
                                const qtd = item.quantidade || item.qtd || 1;
                                const unid = item.unidade || 'un';
                                const nomeItem = item.nome_extraido || item.nome || item.descricao || 'Item desconhecido';
                                const categoria = item.categoria_sugerida || 'POR CLASSIFICAR';
                                
                                return (
                                  <div key={idx} className="flex items-center p-2 pl-12 hover:bg-[#121214] gap-3">
                                    <input type="checkbox" disabled className="w-3.5 h-3.5 rounded bg-zinc-900 border-zinc-800 opacity-30" />
                                    <span className="text-zinc-600 font-mono text-sm ml-2">↳</span>
                                    <div className="flex-1 text-xs text-zinc-300 truncate">
                                      <span className="text-zinc-500 mr-2">[{qtd} {unid}]</span>
                                      {nomeItem}
                                    </div>
                                    <div className="flex-shrink-0 mr-12">
                                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border tracking-wider uppercase flex items-center gap-1
                                        ${categoria === 'POR CLASSIFICAR' 
                                          ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' 
                                          : 'text-blue-400 bg-blue-500/10 border-blue-500/20'}`}>
                                        {categoria === 'POR CLASSIFICAR' && '⚠️ '}
                                        {categoria}
                                      </span>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {processando && (
        <div className="fixed inset-0 bg-black/90 z-[120] flex flex-col items-center justify-center backdrop-blur-sm">
           <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
           <h2 className="text-sm font-bold text-white tracking-widest uppercase">{statusTexto}</h2>
           <p className="text-[10px] text-zinc-500 mt-2 font-mono">Processo {progresso.atual}/{progresso.total}</p>
        </div>
      )}
    </div>
  );
}