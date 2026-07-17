'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Revendedor {
  id: string;
  nome: string;
  responsavel: string;
  contacto: string;
  capacidade_display: number;
  ativo: boolean;
}

interface ProdutoBrownie {
  id: string;
  nome: string;
  preco_cardapio: number;
  preco_revenda: number;
}

interface LoteCentral {
  id: string;
  codigo_lote: string;
  quantidade_disponivel: number;
  produtos: { nome: string };
  data_validade: string;
}

interface Visita {
  id: string;
  revendedor_id: string;
  vendidos: number;
  descartados: number;
  repostos: number;
  valor_recebido: number;
  metodo_pagamento: string;
  observacao: string;
  criado_em: string;
}

export default function GestaoRevendaDesktopCompleta() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // --- ESTADOS DO SISTEMA ---
  const [revendedores, setRevendedores] = useState<Revendedor[]>([]);
  const [brownies, setBrownies] = useState<ProdutoBrownie[]>([]);
  const [lotesDisponiveis, setLotesDisponiveis] = useState<LoteCentral[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // --- ORDENAÇÃO DE PARCEIROS ---
  const [ordemParceiros, setOrdemParceiros] = useState<'az' | 'za'>('za'); // Inicia em Z-A por padrão

  // --- ESTADOS DO FORMULÁRIO DE VISITA NOVA ---
  const [revendedorId, setRevendedorId] = useState<string>('');
  const [dataVisita, setDataVisita] = useState(() => new Date().toISOString().split('T')[0]);
  const [descontoGlobal, setDescontoGlobal] = useState<number>(1.10);
  const [contagens, setContagens] = useState<Record<string, { lote_id: string, vendidos: number, repostos: number }>>({});
  const [metodoPagamento, setMetodoPagamento] = useState('Dinheiro');
  const [observacaoExtra, setObservacaoExtra] = useState('');

  // --- ESTADOS DO MODAL PARCEIRO ---
  const [modalLojaAberto, setModalLojaAberto] = useState(false);
  const [editandoParceiroId, setEditandoParceiroId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [contacto, setContacto] = useState('');
  const [capacidade, setCapacidade] = useState(16);

  // --- ESTADOS DO MODAL DE EDIÇÃO DE VISITA ---
  const [modalEdicaoVisita, setModalEdicaoVisita] = useState(false);
  const [visitaSendoEditada, setVisitaSendoEditada] = useState<Visita | null>(null);
  const [editVendidos, setEditVendidos] = useState(0);
  const [editRepostos, setEditRepostos] = useState(0);
  const [editValor, setEditValor] = useState(0);
  const [editMetodo, setEditMetodo] = useState('Dinheiro');

  // Carregar Dados Iniciais
  async function carregarDados() {
    setLoading(true);
    try {
      const { data: revs } = await supabase.from('revendedores').select('*');
      if (revs) setRevendedores(revs);

      const { data: prods } = await supabase.from('produtos').select('id, nome, preco_cardapio, preco_revenda, categoria').eq('ativo', true);
      const listaBrownies = (prods || [])
        .filter(p => p.categoria?.toLowerCase() === 'brownie' || p.nome.toLowerCase().includes('brownie'))
        .map(p => ({ 
          id: p.id, 
          nome: p.nome, 
          preco_cardapio: Number(p.preco_cardapio),
          preco_revenda: Number(p.preco_revenda || 0)
        }));

      const { data: lotes } = await supabase.from('lotes_producao').select('id, codigo_lote, quantidade_disponivel, data_validade, produtos(nome)').gt('quantidade_disponivel', 0).order('data_validade', { ascending: true });
      if (lotes) setLotesDisponiveis(lotes as any);

      const { data: v } = await supabase.from('revenda_visitas').select('*').order('criado_em', { ascending: false });
      if (v) setVisitas(v);

      if (listaBrownies.length > 0 && Object.keys(contagens).length === 0) {
        resetContagens(listaBrownies, lotes as any);
      }
    } catch (error) {
      console.error("Erro ao carregar dados", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDados(); }, [supabase]);

  const resetContagens = (lista: ProdutoBrownie[], lotesDisponiveis: LoteCentral[]) => {
    const initContagens: Record<string, any> = {};
    lista.forEach(b => {
      const loteSugerido = lotesDisponiveis?.find(l => l.produtos.nome === b.nome);
      initContagens[b.id] = { lote_id: loteSugerido ? loteSugerido.id : '', vendidos: 0, repostos: 0 };
    });
    setContagens(initContagens);
  };

  // --- APLICAR ORDENAÇÃO AOS PARCEIROS ---
  const revendedoresOrdenados = [...revendedores].sort((a, b) => {
    // 1. Ativos sempre primeiro, inativos para o fundo
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    // 2. Ordem Alfabética (A-Z ou Z-A)
    if (ordemParceiros === 'az') return a.nome.localeCompare(b.nome);
    return b.nome.localeCompare(a.nome);
  });

  // --- LÓGICA DO PARCEIRO (CRIAR/EDITAR/EXCLUIR) ---
  const abrirCriarParceiro = () => {
    setEditandoParceiroId(null); setNome(''); setResponsavel(''); setContacto(''); setCapacidade(16);
    setModalLojaAberto(true);
  };

  const abrirEditarParceiro = () => {
    const lojaAtiva = revendedores.find(r => r.id === revendedorId);
    if (!lojaAtiva) return alert('Selecione um parceiro primeiro.');
    setEditandoParceiroId(lojaAtiva.id); setNome(lojaAtiva.nome); setResponsavel(lojaAtiva.responsavel || '');
    setContacto(lojaAtiva.contacto || ''); setCapacidade(lojaAtiva.capacidade_display);
    setModalLojaAberto(true);
  };

  const excluirParceiro = async () => {
    if (!revendedorId) return alert('Selecione um parceiro primeiro.');
    if (!confirm('Tem a certeza que deseja EXCLUIR este parceiro? Se houver histórico financeiro, a exclusão pode ser bloqueada pela base de dados.')) return;
    try {
      const { error } = await supabase.from('revendedores').delete().eq('id', revendedorId);
      if (error) throw error;
      alert('Parceiro excluído!');
      setRevendedorId('');
      carregarDados();
    } catch (err) {
      alert('Erro: Não foi possível excluir. O parceiro já tem visitas associadas no histórico. Sugestão: Edite e desative-o.');
    }
  };

  const salvarParceiro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return alert('O nome da empresa é obrigatório.');
    try {
      const dados = { nome: nome.trim(), responsavel: responsavel.trim(), contacto: contacto.trim(), capacidade_display: capacidade, ativo: true };
      
      if (editandoParceiroId) {
        await supabase.from('revendedores').update(dados).eq('id', editandoParceiroId);
        alert('Parceiro atualizado!');
      } else {
        const { data, error } = await supabase.from('revendedores').insert([dados]).select('id').single();
        if (error) throw error;
        alert('Parceiro criado com sucesso!');
        if (data) setRevendedorId(data.id);
      }
      setModalLojaAberto(false);
      carregarDados();
    } catch (err) { alert('Erro ao salvar parceiro.'); }
  };

  // --- LÓGICA DA VISITA (NOVA) ---
  const atualizarContagem = (produtoId: string, campo: 'vendidos' | 'repostos' | 'lote_id', valor: any) => {
    setContagens(prev => ({ ...prev, [produtoId]: { ...prev[produtoId], [campo]: valor } }));
  };

  const totalVendidos = brownies.reduce((acc, b) => acc + (contagens[b.id]?.vendidos || 0), 0);
  const totalRepostos = brownies.reduce((acc, b) => acc + (contagens[b.id]?.repostos || 0), 0);
  const valorTotalReceber = brownies.reduce((acc, b) => acc + ((contagens[b.id]?.vendidos || 0) * Math.max(0, b.preco_cardapio - descontoGlobal)), 0);

  const registrarVisita = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revendedorId) return alert('Por favor, selecione um parceiro.');
    if (totalVendidos === 0 && totalRepostos === 0) return alert('Introduza pelo menos uma venda ou reposição.');
    if (salvando) return;

    setSalvando(true);
    let relatorioFornadas = `Desconto Aplicado: -${descontoGlobal.toFixed(2)}€/un\n\nDetalhamento:\n`;

    try {
      for (const b of brownies) {
        const c = contagens[b.id];
        if (c && (c.vendidos > 0 || c.repostos > 0)) {
          let infoLote = 'S/ Lote Central';
          if (c.repostos > 0 && c.lote_id) {
            const lote = lotesDisponiveis.find(l => l.id === c.lote_id);
            if (lote) {
              infoLote = `Lote: ${lote.codigo_lote}`;
              const novaQtdCentral = Math.max(0, lote.quantidade_disponivel - c.repostos);
              await supabase.from('lotes_producao').update({ quantidade_disponivel: novaQtdCentral }).eq('id', c.lote_id);
            }
          }
          relatorioFornadas += `- ${b.nome}: [Venda: ${c.vendidos}] | [Repor: ${c.repostos}] -> ${infoLote}\n`;
        }
      }

      const observacaoFinal = (observacaoExtra.trim() ? observacaoExtra.trim() + '\n\n' : '') + relatorioFornadas.trim();

      const dadosVisita = {
        revendedor_id: revendedorId,
        vendidos: totalVendidos,
        descartados: 0,
        repostos: totalRepostos,
        valor_recebido: valorTotalReceber,
        metodo_pagamento: metodoPagamento, 
        observacao: observacaoFinal,
        criado_em: new Date(dataVisita).toISOString()
      };

      await supabase.from('revenda_visitas').insert([dadosVisita]);

      alert(`Auditoria Salva com Sucesso!\n\nReceba ${valorTotalReceber.toFixed(2)}€.`);
      setMetodoPagamento('Dinheiro'); setObservacaoExtra('');
      resetContagens(brownies, lotesDisponiveis);
      carregarDados();
    } catch (error) {
      alert('Erro ao registar auditoria.');
    } finally {
      setSalvando(false);
    }
  };

  // --- LÓGICA DE EDIÇÃO/EXCLUSÃO DO HISTÓRICO ---
  const abrirEdicaoVisita = (v: Visita) => {
    setVisitaSendoEditada(v);
    setEditVendidos(v.vendidos);
    setEditRepostos(v.repostos);
    setEditValor(v.valor_recebido);
    setEditMetodo(v.metodo_pagamento);
    setModalEdicaoVisita(true);
  };

  const salvarEdicaoVisita = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitaSendoEditada) return;
    try {
      await supabase.from('revenda_visitas').update({
        vendidos: editVendidos,
        repostos: editRepostos,
        valor_recebido: editValor,
        metodo_pagamento: editMetodo
      }).eq('id', visitaSendoEditada.id);
      
      alert('Visita corrigida com sucesso!');
      setModalEdicaoVisita(false);
      carregarDados();
    } catch (err) { alert('Erro ao editar visita.'); }
  };

  const excluirVisita = async (id: string) => {
    if (!confirm('Deseja mesmo apagar este registo financeiro?')) return;
    try {
      await supabase.from('revenda_visitas').delete().eq('id', id);
      carregarDados();
    } catch (err) { alert('Erro ao apagar visita.'); }
  };

  const calcularDias = (dataString: string) => Math.floor((new Date().getTime() - new Date(dataString).getTime()) / (1000 * 3600 * 24));

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A carregar...</div>;

  const lojaAtiva = revendedores.find(r => r.id === revendedorId);
  const historicoLojaAtiva = visitas.filter(v => v.revendedor_id === revendedorId);

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col selection:bg-orange-500/30">
      
      {/* HEADER */}
      <header className="px-8 py-6 bg-gradient-to-b from-zinc-900 to-zinc-950 border-b border-zinc-800/80 sticky top-0 z-20 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-600 rounded-2xl flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(234,88,12,0.4)]">🚚</div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white leading-tight">Auditoria B2B</h1>
            <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Gestão de Parceiros & Acertos</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row w-full max-w-[1600px] mx-auto overflow-hidden">
        
        {/* SIDEBAR: LISTA DE PARCEIROS COM ORDENAÇÃO */}
        <aside className="w-full lg:w-80 xl:w-96 flex flex-col border-r border-zinc-800/80 bg-zinc-950/50 flex-shrink-0">
          <div className="p-6 border-b border-zinc-800/80 bg-zinc-900/30">
            <h2 className="text-xs font-black uppercase text-orange-500 tracking-widest mb-3">A Sua Rota</h2>
            <div className="flex gap-2">
              <button onClick={abrirCriarParceiro} className="flex-1 bg-zinc-100 hover:bg-white text-zinc-900 font-black py-3 rounded-xl text-xs transition-transform active:scale-[0.98] shadow-md">
                + Parceiro
              </button>
              <button 
                onClick={() => setOrdemParceiros(prev => prev === 'az' ? 'za' : 'az')} 
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 w-16 rounded-xl text-xs font-black shadow-md flex items-center justify-center transition-colors"
                title="Alternar Ordenação"
              >
                {ordemParceiros === 'az' ? 'A-Z ↓' : 'Z-A ↑'}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
            {revendedoresOrdenados.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 italic py-10">Nenhum parceiro registado.</p>
            ) : (
              revendedoresOrdenados.map(loja => {
                const isSelected = revendedorId === loja.id;
                const visitasLoja = visitas.filter(h => h.revendedor_id === loja.id);
                const ultimaVisita = visitasLoja.length > 0 ? visitasLoja[0] : null;
                const dias = ultimaVisita ? calcularDias(ultimaVisita.criado_em) : -1;

                let corPonto = "bg-zinc-600";
                if (!loja.ativo) corPonto = "bg-red-500";
                else if (dias === -1) corPonto = "bg-zinc-400";
                else if (dias <= 3) corPonto = "bg-green-500";
                else if (dias <= 7) corPonto = "bg-yellow-500";
                else corPonto = "bg-orange-500 animate-pulse";

                return (
                  <div
                    key={loja.id}
                    onClick={() => setRevendedorId(loja.id)}
                    className={`p-3.5 rounded-[16px] cursor-pointer transition-all border ${isSelected ? 'bg-orange-600 border-orange-500 shadow-md' : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-800'} ${!loja.ativo && !isSelected && 'opacity-50 grayscale'}`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="truncate pr-2">
                        <h3 className={`font-bold text-sm truncate ${isSelected ? 'text-white' : 'text-zinc-200'}`}>{loja.nome}</h3>
                        <p className={`text-[10px] mt-1 ${isSelected ? 'text-orange-100' : 'text-zinc-500'}`}>
                          {ultimaVisita ? `Última: ${new Date(ultimaVisita.criado_em).toLocaleDateString('pt-PT')}` : 'Sem histórico'}
                        </p>
                      </div>
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${corPonto} ${isSelected ? 'ring-2 ring-white/30' : ''}`}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ÁREA PRINCIPAL: FORMULÁRIOS E HISTÓRICO */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 bg-zinc-950">
          
          {/* COLUNA CENTRAL: FORMULÁRIO (Span 7) */}
          <div className="lg:col-span-7 space-y-6">
            
            <section className="bg-zinc-900/40 p-6 rounded-[32px] border border-zinc-800/80 shadow-sm space-y-5">
              <div className="flex items-center gap-3 border-b border-zinc-800/50 pb-4">
                <span className="bg-zinc-800 text-zinc-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black">1</span>
                <h2 className="text-sm font-black uppercase text-zinc-300 tracking-wider">Identificação do Ponto</h2>
              </div>

              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[250px]">
                  <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2 ml-1">Selecione o Parceiro (ou na lista)</label>
                  <div className="flex gap-2">
                    <select 
                      value={revendedorId} 
                      onChange={e => setRevendedorId(e.target.value)} 
                      className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3.5 text-sm font-bold text-white outline-none focus:border-orange-500 appearance-none cursor-pointer"
                    >
                      <option value="" disabled>-- Clique para selecionar --</option>
                      {revendedoresOrdenados.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                    </select>
                    
                    {revendedorId && (
                      <>
                        <button type="button" onClick={abrirEditarParceiro} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 rounded-xl text-xs font-black shadow-md flex items-center justify-center transition-colors" title="Editar">
                          ✏️
                        </button>
                        <button type="button" onClick={excluirParceiro} className="bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-400 px-4 rounded-xl text-xs font-black shadow-md flex items-center justify-center transition-colors" title="Excluir">
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2 ml-1">Data da Visita</label>
                  <input type="date" required value={dataVisita} onChange={e => setDataVisita(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold text-zinc-300 outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2 ml-1">Margem de Desconto (€/un)</label>
                  <input type="number" step="0.05" min="0" value={descontoGlobal} onChange={e => setDescontoGlobal(parseFloat(e.target.value) || 0)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold text-orange-400 font-mono outline-none focus:border-orange-500" />
                </div>
              </div>

              {lojaAtiva && (
                <div className="flex gap-4 text-xs bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800 font-medium text-zinc-400">
                  <span className="flex items-center gap-1.5"><span className="text-zinc-600">👤</span> {lojaAtiva.responsavel || 'Sem Responsável'}</span>
                  <span className="flex items-center gap-1.5"><span className="text-zinc-600">📱</span> {lojaAtiva.contacto || 'Sem Contacto'}</span>
                  <span className="flex items-center gap-1.5 ml-auto text-orange-400"><span className="text-orange-600">📦</span> Cap: {lojaAtiva.capacidade_display}</span>
                </div>
              )}
            </section>

            <section className="bg-zinc-900/40 p-6 rounded-[32px] border border-zinc-800/80 shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-zinc-800/50 pb-4">
                <span className="bg-zinc-800 text-zinc-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black">2</span>
                <h2 className="text-sm font-black uppercase text-zinc-300 tracking-wider">Lançar Produtos</h2>
              </div>

              <div className="space-y-4">
                {brownies.map(b => {
                  const item = contagens[b.id] || { lote_id: '', vendidos: 0, repostos: 0 };
                  const precoCalculado = Math.max(0, b.preco_cardapio - descontoGlobal);
                  
                  return (
                    <div key={b.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-[24px] flex flex-col gap-4">
                      <div className="flex justify-between items-center border-b border-zinc-800/60 pb-2">
                        <h3 className="font-black text-base text-white">{b.nome}</h3>
                        <span className="text-[11px] font-mono font-bold text-green-400">Venda a: {precoCalculado.toFixed(2)}€/un</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-950 rounded-2xl p-2.5 border border-zinc-800/50 focus-within:border-zinc-500 transition-colors">
                          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center mb-1.5">Vendido</label>
                          <input type="number" min="0" value={item.vendidos || ''} onChange={e => atualizarContagem(b.id, 'vendidos', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-transparent text-center font-black text-white text-2xl outline-none font-mono" />
                        </div>
                        <div className="bg-orange-950/10 rounded-2xl p-2.5 border border-orange-900/20 focus-within:border-orange-500/50 transition-colors">
                          <label className="block text-[10px] font-black text-orange-500/60 uppercase tracking-widest text-center mb-1.5">Repor Novos</label>
                          <input type="number" min="0" value={item.repostos || ''} onChange={e => atualizarContagem(b.id, 'repostos', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-transparent text-center font-black text-orange-400 text-2xl outline-none font-mono" />
                        </div>
                      </div>

                      {item.repostos > 0 && (
                        <div className="bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/80">
                          <label className="block text-[9px] font-black text-orange-500 uppercase tracking-widest mb-1.5 ml-1">Lote da Reposição (Abater Central)</label>
                          <select value={item.lote_id} onChange={e => atualizarContagem(b.id, 'lote_id', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-bold rounded-xl px-3 py-2.5 outline-none focus:border-orange-500">
                            <option value="">Não descontar</option>
                            {lotesDisponiveis.filter(l => l.produtos.nome === b.nome).map(l => (
                              <option key={l.id} value={l.id}>Lote {l.codigo_lote} ({l.quantidade_disponivel} un) · Val: {new Date(l.data_validade).toLocaleDateString('pt-PT')}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* COLUNA DIREITA: CÁLCULOS E HISTÓRICO (Span 5) */}
          <div className="lg:col-span-5 space-y-6 flex flex-col">
            
            <form onSubmit={registrarVisita} className="bg-zinc-900/80 p-6 rounded-[32px] border border-zinc-800 shadow-xl space-y-6">
              <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4">
                <span className="bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shadow-[0_0_10px_rgba(22,163,74,0.5)]">3</span>
                <h2 className="text-sm font-black uppercase text-green-500 tracking-wider">Fecho de Contas</h2>
              </div>

              <div className="bg-gradient-to-br from-green-500/10 to-transparent p-6 rounded-[24px] border border-green-500/20 text-center py-8">
                <span className="block text-xs font-black text-green-500/80 uppercase tracking-widest mb-2">Total a Cobrar</span>
                <div className="text-6xl font-black text-green-400 font-mono tracking-tighter">{valorTotalReceber.toFixed(2)}<span className="text-3xl ml-1">€</span></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-center"><span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Vendidos</span><span className="text-2xl font-black text-white font-mono">{totalVendidos}</span></div>
                <div className="bg-orange-950/10 p-4 rounded-2xl border border-orange-900/30 text-center"><span className="block text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">Repostos</span><span className="text-2xl font-black text-orange-400 font-mono">{totalRepostos}</span></div>
              </div>

              <div className="space-y-4 pt-4 border-t border-zinc-800/60">
                <select value={metodoPagamento} onChange={e => setMetodoPagamento(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3.5 text-sm font-bold text-zinc-200 outline-none focus:border-orange-500 cursor-pointer">
                  <option value="Dinheiro">💵 Dinheiro (Mão)</option>
                  <option value="MBWay">📱 MBWay Comercial</option>
                  <option value="Transferência">🏦 Transferência Bancária</option>
                  <option value="Pendente">⏳ Fiado / Pendente</option>
                </select>
                <textarea rows={2} value={observacaoExtra} onChange={e => setObservacaoExtra(e.target.value)} placeholder="Notas do estafeta..." className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300 outline-none focus:border-orange-500 resize-none" />
                <button type="submit" disabled={salvando} className="w-full bg-orange-600 hover:bg-orange-500 py-5 rounded-xl text-base font-black uppercase tracking-widest text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50">
                  {salvando ? 'Processando...' : '✅ Confirmar Visita'}
                </button>
              </div>
            </form>

            {revendedorId && (
              <section className="bg-zinc-900/30 p-6 rounded-[32px] border border-zinc-800/60">
                <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider mb-4 border-b border-zinc-800/50 pb-2">📋 Histórico ({lojaAtiva?.nome})</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2 no-scrollbar">
                  {historicoLojaAtiva.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic text-center py-4">Ainda sem histórico registado.</p>
                  ) : (
                    historicoLojaAtiva.map(v => (
                      <div key={v.id} className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-2xl shadow-sm text-xs group transition-colors hover:border-zinc-700">
                        <div className="flex justify-between items-start border-b border-zinc-800/60 pb-2 mb-2">
                          <div>
                            <span className="font-bold text-zinc-200">{new Date(v.criado_em).toLocaleDateString('pt-PT')}</span>
                            <span className="text-[10px] text-zinc-500 block">{v.metodo_pagamento}</span>
                          </div>
                          <span className="font-mono font-black text-green-400 text-sm">+{v.valor_recebido.toFixed(2)}€</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-center font-mono bg-zinc-900/50 p-2 rounded-xl mb-3">
                          <div><span className="text-[9px] text-zinc-500 uppercase block font-sans">Vend.</span><b className="text-zinc-200">{v.vendidos}</b></div>
                          <div><span className="text-[9px] text-orange-500/70 uppercase block font-sans">Repor</span><b className="text-orange-400">{v.repostos}</b></div>
                        </div>

                        {v.observacao && (
                          <div className="text-[10px] text-zinc-400 bg-zinc-900 p-2 rounded-lg border border-zinc-800/40 mb-3 whitespace-pre-line leading-relaxed max-h-24 overflow-y-auto">
                            {v.observacao}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button onClick={() => abrirEdicaoVisita(v)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors">✏️ Editar</button>
                          <button onClick={() => excluirVisita(v.id)} className="flex-1 bg-red-950/30 hover:bg-red-900/50 border border-red-900/30 text-red-400 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors">🗑️ Excluir</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* 📱 MODAL: CRIAR / EDITAR PARCEIRO */}
      {modalLojaAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex flex-col justify-center items-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full max-w-md rounded-[32px] flex flex-col overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-zinc-800 animate-in slide-in-from-bottom-8 duration-300">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800/80">
              <h2 className="text-xl font-black text-white">{editandoParceiroId ? 'Editar Parceiro' : '🤝 Novo Parceiro B2B'}</h2>
              <button onClick={() => setModalLojaAberto(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white">✕</button>
            </div>
            <form onSubmit={salvarParceiro} className="p-6 space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Empresa / Nome Comercial</label>
                  <input required type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Pessoa Responsável</label>
                  <input type="text" value={responsavel} onChange={e => setResponsavel(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500 font-medium" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Contacto</label>
                    <input type="text" inputMode="tel" value={contacto} onChange={e => setContacto(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500 font-medium" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Capacidade (Un)</label>
                    <input required type="number" min="1" value={capacidade} onChange={e => setCapacidade(parseInt(e.target.value) || 0)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 font-mono font-black text-white text-center outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-white hover:bg-zinc-200 text-zinc-950 py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95">
                  Confirmar Parceiro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📱 MODAL: EDITAR VISITA DO HISTÓRICO */}
      {modalEdicaoVisita && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-center items-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full max-w-sm rounded-[32px] flex flex-col overflow-hidden shadow-2xl border border-zinc-800">
            <div className="p-5 border-b border-zinc-800/80 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-white leading-none">Corrigir Visita</h2>
                <span className="text-[10px] text-zinc-500 font-mono mt-1 block">Ref: {visitaSendoEditada?.id?.substring(0,8)}</span>
              </div>
              <button onClick={() => setModalEdicaoVisita(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold hover:text-white">✕</button>
            </div>
            
            <form onSubmit={salvarEdicaoVisita} className="p-6 space-y-5">
              <div className="bg-yellow-950/20 border border-yellow-900/30 p-3 rounded-xl text-[10px] text-yellow-500/80 font-bold text-center">
                Atenção: Está a editar os totais manuais desta visita. O relatório detalhado de sabores não será reescrito.
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Vendidos</label>
                  <input type="number" required value={editVendidos} onChange={e => setEditVendidos(parseInt(e.target.value)||0)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono font-black text-white text-center outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Repostos</label>
                  <input type="number" required value={editRepostos} onChange={e => setEditRepostos(parseInt(e.target.value)||0)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono font-black text-orange-400 text-center outline-none focus:border-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Valor Final Recebido (€)</label>
                <input type="number" step="0.01" required value={editValor} onChange={e => setEditValor(parseFloat(e.target.value)||0)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-lg font-mono font-black text-green-400 text-center outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Forma de Pagamento</label>
                <select value={editMetodo} onChange={e => setEditMetodo(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-blue-500">
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="MBWay">MBWay</option>
                  <option value="Transferência">Transferência</option>
                  <option value="Pendente">Pendente</option>
                </select>
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full bg-white hover:bg-zinc-200 text-zinc-950 py-4 rounded-2xl text-sm font-black shadow-lg transition-transform active:scale-95">
                  Confirmar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}