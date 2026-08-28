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
  const [sessaoDetalhe, setSessaoDetalhe] = useState<SessaoAuditoria | null>(null);

  async function carregarHistorico() {
    setLoading(true);
    // Ordenação segura apenas pelo periodo_ref (evita o erro do created_at)
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

  // 🗑️ FUNÇÕES DE ELIMINAÇÃO INDIVIDUAL
  const apagarSessaoIndividual = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Tem a certeza que deseja eliminar este documento do histórico?')) return;
    await supabase.from('auditoria_sessoes').delete().eq('id', id);
    setHistorico(prev => prev.filter(item => item.id !== id));
    setSelecionados(prev => prev.filter(itemId => itemId !== id));
    if (sessaoDetalhe?.id === id) setSessaoDetalhe(null);
  };

  const toggleSelecionado = (id: string) => { setSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };
  const toggleTodos = () => { setSelecionados(selecionados.length === historico.length ? [] : historico.map(h => h.id)); };
  
  const apagarSelecionados = async () => {
    if (selecionados.length === 0) return;
    if (!confirm(`Deseja eliminar ${selecionados.length} documento(s)?`)) return;
    await supabase.from('auditoria_sessoes').delete().in('id', selecionados);
    setHistorico(prev => prev.filter(item => !selecionados.includes(item.id))); setSelecionados([]);
  };

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto relative">
      <div className="mb-8 border-b border-zinc-800 pb-4">
        <h1 className="text-3xl font-bold text-orange-500 flex items-center gap-3">
          Conciliador Inteligente <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full">v13 Unificador</span>
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-xl">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4">Anexar Lote</h3>
            <div className="border-2 border-dashed border-zinc-700 hover:border-orange-500 bg-zinc-950 rounded-xl p-8 text-center relative mb-4">
              <input type="file" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".pdf,.png,.jpg,.jpeg,.csv" />
              <div className="text-4xl mb-2">📂</div>
              {files.length > 0 ? (<p className="text-sm font-bold text-green-500">{files.length} ficheiro(s)</p>) : (<p className="text-sm font-bold text-zinc-300">Escolher ficheiros</p>)}
            </div>
            <button onClick={iniciarAuditoria} disabled={processando || files.length === 0} className="w-full py-3 rounded-xl text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(147,51,234,0.3)]">Ler Faturas & Extrair Dados 🚀</button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl flex flex-col h-full min-h-[500px]">
            <div className="p-5 border-b border-zinc-800 bg-zinc-900/80 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-bold text-zinc-300 uppercase">🗄️ Histórico de Faturas</h3>
                {selecionados.length > 0 && (
                  <div className="flex gap-2">
                    <button onClick={reprocessarParaDespesas} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md transition-all">💸 Enviar Rascunhos ({selecionados.length})</button>
                    <button onClick={apagarSelecionados} className="bg-red-950 border border-red-900 text-red-400 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-red-900 hover:text-white transition-all">🗑️ Eliminar Selecionados</button>
                  </div>
                )}
              </div>
              <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="bg-zinc-950 px-3 py-1.5 border border-zinc-700 rounded-lg text-sm text-white" />
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto bg-zinc-950/30">
              {loading ? (<div className="text-center text-zinc-500">A carregar...</div>) : historico.length === 0 ? (<div className="text-center text-zinc-600 py-10">Nenhum documento.</div>) : (
                <div className="space-y-3">
                  <div className="flex items-center px-4 py-2 border-b border-zinc-800 mb-2">
                     <input type="checkbox" checked={selecionados.length === historico.length && historico.length > 0} onChange={toggleTodos} className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 accent-orange-500 cursor-pointer" />
                     <span className="text-xs text-zinc-500 font-bold uppercase ml-3">Selecionar Todos</span>
                  </div>
                  {historico.map((sessao) => {
                    const dados = sessao.resumo || {};
                    const dadosExtraidos = dados.dadosExtraidos || dados;
                    const listaItens = extrairListaItens(dadosExtraidos);
                    const nomeFicheiro = dados.fileName || dados.nome_arquivo || 'Fatura';
                    const fornecedor = dadosExtraidos?.fornecedor || 'Desconhecido';
                    const nif = dadosExtraidos?.nif_fornecedor ? ` (NIF: ${dadosExtraidos.nif_fornecedor})` : '';
                    const valorTotal = Number(dadosExtraidos?.valorTotal || 0).toFixed(2);

                    return (
                      <div key={sessao.id} onClick={() => setSessaoDetalhe(sessao)} className={`bg-zinc-900 border p-4 rounded-xl flex items-center justify-between cursor-pointer transition-all hover:bg-zinc-800/50 ${selecionados.includes(sessao.id) ? 'border-orange-500 bg-orange-950/20' : 'border-zinc-700'}`}>
                        <div className="flex items-center flex-1">
                          <input type="checkbox" checked={selecionados.includes(sessao.id)} onChange={() => toggleSelecionado(sessao.id)} onClick={(e)=>e.stopPropagation()} className="w-5 h-5 mr-4 accent-orange-500 cursor-pointer flex-shrink-0" />
                          <div className="flex-1">
                            <h4 className="text-sm font-bold text-white line-clamp-1">🧾 {nomeFicheiro}</h4>
                            <p className="text-xs text-zinc-400 mt-1 line-clamp-1">{fornecedor}{nif} | <span className="text-zinc-200 font-bold">{valorTotal}€</span> | ✓ {listaItens.length} itens lidos</p>
                          </div>
                        </div>
                        <button onClick={(e) => apagarSessaoIndividual(sessao.id, e)} className="ml-4 w-8 h-8 rounded-lg bg-zinc-800 hover:bg-red-600 flex items-center justify-center text-zinc-400 hover:text-white transition-colors" title="Eliminar Fatura">
                          🗑️
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {sessaoDetalhe && (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 w-full max-w-2xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] border border-zinc-800">
            <div className="flex justify-between items-start border-b border-zinc-800 pb-4 mb-4">
              <h3 className="text-xl font-black text-white">Detalhes do Extrato / Fatura</h3>
              <button onClick={() => setSessaoDetalhe(null)} className="bg-zinc-800 hover:bg-zinc-700 text-white w-8 h-8 rounded-full font-bold transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2 mb-4">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Itens Desmembrados (CFO)</h4>
              {(() => {
                const dados = sessaoDetalhe.resumo || {};
                const dadosExtraidos = dados.dadosExtraidos || dados;
                const listaItens = extrairListaItens(dadosExtraidos);
                if (listaItens.length === 0) return <p className="text-zinc-500 text-sm py-4">Nenhum item detalhado.</p>;
                return (
                  <div className="space-y-2">
                    {listaItens.map((item: any, idx: number) => (
                      <div key={idx} className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl flex justify-between items-center hover:border-zinc-700 transition-colors">
                        <div>
                          <h4 className="text-sm font-bold text-zinc-200">{item.nome_extraido || item.nome || 'Item Descrito'}</h4>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[10px] text-zinc-500">Qtd: {item.quantidade || 1} {item.unidade || 'un'}</span>
                             {item.categoria_sugerida && (
                               <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30 uppercase tracking-wider">
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
              <button onClick={(e) => apagarSessaoIndividual(sessaoDetalhe.id, e)} className="bg-red-950 border border-red-900 hover:bg-red-900 text-red-400 hover:text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors shadow-lg">
                🗑️ Eliminar Esta Fatura
              </button>
            </div>
          </div>
        </div>
      )}
      {processando && (
        <div className="fixed inset-0 bg-black/90 z-[120] flex flex-col items-center justify-center backdrop-blur-sm">
           <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_20px_rgba(249,115,22,0.5)]"></div>
           <h2 className="text-xl font-bold text-white tracking-wider">{statusTexto}</h2>
           <p className="text-xs text-zinc-500 mt-2 font-mono">Processo nº {progresso.atual} / {progresso.total}</p>
        </div>
      )}
    </div>
  );
}