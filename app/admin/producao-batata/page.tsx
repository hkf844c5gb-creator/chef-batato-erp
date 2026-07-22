'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface LoteProducao {
  id: string;
  created_at: string;
  data_fabricacao: string;
  nome_recheio: string;
  quantidade: number;
  unidade: string;
  data_validade: string;
  lote_ativo: boolean;
  observacoes: string;
}

interface Insumo {
  id: string;
  nome: string;
  unidade_medida: string;
  quantidade_atual: number;
}

export default function ControloProducaoBatata() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [lotes, setLotes] = useState<LoteProducao[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(true);
  
  const hoje = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    data_fabricacao: hoje,
    insumo_produzido_id: '',
    quantidade_produzida: 0,
    insumo_gasto_id: '',
    quantidade_gasta: 0,
    data_validade: '',
    observacoes: ''
  });

  const [processando, setProcessando] = useState(false);

  async function carregarDados() {
    setLoading(true);
    try {
      // Carrega os lotes ativos
      const { data: dadosLotes, error: errLotes } = await supabase
        .from('producao')
        .select('*')
        .eq('lote_ativo', true)
        .ilike('nome_recheio', '%batata%') // Filtra para mostrar preferencialmente as batatas
        .order('data_validade', { ascending: true });
      
      if (errLotes) throw errLotes;
      setLotes(dadosLotes || []);

      const { data: dadosInsumos, error: errInsumos } = await supabase
        .from('insumos')
        .select('id, nome, unidade_medida, quantidade_atual')
        .order('nome', { ascending: true });
      if (errInsumos) throw errInsumos;
      setInsumos(dadosInsumos || []);

    } catch (err: any) {
      alert("Erro ao carregar dados: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const registarProducao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.insumo_produzido_id || form.quantidade_produzida <= 0 || !form.data_validade) {
      return alert('Preencha o que foi produzido e a validade.');
    }

    const insumoProduzido = insumos.find(i => i.id === form.insumo_produzido_id);
    const insumoGasto = form.insumo_gasto_id ? insumos.find(i => i.id === form.insumo_gasto_id) : null;

    if (!insumoProduzido) return;

    setProcessando(true);
    try {
      const novaQtdProduzida = Number(insumoProduzido.quantidade_atual) + Number(form.quantidade_produzida);
      const { error: errAdd } = await supabase.from('insumos').update({ quantidade_atual: novaQtdProduzida }).eq('id', insumoProduzido.id);
      if (errAdd) throw errAdd;

      if (insumoGasto && form.quantidade_gasta > 0) {
        const novaQtdGasta = Number(insumoGasto.quantidade_atual) - Number(form.quantidade_gasta);
        const { error: errSub } = await supabase.from('insumos').update({ quantidade_atual: novaQtdGasta }).eq('id', insumoGasto.id);
        if (errSub) throw errSub;
      }

      const payloadLote = {
        data_fabricacao: form.data_fabricacao,
        nome_recheio: insumoProduzido.nome,
        quantidade: form.quantidade_produzida,
        unidade: insumoProduzido.unidade_medida,
        data_validade: form.data_validade,
        observacoes: form.observacoes + (insumoGasto ? ` (Gasto: ${form.quantidade_gasta} ${insumoGasto.unidade_medida} de ${insumoGasto.nome})` : '')
      };

      const { error: errLote } = await supabase.from('producao').insert([payloadLote]);
      if (errLote) throw errLote;

      setForm({ ...form, insumo_produzido_id: '', quantidade_produzida: 0, insumo_gasto_id: '', quantidade_gasta: 0, observacoes: '' });
      carregarDados();
    } catch (err: any) {
      alert('Erro ao registar produção: ' + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const finalizarLote = async (id: string) => {
    if (!confirm('Tem a certeza que este lote de batatas já acabou? Ele sairá da lista.')) return;
    try {
      const { error } = await supabase.from('producao').update({ lote_ativo: false }).eq('id', id);
      if (error) throw error;
      setLotes(lotes.filter(l => l.id !== id));
    } catch (err: any) {
      alert("Erro ao finalizar lote: " + err.message);
    }
  };

  const calcularStatusValidade = (dataValidade: string) => {
    const validade = new Date(dataValidade).getTime();
    const agora = new Date(hoje).getTime();
    const diferencaDias = Math.ceil((validade - agora) / (1000 * 3600 * 24));

    if (diferencaDias < 0) return { texto: 'CADUCADO', cor: 'bg-red-600 text-white animate-pulse', alerta: true };
    if (diferencaDias === 0) return { texto: 'CADUCA HOJE', cor: 'bg-orange-600 text-white', alerta: true };
    if (diferencaDias <= 2) return { texto: `Expira em ${diferencaDias} dias`, cor: 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50', alerta: false };
    return { texto: `Expira em ${diferencaDias} dias`, cor: 'bg-green-500/20 text-green-500 border border-green-500/50', alerta: false };
  };

  if (loading && lotes.length === 0) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Aquecer o Forno...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-12 selection:bg-orange-500/30">
      
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center shadow-lg shadow-orange-900/40 text-2xl">
            🥔
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Estação das Batatas</h1>
            <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Registo de Fornadas e Stock</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 md:p-8 space-y-8">
        
        <section className="bg-zinc-900 border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col shadow-xl">
          <div className="p-6 border-b border-zinc-800/80 bg-zinc-950/50">
            <h2 className="text-lg font-black uppercase text-zinc-300 tracking-widest flex items-center gap-2">
              <span className="text-orange-500">🔥</span> Registar Nova Fornada
            </h2>
            <p className="text-xs text-zinc-500 mt-2">Isto vai descontar os quilos do saco e adicionar batatas assadas prontas a vender.</p>
          </div>

          <form onSubmit={registarProducao} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* LADO DIREITO: O QUE FOI PRODUZIDO (SOMA) */}
            <div className="space-y-4 bg-green-950/20 p-5 rounded-2xl border border-green-900/30">
              <h3 className="text-xs font-black text-green-500 uppercase tracking-widest border-b border-green-900/50 pb-2">+ QUANTAS FORAM ASSADAS (PRONTAS)</h3>
              
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Insumo Final (Batata Assada)</label>
                <select required value={form.insumo_produzido_id} onChange={e => setForm({...form, insumo_produzido_id: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-green-500 cursor-pointer">
                  <option value="">-- Selecione a Batata Assada --</option>
                  {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade_medida})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Quantidade (Unidades)</label>
                <input required type="number" step="1" min="1" value={form.quantidade_produzida || ''} onChange={e => setForm({...form, quantidade_produzida: parseInt(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-green-500" placeholder="Ex: 10" />
              </div>
            </div>

            {/* LADO ESQUERDO: O QUE FOI GASTO (SUBTRAI) */}
            <div className="space-y-4 bg-orange-950/20 p-5 rounded-2xl border border-orange-900/30">
              <h3 className="text-xs font-black text-orange-500 uppercase tracking-widest border-b border-orange-900/50 pb-2">- QUANTOS QUILOS GASTOU (CRUA)</h3>
              
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Insumo Base (Saco de Batata)</label>
                <select required value={form.insumo_gasto_id} onChange={e => setForm({...form, insumo_gasto_id: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500 cursor-pointer">
                  <option value="">-- Selecione o Saco (Kg) --</option>
                  {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade_medida})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Peso Gasto (em Kg)</label>
                <input required type="number" step="0.01" min="0.01" value={form.quantidade_gasta || ''} onChange={e => setForm({...form, quantidade_gasta: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500" placeholder="Ex: 3" />
              </div>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-zinc-800/80 pt-6">
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Data da Fornada</label>
                <input required type="date" value={form.data_fabricacao} onChange={e => setForm({...form, data_fabricacao: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500 cursor-pointer" />
              </div>

              <div>
                <label className="block text-[10px] text-orange-500 font-bold uppercase mb-1">Data de Validade</label>
                <input required type="date" value={form.data_validade} onChange={e => setForm({...form, data_validade: e.target.value})} className="w-full bg-orange-950/20 border border-orange-900/50 rounded-xl px-4 py-2.5 text-sm text-orange-400 outline-none focus:border-orange-500 cursor-pointer" />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Observações</label>
                <input type="text" value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500" placeholder="Ex: Forno 1..." />
              </div>
            </div>

            <div className="md:col-span-2 mt-2">
              <button type="submit" disabled={processando} className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded-xl px-4 py-4 text-sm font-black transition-all shadow-lg active:scale-95 disabled:opacity-50 tracking-wider">
                🔄 REGISTAR FORNADA NO STOCK
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="text-sm font-black uppercase text-zinc-400 tracking-widest mb-4 px-2">Fornadas Ativas (Prontas a Vender)</h2>
          
          {lotes.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-[24px] p-8 text-center text-zinc-500">
              Nenhuma batata assada registada no momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lotes.map(lote => {
                const status = calcularStatusValidade(lote.data_validade);
                
                return (
                  <div key={lote.id} className={`bg-zinc-900 border rounded-[24px] p-5 flex flex-col relative overflow-hidden transition-all hover:border-zinc-700
                    ${status.alerta ? 'border-red-900/50 shadow-[0_0_15px_rgba(220,38,38,0.15)]' : 'border-zinc-800'}`}>
                    
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-black text-lg text-white pr-4">{lote.nome_recheio}</h3>
                      <button onClick={() => finalizarLote(lote.id)} className="w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-green-500 hover:border-green-500 flex items-center justify-center transition-colors flex-shrink-0" title="Marcar Lote como Terminado">
                        ✔
                      </button>
                    </div>

                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-3xl font-black font-mono text-orange-400 tracking-tighter">{lote.quantidade}</span>
                      <span className="text-xs font-bold text-zinc-500 uppercase">{lote.unidade}</span>
                    </div>

                    <div className="space-y-2 mt-auto">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-zinc-500">Fábrico:</span>
                        <span className="text-zinc-300">{new Date(lote.data_fabricacao).toLocaleDateString('pt-PT')}</span>
                      </div>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-zinc-500">Validade:</span>
                        <span className="text-zinc-300">{new Date(lote.data_validade).toLocaleDateString('pt-PT')}</span>
                      </div>
                      
                      {lote.observacoes && (
                        <p className="text-[10px] text-zinc-500 italic mt-2 border-t border-zinc-800/50 pt-2">{lote.observacoes}</p>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-zinc-800/80">
                      <div className={`text-center py-1.5 rounded-lg text-xs font-black uppercase tracking-widest ${status.cor}`}>
                        {status.texto}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}