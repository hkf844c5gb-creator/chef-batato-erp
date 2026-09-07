'use client';

import { useState, useEffect, useMemo } from 'react';
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
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

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
  const [modalEntregaExtraAberto, setModalEntregaExtraAberto] = useState(false);
  const [processando, setProcessando] = useState(false);
  
  // Filtros
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim] = useState('');

  // Formulários
  const [novoPagamento, setNovoPagamento] = useState({ 
    id: '',
    entregador: '',
    valor: 0,
    data: new Date().toISOString().split('T')[0],
    inicio: '',
    fim: '',
    formaPagamento: 'Dinheiro' as 'Dinheiro' | 'MB Way'
  });
  
  const [formEstafeta, setFormEstafeta] = useState({ id: '', nome: '', contacto: '', divida_inicial: 0 });

  const [formEntregaExtra, setFormEntregaExtra] = useState({
    pedidoId: '',
    pedidoNumero: '',
    estafeta: '',
    taxaCliente: 0,
    valorExtra: 0,
    observacao: ''
  });

  const limparNomePedido = (nome: string) => {
    if (!nome) return 'N/D';
    const match = nome.match(/Pedido\s*#?(\d+)/i);
    return match ? match[1] : nome;
  };

  // Função de segurança: Limpa nomes para evitar que 'Marcelo', 'marcelo' e 'Marcelo ' sejam tratados como pessoas diferentes
  const normalizarNome = (nome: string) => {
    return nome ? nome.trim().toLowerCase() : '';
  };

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: ests } = await supabase.from('estafetas').select('*').order('nome');
      
      const { data: peds } = await supabase.from('pedidos')
        .select('id, numero_pedido, cliente, entregador, taxa_entrega, valor_entrega_extra_estafeta, observacao_entrega_extra, criado_em')
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

  useEffect(() => {
    carregarDados();

    const canal = supabase
      .channel('estafetas-tempo-real')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, carregarDados)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estafetas' }, carregarDados)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estafetas_pagamentos' }, carregarDados)
      .subscribe();

    return () => { void supabase.removeChannel(canal); };
  }, [supabase]);

  // --- MOTOR DE CÁLCULO GERAL (CORRIGIDO PARA IGNORAR MAIÚSCULAS E ESPAÇOS) ---
  
  // Cria uma lista de nomes originais (preservando o formato), mas usando o Set normalizado para remover duplicados ocultos
  const mapaNomesUnicos = new Map<string, string>(); // Mapa: nome_normalizado -> nome_original_bonito

  estafetasDB.forEach(e => { if(e.nome) mapaNomesUnicos.set(normalizarNome(e.nome), e.nome); });
  pedidosDB.forEach(p => { if(p.entregador && !mapaNomesUnicos.has(normalizarNome(p.entregador))) mapaNomesUnicos.set(normalizarNome(p.entregador), p.entregador.trim()); });
  pagamentosDB.forEach(p => { if(p.entregador && !mapaNomesUnicos.has(normalizarNome(p.entregador))) mapaNomesUnicos.set(normalizarNome(p.entregador), p.entregador.trim()); });

  const estafetasCalculados: EstafetaCalculado[] = Array.from(mapaNomesUnicos.entries()).map(([nomeNorm, nomeBonito]) => {
    
    // Procura a ficha pelo nome normalizado
    const perfilDB = estafetasDB.find(e => normalizarNome(e.nome) === nomeNorm);
    const taxasAntigas = Number(perfilDB?.divida_inicial) || 0.0; 
    
    // Filtra as entregas pelo nome normalizado
    const pedsAtuais = pedidosDB.filter(p => normalizarNome(p.entregador) === nomeNorm);
    // Filtra os pagamentos pelo nome normalizado
    const pagsAtuais = pagamentosDB.filter(p => normalizarNome(p.entregador) === nomeNorm);

    const entregasNovas = pedsAtuais.length;
    
    // Soma cravada, garantindo que valores nulos ou strings inválidas da BD viram 0
    // Total devido ao estafeta = entrega cobrada ao cliente + extra pago pela empresa.
    const taxasNovas = pedsAtuais.reduce(
      (sum, p) => sum
        + (parseFloat(p.taxa_entrega) || 0)
        + (parseFloat(p.valor_entrega_extra_estafeta) || 0),
      0
    );
    const pagamentosNovos = pagsAtuais.reduce((sum, p) => sum + (parseFloat(p.valor_pago) || 0), 0);

    // MATEMÁTICA CORRETA: (Taxas Passadas + Taxas Novas) - Todos os Pagamentos
    const pendenteAtual = taxasAntigas + taxasNovas - pagamentosNovos;

    return { 
      db_id: perfilDB?.id,
      nome: nomeBonito, 
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
      fim: pag.fim_periodo || '',
      formaPagamento: pag.forma_pagamento === 'MB Way' ? 'MB Way' : 'Dinheiro'
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
        entregador: novoPagamento.entregador.trim(),
        valor_pago: novoPagamento.valor,
        data_pagamento: novoPagamento.data,
        inicio_periodo: novoPagamento.inicio || null,
        fim_periodo: novoPagamento.fim || null,
        forma_pagamento: novoPagamento.formaPagamento
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
      setNovoPagamento({ id: '', entregador: '', valor: 0, data: new Date().toISOString().split('T')[0], inicio: '', fim: '', formaPagamento: 'Dinheiro' });
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

  // --- AÇÕES: ENTREGA EXTRA PAGA PELA EMPRESA ---
  const abrirEntregaExtra = (pedido: any) => {
    setFormEntregaExtra({
      pedidoId: pedido.id,
      pedidoNumero: String(pedido.numero_pedido || limparNomePedido(pedido.cliente)),
      estafeta: pedido.entregador || '',
      taxaCliente: Number(pedido.taxa_entrega) || 0,
      valorExtra: Number(pedido.valor_entrega_extra_estafeta) || 0,
      observacao: pedido.observacao_entrega_extra || ''
    });
    setModalEntregaExtraAberto(true);
  };

  const abrirNovaEntregaExtra = () => {
    setFormEntregaExtra({
      pedidoId: '',
      pedidoNumero: '',
      estafeta: '',
      taxaCliente: 0,
      valorExtra: 0,
      observacao: ''
    });
    setModalEntregaExtraAberto(true);
  };

  const guardarEntregaExtra = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formEntregaExtra.estafeta.trim()) return alert('Selecione o estafeta.');
    if (!formEntregaExtra.pedidoNumero.trim()) return alert('Indique o número do pedido.');
    if (formEntregaExtra.valorExtra <= 0) return alert('Indique um valor extra superior a zero.');

    setProcessando(true);
    try {
      // Se o modal foi aberto pela linha, já conhecemos o ID. Quando o número
      // foi escrito manualmente, procuramos o pedido na base de dados.
      let pedidoId = formEntregaExtra.pedidoId;

      if (!pedidoId) {
        const { data: pedidosEncontrados, error: erroPesquisa } = await supabase
          .from('pedidos')
          .select('id, numero_pedido, taxa_entrega, entregador')
          .eq('numero_pedido', formEntregaExtra.pedidoNumero.trim())
          .limit(1);

        if (erroPesquisa) throw erroPesquisa;
        if (!pedidosEncontrados || pedidosEncontrados.length === 0) {
          return alert(`O pedido #${formEntregaExtra.pedidoNumero.trim()} não foi encontrado.`);
        }

        pedidoId = String(pedidosEncontrados[0].id);
      }

      const { error } = await supabase
        .from('pedidos')
        .update({
          entregador: formEntregaExtra.estafeta.trim(),
          valor_entrega_extra_estafeta: Number(formEntregaExtra.valorExtra.toFixed(2)),
          observacao_entrega_extra: formEntregaExtra.observacao.trim() || null
        })
        .eq('id', pedidoId);

      if (error) throw error;

      setModalEntregaExtraAberto(false);
      await carregarDados();
    } catch (error: unknown) {
      const mensagem = error instanceof Error ? error.message : JSON.stringify(error);
      alert('Erro ao guardar o valor extra da entrega:\n' + mensagem);
    } finally {
      setProcessando(false);
    }
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
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={abrirNovaEntregaExtra} className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-5 py-2.5 rounded-xl text-sm font-black shadow-lg transition-transform active:scale-95 flex items-center gap-2">
            <span>+</span> Entrega Extra
          </button>
          <button onClick={() => { setNovoPagamento({ id: '', entregador: '', valor: 0, data: new Date().toISOString().split('T')[0], inicio: '', fim: '', formaPagamento: 'Dinheiro' }); setModalPagamentoAberto(true); }} className="bg-white hover:bg-zinc-200 text-zinc-950 px-5 py-2.5 rounded-xl text-sm font-black shadow-lg transition-transform active:scale-95 flex items-center gap-2">
            <span>+</span> Novo Acerto
          </button>
        </div>
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
              
              // Pagamentos nativos da BD - normalizando o nome para evitar bugs
              const pagamentosDesteEstafeta = pagamentosDB.filter(p => normalizarNome(p.entregador) === normalizarNome(estafeta.nome));

              // Entregas da BD (com filtro local)
              let entregasDesteEstafeta = pedidosDB.filter(p => normalizarNome(p.entregador) === normalizarNome(estafeta.nome));
              if (filtroInicio) entregasDesteEstafeta = entregasDesteEstafeta.filter(p => p.criado_em.split('T')[0] >= filtroInicio);
              if (filtroFim) entregasDesteEstafeta = entregasDesteEstafeta.filter(p => p.criado_em.split('T')[0] <= filtroFim);

              // Cálculo do total filtrado de taxas
              const totalTaxasFiltradas = entregasDesteEstafeta.reduce(
                (sum, ped) => sum
                  + (parseFloat(ped.taxa_entrega) || 0)
                  + (parseFloat(ped.valor_entrega_extra_estafeta) || 0),
                0
              );

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
                                    <th className="p-4 text-right">Cliente</th>
                                    <th className="p-4 text-right">Extra Empresa</th>
                                    <th className="p-4 text-right">Total Estafeta</th>
                                    <th className="p-4 text-center">Ação</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50 font-medium pb-12">
                                  {entregasDesteEstafeta.length === 0 ? (
                                    <tr><td colSpan={6} className="p-6 text-center text-zinc-600 italic">Nenhuma entrega encontrada neste período.</td></tr>
                                  ) : (
                                    entregasDesteEstafeta.map(ped => {
                                      const taxaCliente = Number(ped.taxa_entrega) || 0;
                                      const valorExtra = Number(ped.valor_entrega_extra_estafeta) || 0;
                                      const totalEstafeta = taxaCliente + valorExtra;

                                      return (
                                        <tr key={ped.id} className="hover:bg-zinc-800/30 transition-colors">
                                          <td className="p-4 text-zinc-300">
                                            {new Date(ped.criado_em).toLocaleDateString('pt-PT')} <span className="text-[10px] text-zinc-500 ml-1">{new Date(ped.criado_em).toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'})}</span>
                                          </td>
                                          <td className="p-4 font-bold text-white">#{ped.numero_pedido || limparNomePedido(ped.cliente)}</td>
                                          <td className="p-4 text-right font-mono text-zinc-400">{taxaCliente.toFixed(2)}€</td>
                                          <td className={`p-4 text-right font-black font-mono ${valorExtra > 0 ? 'text-amber-400' : 'text-zinc-600'}`} title={ped.observacao_entrega_extra || ''}>
                                            {valorExtra.toFixed(2)}€
                                          </td>
                                          <td className="p-4 text-right font-black font-mono text-indigo-400">{totalEstafeta.toFixed(2)}€</td>
                                          <td className="p-4 text-center">
                                            <button
                                              type="button"
                                              onClick={() => abrirEntregaExtra(ped)}
                                              className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-2.5 py-1.5 text-[10px] font-black uppercase text-amber-400 hover:bg-amber-900/40"
                                              title="Adicionar ou editar valor extra pago pela empresa"
                                            >
                                              {valorExtra > 0 ? '✏️ Extra' : '+ Extra'}
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                                {entregasDesteEstafeta.length > 0 && (
                                  <tfoot className="bg-indigo-950/20 border-t border-indigo-900/30 sticky bottom-0 backdrop-blur-md">
                                    <tr>
                                      <td colSpan={5} className="p-4 text-right text-[10px] font-black text-indigo-500 uppercase tracking-widest">
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
                              <button onClick={() => { setNovoPagamento({ id: '', entregador: estafeta.nome, valor: 0, data: new Date().toISOString().split('T')[0], inicio: '', fim: '', formaPagamento: 'Dinheiro' }); setModalPagamentoAberto(true); }} className="text-[10px] bg-green-900/30 hover:bg-green-800/50 text-green-400 border border-green-800/50 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider transition-colors">
                                + Lançar Pagamento
                              </button>
                            </div>
                            
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-h-72 overflow-y-auto no-scrollbar">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-zinc-950/50 border-b border-zinc-800 text-[9px] font-bold text-zinc-500 uppercase tracking-widest sticky top-0">
                                  <tr>
                                    <th className="p-4">Data Acerto</th>
                                    <th className="p-4 hidden sm:table-cell">Período Ref.</th>
                                    <th className="p-4">Forma</th>
                                    <th className="p-4 text-right">Valor Pago</th>
                                    <th className="p-4 text-center">Ações</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50 font-medium">
                                  {pagamentosDesteEstafeta.length === 0 ? (
                                    <tr><td colSpan={5} className="p-6 text-center text-zinc-600 italic">Nenhum pagamento registado.</td></tr>
                                  ) : (
                                    pagamentosDesteEstafeta.map(pag => (
                                      <tr key={pag.id} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="p-4 text-white font-bold flex items-center gap-2">
                                          {new Date(pag.data_pagamento).toLocaleDateString('pt-PT')}
                                        </td>
                                        <td className="p-4 text-zinc-400 font-mono text-[10px] hidden sm:table-cell">
                                          {pag.inicio_periodo ? new Date(pag.inicio_periodo).toLocaleDateString('pt-PT') : 'N/A'} a {pag.fim_periodo ? new Date(pag.fim_periodo).toLocaleDateString('pt-PT') : 'N/A'}
                                        </td>
                                        <td className="p-4">
                                          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${
                                            pag.forma_pagamento === 'MB Way'
                                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                          }`}>
                                            {pag.forma_pagamento || 'Dinheiro'}
                                          </span>
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

      {/* MODAL: VALOR EXTRA DE ENTREGA PAGO PELA EMPRESA */}
      {modalEntregaExtraAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[70] flex flex-col justify-end md:justify-center items-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full md:max-w-md rounded-t-[32px] md:rounded-[32px] overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)] border border-zinc-800">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800/80">
              <div>
                <h2 className="text-xl font-black text-white">🛵 Entrega extra</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {formEntregaExtra.pedidoId
                    ? `Pedido #${formEntregaExtra.pedidoNumero} · ${formEntregaExtra.estafeta}`
                    : 'Selecione o estafeta e escreva o número do pedido'}
                </p>
              </div>
              <button type="button" onClick={() => setModalEntregaExtraAberto(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white">✕</button>
            </div>

            <form onSubmit={guardarEntregaExtra} className="p-6 space-y-5">
              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Estafeta</label>
                <select
                  required
                  value={formEntregaExtra.estafeta}
                  onChange={e => setFormEntregaExtra({ ...formEntregaExtra, estafeta: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-amber-500 font-bold appearance-none cursor-pointer"
                >
                  <option value="">Selecione o estafeta...</option>
                  {estafetasCalculados.map(estafeta => (
                    <option key={estafeta.nome} value={estafeta.nome}>{estafeta.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Número do pedido</label>
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  value={formEntregaExtra.pedidoNumero}
                  onChange={e => setFormEntregaExtra({
                    ...formEntregaExtra,
                    pedidoId: '',
                    pedidoNumero: e.target.value.replace(/[^0-9]/g, ''),
                    taxaCliente: 0
                  })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-xl text-white outline-none focus:border-amber-500 font-black font-mono text-center"
                  placeholder="Ex.: 482"
                />
                <p className="mt-2 text-[10px] text-zinc-500">O sistema confirmará se este pedido existe antes de guardar.</p>
              </div>

              {formEntregaExtra.pedidoId && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Entrega cobrada ao cliente</span>
                <span className="font-mono font-black text-zinc-300">{formEntregaExtra.taxaCliente.toFixed(2)}€</span>
              </div>
              )}

              <div>
                <label className="block text-[10px] text-amber-400 font-black uppercase tracking-widest mb-2">Valor extra pago pela empresa (€)</label>
                <input
                  autoFocus
                  min="0"
                  step="0.01"
                  type="number"
                  value={formEntregaExtra.valorExtra || ''}
                  onChange={e => setFormEntregaExtra({ ...formEntregaExtra, valorExtra: Number(e.target.value) || 0 })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-2xl font-black text-amber-400 font-mono text-center outline-none focus:border-amber-500"
                  placeholder="0.00"
                />
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">Este valor aumenta apenas o total a pagar ao estafeta. Não altera o total cobrado ao cliente.</p>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Motivo / observação (opcional)</label>
                <input
                  type="text"
                  value={formEntregaExtra.observacao}
                  onChange={e => setFormEntregaExtra({ ...formEntregaExtra, observacao: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-amber-500"
                  placeholder="Ex.: entrega oferecida ao cliente"
                />
              </div>

              <div className="rounded-2xl border border-indigo-900/40 bg-indigo-950/20 p-4 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Total desta entrega para o estafeta</span>
                <span className="font-mono text-xl font-black text-indigo-300">{(formEntregaExtra.taxaCliente + formEntregaExtra.valorExtra).toFixed(2)}€</span>
              </div>

              <button type="submit" disabled={processando} className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95 uppercase tracking-wider disabled:opacity-50">
                {processando ? 'A guardar...' : 'Guardar entrega extra'}
              </button>
            </form>
          </div>
        </div>
      )}

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

              <div>
                <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">
                  Forma de Pagamento
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNovoPagamento({
                      ...novoPagamento,
                      formaPagamento: 'Dinheiro'
                    })}
                    className={`rounded-2xl border px-4 py-3.5 text-sm font-black transition-all ${
                      novoPagamento.formaPagamento === 'Dinheiro'
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    💶 Dinheiro
                  </button>

                  <button
                    type="button"
                    onClick={() => setNovoPagamento({
                      ...novoPagamento,
                      formaPagamento: 'MB Way'
                    })}
                    className={`rounded-2xl border px-4 py-3.5 text-sm font-black transition-all ${
                      novoPagamento.formaPagamento === 'MB Way'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    📱 MB Way
                  </button>
                </div>

                <p className="mt-2 text-[10px] text-zinc-500">
                  Dinheiro sai do caixa físico. MB Way reduz a dívida do estafeta, mas não altera o caixa em dinheiro.
                </p>
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
