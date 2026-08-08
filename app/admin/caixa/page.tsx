'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface MovimentoCaixa {
  id: string;
  created_at: string;
  data_dia: string;
  tipo: 'Abertura' | 'Entrada' | 'Saida' | 'Fechamento';
  descricao: string;
  valor: number;
  isAutomatico?: boolean; 
  isFromPDV?: boolean; 
}

export default function GestaoCaixa() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([]);
  const [loading, setLoading] = useState(true);
  
  const hoje = new Date().toISOString().split('T')[0];
  const [dataFiltro, setDataFiltro] = useState(hoje);

  const [modalAberto, setModalAberto] = useState(false);
  const [tipoModal, setTipoModal] = useState<'Abertura' | 'Entrada' | 'Saida' | 'Fechamento' | null>(null);
  const [idEditando, setIdEditando] = useState<string | null>(null);
  
  const [form, setForm] = useState({ 
    valor: 0, 
    descricao: '',
    subtipo: 'Pagamento' 
  });
  
  const [processando, setProcessando] = useState(false);

  async function carregarCaixa() {
    setLoading(true);
    try {
      let { data: caixaData, error: caixaError } = await supabase
        .from('caixa')
        .select('*')
        .eq('data_dia', dataFiltro);

      if (caixaError) throw caixaError;

      const temAberturaHoje = caixaData?.some(m => m.tipo === 'Abertura');
      
      if (!temAberturaHoje) {
        // Ordena por data e created_at para garantir que puxa o último fecho exato
        const { data: ultimoFecho } = await supabase
          .from('caixa')
          .select('valor')
          .eq('tipo', 'Fechamento')
          .lt('data_dia', dataFiltro)
          .order('data_dia', { ascending: false })
          .order('created_at', { ascending: false }) 
          .limit(1);

        if (ultimoFecho && ultimoFecho.length > 0) {
          const valorTransitado = Number(ultimoFecho[0].valor);
          
          const { error: erroInsert } = await supabase.from('caixa').insert([{
            data_dia: dataFiltro,
            tipo: 'Abertura',
            descricao: 'Fundo de Maneio (Abertura Automática)',
            valor: valorTransitado
          }]);

          if (!erroInsert) {
            const { data: novoCaixaData } = await supabase
              .from('caixa')
              .select('*')
              .eq('data_dia', dataFiltro);
            caixaData = novoCaixaData;
          }
        }
      }

      const dataInicio = new Date(`${dataFiltro}T00:00:00`).toISOString();
      const dataFim = new Date(`${dataFiltro}T23:59:59`).toISOString();

      const { data: pedidosData, error: pedidosError } = await supabase
        .from('pedidos')
        .select('id, numero_pedido, total_geral, criado_em, forma_pagamento, canal')
        .gte('criado_em', dataInicio)
        .lte('criado_em', dataFim)
        .eq('pago', true)
        .in('forma_pagamento', ['Dinheiro', 'Dinheiro Glovo']); 

      if (pedidosError) throw pedidosError;

      // Movimentos da tabela CAIXA (Manuais + Abertura Automática)
      const movimentosManuais: MovimentoCaixa[] = (caixaData || []).map(m => ({
        id: m.id,
        created_at: m.created_at,
        data_dia: m.data_dia,
        tipo: m.tipo,
        descricao: m.descricao,
        valor: Number(m.valor),
        isAutomatico: m.descricao.includes('Abertura Automática'),
        isFromPDV: false // Permite editar/excluir!
      }));

      // Movimentos da tabela PEDIDOS (Apenas Vendas)
      const movimentosPDV: MovimentoCaixa[] = (pedidosData || []).map(p => ({
        id: p.id,
        created_at: p.criado_em,
        data_dia: dataFiltro,
        tipo: 'Entrada', 
        descricao: `Venda PDV #${p.numero_pedido || 'S/N'} (${p.canal}) - ${p.forma_pagamento}`,
        valor: Number(p.total_geral),
        isAutomatico: true,
        isFromPDV: true // Bloqueia edição pois vem do sistema de vendas
      }));

      const todosMovimentos = [...movimentosManuais, ...movimentosPDV];
      todosMovimentos.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      setMovimentos(todosMovimentos);
    } catch (err) {
      console.error("Erro ao carregar caixa:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarCaixa(); }, [dataFiltro]);

  const temAbertura = movimentos.some(m => m.tipo === 'Abertura');
  const temFechamento = movimentos.some(m => m.tipo === 'Fechamento');
  const caixaAberto = temAbertura && !temFechamento;

  const totalEntradas = movimentos.filter(m => m.tipo === 'Entrada').reduce((acc, m) => acc + Number(m.valor), 0);
  const totalSaidas = movimentos.filter(m => m.tipo === 'Saida').reduce((acc, m) => acc + Number(m.valor), 0);
  const valorAbertura = movimentos.find(m => m.tipo === 'Abertura')?.valor || 0;
  
  const saldoAtual = Number(valorAbertura) + totalEntradas - totalSaidas;

  const abrirModal = (tipo: 'Abertura' | 'Entrada' | 'Saida' | 'Fechamento', movEdit?: MovimentoCaixa) => {
    setTipoModal(tipo);
    setIdEditando(movEdit ? movEdit.id : null);

    if (movEdit) {
      let desc = movEdit.descricao;
      let subtipo = tipo === 'Saida' ? 'Pagamento' : 'Levantamento Banco';
      
      if (desc.startsWith('[')) {
        const match = desc.match(/^\[(.*?)\]\s*(.*)$/);
        if (match) {
          subtipo = match[1];
          desc = match[2];
        }
      }
      setForm({ valor: movEdit.valor, descricao: desc, subtipo });
    } else {
      if (tipo === 'Abertura') setForm({ valor: 0, descricao: 'Fundo de Maneio Inicial', subtipo: '' });
      else if (tipo === 'Fechamento') setForm({ valor: saldoAtual, descricao: 'Fecho do Dia', subtipo: '' });
      else if (tipo === 'Entrada') setForm({ valor: 0, descricao: '', subtipo: 'Levantamento Banco' });
      else setForm({ valor: 0, descricao: '', subtipo: 'Pagamento' });
    }
    
    setModalAberto(true);
  };

  const excluirMovimento = async (id: string) => {
    if (!confirm('Tem a certeza que deseja excluir este movimento definitivamente?')) return;
    setProcessando(true);
    try {
      const { error } = await supabase.from('caixa').delete().eq('id', id);
      if (error) throw error;
      carregarCaixa();
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const registarMovimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoModal) return;
    if (form.valor < 0) return alert('O valor não pode ser negativo.');
    if (tipoModal !== 'Fechamento' && form.valor === 0 && tipoModal !== 'Abertura') return alert('Insira um valor maior que zero.');

    setProcessando(true);
    try {
      let descFinal = form.descricao;
      
      if (tipoModal === 'Saida' || tipoModal === 'Entrada') {
        descFinal = `[${form.subtipo}] ${form.descricao}`;
      }

      const payload = {
        data_dia: dataFiltro,
        tipo: tipoModal,
        descricao: descFinal,
        valor: form.valor
      };

      if (idEditando) {
        const { error } = await supabase.from('caixa').update(payload).eq('id', idEditando);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('caixa').insert([payload]);
        if (error) throw error;
      }
      
      setModalAberto(false);
      carregarCaixa();
    } catch (error: any) {
      alert('Erro ao registar movimento: ' + error.message);
    } finally {
      setProcessando(false);
    }
  };

  if (loading && movimentos.length === 0) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Abrir Gaveta...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24 selection:bg-orange-500/30">
      
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center transition-all">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center shadow-lg shadow-green-900/40 text-2xl">
            💶
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Frente de Caixa</h1>
            <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Controlo de Dinheiro Físico</p>
          </div>
        </div>
        
        <input 
          type="date" 
          max="9999-12-31" 
          value={dataFiltro} 
          onChange={(e) => {
            if (e.target.value) setDataFiltro(e.target.value);
          }}
          className="bg-zinc-900 border border-zinc-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold outline-none focus:border-green-500 shadow-lg w-40"
        />
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 md:p-8 space-y-8">
        
        {/* DASHBOARD RÁPIDO */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={`p-6 rounded-[32px] shadow-xl flex flex-col justify-center border ${caixaAberto ? 'bg-gradient-to-br from-green-900/20 to-green-950/20 border-green-500/30' : 'bg-gradient-to-br from-red-900/20 to-red-950/20 border-red-500/30'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${caixaAberto ? 'text-green-500' : 'text-red-500'}`}>
              Estado do Dia
            </span>
            <div className="text-2xl font-black text-white mt-2 tracking-tight">
              {temFechamento ? '🔒 Fechado' : caixaAberto ? '🟢 Aberto' : '⚪ Não Iniciado'}
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center md:col-span-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Saldo Atual na Gaveta</span>
            <div className={`text-4xl font-black font-mono mt-2 tracking-tighter ${saldoAtual >= 0 ? 'text-white' : 'text-red-500'}`}>
              {saldoAtual.toFixed(2)}<span className="text-2xl ml-1 text-zinc-500">€</span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-green-500/80 uppercase tracking-widest">Entradas (Vendas + Reforços)</span>
            <div className="text-2xl font-black text-green-400 font-mono mt-2 tracking-tighter">
              + {totalEntradas.toFixed(2)}€
            </div>
          </div>

          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest">Saídas (Despesas/Retiradas)</span>
            <div className="text-2xl font-black text-red-400 font-mono mt-2 tracking-tighter">
              - {totalSaidas.toFixed(2)}€
            </div>
          </div>
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div className="flex flex-wrap gap-4">
          {!temAbertura && (
            <button onClick={() => abrirModal('Abertura')} className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl text-sm font-black shadow-lg shadow-green-900/50 transition-transform active:scale-95 flex-1 md:flex-none">
              🔓 Abrir Caixa Manualmente
            </button>
          )}
          
          {caixaAberto && (
            <>
              <button onClick={() => abrirModal('Entrada')} className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 hover:border-emerald-400 px-6 py-3 rounded-xl text-sm font-black shadow-lg transition-transform active:scale-95 flex-1 md:flex-none">
                + Nova Entrada / Reforço
              </button>
              <button onClick={() => abrirModal('Saida')} className="bg-zinc-800 hover:bg-zinc-700 text-red-400 border border-zinc-700 hover:border-red-500/50 px-6 py-3 rounded-xl text-sm font-black shadow-lg transition-transform active:scale-95 flex-1 md:flex-none">
                - Nova Saída / Retirada
              </button>
              <button onClick={() => abrirModal('Fechamento')} className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-xl text-sm font-black shadow-lg shadow-red-900/50 transition-transform active:scale-95 flex-1 md:flex-none md:ml-auto">
                🔒 Fechar Caixa
              </button>
            </>
          )}
        </div>

        {/* LINHA DO TEMPO / HISTÓRICO DO DIA */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-[24px] overflow-hidden">
          <div className="p-5 border-b border-zinc-800/80 bg-zinc-950/50">
            <h3 className="text-xs font-black uppercase text-zinc-400 tracking-widest">Movimentos de {new Date(dataFiltro).toLocaleDateString('pt-PT')}</h3>
          </div>
          
          <div className="p-2">
            {movimentos.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 italic text-sm">Nenhum movimento registado neste dia.</div>
            ) : (
              <div className="space-y-1">
                {movimentos.map((mov) => {
                  
                  let badgeCategoria = '';
                  let textoDescricao = mov.descricao;
                  
                  if (textoDescricao.startsWith('[')) {
                    const match = textoDescricao.match(/^\[(.*?)\]\s*(.*)$/);
                    if (match) {
                      badgeCategoria = match[1];
                      textoDescricao = match[2];
                    }
                  }

                  const badgeCor = mov.tipo === 'Abertura' ? 'bg-green-950 text-green-400' : 
                                   mov.tipo === 'Entrada' && !mov.isAutomatico ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 
                                   mov.isAutomatico ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 
                                   mov.tipo === 'Saida' ? 'bg-red-950 text-red-400' : 
                                   'bg-zinc-700 text-zinc-300';
                  
                  const iconMov = mov.tipo === 'Abertura' ? '🔓' : 
                                  mov.tipo === 'Entrada' && !mov.isAutomatico ? '💵' : 
                                  mov.isAutomatico ? '🤖' : 
                                  mov.tipo === 'Saida' ? '📉' : '🔒';

                  return (
                    <div key={mov.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-zinc-800/40 rounded-xl transition-colors gap-4">
                      
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm flex-shrink-0 ${badgeCor}`}>
                          {iconMov}
                        </div>
                        
                        <div>
                          <p className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
                            {textoDescricao}
                            {mov.isAutomatico && <span className="text-[9px] bg-orange-600 text-white px-1.5 py-0.5 rounded uppercase">Automático</span>}
                            {badgeCategoria && (
                              <span className={`text-[9px] border px-1.5 py-0.5 rounded uppercase ${mov.tipo === 'Entrada' ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'}`}>
                                {badgeCategoria}
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            {new Date(mov.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} • {mov.tipo}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 justify-end sm:justify-between w-full sm:w-auto pl-14 sm:pl-0">
                        <div className={`text-base font-black font-mono whitespace-nowrap
                          ${mov.tipo === 'Saida' ? 'text-red-400' : mov.tipo === 'Fechamento' ? 'text-zinc-500' : 'text-green-400'}`}>
                          {mov.tipo === 'Saida' ? '-' : mov.tipo === 'Fechamento' ? '=' : '+'}{Number(mov.valor).toFixed(2)}€
                        </div>
                        
                        {/* Como a abertura automática agora não é isFromPDV, o botão editar/excluir aparece! */}
                        {!mov.isFromPDV ? (
                          <div className="flex gap-2">
                            <button onClick={() => abrirModal(mov.tipo, mov)} className="w-8 h-8 rounded-lg bg-zinc-800/80 hover:bg-blue-600 flex items-center justify-center text-zinc-400 hover:text-white transition-colors" title="Editar">
                              ✏️
                            </button>
                            <button onClick={() => excluirMovimento(mov.id)} className="w-8 h-8 rounded-lg bg-zinc-800/80 hover:bg-red-600 flex items-center justify-center text-zinc-400 hover:text-white transition-colors" title="Excluir">
                              🗑️
                            </button>
                          </div>
                        ) : (
                          <div className="w-16"></div> 
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </main>

      {/* MODAL MÁGICO DE MOVIMENTOS E EDIÇÃO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-end md:justify-center items-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full md:max-w-md rounded-t-[32px] md:rounded-[32px] flex flex-col overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)] border border-zinc-800 animate-in slide-in-from-bottom-10 duration-300">
            <div className={`p-6 pb-4 flex justify-between items-center border-b border-zinc-800/80 
              ${tipoModal === 'Saida' || tipoModal === 'Fechamento' ? 'border-b-red-500/20' : 'border-b-green-500/20'}`}>
              <h2 className="text-xl font-black text-white">
                {idEditando ? '✏️ Editar Movimento' : 
                 tipoModal === 'Abertura' ? '🔓 Abrir Caixa' : 
                 tipoModal === 'Entrada' ? '💵 Nova Entrada' :
                 tipoModal === 'Saida' ? '📉 Nova Saída' : '🔒 Fechar Caixa'}
              </h2>
              <button onClick={() => setModalAberto(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white">✕</button>
            </div>
            
            <form onSubmit={registarMovimento} className="p-6 space-y-5">
              
              {tipoModal === 'Fechamento' && !idEditando ? (
                <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl mb-4 text-center">
                  <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-1">Saldo Esperado na Gaveta</p>
                  <p className="text-3xl font-black text-white font-mono">{saldoAtual.toFixed(2)}€</p>
                  <p className="text-xs text-zinc-400 mt-2">Conte as notas e moedas. Se o valor real for diferente, ajuste abaixo e justifique na descrição.</p>
                </div>
              ) : null}

              {(tipoModal === 'Saida' || tipoModal === 'Entrada') && (
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Categoria da {tipoModal}</label>
                  <select 
                    value={form.subtipo} 
                    onChange={e => setForm({...form, subtipo: e.target.value})} 
                    className={`w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none font-bold appearance-none cursor-pointer ${tipoModal === 'Saida' ? 'focus:border-red-500' : 'focus:border-emerald-500'}`}
                  >
                    {tipoModal === 'Saida' ? (
                      <>
                        <option value="Pagamento">Pagamento (Fornecedores/Despesas)</option>
                        <option value="Sangria (Depósito)">Sangria (Depósito no Banco/Cofre)</option>
                        <option value="Pagamento Estafetas">Pagamento Estafetas (Acertos)</option>
                        <option value="Retirada Sócios">Retirada Sócios (Distribuição)</option>
                      </>
                    ) : (
                      <>
                        <option value="Levantamento Banco">Levantamento de Conta Bancária</option>
                        <option value="Reforço de Caixa">Reforço de Caixa / Trocos</option>
                        <option value="Outras Entradas">Outras Entradas</option>
                      </>
                    )}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Descrição / Motivo</label>
                <input required type="text" value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} className={`w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none font-bold ${tipoModal === 'Saida' ? 'focus:border-red-500' : 'focus:border-green-500'}`} placeholder={tipoModal === 'Entrada' ? 'Ex: Trocos de 5€, Banco Santander...' : 'Ex: Reforço de Caixa, Levantamento...'} />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">
                  {tipoModal === 'Abertura' ? 'Fundo de Maneio (€)' : tipoModal === 'Fechamento' ? 'Valor Real Contado (€)' : 'Valor (€)'}
                </label>
                <input required type="number" step="0.01" value={form.valor === 0 && !idEditando && tipoModal !== 'Abertura' ? '' : form.valor} onChange={e => setForm({...form, valor: parseFloat(e.target.value) || 0})} className={`w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-2xl font-black font-mono text-center outline-none ${tipoModal === 'Saida' ? 'text-red-400 focus:border-red-500' : 'text-green-400 focus:border-green-500'}`} placeholder="0.00" />
              </div>

              <div className="pt-4">
                <button type="submit" disabled={processando} className={`w-full py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95 uppercase tracking-wider disabled:opacity-50 text-white
                  ${tipoModal === 'Saida' || tipoModal === 'Fechamento' ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`}>
                  {processando ? 'A Processar...' : (idEditando ? 'Salvar Alterações' : 'Confirmar Lançamento')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}