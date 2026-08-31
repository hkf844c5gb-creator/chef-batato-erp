'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface MovimentoCaixa {
  id: string;
  tipo: string; 
  descricao: string;
  valor: number;
  metodo_pagamento: string;
  pedido_id?: string;
  created_at: string;
}

export default function CaixaPage() {
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  
  // Captura o dia de hoje automaticamente
  const getHoje = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  
  const [dataFiltro, setDataFiltro] = useState(getHoje());
  const [caixaFechado, setCaixaFechado] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({ tipo: 'Saída', descricao: '', valor: 0, metodo_pagamento: 'Dinheiro' });

  // 🔄 CARREGAMENTO + AUDITORIA AUTOMÁTICA SILENCIOSA
  async function carregarCaixa() {
    setLoading(true);
    
    const dateStart = new Date(`${dataFiltro}T00:00:00`).toISOString();
    const dateEnd = new Date(`${dataFiltro}T23:59:59.999`).toISOString();

    // 1. Carrega o que já está na gaveta
    let { data: movimentosAtuais, error } = await supabase
      .from('caixa')
      .select('*')
      .gte('created_at', dateStart)
      .lte('created_at', dateEnd)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const fecho = movimentosAtuais?.find(m => m.descricao === 'FECHO DE CAIXA MANUAL');
    const isFechado = !!fecho;
    setCaixaFechado(isFechado);

    // 2. SE NÃO ESTIVER FECHADO, FAZ A AUDITORIA AUTOMÁTICA AOS PEDIDOS
    if (!isFechado) {
      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('*')
        .gte('created_at', dateStart)
        .lte('created_at', dateEnd);

      let inseriuNovo = false;

      if (pedidos && pedidos.length > 0) {
        const pedidosDinheiro = pedidos.filter(p => 
          p.status !== 'Cancelado' && 
          p.metodo_pagamento && 
          p.metodo_pagamento.toLowerCase().includes('dinheiro')
        );

        for (const ped of pedidosDinheiro) {
          const pedShortId = String(ped.id).substring(0, 6);
          const jaRegistado = movimentosAtuais?.some(m => 
             m.pedido_id === ped.id || 
             (m.descricao && m.descricao.includes(pedShortId))
          );

          if (!jaRegistado) {
            const fakeDataInsercao = new Date(`${dataFiltro}T12:00:00`).toISOString();
            await supabase.from('caixa').insert([{
              tipo: 'Entrada',
              descricao: `Pedido #${pedShortId} - ${ped.cliente_nome || 'Balcão'}`,
              valor: ped.total,
              metodo_pagamento: ped.metodo_pagamento,
              pedido_id: ped.id,
              created_at: fakeDataInsercao
            }]);
            inseriuNovo = true;
          }
        }
      }

      // 3. Se injetou dinheiro novo, atualiza a gaveta silenciosamente
      if (inseriuNovo) {
        const { data: caixaAtualizado } = await supabase
          .from('caixa')
          .select('*')
          .gte('created_at', dateStart)
          .lte('created_at', dateEnd)
          .order('created_at', { ascending: false });
          
        if (caixaAtualizado) movimentosAtuais = caixaAtualizado;
      }
    }

    setMovimentos(movimentosAtuais || []);
    setLoading(false);
  }

  useEffect(() => {
    carregarCaixa();
  }, [dataFiltro]);

  // 🔒 FECHO MANUAL DO CAIXA
  const fecharCaixaManual = async () => {
    if (caixaFechado) return;
    if (!confirm('Tem a certeza que conferiu o dinheiro da gaveta e deseja FECHAR o caixa deste dia?')) return;

    setProcessando(true);
    const fakeDataInsercao = new Date(`${dataFiltro}T23:55:00`).toISOString();
    
    const { error } = await supabase.from('caixa').insert([{
      tipo: 'Fecho',
      descricao: 'FECHO DE CAIXA MANUAL',
      valor: saldoFinal,
      metodo_pagamento: 'Sistema',
      created_at: fakeDataInsercao
    }]);

    if (!error) {
      alert('🔒 Caixa Fechado com sucesso!');
      setCaixaFechado(true);
      carregarCaixa();
    }
    setProcessando(false);
  };

  // ➕ NOVA ENTRADA / SAÍDA MANUAL
  const salvarMovimentoManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (caixaFechado) return alert("O Caixa deste dia já foi fechado!");
    
    setProcessando(true);
    const fakeDataInsercao = new Date(`${dataFiltro}T15:00:00`).toISOString();

    const { error } = await supabase.from('caixa').insert([{
      tipo: form.tipo,
      descricao: form.descricao,
      valor: form.valor,
      metodo_pagamento: form.metodo_pagamento,
      created_at: fakeDataInsercao
    }]);

    if (error) {
      alert("Erro: " + error.message);
    } else {
      setModalAberto(false);
      setForm({ tipo: 'Saída', descricao: '', valor: 0, metodo_pagamento: 'Dinheiro' });
      carregarCaixa();
    }
    setProcessando(false);
  };

  const apagarMovimento = async (id: string) => {
    if (caixaFechado) return alert("Não pode alterar registos de um caixa fechado.");
    if (!confirm("Tem a certeza que deseja remover este registo?")) return;
    await supabase.from('caixa').delete().eq('id', id);
    carregarCaixa();
  };

  // 📊 CÁLCULOS DO CAIXA
  const movimentosReais = movimentos.filter(m => m.tipo !== 'Fecho');
  const entradas = movimentosReais.filter(m => m.tipo === 'Entrada').reduce((acc, m) => acc + Number(m.valor), 0);
  const saidas = movimentosReais.filter(m => m.tipo === 'Saída').reduce((acc, m) => acc + Number(m.valor), 0);
  const saldoFinal = entradas - saidas;

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto relative min-h-screen">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
          Gestão de Caixa <span className="text-xl">💰</span>
          {caixaFechado && <span className="bg-red-500/20 text-red-500 text-xs px-3 py-1 rounded-full border border-red-500/30 uppercase tracking-widest ml-2">Fechado</span>}
        </h1>
        <div className="flex items-center gap-4">
          <input 
            type="date" 
            value={dataFiltro} 
            onChange={(e) => setDataFiltro(e.target.value)} 
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-4 py-2.5 rounded-xl text-sm outline-none focus:border-orange-500 shadow-xl font-medium cursor-pointer" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#121214] border border-zinc-800/80 p-6 rounded-[24px] shadow-xl flex flex-col justify-center relative overflow-hidden">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest relative z-10">Entradas (Faturação)</span>
          <div className="text-3xl font-black text-emerald-500 font-mono mt-2 tracking-tighter relative z-10">
            + {entradas.toFixed(2)}<span className="text-xl ml-1 text-zinc-600">€</span>
          </div>
        </div>
        <div className="bg-[#121214] border border-zinc-800/80 p-6 rounded-[24px] shadow-xl flex flex-col justify-center">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Saídas (Despesas/Trocos)</span>
          <div className="text-3xl font-black text-red-500 font-mono mt-2 tracking-tighter">
            - {saidas.toFixed(2)}<span className="text-xl ml-1 text-zinc-600">€</span>
          </div>
        </div>
        <div className="bg-zinc-900 border border-orange-500/30 p-6 rounded-[24px] shadow-[0_0_20px_rgba(249,115,22,0.1)] flex flex-col justify-center relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl"></div>
          <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest relative z-10">Saldo em Caixa (Gaveta)</span>
          <div className="text-4xl font-black text-white font-mono mt-2 tracking-tighter relative z-10">
            {saldoFinal.toFixed(2)}<span className="text-2xl ml-1 text-zinc-500">€</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 rounded-xl flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Sincronização Ativa</span>
        </div>
        
        <button 
          onClick={() => setModalAberto(true)} 
          disabled={caixaFechado}
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-50 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2"
        >
          ➕ Adicionar Saída Manual
        </button>

        <div className="flex-1"></div>

        <button 
          onClick={fecharCaixaManual} 
          disabled={caixaFechado || processando}
          className="bg-red-950 border border-red-900 hover:bg-red-900 disabled:opacity-50 text-red-400 hover:text-white text-sm font-bold px-8 py-3 rounded-xl transition-all shadow-lg flex items-center gap-2 uppercase tracking-widest"
        >
          🔒 Fechar Caixa
        </button>
      </div>

      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-[24px] overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-zinc-800/80 bg-zinc-950/40 flex justify-between items-center">
          <h3 className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">Histórico de Movimentos</h3>
        </div>
        
        <div className="p-4">
          {loading ? (
            <div className="text-center text-zinc-500 py-12 font-bold uppercase tracking-widest text-xs animate-pulse">A carregar a gaveta...</div>
          ) : movimentosReais.length === 0 ? (
            <div className="text-center text-zinc-600 py-12 italic text-sm">A gaveta está vazia neste dia. Verifique outra data no calendário acima.</div>
          ) : (
            <div className="space-y-3">
              {movimentosReais.map((mov) => (
                <div key={mov.id} className="flex items-center justify-between p-4 bg-[#121214] border border-zinc-800/60 hover:border-zinc-700 rounded-2xl transition-all gap-4 shadow-sm">
                  
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${mov.tipo === 'Entrada' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                    {mov.tipo === 'Entrada' ? '↓' : '↑'}
                  </div>

                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-bold text-zinc-200 line-clamp-1 leading-snug">
                      {mov.descricao}
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5 mt-2">
                      <span className={`text-[9px] px-2.5 py-0.5 rounded border uppercase tracking-wider font-bold ${mov.tipo === 'Entrada' ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'}`}>
                        {mov.tipo}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                        {mov.metodo_pagamento}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className={`text-xl font-black font-mono tracking-tight ${mov.tipo === 'Entrada' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {mov.tipo === 'Entrada' ? '+' : '-'}{Number(mov.valor).toFixed(2)}€
                    </div>
                    {!caixaFechado && (
                      <button 
                        onClick={() => apagarMovimento(mov.id)} 
                        className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-red-950 hover:border-red-900 flex items-center justify-center text-zinc-400 hover:text-red-400 transition-all shadow-sm flex-shrink-0" 
                        title="Eliminar Movimento"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col justify-center items-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full max-w-lg rounded-[32px] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-zinc-800">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800 bg-zinc-950/50">
              <h2 className="text-xl font-black text-white">💰 Registar Entrada/Saída</h2>
              <button onClick={() => setModalAberto(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white hover:bg-zinc-700 transition-colors">✕</button>
            </div>
            
            <form onSubmit={salvarMovimentoManual} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Tipo de Movimento</label>
                  <select value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-orange-500 cursor-pointer">
                    <option value="Entrada">Entrada (Reforço de Gaveta)</option>
                    <option value="Saída">Saída (Despesa Rápida)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Método</label>
                  <select value={form.metodo_pagamento} onChange={e => setForm({...form, metodo_pagamento: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-orange-500 cursor-pointer">
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Dinheiro Glovo">Dinheiro Glovo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">O que foi?</label>
                <input required type="text" placeholder="Ex: Fundo de maneio, Supermercado..." value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-orange-500" />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Valor (€)</label>
                <input required type="number" step="0.01" value={form.valor} onChange={e => setForm({...form, valor: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-3xl font-black font-mono text-center outline-none text-orange-400 focus:border-orange-500" />
              </div>

              <div className="pt-4">
                <button type="submit" disabled={processando} className="w-full bg-orange-600 hover:bg-orange-500 py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95 uppercase tracking-wider disabled:opacity-50 text-white">
                  {processando ? 'A Gravar...' : 'Confirmar e Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}