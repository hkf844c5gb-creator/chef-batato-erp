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
}

export default function ConciliacaoPage() {
  const [historico, setHistorico] = useState<SessaoAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [statusTexto, setStatusTexto] = useState('A extrair itens e faturas...'); 

  const [files, setFiles] = useState<File[]>([]);
  const [categoria, setCategoria] = useState('Fatura');
  const [periodo, setPeriodo] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });
  const [autoDetectado, setAutoDetectado] = useState(false);

  const [filtroMes, setFiltroMes] = useState('');
  const [selecionados, setSelecionados] = useState<string[]>([]);

  // Estado para controlar a Fatura/Sessão aberta no Modal de Detalhes
  const [sessaoDetalhe, setSessaoDetalhe] = useState<SessaoAuditoria | null>(null);

  const categoriasDisponiveis = [
    { id: 'Extrato', label: '🏦 Extrato Bancário' },
    { id: 'Fatura', label: '🧾 Recibo / Fatura' },
    { id: 'Glovo', label: '🛵 Extrato Glovo' },
    { id: 'Palmbites', label: '🌴 Extrato Palmbites' }
  ];

  async function carregarHistorico() {
    setLoading(true);
    let query = supabase.from('auditoria_sessoes').select('*').order('periodo_ref', { ascending: false }); 

    if (filtroMes) query = query.eq('periodo_ref', filtroMes);

    const { data, error } = await query;
    if (error) {
      console.error("🔥 ERRO A LER SUPABASE:", error);
      alert("Erro ao puxar histórico: " + error.message);
    } else if (data) {
      setHistorico(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    carregarHistorico();
    setSelecionados([]);
  }, [filtroMes]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selecionados = Array.from(e.target.files);
      setFiles(selecionados);
      
      const nome = selecionados[0].name.toLowerCase();
      let detectado = 'Fatura'; 
      
      if (nome.includes('glovo')) detectado = 'Glovo';
      else if (nome.includes('palm') || nome.includes('palmbites')) detectado = 'Palmbites';
      else if (nome.includes('extrato') || nome.includes('banco') || nome.includes('cgd')) detectado = 'Extrato';
      else if (nome.includes('recibo') || nome.includes('fatura') || nome.includes('pagamento')) detectado = 'Fatura';

      setCategoria(detectado);
      setAutoDetectado(true);
    }
  };

  const processarInsercaoNoEstoque = async (itens: any[], fornecedor: string, mesRef: string) => {
    if (!itens || itens.length === 0) return;

    for (const item of itens) {
      try {
        if (item.tipo === 'alimentar' || item.tipo === 'embalagem') {
          const { data: insumoExistente } = await supabase
            .from('insumos')
            .select('id, quantidade_atual')
            .ilike('nome', `%${item.nome_extraido}%`)
            .limit(1)
            .maybeSingle();

          if (insumoExistente) {
            const novaQtd = Number(insumoExistente.quantidade_atual) + Number(item.quantidade);
            await supabase.from('insumos').update({ quantidade_atual: novaQtd }).eq('id', insumoExistente.id);
          } else {
            await supabase.from('insumos').insert([{
              nome: item.nome_extraido,
              unidade_medida: item.unidade || 'unidade',
              quantidade_atual: item.quantidade,
              custo_unidade: Number(item.valor_total) / Number(item.quantidade),
              fornecedor_principal: fornecedor
            }]);
          }
        } else if (item.tipo === 'geral') {
          await supabase.from('despesas').insert([{
            descricao: item.nome_extraido,
            categoria: 'Despesas Gerais e Ferramentas',
            valor: item.valor_total,
            fornecedor: fornecedor,
            data_despesa: new Date().toISOString().split('T')[0],
            mes_referencia: mesRef,
            pago: true
          }]);
        }
      } catch (err) {
        console.error("Erro a inserir item no ERP:", item, err);
      }
    }
  };

  const iniciarAuditoria = async () => {
    if (files.length === 0) return alert('Por favor, anexe pelo menos um ficheiro.');
    
    setProcessando(true);
    setProgresso({ atual: 1, total: files.length });

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgresso({ atual: i + 1, total: files.length });
        setStatusTexto(`A analisar ficheiro ${i + 1} de ${files.length}...`);

        // 🛡️ 1. VERIFICAÇÃO DE DUPLICADOS (Evitar processar a mesma fatura 2x)
        const jaExiste = historico.some(h => {
          return h.resumo?.fileName === file.name || JSON.stringify(h.resumo || {}).includes(file.name);
        });

        if (jaExiste) {
          alert(`⚠️ A fatura "${file.name}" já se encontra no sistema! Vamos saltar este ficheiro para não duplicar custos.`);
          continue; // Salta para a próxima repetição do loop
        }

        const nomeFile = file.name.toLowerCase();
        let catIndividual = categoria; 
        if (autoDetectado) {
          if (nomeFile.includes('glovo')) catIndividual = 'Glovo';
          else if (nomeFile.includes('palm') || nomeFile.includes('palmbites')) catIndividual = 'Palmbites';
          else if (nomeFile.includes('extrato') || nomeFile.includes('banco') || nomeFile.includes('cgd')) catIndividual = 'Extrato';
          else catIndividual = 'Fatura';
        }

        const base64Real = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
        });

        const payload = {
          fileBase64: base64Real,
          fileName: file.name,
          fileType: file.type,
          tipoArquivo: catIndividual,
          periodoRef: periodo
        };

        const res = await fetch('/admin/conciliacao/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const dataAPI = await res.json();

        if (!res.ok) {
           console.error(`Erro ao processar ${file.name}:`, dataAPI.error);
        } else {
           if (dataAPI.dadosLidos && dataAPI.dadosLidos.itens && dataAPI.dadosLidos.itens.length > 0) {
              await processarInsercaoNoEstoque(dataAPI.dadosLidos.itens, dataAPI.dadosLidos.fornecedor, periodo);
           }
        }

        // 🛡️ 2. TRAVÃO DE SEGURANÇA (15 Segundos) ENTRE FATURAS
        if (i < files.length - 1) {
          setStatusTexto(`A arrefecer a Inteligência Artificial... (A aguardar 15s para o ficheiro ${i + 2})`);
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
      }

      alert('Lote finalizado! Matéria-prima adicionada ao Stock e Despesas atualizadas! 🎉');
      setFiles([]);
      setAutoDetectado(false);
      carregarHistorico(); 

    } catch (err: any) {
      alert(`Erro fatal durante o processamento: ${err.message}`);
    } finally {
      setProcessando(false);
      setProgresso({ atual: 0, total: 0 });
      setStatusTexto('A extrair itens e faturas...');
    }
  };

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleTodos = () => {
    if (selecionados.length === historico.length) {
      setSelecionados([]);
    } else {
      setSelecionados(historico.map(h => h.id));
    }
  };

  const apagarSelecionados = async () => {
    if (selecionados.length === 0) return;
    if (!confirm(`Tem a certeza que deseja eliminar ${selecionados.length} documento(s)?`)) return;

    const { error } = await supabase.from('auditoria_sessoes').delete().in('id', selecionados);
    
    if (!error) {
      setHistorico(prev => prev.filter(item => !selecionados.includes(item.id)));
      setSelecionados([]);
    } else {
      alert("Erro ao eliminar documentos: " + error.message);
    }
  };

  const mudarCategoria = async (id: string, novaCategoria: string) => {
    const { error } = await supabase.from('auditoria_sessoes').update({ tipo_arquivo: novaCategoria }).eq('id', id);
    if (!error) setHistorico(prev => prev.map(item => item.id === id ? { ...item, tipo_arquivo: novaCategoria } : item));
  };

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto relative">
      <div className="mb-8 border-b border-zinc-800 pb-4">
        <h1 className="text-3xl font-bold text-orange-500 flex items-center gap-3">
          Conciliador Inteligente <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full">v2.2</span>
        </h1>
        <p className="text-zinc-400 text-sm mt-2">Upload em lote, eliminação em massa, extração inteligente de itens de faturas.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUNA ESQUERDA */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-xl">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4">Anexar Lote de Documentos</h3>
            
            <div className="border-2 border-dashed border-zinc-700 hover:border-orange-500 bg-zinc-950 rounded-xl p-8 text-center transition-colors relative mb-4">
              <input type="file" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".pdf,.png,.jpg,.jpeg,.csv" />
              <div className="text-4xl mb-2">📂</div>
              {files.length > 0 ? (
                <div className="flex flex-col items-center">
                  <p className="text-sm font-bold text-green-500">{files.length} ficheiro(s) selecionado(s)</p>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2 px-2">
                    {files.map(f => f.name).join(', ')}
                  </p>
                </div>
              ) : (
                <p className="text-sm font-bold text-zinc-300">Escolha vários ficheiros ou arraste</p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Mês de Referência</label>
              <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none" />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-2 flex justify-between">
                <span>Categoria (Base)</span>
                {autoDetectado && <span className="text-green-500 text-[10px] animate-pulse">✨ Lote Automático</span>}
              </label>
              <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setAutoDetectado(false); }} className={`w-full bg-zinc-950 border ${autoDetectado ? 'border-green-500 text-green-400' : 'border-zinc-800 text-zinc-200'} rounded-lg px-3 py-2 text-sm outline-none`}>
                {categoriasDisponiveis.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <button onClick={iniciarAuditoria} disabled={processando || files.length === 0} className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${processando || files.length === 0 ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)]'}`}>
              Ler Faturas & Extrair Estoque 🚀
            </button>
          </div>
        </div>

        {/* COLUNA DIREITA */}
        <div className="lg:col-span-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl flex flex-col h-full overflow-hidden min-h-[500px]">
            
            <div className="p-5 border-b border-zinc-800 bg-zinc-900/80 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  🗄️ Histórico (Clique numa fatura para ver os itens)
                </h3>
                
                {selecionados.length > 0 && (
                  <button onClick={apagarSelecionados} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-red-900/20">
                    🗑️ Eliminar Selecionados ({selecionados.length})
                  </button>
                )}
              </div>
              
              <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-700">
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Mês:</span>
                <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="bg-transparent text-sm text-white focus:outline-none cursor-pointer" />
                {filtroMes && (
                  <button onClick={() => setFiltroMes('')} className="text-red-500 hover:text-red-400 font-bold ml-2 text-xs">LIMPAR</button>
                )}
              </div>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto bg-zinc-950/30">
              {loading ? (
                <div className="flex justify-center items-center h-full text-zinc-500">A carregar registos...</div>
              ) : historico.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-full text-zinc-600">
                  <span className="text-5xl mb-4">📂</span>
                  <p className="text-sm">Nenhum documento encontrado no histórico.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center px-4 py-2 border-b border-zinc-800 mb-2">
                     <input 
                       type="checkbox" 
                       checked={selecionados.length === historico.length && historico.length > 0} 
                       onChange={toggleTodos}
                       className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 accent-orange-500 cursor-pointer"
                     />
                     <span className="text-xs text-zinc-500 font-bold uppercase ml-3">Selecionar Todos</span>
                  </div>

                  {historico.map((sessao) => {
                    const dados = sessao.resumo;
                    const listaItens = dados?.itens || dados?.produtos || dados?.line_items || dados?.dadosExtraidos?.itens || dados?.dadosExtraidos?.produtos || (Array.isArray(dados) ? dados : []);
                    const qtdItensListados = listaItens.length > 0 ? listaItens.length : (dados?.dadosExtraidos ? 1 : 0);

                    // EXTRAI O NOME DO FICHEIRO ORIGINAL E O EMOJI
                    const nomeFicheiroOriginal = dados?.fileName || dados?.nome_arquivo || dados?.file_name;
                    
                    let emoji = '🧾';
                    let tituloFallback = 'Recibo / Fatura';

                    if (sessao.tipo_arquivo === 'Glovo') { emoji = '🛵'; tituloFallback = 'Extrato Glovo'; }
                    else if (sessao.tipo_arquivo === 'Palmbites') { emoji = '🌴'; tituloFallback = 'Extrato Palmbites'; }
                    else if (sessao.tipo_arquivo === 'Extrato') { emoji = '🏦'; tituloFallback = 'Extrato Bancário'; }

                    const tituloExibicao = nomeFicheiroOriginal ? nomeFicheiroOriginal : tituloFallback;

                    return (
                      <div 
                        key={sessao.id} 
                        onClick={() => setSessaoDetalhe(sessao)}
                        className={`bg-zinc-900 border p-4 rounded-xl flex justify-between items-center cursor-pointer hover:border-orange-500/50 transition-all ${selecionados.includes(sessao.id) ? 'border-orange-500 shadow-sm shadow-orange-900/20' : 'border-zinc-700'}`}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0 pr-4" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={selecionados.includes(sessao.id)}
                            onChange={() => toggleSelecionado(sessao.id)}
                            className="w-5 h-5 rounded border-zinc-700 bg-zinc-950 accent-orange-500 cursor-pointer flex-shrink-0"
                          />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-xs text-orange-400 font-bold bg-orange-950 px-2 py-1 rounded">{sessao.periodo_ref}</span>
                              <span className="text-xs text-zinc-500">ID: {sessao.id.split('-')[0]}...</span>
                            </div>
                            <h4 className="text-sm font-bold text-white mt-2 truncate w-full" title={tituloExibicao}>
                              {emoji} {tituloExibicao}
                            </h4>
                            
                            {qtdItensListados > 0 ? (
                              <p className="text-[10px] font-mono text-green-400 mt-2">
                                ✓ {qtdItensListados} registo(s) extraído(s) (Clique para ver detalhes)
                              </p>
                            ) : (
                              <p className="text-[10px] font-mono text-zinc-500 mt-2">
                                Clique para inspecionar dados extraídos
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <select value={sessao.tipo_arquivo} onChange={(e) => mudarCategoria(sessao.id, e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-orange-500">
                            {categoriasDisponiveis.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* MODAL DE DETALHES DOS ITENS DA FATURA */}
      {sessaoDetalhe && (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-2xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-start border-b border-zinc-800 pb-4 mb-4">
              <div className="pr-4">
                <span className="text-xs font-bold text-orange-400 bg-orange-950 px-2 py-1 rounded inline-block mb-2">Período: {sessaoDetalhe.periodo_ref}</span>
                <h3 className="text-xl font-black text-white break-words">
                  {sessaoDetalhe.resumo?.fileName ? `📑 Documento: ${sessaoDetalhe.resumo.fileName}` : 'Detalhes dos Itens Extraídos'}
                </h3>
              </div>
              <button 
                onClick={() => setSessaoDetalhe(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white w-8 h-8 rounded-full font-bold flex items-center justify-center transition-colors flex-shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {sessaoDetalhe.resumo?.fornecedor && (
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 mb-4 flex justify-between items-center">
                  <span className="text-xs text-zinc-400 font-bold uppercase">Fornecedor Identificado:</span>
                  <span className="text-sm font-black text-white">{sessaoDetalhe.resumo.fornecedor}</span>
                </div>
              )}

              {(() => {
                const dados = sessaoDetalhe.resumo;
                const listaItens = dados?.itens || dados?.produtos || dados?.line_items || dados?.dadosExtraidos?.itens || dados?.dadosExtraidos?.produtos || (Array.isArray(dados) ? dados : []);

                const itensParaMostrar = listaItens.length > 0 ? listaItens : (dados?.dadosExtraidos ? [{
                  nome_extraido: `Fatura / Recibo - ${dados.dadosExtraidos.fornecedor || 'Fornecedor'}`,
                  tipo: 'geral',
                  quantidade: 1,
                  unidade: 'un',
                  valor_total: dados.dadosExtraidos.valorTotal || 0
                }] : []);

                if (!itensParaMostrar || itensParaMostrar.length === 0) {
                  return (
                    <div className="text-center py-12 text-zinc-500 text-sm">
                      <p className="font-bold mb-2">Conteúdo bruto guardado:</p>
                      <pre className="text-[10px] text-zinc-400 bg-zinc-950 p-3 rounded-xl overflow-x-auto text-left mt-2">
                        {JSON.stringify(dados, null, 2)}
                      </pre>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {itensParaMostrar.map((item: any, idx: number) => (
                      <div key={idx} className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                        <div>
                          <h4 className="text-sm font-bold text-zinc-200">
                            {item.nome_extraido || item.nome || item.descricao || item.item || 'Item Descrito'}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${item.tipo === 'alimentar' ? 'bg-green-950 text-green-400 border border-green-900/50' : item.tipo === 'embalagem' ? 'bg-blue-950 text-blue-400 border border-blue-900/50' : 'bg-amber-950 text-amber-400 border border-amber-900/50'}`}>
                              {item.tipo || 'geral'}
                            </span>
                            <span className="text-xs text-zinc-500 font-mono">Qtd: {item.quantidade || item.qtd || 1} {item.unidade || 'un'}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-black text-white">{(Number(item.valor_total || item.valor || item.preco || 0)).toFixed(2)}€</span>
                          <span className="text-[10px] text-zinc-500 block uppercase">Total Item</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="border-t border-zinc-800 pt-4 mt-4 flex justify-between items-center">
              <span className="text-xs text-zinc-500">ID da Sessão: {sessaoDetalhe.id}</span>
              <button 
                onClick={() => setSessaoDetalhe(null)}
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-colors"
              >
                Fechar Janela
              </button>
            </div>
          </div>
        </div>
      )}

      {processando && (
        <div className="fixed inset-0 bg-black/90 z-[120] flex flex-col items-center justify-center backdrop-blur-md">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-2xl font-bold text-white mb-2 text-center px-4">{statusTexto}</h2>
          <p className="text-zinc-400">
            A auditar <span className="font-bold text-white">{progresso.atual}</span> de <span className="font-bold text-white">{progresso.total}</span> ficheiros inseridos.
          </p>
          <div className="w-64 bg-zinc-800 rounded-full h-2.5 mt-6 overflow-hidden">
             <div className="bg-orange-500 h-2.5 transition-all duration-300" style={{ width: `${(progresso.atual / progresso.total) * 100}%` }}></div>
          </div>
          <p className="text-orange-500 text-sm mt-4 animate-pulse">A Inteligência Artificial está a catalogar as quantidades do seu stock.</p>
        </div>
      )}
    </div>
  );
}