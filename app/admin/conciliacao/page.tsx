'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Conexão direta e à prova de falhas com o Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface SessaoAuditoria {
  id: number;
  created_at: string;
  tipo_arquivo: string;
  periodo_ref: string;
  resumo: any;
  divergencias: any[];
}

export default function ConciliacaoPage() {
  const [historico, setHistorico] = useState<SessaoAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);

  // Estados do upload
  const [file, setFile] = useState<File | null>(null);
  const [categoria, setCategoria] = useState('Fatura');
  const [periodo, setPeriodo] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });
  const [autoDetectado, setAutoDetectado] = useState(false);

  // Estado do Filtro
  const [filtroMes, setFiltroMes] = useState('');

  const categoriasDisponiveis = [
    { id: 'Extrato', label: '🏦 Extrato Bancário' },
    { id: 'Fatura', label: '🧾 Recibo / Fatura' },
    { id: 'Glovo', label: '🛵 Extrato Glovo' },
    { id: 'Palmbites', label: '🌴 Extrato Palmbites' }
  ];

  // 1. FUNÇÃO PARA BUSCAR O HISTÓRICO COM FILTRO
  async function carregarHistorico() {
    setLoading(true);
    
    let query = supabase
      .from('auditoria_sessoes')
      .select('*')
      .order('created_at', { ascending: false });

    if (filtroMes) {
      query = query.eq('periodo_ref', filtroMes);
    }

    const { data, error } = await query;
    if (!error && data) {
      setHistorico(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    carregarHistorico();
  }, [filtroMes]);

  // 2. RECONHECIMENTO AUTOMÁTICO DO FICHEIRO
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selecionado = e.target.files[0];
      setFile(selecionado);
      
      const nome = selecionado.name.toLowerCase();
      let detectado = 'Fatura'; 
      
      if (nome.includes('glovo')) detectado = 'Glovo';
      else if (nome.includes('palm') || nome.includes('palmbites')) detectado = 'Palmbites';
      else if (nome.includes('extrato') || nome.includes('banco') || nome.includes('cgd')) detectado = 'Extrato';
      else if (nome.includes('recibo') || nome.includes('fatura') || nome.includes('pagamento')) detectado = 'Fatura';

      setCategoria(detectado);
      setAutoDetectado(true);
    }
  };

  // 3. PROCESSAR E ANEXAR DOCUMENTO
  const iniciarAuditoria = async () => {
    if (!file) return alert('Por favor, anexe um ficheiro.');
    setProcessando(true);

    try {
      const payload = {
        fileName: file.name,
        fileType: file.type,
        tipoArquivo: categoria,
        periodoRef: periodo
      };

      const res = await fetch('/admin/conciliacao/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na auditoria');

      alert('Documento processado e guardado no histórico!');
      setFile(null);
      setAutoDetectado(false);
      carregarHistorico(); // Atualiza a lista automaticamente

    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setProcessando(false);
    }
  };

  // 4. APAGAR FICHEIRO DO HISTÓRICO
  const apagarSessao = async (id: number) => {
    if (!confirm('Eliminar este documento do histórico?')) return;
    const { error } = await supabase.from('auditoria_sessoes').delete().eq('id', id);
    if (!error) setHistorico(prev => prev.filter(item => item.id !== id));
  };

  // 5. EDITAR CATEGORIA NO HISTÓRICO
  const mudarCategoria = async (id: number, novaCategoria: string) => {
    const { error } = await supabase.from('auditoria_sessoes').update({ tipo_arquivo: novaCategoria }).eq('id', id);
    if (!error) setHistorico(prev => prev.map(item => item.id === id ? { ...item, tipo_arquivo: novaCategoria } : item));
  };

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto">
      <div className="mb-8 border-b border-zinc-800 pb-4">
        {/* AVISO VISUAL DE VERSÃO NOVA */}
        <h1 className="text-3xl font-bold text-orange-500 flex items-center gap-3">
          Conciliador Inteligente <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full">v2.0</span>
        </h1>
        <p className="text-zinc-400 text-sm mt-2">Reconhecimento, cruzamento de dados e histórico completo.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUNA ESQUERDA: ANEXAR */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-xl">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4">Novo Documento</h3>
            
            <div className="border-2 border-dashed border-zinc-700 hover:border-orange-500 bg-zinc-950 rounded-xl p-8 text-center transition-colors relative mb-4">
              <input type="file" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".pdf,.png,.jpg,.csv" />
              <div className="text-4xl mb-2">📂</div>
              {file ? (
                <p className="text-sm font-bold text-green-500 truncate px-2">{file.name}</p>
              ) : (
                <p className="text-sm font-bold text-zinc-300">Escolha o ficheiro ou arraste</p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Mês do Documento</label>
              <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none" />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-2 flex justify-between">
                <span>Categoria detetada</span>
                {autoDetectado && <span className="text-green-500 text-[10px] animate-pulse">✨ Automático</span>}
              </label>
              <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setAutoDetectado(false); }} className={`w-full bg-zinc-950 border ${autoDetectado ? 'border-green-500 text-green-400' : 'border-zinc-800 text-zinc-200'} rounded-lg px-3 py-2 text-sm outline-none`}>
                {categoriasDisponiveis.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <button onClick={iniciarAuditoria} disabled={processando || !file} className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${processando || !file ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}>
              {processando ? 'A Processar...' : 'Analisar e Guardar 🚀'}
            </button>
          </div>
        </div>

        {/* COLUNA DIREITA: HISTÓRICO COM FILTRO */}
        <div className="lg:col-span-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl flex flex-col h-full overflow-hidden min-h-[500px]">
            
            {/* CABEÇALHO DO HISTÓRICO */}
            <div className="p-5 border-b border-zinc-800 bg-zinc-900/80 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                🗄️ Histórico de Documentos
              </h3>
              
              <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-700">
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Mês:</span>
                <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="bg-transparent text-sm text-white focus:outline-none cursor-pointer" />
                {filtroMes && (
                  <button onClick={() => setFiltroMes('')} className="text-red-500 hover:text-red-400 font-bold ml-2 text-xs">LIMPAR</button>
                )}
              </div>
            </div>
            
            {/* LISTAGEM DO HISTÓRICO */}
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
                  {historico.map((sessao) => (
                    <div key={sessao.id} className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs text-orange-400 font-bold bg-orange-950 px-2 py-1 rounded">{sessao.periodo_ref}</span>
                          <span className="text-xs text-zinc-500">ID: {sessao.id}</span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-2">
                          {sessao.tipo_arquivo === 'Glovo' ? '🛵 Extrato Glovo' : 
                           sessao.tipo_arquivo === 'Palmbites' ? '🌴 Extrato Palmbites' : 
                           sessao.tipo_arquivo === 'Extrato' ? '🏦 Extrato Bancário' : '🧾 Recibo / Fatura'}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                        <select value={sessao.tipo_arquivo} onChange={(e) => mudarCategoria(sessao.id, e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300">
                          {categoriasDisponiveis.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <button onClick={() => apagarSessao(sessao.id)} className="bg-red-950/50 text-red-500 hover:bg-red-600 hover:text-white border border-red-900/50 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold">
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
