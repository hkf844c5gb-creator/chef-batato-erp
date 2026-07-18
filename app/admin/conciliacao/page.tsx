'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface SessaoAuditoria {
  id: string;
  tipo_arquivo: string;
  periodo_ref: string;
  resumo: any;
  divergencias: any[];
  criado_em: string;
}

export default function PainelConciliacao() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [sessoes, setSessoes] = useState<SessaoAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  
  // Estados do upload
  const [tipoArquivo, setTipoArquivo] = useState('Fatura');
  const [periodoRef, setPeriodoRef] = useState(new Date().toISOString().slice(0, 7));
  const [base64File, setBase64File] = useState<string | null>(null);

  async function carregarSessoes() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('auditoria_sessoes')
        .select('*')
        .order('criado_em', { ascending: false });
      if (error) throw error;
      if (data) setSessoes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarSessoes(); }, []);

  // Conversor do ficheiro anexado para string Base64 para enviar à API
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setBase64File(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const processarDocumentoIA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!base64File) return alert('Por favor, anexe um documento primeiro.');
    
    setProcessando(true);
    try {
      const res = await fetch('/api/conciliacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64File,
          tipoArquivo,
          periodoRef
        })
      });

      const resultado = await res.json();
      if (!res.ok) throw new Error(resultado.error || 'Erro no processamento.');

      alert('Análise Inteligente Concluída! O cruzamento foi efetuado.');
      setBase64File(null);
      carregarSessoes();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessando(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Ativar Motores de IA...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24 selection:bg-orange-500/30">
      
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center transition-all">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-900/40 text-2xl">
            🤖
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Conciliador Inteligente</h1>
            <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Auditoria e Cruzamento por IA</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUNA ESQUERDA: ZONA DE CARREGAMENTO / UPLOAD */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-[24px] p-6 h-fit space-y-5">
          <h2 className="text-sm font-black uppercase text-zinc-300 tracking-wider">Anexar Novo Relatório</h2>
          
          <form onSubmit={processarDocumentoIA} className="space-y-4">
            <div>
              <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1.5">Origem / Tipo de Ficheiro</label>
              <select value={tipoArquivo} onChange={e => setTipoArquivo(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-indigo-500 font-bold">
                <option value="Fatura">Fatura de Fornecedor (PDF / Imagem)</option>
                <option value="Extrato">Extrato Bancário Mensal (PDF)</option>
                <option value="Glovo">Fatura de Taxas Glovo (PDF / CSV)</option>
                <option value="Palmbites">Ficheiro de Integração Palmbites</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1.5">Mês de Referência</label>
              <input type="month" value={periodoRef} onChange={e => setPeriodoRef(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none" />
            </div>

            <div className="pt-2">
              <label className="w-full flex flex-col items-center justify-center bg-zinc-950 border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 rounded-2xl p-6 text-center cursor-pointer transition-colors">
                <span className="text-3xl mb-2">📁</span>
                <span className="text-xs font-bold text-zinc-300">Escolha o ficheiro ou arraste</span>
                <span className="text-[10px] text-zinc-500 mt-1">PDF, JPEG, PNG, CSV</span>
                <input type="file" accept="image/*,application/pdf,text/csv" onChange={handleFileChange} className="hidden" />
              </label>
              {base64File && <p className="text-[10px] text-green-400 font-bold mt-2 text-center">✓ Ficheiro carregado em memória</p>}
            </div>

            <button type="submit" disabled={processando || !base64File} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg active:scale-95">
              {processando ? 'A Ler e Cruzar Dados...' : 'Iniciar Auditoria IA 🚀'}
            </button>
          </form>
        </div>

        {/* COLUNA DIREITA: HISTÓRICO DE AUDITORIAS E DIVERGÊNCIAS DETETADAS (Ocupa 2/3) */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-black uppercase text-zinc-300 tracking-wider pl-1">Resultados e Divergências Encontradas</h2>

          {sessoes.length === 0 ? (
            <p className="text-zinc-600 text-xs italic bg-zinc-900/20 p-8 rounded-2xl border border-zinc-800/40 text-center">Nenhum documento auditado até ao momento.</p>
          ) : sessoes.map(sessao => (
            <div key={sessao.id} className="bg-zinc-900/40 border border-zinc-800/60 rounded-[24px] p-5 space-y-4">
              
              {/* CABEÇALHO DO DOCUMENTO PROCESADO */}
              <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📄</span>
                  <div>
                    <h3 className="font-black text-sm text-white">{sessao.tipo_arquivo} - Ref: {sessao.periodo_ref}</h3>
                    <p className="text-[10px] text-zinc-500 font-mono">Processado em {new Date(sessao.criado_em).toLocaleString('pt-PT')}</p>
                  </div>
                </div>

                <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${sessao.divergencias.length > 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                  {sessao.divergencias.length > 0 ? `${sessao.divergencias.length} Alertas` : '100% Conciliado'}
                </span>
              </div>

              {/* LISTA DE DIVERGÊNCIAS DENTRO DO DOCUMENTO */}
              {sessao.divergencias.length > 0 ? (
                <div className="space-y-2">
                  {sessao.divergencias.map((div, i) => (
                    <div key={i} className="bg-red-950/20 border border-red-900/30 p-3 rounded-xl flex items-start gap-3">
                      <span className="text-red-400 font-bold text-xs mt-0.5">⚠️</span>
                      <div>
                        <span className="block text-xs font-black text-red-400">{div.alerta}</span>
                        <span className="text-[11px] text-zinc-400 font-medium mt-0.5 block">{div.detalhe}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-green-950/10 border border-green-900/20 p-3 rounded-xl flex items-center gap-2 text-green-400 text-xs font-bold">
                  <span>✓</span> Todos os valores cruzam perfeitamente com os pedidos do sistema e saídas de caixa!
                </div>
              )}
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}
