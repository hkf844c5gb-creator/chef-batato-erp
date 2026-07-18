'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

interface SessaoAuditoria {
  id: number;
  created_at: string;
  tipo_arquivo: string;
  periodo_ref: string;
  resumo: any;
  divergencias: any[];
}

// Usamos o supabase-js normal para garantir que a Vercel compila sem erros de pacotes em falta
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ConciliacaoPage() {
  const [historico, setHistorico] = useState<SessaoAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);

  // Estados do Formulário
  const [file, setFile] = useState<File | null>(null);
  const [categoria, setCategoria] = useState('Fatura');
  const [periodo, setPeriodo] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });
  const [autoDetectado, setAutoDetectado] = useState(false);

  // NOVO: Filtro de Mês para o Histórico
  const [filtroMes, setFiltroMes] = useState('');

  const categoriasDisponiveis = [
    { id: 'Extrato', label: '🏦 Extrato Bancário' },
    { id: 'Fatura', label: '🧾 Recibo / Fatura' },
    { id: 'Glovo', label: '🛵 Extrato Glovo' },
    { id: 'Palmbites', label: '🌴 Extrato Palmbites' }
  ];

  // 1. CARREGAR HISTÓRICO (AGORA COM FILTRO)
  async function carregarHistorico() {
    setLoading(true);
    
    let query = supabase
      .from('auditoria_sessoes')
      .select('*')
      .order('created_at', { ascending: false });

    // Se houver um mês selecionado no filtro, aplica-o à pesquisa
    if (filtroMes) {
      query = query.eq('periodo_ref', filtroMes);
    }

    const { data, error } = await query;

    if (!error && data) {
      setHistorico(data);
    }
    setLoading(false);
  }

  // Recarrega a tabela sempre que o filtro de mês é alterado
  useEffect(() => {
    carregarHistorico();
  }, [filtroMes]);

  // 2. DETEÇÃO INTELIGENTE DO TIPO DE FICHEIRO
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selecionado = e.target.files[0];
      setFile(selecionado);
      
      const nomeLower = selecionado.name.toLowerCase();
      let detectado = 'Fatura'; 
      
      if (nomeLower.includes('glovo')) detectado = 'Glovo';
      else if (nomeLower.includes('palm') || nomeLower.includes('palmbites')) detectado = 'Palmbites';
      else if (nomeLower.includes('extrato') || nomeLower.includes('banco') || nomeLower.includes('cgd')) detectado = 'Extrato';
      else if (nomeLower.includes('recibo') || nomeLower.includes('fatura') || nomeLower.includes('pagamento')) detectado = 'Fatura';

      setCategoria(detectado);
      setAutoDetectado(true);
    }
  };

  // 3. INICIAR AUDITORIA
  const iniciarAuditoria = async () => {
    if (!file) return alert('Por favor, anexe um ficheiro primeiro.');
    setProcessando(true);

    try {
      const payload = {
        fileBase64: "simulacao_base64",
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

      if (!res.ok) throw new Error(data.error || 'Falha ao auditar documento');

      alert('Auditoria concluída com sucesso!');
      setFile(null);
      setAutoDetectado(false);
      carregarHistorico(); // Atualiza a tabela na hora

    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setProcessando(false);
    }
  };

  // 4. APAGAR REGISTO
  const apagarSessao = async (id: number) => {
    if (!confirm('Tem a certeza que quer apagar este registo?')) return;
    
    const { error } = await supabase.from('auditoria_sessoes').delete().eq('id', id);
    if (error) {
      alert('Erro ao apagar: ' + error.message);
    } else {
      setHistorico(prev => prev.filter(item => item.id !== id));
    }
  };

  // 5. ATUALIZAR CATEGORIA
  const mudarCategoria = async (id: number, novaCategoria: string) => {
    const { error } = await supabase
      .from('auditoria_sessoes')
      .update({ tipo_arquivo: novaCategoria })
      .eq('id', id);

    if (error) {
      alert('Erro ao atualizar categoria: ' + error.message);
    } else {
      setHistorico(prev => prev.map(item => item.id === id ? { ...item, tipo_arquivo: novaCategoria } : item));
    }
  };

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-orange-500">Conciliador Inteligente</h1>
        <p className="text-zinc-400 text-sm mt-1">Auditoria automática de faturas e extratos bancários</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUNA ESQUERDA: UPLOAD */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-xl">
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4">Anexar Documento</h3>
            
            <div className="border-2 border-dashed border-zinc-700 hover:border-orange-500 bg-zinc-950 rounded-xl p-8 text-center transition-colors relative mb-4">
              <input 
                type="file" 
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                accept=".pdf,.png,.jpg,.jpeg,.csv"
              />
              <div className="text-4xl mb-2">📂</div>
              {file ? (
                <p className="text-sm font-bold text-green-500 truncate px-2">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm font-bold text-zinc-300">Escolha o ficheiro ou arraste</p>
                  <p className="text-xs text-zinc-500 mt-1">PDF, JPEG, PNG, CSV</p>
                </>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Mês de Referência</label>
              <input 
                type="month" 
                value={periodo} 
                onChange={(e) => setPeriodo(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none"
              />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-2 flex justify-between">
                <span>Categoria</span>
                {autoDetectado && <span className="text-green-500 text-[10px] animate-pulse">✨ Auto-detetado</span>}
              </label>
              <select 
                value={categoria}
                onChange={(e) => { setCategoria(e.target.value); setAutoDetectado(false); }}
                className={`w-full bg-zinc-950 border ${autoDetectado ? 'border-green-900/50 text-green-400' : 'border-zinc-800 text-zinc-200'} rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none transition-colors`}
              >
                {categoriasDisponiveis.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <button 
              onClick={iniciarAuditoria}
              disabled={processando || !file}
              className={`w-full py-3 rounded-xl text-sm font-bold shadow-lg transition-all ${processando || !file ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
            >
              {processando ? 'A Ler e Cruzar Dados...' : 'Iniciar Auditoria IA 🚀'}
            </button>
          </div>
        </div>

        {/* COLUNA DIREITA: HISTÓRICO COM FILTRO DE MÊS */}
        <div className="lg:col-span-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl flex flex-col h-full overflow-hidden">
            
            {/* CABEÇALHO COM O FILTRO */}
            <div className="p-5 border-b border-zinc-800 bg-zinc-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Histórico Processado</h3>
              
              <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                <label className="text-[10px] text-zinc-400 font-bold uppercase">Filtrar Mês:</label>
                <input 
                  type="month" 
                  value={filtroMes}
                  onChange={(e) => setFiltroMes(e.target.value)}
                  className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
                />
                {filtroMes && (
                  <button onClick={() => setFiltroMes('')} className="text-xs text-red-500 hover:text-red-400 font-bold ml-2" title="Limpar Filtro">
                    ✕
                  </button>
                )}
              </div>
            </div>
            
            {/* LISTA DE HISTÓRICO */}
            <div className="p-5 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center items-center h-32 text-zinc-500 animate-pulse">A carregar cofre de documentos...</div>
              ) : historico.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-48 text-zinc-600">
                  <span className="text-4xl mb-3">🗄️</span>
                  <p className="text-sm">Nenhum documento encontrado para este período.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {historico.map((sessao) => (
                    <div key={sessao.id} className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:border-zinc-700 transition-colors">
                      
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded">ID: {sessao.id}</span>
                          <span className="text-xs text-orange-400 font-bold bg-orange-900/20 px-2 py-0.5 rounded">{sessao.periodo_ref}</span>
                        </div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2 mt-2">
                          {sessao.tipo_arquivo === 'Glovo' ? '🛵 Extrato Glovo' : 
                           sessao.tipo_arquivo === 'Palmbites' ? '🌴 Extrato Palmbites' : 
                           sessao.tipo_arquivo === 'Extrato' ? '🏦 Extrato Bancário' : '🧾 Recibo / Fatura'}
                        </h4>
                        
                        {sessao.divergencias && sessao.divergencias.length > 0 ? (
                          <p className="text-[11px] font-bold text-red-400 mt-2 flex items-center gap-1">
                            ⚠️ {sessao.divergencias.length} Divergência(s) Encontrada(s)
                          </p>
                        ) : (
                          <p className="text-[11px] font-bold text-green-400 mt-2 flex items-center gap-1">
                            ✅ Documento Validado
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <select 
                          value={sessao.tipo_arquivo}
                          onChange={(e) => mudarCategoria(sessao.id, e.target.value)}
                          className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:border-orange-500 outline-none flex-1 sm:flex-none cursor-pointer"
                        >
                          {categoriasDisponiveis.map(c => <option key={c.id} value={c.id}>{c.label.split(' ')[1]} {c.label.split(' ')[2] || ''}</option>)}
                        </select>
                        
                        <button 
                          onClick={() => apagarSessao(sessao.id)}
                          className="bg-red-950/30 text-red-500 hover:bg-red-900 hover:text-white border border-red-900/50 p-1.5 rounded-lg transition-colors"
                          title="Apagar Registo"
                        >
                          🗑️
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

