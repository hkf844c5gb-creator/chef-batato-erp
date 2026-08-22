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
      alert("Erro ao puxar histórico: " + error.message);
    } else if (data) {
      const dataOrdenada = [...data].sort((a, b) => b.id.localeCompare(a.id));
      setHistorico(dataOrdenada);
    }
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
      setCategoria(detectado);
      setAutoDetectado(true);
    }
  };

  const extrairListaItens = (dados: any) => {
    if (!dados) return [];
    if (Array.isArray(dados)) return dados;
    if (Array.isArray(dados.itens)) return dados.itens;
    if (Array.isArray(dados.produtos)) return dados.produtos;
    if (Array.isArray(dados.line_items)) return dados.line_items;
    if (dados.dadosExtraidos && Array.isArray(dados.dadosExtraidos.itens)) return dados.dadosExtraidos.itens;
    if (dados.dadosExtraidos && Array.isArray(dados.dadosExtraidos.produtos)) return dados.dadosExtraidos.produtos;
    if (dados.dadosLidos && Array.isArray(dados.dadosLidos.itens)) return dados.dadosLidos.itens;
    return [];
  };

  const processarInsercaoGlobal = async (itens: any[], fornecedor: string, mesRef: string, arquivoNome: string, tipoArquivo: string, apenasDespesas = false, dataFaturaDoc = '') => {
    if (!itens || itens.length === 0) return;

    for (const item of itens) {
      const tipoItem = String(item.tipo || 'geral').toLowerCase();
      const fornecedorFormatado = fornecedor || 'Fornecedor Diversos';
      const valorReal = Number(item.valor_total || item.valor || item.preco || 0);
      const qtdItem = item.quantidade || item.qtd || 1;
      const unidItem = item.unidade || 'un';

      if (valorReal <= 0) continue; 

      if (!apenasDespesas && (tipoItem === 'alimentar' || tipoItem === 'embalagem' || tipoItem === 'insumo')) {
        const { data: insumoExistente } = await supabase.from('insumos').select('id, quantidade_atual').ilike('nome', `%${item.nome_extraido || item.nome}%`).limit(1).maybeSingle();
        if (insumoExistente) {
          const novaQtd = Number(insumoExistente.quantidade_atual) + Number(qtdItem);
          await supabase.from('insumos').update({ quantidade_atual: novaQtd }).eq('id', insumoExistente.id);
        } else {
          await supabase.from('insumos').insert([{
            nome: item.nome_extraido || item.nome, unidade_medida: unidItem, quantidade_atual: qtdItem,
            custo_unidade: valorReal / Number(qtdItem), fornecedor_principal: fornecedorFormatado
          }]);
        }
      }

      const nomeRealDoItem = item.nome_extraido || item.nome || item.descricao || 'Despesa Extraída';
      const nomeDaFaturaSeguro = arquivoNome ? arquivoNome : 'Doc. Extraído';
      const descFinal = `[${qtdItem} ${unidItem}] ${nomeRealDoItem} 📄 ${nomeDaFaturaSeguro}`;
      
      let dataDespesaGravar = new Date().toISOString().split('T')[0];
      if (dataFaturaDoc && dataFaturaDoc.length >= 10) {
        try { dataDespesaGravar = new Date(dataFaturaDoc).toISOString().split('T')[0]; } catch(e) {}
      }

      // CORREÇÃO CRÍTICA: Usa as colunas corretas (pago, mes_referencia)
      const { error } = await supabase.from('despesas').insert([{
        descricao: descFinal,
        categoria: '⚠️ Por Classificar', 
        valor: valorReal,
        fornecedor: fornecedorFormatado,
        data_despesa: dataDespesaGravar,
        mes_referencia: mesRef,
        pago: true // Como o Rafael disse: Todas já estão pagas!
      }]);

      if (error) throw new Error(`Erro na Base de Dados ao gravar o item "${nomeRealDoItem}": ${error.message}`);
    }
  };

  const iniciarAuditoria = async () => {
    if (files.length === 0) return alert('Por favor, anexe pelo menos um ficheiro.');
    setProcessando(true); setProgresso({ atual: 1, total: files.length });

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgresso({ atual: i + 1, total: files.length });
        setStatusTexto(`A analisar ficheiro ${i + 1} de ${files.length}...`);

        const jaExiste = historico.some(h => h.resumo?.fileName === file.name || JSON.stringify(h.resumo || {}).includes(file.name));
        if (jaExiste) continue; 

        const nomeFile = file.name.toLowerCase();
        let catIndividual = categoria; 
        if (autoDetectado) {
          if (nomeFile.includes('glovo')) catIndividual = 'Glovo';
          else if (nomeFile.includes('palm') || nomeFile.includes('palmbites')) catIndividual = 'Palmbites';
          else if (nomeFile.includes('extrato') || nomeFile.includes('banco')) catIndividual = 'Extrato';
          else catIndividual = 'Fatura';
        }

        const base64Real = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error);
        });

        const res = await fetch('/admin/conciliacao/api', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64Real, fileName: file.name, fileType: file.type, tipoArquivo: catIndividual, periodoRef: periodo })
        });

        const dataAPI = await res.json();
        if (res.ok && dataAPI.dadosLidos) {
           let itensParaProcessar = extrairListaItens(dataAPI.dadosLidos);
           if (itensParaProcessar.length === 0 && dataAPI.dadosLidos.valorTotal) {
              itensParaProcessar = [{ nome_extraido: `Fatura Lote (${catIndividual})`, tipo: 'geral', quantidade: 1, unidade: 'un', valor_total: dataAPI.dadosLidos.valorTotal }];
           }
           if (itensParaProcessar.length > 0) {
              const dataFaturaDoc = dataAPI.dadosLidos.data || dataAPI.dadosLidos.data_fatura || '';
              await processarInsercaoGlobal(itensParaProcessar, dataAPI.dadosLidos.fornecedor, periodo, file.name, catIndividual, false, dataFaturaDoc);
           }
        }
        if (i < files.length - 1) {
          setStatusTexto(`A aguardar IA (15s)...`);
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
      }
      alert('Lote finalizado e Rascunhos enviados com sucesso! 🎉');
      setFiles([]); setAutoDetectado(false); carregarHistorico(); 
    } catch (err: any) { alert(`Erro fatal: ${err.message}`); } finally { setProcessando(false); setProgresso({ atual: 0, total: 0 }); setStatusTexto('A extrair itens...'); }
  };

  const reprocessarParaDespesas = async () => {
    if (selecionados.length === 0) return;
    if (!confirm(`Deseja desmembrar as ${selecionados.length} faturas selecionadas e enviá-las para as Despesas?`)) return;
    setProcessando(true); setProgresso({ atual: 1, total: selecionados.length }); setStatusTexto('A extrair rascunhos...');
    try {
      for (let i = 0; i < selecionados.length; i++) {
        const id = selecionados[i];
        const sessao = historico.find(h => h.id === id);
        if (!sessao) continue;
        setProgresso({ atual: i + 1, total: selecionados.length });

        const dados = sessao.resumo || {};
        let itensParaProcessar = extrairListaItens(dados);
        let valorTotalBruto = dados?.dadosExtraidos?.valorTotal || dados?.valorTotal || dados?.total || 0;
        
        if (itensParaProcessar.length === 0 && valorTotalBruto > 0) {
           itensParaProcessar = [{ nome_extraido: `Fatura Antiga (${sessao.tipo_arquivo})`, tipo: 'geral', quantidade: 1, unidade: 'un', valor_total: valorTotalBruto }];
        }
        if (itensParaProcessar.length > 0) {
           const dataFaturaDoc = dados?.dadosExtraidos?.data || dados?.data || dados?.data_fatura || '';
           await processarInsercaoGlobal(itensParaProcessar, dados?.dadosExtraidos?.fornecedor || dados?.fornecedor || 'Fornecedor Desconhecido', sessao.periodo_ref, dados?.fileName || dados?.nome_arquivo || '', sessao.tipo_arquivo, true, dataFaturaDoc);
        }
      }
      alert('Mágico! Todos os itens das faturas foram inseridos nas Despesas! Pode ir lá classificar. 🎉');
      setSelecionados([]);
    } catch (err: any) { alert(`Erro ao inserir no Supabase: ${err.message}`); } finally { setProcessando(false); setProgresso({ atual: 0, total: 0 }); setStatusTexto('A extrair itens...'); }
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
          Conciliador Inteligente <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full">v6 Garantia Total</span>
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
            <button onClick={iniciarAuditoria} disabled={processando || files.length === 0} className="w-full py-3 rounded-xl text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white transition-all disabled:opacity-50">Ler Faturas & Extrair Dados 🚀</button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl flex flex-col h-full min-h-[500px]">
            <div className="p-5 border-b border-zinc-800 bg-zinc-900/80 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-bold text-zinc-300 uppercase">🗄️ Histórico de Faturas</h3>
                {selecionados.length > 0 && (
                  <div className="flex gap-2">
                    <button onClick={reprocessarParaDespesas} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg">💸 Enviar Rascunhos ({selecionados.length})</button>
                    <button onClick={apagarSelecionados} className="bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">🗑️ Eliminar</button>
                  </div>
                )}
              </div>
              <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="bg-zinc-950 px-3 py-1.5 border border-zinc-700 rounded-lg text-sm text-white" />
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto bg-zinc-950/30">
              {loading ? (<div className="text-center text-zinc-500">A carregar...</div>) : historico.length === 0 ? (<div className="text-center text-zinc-600 py-10">Nenhum documento.</div>) : (
                <div className="space-y-3">
                  <div className="flex items-center px-4 py-2 border-b border-zinc-800 mb-2">
                     <input type="checkbox" checked={selecionados.length === historico.length && historico.length > 0} onChange={toggleTodos} className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 accent-orange-500" />
                     <span className="text-xs text-zinc-500 font-bold uppercase ml-3">Selecionar Todos</span>
                  </div>
                  {historico.map((sessao) => {
                    const dados = sessao.resumo || {};
                    const listaItens = extrairListaItens(dados);
                    const nomeFicheiro = dados.fileName || dados.nome_arquivo || 'Fatura';
                    const fornecedor = dados.dadosExtraidos?.fornecedor || dados.fornecedor || 'Desconhecido';
                    const valorTotal = Number(dados.dadosExtraidos?.valorTotal || dados.valorTotal || dados.total || 0).toFixed(2);

                    return (
                      <div key={sessao.id} onClick={() => setSessaoDetalhe(sessao)} className={`bg-zinc-900 border p-4 rounded-xl flex items-center cursor-pointer transition-all ${selecionados.includes(sessao.id) ? 'border-orange-500 bg-orange-950/20' : 'border-zinc-700'}`}>
                        <input type="checkbox" checked={selecionados.includes(sessao.id)} onChange={() => toggleSelecionado(sessao.id)} onClick={(e)=>e.stopPropagation()} className="w-5 h-5 mr-4 accent-orange-500" />
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-white">🧾 {nomeFicheiro}</h4>
                          <p className="text-xs text-zinc-400 mt-1">{fornecedor} | {valorTotal}€ | ✓ {listaItens.length} itens extraídos</p>
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

      {sessaoDetalhe && (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-4">
          <div className="bg-zinc-900 w-full max-w-2xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-start border-b border-zinc-800 pb-4 mb-4">
              <h3 className="text-xl font-black text-white">Detalhes da Fatura</h3>
              <button onClick={() => setSessaoDetalhe(null)} className="bg-zinc-800 text-white w-8 h-8 rounded-full font-bold">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4">
              <h4 className="text-xs font-bold text-zinc-400 uppercase">Itens Desmembrados da Fatura</h4>
              {(() => {
                const listaItens = extrairListaItens(sessaoDetalhe.resumo);
                if (listaItens.length === 0) return <p className="text-zinc-500 text-sm py-4">Sem itens detalhados. A IA leu apenas o total.</p>;
                return (
                  <div className="space-y-2">
                    {listaItens.map((item: any, idx: number) => (
                      <div key={idx} className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl flex justify-between items-center">
                        <div>
                          <h4 className="text-sm font-bold text-zinc-200">{item.nome_extraido || item.nome || item.descricao || 'Item Descrito'}</h4>
                          <span className="text-[10px] text-zinc-500">Qtd: {item.quantidade || 1} {item.unidade || 'un'}</span>
                        </div>
                        <span className="text-sm font-black text-orange-400">{(Number(item.valor_total || item.valor || item.preco || 0)).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="border-t border-zinc-800 pt-4 mt-4 text-center">
              <button onClick={() => setSessaoDetalhe(null)} className="bg-orange-600 text-white text-xs font-bold px-6 py-2.5 rounded-xl">Fechar Detalhes</button>
            </div>
          </div>
        </div>
      )}
      {processando && (
        <div className="fixed inset-0 bg-black/90 z-[120] flex flex-col items-center justify-center"><div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-6"></div><h2 className="text-2xl font-bold text-white">{statusTexto}</h2></div>
      )}
    </div>
  );
}