'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface EstafetaCalculado {
  db_id?: string;
  nome: string;
  contacto: string;
  entregas_novas: number;
  taxas_novas: number;
  pagamentos_novos: number;
  taxas_antigas: number;
  pendente_atual: number;
}

export default function GestaoEstafetas() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [estafetasDB, setEstafetasDB] = useState<any[]>([]);
  const [pedidosDB, setPedidosDB] = useState<any[]>([]);
  const [pagamentosDB, setPagamentosDB] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados Visuais e de UI
  const [estafetaExpandidoId, setEstafetaExpandidoId] = useState<string | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<'entregas' | 'pagamentos'>('entregas');
  
  // Modais
  const [modalPagamentoAberto, setModalPagamentoAberto] = useState(false);
  const [modalEstafetaAberto, setModalEstafetaAberto] = useState(false);
  const [processando, setProcessando] = useState(false);
  
  // Filtros
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim] = useState('');

  // Formulários
  const [novoPagamento, setNovoPagamento] = useState({ 
    id: '', entregador: '', valor: 0, data: new Date().toISOString().split('T')[0], inicio: '', fim: '' 
  });
  
  const [formEstafeta, setFormEstafeta] = useState({ id: '', nome: '', contacto: '', divida_inicial: 0 });

  const limparNomePedido = (nome: string) => {
    if (!nome) return 'N/D';
    const match = nome.match(/Pedido\s*#?(\d+)/i);
    return match ? match[1] : nome;
  };

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: ests } = await supabase.from('estafetas').select('*').order('nome');
      
      const { data: peds } = await supabase.from('pedidos')
        .select('id, cliente, entregador, taxa_entrega, criado_em')
        .not('entregador', 'is', null)
        .neq('entregador', '')
        .order('criado_em', { ascending: false });
      
      const { data: pags } = await supabase.from('estafetas_pagamentos')
        .select('*').order('data_pagamento', { ascending: false });

      if (ests) setEstafetasDB(ests);
      if (peds) setPedidosDB(peds);
      if (pags) setPagamentosDB(pags);
    } catch (err) {
      console.error("Erro de BD", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDados(); }, []);

  // --- MOTOR DE CÁLCULO GERAL ---
  const nomesUnicos = Array.from(new Set([
    ...estafetasDB.map(e => e.nome),
    ...pedidosDB.map(p => p.entregador),
    ...pagamentosDB.map(p => p.entregador)
  ]));

  const estafetasCalculados: EstafetaCalculado[] = nomesUnicos.map(nome => {
    const perfilDB = estafetasDB.find(e => e.nome === nome);
    const taxasAntigas = Number(perfilDB?.divida_inicial) || 0.0; 
    
    const pedsAtuais = pedidosDB.filter(p => p.entregador === nome);
    const pagsAtuais = pagamentosDB.filter(p => p.entregador === nome);

    const entregasNovas = pedsAtuais.length;
    const taxasNovas = pedsAtuais.reduce((sum, p) => sum + (Number(p.taxa_entrega) || 0), 0);
    const pagamentosNovos = pagsAtuais.reduce((sum, p) => sum + (Number(p.valor_pago) || 0), 0);

    // MATEMÁTICA CORRETA: (Taxas Passadas + Taxas Novas) - Todos os Pagamentos
    const pendenteAtual = taxasAntigas + taxasNovas - pagamentosNovos;

    return { 
      db_id: perfilDB?.id,
      nome, 
      contacto: perfilDB?.contacto || '',
      entregas_novas: entregasNovas, 
      taxas_novas: taxasNovas, 
      pagamentos_novos: pagamentosNovos, 
      taxas_antigas: taxasAntigas, 
      pendente_atual: pendenteAtual 
    };
  }).sort((a, b) => b.pendente_atual - a.pendente_atual);

  const totalPendenteGlobal = estafetasCalculados.reduce((acc, est) => acc + est.pendente_atual, 0);
  const totalEntregasGlobal = estafetasCalculados.reduce((acc, est) => acc + est.entregas_novas, 0);

  // --- AÇÕES: ESTAFETAS (CRUD) ---
  const abrirNovoEstafeta = () => {
    setFormEstafeta({ id: '', nome: '', contacto: '', divida_inicial: 0 });
    setModalEstafetaAberto(true);
  };

  const abrirEditarEstafeta = (est: EstafetaCalculado) => {
    setFormEstafeta({ id: est.db_id || '', nome: est.nome, contacto: est.contacto, divida_inicial: est.taxas_antigas });
    setModalEstafetaAberto(true);
  };

  const salvarFichaEstafeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEstafeta.nome.trim()) return alert('O nome é obrigatório.');
    setProcessando(true);

    try {
      const dados = { 
        nome: formEstafeta.nome.trim(), 
        contacto: formEstafeta.contacto.trim(),
        divida_inicial: formEstafeta.divida_inicial 
      };
      
      if (formEstafeta.id) {
        await supabase.from('estafetas').update(dados).eq('id', formEstafeta.id);
      } else {
        await supabase.from('estafetas').upsert([dados], { onConflict: 'nome' });
      }

      alert('Ficha do estafeta gravada com sucesso!');
      setModalEstafetaAberto(false);
      carregarDados();
    } catch (err) {
      alert('Erro ao gravar ficha.');
    } finally {
      setProcessando(false);
    }
  };

  const excluirEstafeta = async (id?: string) => {
    if (!id) return alert('Este estafeta não tem ficha criada na BD.');
    if (!confirm('Deseja excluir a ficha deste estafeta?\n(O seu histórico de entregas será mantido nas contas para não haver erros).')) return;
    
    try {
      await supabase.from('estafetas').delete().eq('id', id);
      carregarDados();
    } catch (err) {
      alert('Erro ao excluir estafeta.');
    }
  };

  // --- AÇÕES: PAGAMENTOS (CRIAR, EDITAR E EXCLUIR) ---
  const abrirEditarPagamento = (pag: any) => {
    setNovoPagamento({
      id: pag.id,
      entregador: pag.entregador,
      valor: Number(pag.valor_pago),
      data: pag.data_pagamento,
      inicio: pag.inicio_periodo || '',
      fim: pag.fim_periodo || ''
    });
    setModalPagamentoAberto(true);
  };

  const registarNovoPagamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoPagamento.entregador) return alert("Selecione o estafeta.");
    if (novoPagamento.valor <= 0) return alert("O valor a pagar deve ser superior a zero.");
    
    setProcessando(true);
    try {
      const dadosInsercao: any = {
        entregador: novoPagamento.entregador,
        valor_pago: novoPagamento.valor,
        data_pagamento: novoPagamento.data,
        inicio_periodo: novoPagamento.inicio || null,
        fim_periodo: novoPagamento.fim || null
      };

      if (novoPagamento.id) {
        // Atualiza pagamento existente
        const { error } = await supabase.from('estafetas_pagamentos').update(dadosInsercao).eq('id', novoPagamento.id);
        if (error) throw error;
        alert('Pagamento atualizado com sucesso!');
      } else {
        // Insere novo pagamento
        const { error } = await supabase.from('estafetas_pagamentos').insert([dadosInsercao]);
        if (error) throw error;
        alert('Pagamento registado! A dívida foi atualizada.');
      }

      setModalPagamentoAberto(false);
      setNovoPagamento({ id: '', entregador: '', valor: 0, data: new Date().toISOString().split('T')[0], inicio: '', fim: '' });
      carregarDados();
    } catch (error: unknown) {
      const erroMsg = error instanceof Error ? error.message : JSON.stringify(error);
      alert("Erro ao gravar pagamento:\n" + erroMsg);
    } finally {
      setProcessando(false);
    }
  };

  const apagarPagamento = async (id: string) => {
    if (!confirm("Deseja apagar este pagamento? A dívida do estafeta voltará a aumentar.")) return;
    try {
      await supabase.from('estafetas_pagamentos').delete().eq('id', id);
      carregarDados();
    } catch (err) { alert("Erro ao apagar."); }
  };

  const alternarCard = (nome: string) => {
    const isExpanded = estafetaExpandidoId === nome;
    setEstafetaExpandidoId(isExpanded ? null : nome);
    setAbaAtiva('entregas'); 
    setFiltroInicio('');
    setFiltroFim('');
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A Sincronizar Sistema...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24 selection:bg-orange-500/30">
      
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center transition-all">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center shadow-lg shadow-indigo-900/40 text-2xl">
            🛵
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Estafetas & Caixa</h1>
            <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Gestão de Pagamentos</p>
          </div>
        </div>
        <button onClick={() => { setNovoPagamento({ id: '', entregador: '', valor: 0, data: new Date().toISOString().split('T')[0], inicio: '', fim: '' }); setModalPagamentoAberto(true); }} className="bg-white hover:bg-zinc-200 text-zinc-950 px-5 py-2.5 rounded-xl text-sm font-black shadow-lg transition-transform active:scale-95 flex items-center gap-2">
          <span>+</span> Novo Acerto
        </button>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 md:p-8 space-y-8">
        
        {/* DASHBOARD RÁPIDO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest">Dívida Total a Pagar</span>
            <div className="text-4xl font-black text-red-400 font-mono mt-2 tracking-tighter">
              {totalPendenteGlobal.toFixed(2)}<span className="text-2xl text-red-500/50 ml-1">€</span>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Entregas Realizadas</span>
            <div className="text-4xl font-black text-white font-mono mt-2 tracking-tighter">
              {totalEntregasGlobal} <span className="text-lg text-zinc-600 font-sans tracking-normal uppercase">viagens</span>
            </div>
          </div>
        </div>

        {/* LISTA DE ESTAFETAS COM CÁLCULO AUTOMÁTICO */}
        <div className="space-y-4">
          <div className="flex justify-between items-center pl-2">
            <h2 className="text-sm font-black uppercase text-zinc-300 tracking-wider">A Sua Equipa</h2>
            <button onClick={abrirNovoEstafeta} className="text-[10px] bg-indigo-950/40 text-indigo-400 hover:bg-indigo-900/60 border border-indigo-900/50 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider transition-colors">
              + Novo Estafeta
            </button>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {estafetasCalculados.length === 0 ? (
              <p className="text-center text-zinc-600 text-xs py-10">Nenhum registo encontrado.</p>
            ) : estafetasCalculados.map(estafeta => {
              const isExpanded = estafetaExpandidoId === estafeta.nome;
              
              // Pagamentos nativos da BD
              const pagamentosDesteEstafeta = pagamentosDB.filter(p => p.entregador === estafeta.nome);

              // Entregas da BD (com filtro local)
              let entregasDesteEstafeta = pedidosDB.filter(p => p.entregador === estafeta.nome);
              if (filtroInicio) entregasDesteEstafeta = entregasDesteEstafeta.filter(p => p.criado_em.split('T')[0] >= filtroInicio);
              if (filtroFim) entregasDesteEstafeta = entregasDesteEstafeta.filter(p => p.criado_em.split('T')[0] <= filtroFim);

              // Cálculo do total filtrado de taxas
              const totalTaxasFiltradas = entregasDesteEstafeta.reduce((sum, ped) => sum + Number(ped.taxa_entrega), 0);

              return (
                <div key={estafeta.nome} className="bg-zinc-900/60 border border-zinc-800/60 rounded-[24px] overflow-hidden transition-all hover:border-zinc-700">
                  
                  {/* CARD RESUMO (CLICÁVEL) */}
                  <div className="p-5 flex items-center justify-between">
                    <div onClick={() => alternarCard(estafeta.nome)} className="flex gap-4 items-center flex-1 cursor-pointer">
                      <div className="w-14 h-14 bg-zinc-950 border border-zinc-800 rounded-full flex items-center justify-center text-xl shadow-inner">🪖</div>
                      <div>
                        <h3 className="font-black text-xl text-white flex items-center gap-2">
                          {estafeta.nome}
                          {estafeta.contacto && <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono font-medium">{estafeta.contacto}</span>}
                        </h3>
                        <div className="flex gap-3 mt-1.5">
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${estafeta.pendente_atual > 0.1 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                            {estafeta.pendente_atual > 0.1 ? 'Valores Pendentes' : 'Tudo Saldado'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right mr-2 cursor-pointer" onClick={() => alternarCard(estafeta.nome)}>
                        <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">A Acertar</span>
                        <span className="font-mono font-black text-3xl text-zinc-100">{estafeta.pendente_atual.toFixed(2)}€</span>
                      </div>
                    </div>
                  </div>

                  {/* ZONA EXPANDIDA: DETALHES E ABAS */}
                  {isExpanded && (
                    <div className="bg-zinc-950/80 p-6 border-t border-zinc-800/50 flex flex-col lg:flex-row gap-8 relative">
                      
                      {/* BARRA DE AÇÕES DO PERFIL */}
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button onClick={() => abrirEditarEstafeta(estafeta)} className="bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors border border-zinc-700">✏️ Editar Ficha</button>
                        <button onClick={() => excluirEstafeta(estafeta.db_id)} className="bg-red-950/30 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors border border-red-900/30">🗑️ Excluir</button>
                      </div>

                      {/* LADO ESQUERDO: RESUMO FINANCEIRO */}
                      <div className="w-full lg:w-1/3 space-y-4 mt-6 lg:mt-0">
                        <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest">Saldo Automático</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {estafeta.taxas_antigas > 0 && (
                            <div className="col-span-2 bg-zinc-900 border border-zinc-800 p-3 rounded-xl flex justify-between items-center">
                              <span className="block text-[9px] text-zinc-500 uppercase font-bold">Taxas Antigas (Excel)</span>
                              <span className="text-sm font-black text-zinc-300 font-mono">{estafeta.taxas_antigas.toFixed(2)}€</span>
                            </div>
                          )}
                          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                            <span className="block text-[9px] text-zinc-500 uppercase font-bold">Viagens Novas</span>
                            <span className="text-lg font-black text-white">{estafeta.entregas_novas}</span>
                          </div>
                          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                            <span className="block text-[9px] text-zinc-500 uppercase font-bold">Taxas Novas</span>
                            <span className="text-lg font-black text-white">{estafeta.taxas_novas.toFixed(2)}€</span>
                          </div>
                          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                            <span className="block text-[9px] text-zinc-500 uppercase font-bold">Total Pago (Acertos)</span>
                            <span className="text-lg font-black text-green-400">{estafeta.pagamentos_novos.toFixed(2)}€</span>
                          </div>
                          <div className="bg-red-950/20 border border-red-900/30 p-3 rounded-xl">
                            <span className="block text-[9px] text-red-500/70 uppercase font-bold">Dívida Atual</span>
                            <span className="text-lg font-black text-red-400">{estafeta.pendente_atual.toFixed(2)}€</span>
                          </div>
                        </div>
                      </div>

                      {/* LADO DIREITO: ABAS */}
                      <div className="flex-1 space-y-4">
                        
                        {/* NAVEGAÇÃO DAS ABAS */}
                        <div className="flex gap-4 border-b border-zinc-800/80">
                          <button onClick={() => setAbaAtiva('entregas')} className={`pb-3 text-xs font-black uppercase tracking-widest transition-colors ${abaAtiva === 'entregas' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
                            📦 Histórico de Entregas
                          </button>
                          <button onClick={() => setAbaAtiva('pagamentos')} className={`pb-3 text-xs font-black uppercase tracking-widest transition-colors ${abaAtiva === 'pagamentos' ? 'text-green-400 border-b-2 border-green-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
                            💸 Pagamentos Efetuados
                          </button>
                        </div>

                        {/* CONTEÚDO DA ABA: ENTREGAS */}
                        {abaAtiva === 'entregas' && (
                          <div className="space-y-4 animate-in fade-in duration-300">
                            <div className="flex gap-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
                              <div className="flex-1">
                                <label className="block text-[9px] font-bold text-zinc-500 uppercase ml-1 mb-1">De:</label>
                                <input type="date" value={filtroInicio} onChange={e => setFiltroInicio(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-bold text-zinc-300 outline-none focus:border-indigo-500" />
                              </div>
                              <div className="flex-1">
                                <label className="block text-[9px] font-bold text-zinc-500 uppercase ml-1 mb-1">Até:</label>
                                <input type="date" value={filtroFim} onChange={e => setFiltroFim(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-bold text-zinc-300 outline-none focus:border-indigo-500" />
                              </div>
                            </div>

                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto no-scrollbar relative">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-zinc-950/90 border-b border-zinc-800 text-[9px] font-bold text-zinc-500 uppercase tracking-widest sticky top-0 backdrop-blur-md">
                                  <tr>
                                    <th className="p-4">Data e Hora</th>
                                    <th className="p-4">Nº Pedido</th>
                                    <th className="p-4 text-right">Taxa Gerada</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50 font-medium pb-12">
                                  {entregasDesteEstafeta.length === 0 ? (
                                    <tr><td colSpan={3} className="p-6 text-center text-zinc-600 italic">Nenhuma entrega encontrada neste período.</td></tr>
                                  ) : (
                                    entregasDesteEstafeta.map(ped => (
                                      <tr key={ped.id} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="p-4 text-zinc-300">
                                          {new Date(ped.criado_em).toLocaleDateString('pt-PT')} <span className="text-[10px] text-zinc-500 ml-1">{new Date(ped.criado_em).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'})}</span>
                                        </td>
                                        <td className="p-4 font-bold text-white">#{limparNomePedido(ped.cliente)}</td>
                                        <td className="p-4 text-right font-black font-mono text-indigo-400">{Number(ped.taxa_entrega).toFixed(2)}€</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                                {entregasDesteEstafeta.length > 0 && (
                                  <tfoot className="bg-indigo-950/20 border-t border-indigo-900/30 sticky bottom-0 backdrop-blur-md">
                                    <tr>
                                      <td colSpan={2} className="p-4 text-right text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                                        Total no Período Filtrado:
                                      </td>
                                      <td className="p-4 text-right font-black font-mono text-indigo-400 text-sm">
                                        {totalTaxasFiltradas.toFixed(2)}€
                                      </td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>
                        )}

                        {/* CONTEÚDO DA ABA: PAGAMENTOS */}
                        {abaAtiva === 'pagamentos' && (
                          <div className="space-y-4 animate-in fade-in duration-300">
                            <div className="flex justify-end">
                              <button onClick={() => { setNovoPagamento({ id: '', entregador: estafeta.nome, valor: 0, data: new Date().toISOString().split('T')[0], inicio: '', fim: '' }); setModalPagamentoAberto(true); }} className="text-[10px] bg-green-900/30 hover:bg-green-800/50 text-green-400 border border-green-800/50 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider transition-colors">
                                + Lançar Pagamento
                              </button>
                            </div>
                            
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-h-72 overflow-y-auto no-scrollbar">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-zinc-950/50 border-b border-zinc-800 text-[9px] font-bold text-zinc-500 uppercase tracking-widest sticky top-0">
                                  <tr>
                                    <th className="p-4">Data Acerto</th>
                                    <th className="p-4 hidden sm:table-cell">Período Ref.</th>
                                    <th className="p-4 text-right">Valor Pago</th>
                                    <th className="p-4 text-center">Ações</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50 font-medium">
                                  {pagamentosDesteEstafeta.length === 0 ? (
                                    <tr><td colSpan={4} className="p-6 text-center text-zinc-600 italic">Nenhum pagamento registado.</td></tr>
                                  ) : (
                                    pagamentosDesteEstafeta.map(pag => (
                                      <tr key={pag.id} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="p-4 text-white font-bold flex items-center gap-2">
                                          {new Date(pag.data_pagamento).toLocaleDateString('pt-PT')}
                                        </td>
                                        <td className="p-4 text-zinc-400 font-mono text-[10px] hidden sm:table-cell">
                                          {pag.inicio_periodo ? new Date(pag.inicio_periodo).toLocaleDateString('pt-PT') : 'N/A'} a {pag.fim_periodo ? new Date(pag.fim_periodo).toLocaleDateString('pt-PT') : 'N/A'}
                                        </td>
                                        <td className="p-4 text-right font-black font-mono text-green-400">{Number(pag.valor_pago).toFixed(2)}€</td>
                                        <td className="p-4 text-center flex items-center justify-center gap-3">
                                          <button onClick={() => abrirEditarPagamento(pag)} className="text-zinc-400 hover:text-white" title="Editar Pagamento">✏️</button>
                                          <button onClick={() => apagarPagamento(pag.id)} className="text-red-500/50 hover:text-red-400 font-black" title="Excluir Pagamento">🗑️</button>
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* MODAL DE NOVO ACERTO/PAGAMENTO */}
      {modalPagamentoAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-end md:justify-center items-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full md:max-w-md rounded-t-[32px] md:rounded-[32px] flex flex-col overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)] border border-zinc-800 animate-in slide-in-from-bottom-10 duration-300">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800/80">
              <h2 className="text-xl font-black text-white">{novoPagamento.id ? '✏️ Editar Acerto' : '💰 Registar Acerto'}</h2>
              <button onClick={() => setModalPagamentoAberto(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white">✕</button>
            </div>
            
            <form onSubmit={registarNovoPagamento} className="p-6 space-y-5">
              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Estafeta</label>
                <select 
                  value={novoPagamento.entregador} 
                  onChange={e => setNovoPagamento({...novoPagamento, entregador: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-indigo-500 font-bold appearance-none cursor-pointer"
                  disabled={!!novoPagamento.id} 
                >
                  <option value="" disabled>Selecione a quem está a pagar...</option>
                  {estafetasCalculados.map(e => <option key={e.nome} value={e.nome}>{e.nome} (Pendente: {e.pendente_atual.toFixed(2)}€)</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Valor Entregue ao Estafeta (€)</label>
                <input required type="number" step="0.01" value={novoPagamento.valor || ''} onChange={e => setNovoPagamento({...novoPagamento, valor: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-2xl font-black text-green-400 font-mono text-center outline-none focus:border-indigo-500" placeholder="0.00" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Início do Período (Opc.)</label>
                  <input type="date" value={novoPagamento.inicio} onChange={e => setNovoPagamento({...novoPagamento, inicio: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-xs text-white outline-none focus:border-indigo-500 font-medium" />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Fim do Período (Opc.)</label>
                  <input type="date" value={novoPagamento.fim} onChange={e => setNovoPagamento({...novoPagamento, fim: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-xs text-white outline-none focus:border-indigo-500 font-medium" />
                </div>
              </div>
              
              <div className="pt-4">
                <button type="submit" disabled={processando} className="w-full bg-white hover:bg-zinc-200 text-zinc-950 py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95 uppercase tracking-wider disabled:opacity-50">
                  {processando ? 'A Gravar...' : 'Confirmar Pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📱 MODAL DE ESTAFETA (CRIAR/EDITAR FICHA) */}
      {modalEstafetaAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-end md:justify-center items-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full md:max-w-md rounded-t-[32px] md:rounded-[32px] flex flex-col overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)] border border-zinc-800 animate-in slide-in-from-bottom-10 duration-300">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800/80">
              <h2 className="text-xl font-black text-white">{formEstafeta.id ? '✏️ Editar Ficha' : '🪖 Novo Estafeta'}</h2>
              <button onClick={() => setModalEstafetaAberto(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white">✕</button>
            </div>
            
            <form onSubmit={salvarFichaEstafeta} className="p-6 space-y-5">
              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Nome do Estafeta</label>
                <input required type="text" value={formEstafeta.nome} onChange={e => setFormEstafeta({...formEstafeta, nome: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-indigo-500 font-bold" placeholder="Ex: João Silva" />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Contacto Telefónico</label>
                <input type="text" inputMode="tel" value={formEstafeta.contacto} onChange={e => setFormEstafeta({...formEstafeta, contacto: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-indigo-500 font-bold" placeholder="Ex: 912 345 678" />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                  Taxas Antigas Acumuladas (€)
                  <span className="bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded text-[8px]">Opcional</span>
                </label>
                <input type="number" step="0.01" value={formEstafeta.divida_inicial} onChange={e => setFormEstafeta({...formEstafeta, divida_inicial: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm font-mono font-bold text-orange-400 outline-none focus:border-indigo-500" placeholder="0.00" />
                <p className="text-[9px] text-zinc-500 mt-1.5">Insira o total de taxas brutas geradas no passado. O sistema subtrairá os pagamentos que inseriu na BD.</p>
              </div>
              
              <div className="pt-4">
                <button type="submit" disabled={processando} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95 uppercase tracking-wider disabled:opacity-50">
                  {processando ? 'A Gravar...' : 'Guardar Ficha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}