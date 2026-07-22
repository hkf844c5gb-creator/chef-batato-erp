'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Consignacao {
  id: string;
  data_registo: string;
  parceiro: string;
  produto: string;
  sabor: string;
  lote: string;
  data_validade: string;
  preco_unidade: number;
  qtd_deixada: number;
  qtd_vendida: number;
  qtd_trocada: number;
  qtd_vencida: number;
  status: string;
}

export default function GestaoRevenda() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [consignacoes, setConsignacoes] = useState<Consignacao[]>([]);
  const [produtosDB, setProdutosDB] = useState<any[]>([]); 
  const [revendedoresDB, setRevendedoresDB] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [buscandoLote, setBuscandoLote] = useState(false);

  const [pastasAbertas, setPastasAbertas] = useState<string[]>([]);

  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [modalFechoAberto, setModalFechoAberto] = useState(false);
  const [modalRevendedorAberto, setModalRevendedorAberto] = useState(false);
  
  const [fechoMassa, setFechoMassa] = useState<{ parceiro: string; itens: any[] } | null>(null);

  const hoje = new Date();
  
  const [formNovo, setFormNovo] = useState({
    id: '', parceiro: '', produto: '', sabor: '', lote: 'BR', 
    data_validade: '', preco_unidade: 0, qtd_deixada: 1, 
    data_registo: hoje.toISOString().split('T')[0]
  });

  const [formRevendedor, setFormRevendedor] = useState({
    id: '', nome_empresa: '', responsavel: '', contacto: '', morada: ''
  });

  const [formFecho, setFormFecho] = useState<Consignacao | null>(null);

  async function carregarDadosIniciais() {
    setLoading(true);
    try {
      const { data: consData } = await supabase.from('revenda_consignacoes').select('*').order('created_at', { ascending: false });
      if (consData) setConsignacoes(consData);

      const { data: prodData } = await supabase.from('produtos').select('*');
      if (prodData) setProdutosDB(prodData);

      const { data: revData } = await supabase.from('revendedores').select('*').order('nome_empresa', { ascending: true });
      if (revData) setRevendedoresDB(revData);

    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDadosIniciais(); }, []);

  const consignacoesAgrupadas = consignacoes.reduce((acc, cons) => {
    if (!acc[cons.parceiro]) acc[cons.parceiro] = [];
    acc[cons.parceiro].push(cons);
    return acc;
  }, {} as Record<string, Consignacao[]>);

  const alternarPasta = (parceiro: string) => {
    setPastasAbertas(prev => 
      prev.includes(parceiro) ? prev.filter(p => p !== parceiro) : [...prev, parceiro]
    );
  };

  const calcularDiasValidade = (dataValidade: string) => {
    if (!dataValidade) return null;
    const dataAtual = new Date(); dataAtual.setHours(0, 0, 0, 0);
    const validade = new Date(dataValidade); validade.setHours(0, 0, 0, 0);
    return Math.ceil((validade.getTime() - dataAtual.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getStatusGrupo = (lista: Consignacao[]) => {
    const ativos = lista.filter(c => c.status === 'Ativo');
    if (ativos.length === 0) return { text: "TUDO FECHADO", bg: "bg-zinc-800 text-zinc-500 border border-zinc-700" };

    let piorStatus = Infinity;
    ativos.forEach(c => {
       const dias = calcularDiasValidade(c.data_validade);
       if (dias !== null && dias < piorStatus) piorStatus = dias;
    });

    if (piorStatus < 0) return { text: "⚠️ PRODUTO VENCIDO", bg: "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/20" };
    if (piorStatus === 0) return { text: "🚨 VENCE HOJE", bg: "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/20" };
    if (piorStatus <= 3) return { text: `EM RISCO (${piorStatus} DIAS)`, bg: "bg-orange-500 text-white shadow-lg shadow-orange-500/20" };
    
    return { text: "NO PRAZO", bg: "bg-green-500/10 text-green-400 border border-green-500/20" };
  };

  const cruzarLoteComProducao = async (loteDigitado: string) => {
    if (!loteDigitado.trim() || loteDigitado === 'BR') return;
    setBuscandoLote(true);
    try {
      const loteLimpo = loteDigitado.trim();
      let { data, error } = await supabase.from('producao').select('*').ilike('lote', loteLimpo).maybeSingle();
      if (!data) {
        const fallback = await supabase.from('lotes_producao').select('*').ilike('codigo_lote', loteLimpo).limit(1);
        data = fallback.data && fallback.data.length > 0 ? fallback.data[0] : null;
      }
      const validadeEncontrada = data?.data_validade || data?.validade;

      if (data && validadeEncontrada) {
        const nomeProduto = data.produto || formNovo.produto;
        let precoCalculado = formNovo.preco_unidade;

        if (nomeProduto) {
          const prodDetalhes = produtosDB.find(p => (p.nome || p.descricao) === nomeProduto);
          if (prodDetalhes) {
            const precoBase = Number(prodDetalhes.preco_whatsapp || prodDetalhes.preco_venda || prodDetalhes.preco || 0);
            if (precoBase > 0) precoCalculado = parseFloat(Math.max(0, precoBase - 1.10).toFixed(2));
          }
        }

        setFormNovo(prev => ({ 
          ...prev, 
          data_validade: validadeEncontrada,
          produto: nomeProduto,
          sabor: data.sabor || prev.sabor,
          preco_unidade: precoCalculado
        }));
      } else {
        alert(`O Lote "${loteDigitado}" não foi encontrado na tabela de produção.\n\nVerifique se escreveu corretamente.`);
        setFormNovo(prev => ({ ...prev, data_validade: '' }));
      }
    } catch (err) { console.error(err); } finally { setBuscandoLote(false); }
  };

  const aoSelecionarProduto = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nomeProduto = e.target.value;
    let precoCalculado = formNovo.preco_unidade;
    const prodDetalhes = produtosDB.find(p => (p.nome || p.descricao) === nomeProduto);
    if (prodDetalhes) {
      const precoBase = Number(prodDetalhes.preco_whatsapp || prodDetalhes.preco_venda || prodDetalhes.preco || 0);
      if (precoBase > 0) precoCalculado = parseFloat(Math.max(0, precoBase - 1.10).toFixed(2));
    }
    setFormNovo({...formNovo, produto: nomeProduto, preco_unidade: precoCalculado});
  };

  const ativas = consignacoes.filter(c => c.status === 'Ativo');
  const totalProdutosRua = ativas.reduce((acc, c) => acc + Number(c.qtd_deixada), 0);
  const valorPotencialRua = ativas.reduce((acc, c) => acc + (Number(c.qtd_deixada) * Number(c.preco_unidade)), 0);
  const fechadas = consignacoes.filter(c => c.status === 'Fechado');
  const lucroRealizado = fechadas.reduce((acc, c) => acc + (Number(c.qtd_vendida) * Number(c.preco_unidade)), 0);
  const lotesEmRisco = ativas.filter(c => { const dias = calcularDiasValidade(c.data_validade); return dias !== null && dias <= 3; }).length;

  const abrirNovaConsignacao = () => {
    if (revendedoresDB.length === 0) return alert("Por favor, registe primeiro um Revendedor clicando no botão 'Gestão Revendedores'.");
    setFormNovo({ 
      id: '', parceiro: '', produto: '', sabor: '', lote: 'BR', data_validade: '', preco_unidade: 0, qtd_deixada: 1,
      data_registo: new Date().toISOString().split('T')[0]
    });
    setModalNovoAberto(true);
  };

  const editarConsignacao = (cons: Consignacao) => {
    setFormNovo({
      id: cons.id,
      parceiro: cons.parceiro,
      produto: cons.produto,
      sabor: cons.sabor || '',
      lote: cons.lote,
      data_validade: cons.data_validade,
      preco_unidade: cons.preco_unidade,
      qtd_deixada: cons.qtd_deixada,
      data_registo: cons.data_registo.split('T')[0]
    });
    setModalNovoAberto(true);
  };

  // ⚡ FUNÇÃO DE EXCLUSÃO DE PRODUTOS DOS LOTES (FIFO) NO MOMENTO DA REVENDA ⚡
  const abaterProdutoDoLoteDeProducao = async (nomeProduto: string, loteAlvo: string, quantidadeRestante: number) => {
    try {
        const prodDbInfo = produtosDB.find(p => (p.nome || p.descricao) === nomeProduto);
        if (!prodDbInfo) return;

        const loteId = prodDbInfo.id;
        
        // Vai buscar os lotes deste produto que ainda têm unidades
        const { data: lotesAtivos } = await supabase
            .from('lotes_producao')
            .select('id, quantidade_disponivel, codigo_lote')
            .eq('produto_id', loteId)
            .gt('quantidade_disponivel', 0)
            .order('data_validade', { ascending: true }); // Aplica FIFO

        if (lotesAtivos && lotesAtivos.length > 0) {
            let qtdParaAbater = quantidadeRestante;

            // 1ª Tentativa: Procura se o lote especificado tem quantidade
            const loteEscolhido = lotesAtivos.find(l => l.codigo_lote.toUpperCase() === loteAlvo.toUpperCase());

            if (loteEscolhido) {
                const abatimento = Math.min(qtdParaAbater, loteEscolhido.quantidade_disponivel);
                const novoDisponivel = loteEscolhido.quantidade_disponivel - abatimento;

                await supabase.from('lotes_producao').update({
                    quantidade_disponivel: novoDisponivel,
                    quantidade_atual: novoDisponivel
                }).eq('id', loteEscolhido.id);
                
                qtdParaAbater -= abatimento;
            }

            // 2ª Tentativa (FIFO): Abater noutros lotes se o lote escolhido não chegar para a encomenda toda
            if (qtdParaAbater > 0) {
               for (const lote of lotesAtivos) {
                  if (lote.codigo_lote.toUpperCase() === loteAlvo.toUpperCase()) continue; // Salta o que já vimos
                  if (qtdParaAbater <= 0) break;

                  const abatimento = Math.min(qtdParaAbater, lote.quantidade_disponivel);
                  const novoDisponivel = lote.quantidade_disponivel - abatimento;
                  
                  await supabase.from('lotes_producao').update({
                      quantidade_disponivel: novoDisponivel,
                      quantidade_atual: novoDisponivel
                  }).eq('id', lote.id);

                  qtdParaAbater -= abatimento;
               }
            }
        }
    } catch (err) {
        console.error("Erro a cruzar revenda com os lotes de produção: ", err);
    }
  };

  const salvarNovaConsignacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNovo.data_validade) return alert("Erro: A Data de Validade está vazia.");
    setProcessando(true);
    
    try {
      const payload = {
        parceiro: formNovo.parceiro, produto: formNovo.produto, sabor: formNovo.sabor, 
        lote: formNovo.lote, data_validade: formNovo.data_validade, 
        preco_unidade: formNovo.preco_unidade, qtd_deixada: formNovo.qtd_deixada, 
        data_registo: formNovo.data_registo
      };

      if (formNovo.id) {
        // Obter os detalhes atuais da consignacao para calcular a diferença
        const { data: consAtual } = await supabase.from('revenda_consignacoes').select('qtd_deixada').eq('id', formNovo.id).single();
        const { error } = await supabase.from('revenda_consignacoes').update(payload).eq('id', formNovo.id);
        if (error) throw error;
        
        // Descontar a diferença (caso o utilizador aumente a quantidade após já ter salvo o registo)
        if (consAtual && formNovo.qtd_deixada > consAtual.qtd_deixada) {
            const diferencaAAbater = formNovo.qtd_deixada - consAtual.qtd_deixada;
            await abaterProdutoDoLoteDeProducao(formNovo.produto, formNovo.lote, diferencaAAbater);
        }
      } else {
        const { error } = await supabase.from('revenda_consignacoes').insert([payload]);
        if (error) throw error;

        // Desconta da tabela de produção dos Brownies!
        await abaterProdutoDoLoteDeProducao(formNovo.produto, formNovo.lote, formNovo.qtd_deixada);
      }

      setModalNovoAberto(false);
      if (!pastasAbertas.includes(formNovo.parceiro)) alternarPasta(formNovo.parceiro);
      carregarDadosIniciais();
    } catch (err: any) { alert("Erro ao guardar lote: " + err.message); } finally { setProcessando(false); }
  };

  const abrirFechoMassa = (parceiro: string, lista: Consignacao[]) => {
    const ativos = lista.filter(c => c.status === 'Ativo');
    if (ativos.length === 0) return alert('Não tem produtos ativos para fechar neste local.');

    setFechoMassa({
      parceiro,
      itens: ativos.map(c => ({
        ...c,
        qtd_vendida: c.qtd_vendida || 0,
        qtd_trocada: c.qtd_trocada || 0,
        qtd_vencida: c.qtd_vencida || 0
      }))
    });
  };

  const atualizarItemMassa = (id: string, campo: string, valor: string) => {
    const valNum = parseInt(valor) || 0;
    setFechoMassa(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        itens: prev.itens.map(i => i.id === id ? { ...i, [campo]: valNum } : i)
      };
    });
  };

  const salvarFechoMassa = async () => {
    if (!fechoMassa) return;

    for (const item of fechoMassa.itens) {
      const tot = Number(item.qtd_vendida) + Number(item.qtd_trocada) + Number(item.qtd_vencida);
      if (tot > item.qtd_deixada) {
        return alert(`Atenção: No produto ${item.produto} (Lote ${item.lote}), a soma (${tot}) ultrapassa os ${item.qtd_deixada} entregues inicialmente.`);
      }
    }

    setProcessando(true);
    try {
      await Promise.all(fechoMassa.itens.map(item => 
        supabase.from('revenda_consignacoes').update({
          qtd_vendida: item.qtd_vendida,
          qtd_trocada: item.qtd_trocada,
          qtd_vencida: item.qtd_vencida,
          status: 'Fechado'
        }).eq('id', item.id)
      ));
      
      setFechoMassa(null);
      carregarDadosIniciais();
    } catch (err: any) { alert("Erro ao gravar balanço completo: " + err.message); } finally { setProcessando(false); }
  };

  const salvarRevendedor = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessando(true);
    try {
      const payload = { nome: formRevendedor.nome_empresa, nome_empresa: formRevendedor.nome_empresa, responsavel: formRevendedor.responsavel, contacto: formRevendedor.contacto, morada: formRevendedor.morada };
      if (formRevendedor.id) {
        const { error } = await supabase.from('revendedores').update(payload).eq('id', formRevendedor.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('revendedores').insert([payload]);
        if (error) throw error;
      }
      setFormRevendedor({id: '', nome_empresa: '', responsavel: '', contacto: '', morada: ''});
      carregarDadosIniciais();
    } catch (err: any) { alert("Erro ao registar: " + err.message); } finally { setProcessando(false); }
  };

  const editarRevendedor = (rev: any) => {
    setFormRevendedor({ id: rev.id, nome_empresa: rev.nome_empresa || rev.nome || '', responsavel: rev.responsavel || '', contacto: rev.contacto || '', morada: rev.morada || '' });
  };

  const excluirRevendedor = async (id: string) => {
    if (!confirm('Deseja eliminar este parceiro?')) return;
    try {
      const { error } = await supabase.from('revendedores').delete().eq('id', id);
      if (error) throw error;
      carregarDadosIniciais();
    } catch (err: any) { alert("Não foi possível eliminar! Este revendedor já tem histórico.\n\n" + err.message); }
  };

  const abrirFecho = (cons: Consignacao) => {
    setFormFecho({ ...cons, qtd_vendida: cons.qtd_vendida || 0, qtd_trocada: cons.qtd_trocada || 0, qtd_vencida: cons.qtd_vencida || 0 });
    setModalFechoAberto(true);
  };

  const salvarFecho = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFecho) return;
    const totalApurado = Number(formFecho.qtd_vendida) + Number(formFecho.qtd_trocada) + Number(formFecho.qtd_vencida);
    if (totalApurado > formFecho.qtd_deixada) return alert(`Atenção: A soma dos produtos não pode ser maior que os ${formFecho.qtd_deixada} entregues.`);

    setProcessando(true);
    try {
      const { error } = await supabase.from('revenda_consignacoes').update({
        qtd_vendida: formFecho.qtd_vendida, qtd_trocada: formFecho.qtd_trocada, qtd_vencida: formFecho.qtd_vencida, status: 'Fechado'
      }).eq('id', formFecho.id);
      if (error) throw error;
      setModalFechoAberto(false);
      carregarDadosIniciais();
    } catch (err: any) { alert("Erro: " + err.message); } finally { setProcessando(false); }
  };

  const anularFecho = async (id: string) => {
    if (!confirm('Tem a certeza que deseja anular este balanço e colocar o lote de novo como "Ativo"?')) return;
    setProcessando(true);
    try {
      const { error } = await supabase.from('revenda_consignacoes').update({ qtd_vendida: 0, qtd_trocada: 0, qtd_vencida: 0, status: 'Ativo' }).eq('id', id);
      if (error) throw error;
      setModalFechoAberto(false);
      carregarDadosIniciais();
    } catch (err: any) { alert("Erro: " + err.message); } finally { setProcessando(false); }
  };

  const excluirRegisto = async (id: string) => {
    if (!confirm('Deseja eliminar este pedido inteiro? Esta ação não pode ser desfeita.')) return;
    await supabase.from('revenda_consignacoes').delete().eq('id', id);
    carregarDadosIniciais();
  };

  const renderizarValidade = (dataValidade: string, status: string) => {
    if (status === 'Fechado') return <span className="text-zinc-600">-</span>;
    if (!dataValidade) return <span className="text-zinc-500">N/D</span>;
    const dias = calcularDiasValidade(dataValidade);
    if (dias === null) return null;
    if (dias < 0) return <span className="bg-red-500 text-white px-2 py-1 rounded-md text-[10px] font-bold uppercase animate-pulse">⚠️ Vencido</span>;
    if (dias === 0) return <span className="bg-red-500 text-white px-2 py-1 rounded-md text-[10px] font-bold uppercase animate-pulse">🚨 Vence Hoje!</span>;
    if (dias <= 3) return <span className="bg-orange-500 text-white px-2 py-1 rounded-md text-[10px] font-bold uppercase shadow-lg shadow-orange-500/20">Vence em {dias} dias</span>;
    return <span className="text-green-500 font-mono text-xs">{new Date(dataValidade).toLocaleDateString('pt-PT')}</span>;
  };

  if (loading && consignacoes.length === 0) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-amber-500 font-bold uppercase tracking-widest text-xs">A Carregar Dados...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-24 selection:bg-amber-500/30">
      
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center shadow-lg shadow-amber-900/40 text-2xl">📦</div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Revenda & Lotes</h1>
            <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Controlo de Sabores e Validades</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => { setFormRevendedor({id:'', nome_empresa:'', responsavel:'', contacto:'', morada:''}); setModalRevendedorAberto(true); }} className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2.5 rounded-xl text-sm font-black shadow-lg transition-transform active:scale-95 flex items-center gap-2 border border-zinc-700">
            <span>👥</span> Gestão Revendedores
          </button>
          
          <button onClick={abrirNovaConsignacao} className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-5 py-2.5 rounded-xl text-sm font-black shadow-lg transition-transform active:scale-95 flex items-center gap-2">
            <span>+</span> Entregar Lote
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 md:p-8 space-y-8">
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-zinc-900 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Produtos Ativos</span>
            <div className="text-4xl font-black text-white font-mono mt-2">{totalProdutosRua}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800/80 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor Esperado</span>
            <div className="text-3xl font-black text-white font-mono mt-2">{valorPotencialRua.toFixed(2)}<span className="text-lg text-zinc-500 ml-1">€</span></div>
          </div>
          <div className="bg-green-950/20 border border-green-900/30 p-6 rounded-[32px] shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Lucro Realizado</span>
            <div className="text-3xl font-black text-green-400 font-mono mt-2">{lucroRealizado.toFixed(2)}<span className="text-lg text-green-700 ml-1">€</span></div>
          </div>
          <div className={`p-6 rounded-[32px] shadow-xl flex flex-col justify-center border ${lotesEmRisco > 0 ? 'bg-orange-950/40 border-orange-500/50' : 'bg-zinc-900 border-zinc-800/80'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${lotesEmRisco > 0 ? 'text-orange-400' : 'text-zinc-500'}`}>Lotes em Risco (≤ 3 Dias)</span>
            <div className={`text-3xl font-black font-mono mt-2 ${lotesEmRisco > 0 ? 'text-orange-500 animate-pulse' : 'text-zinc-600'}`}>
              {lotesEmRisco} <span className="text-xs font-sans text-zinc-500 ml-1 uppercase">Avisos</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {Object.keys(consignacoesAgrupadas).length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-[24px] p-12 text-center text-zinc-500 italic">
              Nenhuma consignação registada. Comece por entregar lotes aos seus parceiros.
            </div>
          ) : (
            Object.entries(consignacoesAgrupadas).map(([parceiro, lista]) => {
              const isOpen = pastasAbertas.includes(parceiro);
              const statusAviso = getStatusGrupo(lista);
              
              const ativosLista = lista.filter(c => c.status === 'Ativo');
              const totalAtivos = ativosLista.reduce((acc, c) => acc + Number(c.qtd_deixada), 0);
              
              let ultimaEntregaStr = "";
              if (ativosLista.length > 0) {
                const datas = ativosLista.map(c => new Date(c.data_registo).getTime());
                const maxData = Math.max(...datas);
                ultimaEntregaStr = new Date(maxData).toLocaleDateString('pt-PT');
              }

              return (
                <div key={parceiro} className="bg-zinc-900 border border-zinc-800 rounded-[24px] overflow-hidden transition-all shadow-lg">
                  
                  <div 
                    onClick={() => alternarPasta(parceiro)}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-zinc-800/50 transition-colors select-none"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-zinc-950 border border-zinc-800 flex justify-center items-center text-xl">🏪</div>
                      <div>
                        <h3 className="text-lg font-black text-amber-400">{parceiro}</h3>
                        <p className="text-xs text-zinc-500 font-mono mt-0.5">
                          {totalAtivos > 0 ? `Entrega: ${ultimaEntregaStr} • ${totalAtivos} Produtos` : 'Nenhum produto ativo.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${statusAviso.bg}`}>
                        {statusAviso.text}
                      </span>
                      <div className={`w-8 h-8 rounded-full flex justify-center items-center bg-zinc-950 text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>▼</div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-zinc-800 bg-zinc-950/40">
                      
                      <div className="flex justify-between items-center px-4 py-3 bg-zinc-950/80 border-b border-zinc-800/50">
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Histórico de Lotes</span>
                        
                        {ativosLista.length > 0 && (
                          <button onClick={() => abrirFechoMassa(parceiro, ativosLista)} className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded-xl text-xs font-black shadow-lg transition-transform active:scale-95 flex items-center gap-2">
                            📝 Fazer Balanço Completo
                          </button>
                        )}
                      </div>

                      <div className="overflow-x-auto p-2">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800/50">
                            <tr>
                              <th className="p-4">Produto</th>
                              <th className="p-4 text-center">Lote</th>
                              <th className="p-4 text-center">Validade</th>
                              <th className="p-4 text-center">Qtd Inicial</th>
                              <th className="p-4 text-center">Ações no Pedido</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/30">
                            {lista.map(cons => (
                              <tr key={cons.id} className="hover:bg-zinc-800/20 transition-colors">
                                <td className="p-4 text-white">
                                  <span className="font-bold">{cons.produto}</span>
                                  {cons.sabor && cons.sabor !== '-' && <span className="ml-2 bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-[10px]">{cons.sabor}</span>}
                                  <div className="text-[9px] text-zinc-500 mt-1">Data Entrega: {new Date(cons.data_registo).toLocaleDateString('pt-PT')}</div>
                                </td>
                                <td className="p-4 text-center">
                                  <span className="bg-zinc-950 border border-zinc-800 text-amber-400 font-mono font-bold text-[10px] px-2 py-1 rounded shadow-inner">
                                    {cons.lote}
                                  </span>
                                </td>
                                <td className="p-4 text-center">{renderizarValidade(cons.data_validade, cons.status)}</td>
                                <td className="p-4 text-center font-black font-mono text-base text-white">{cons.qtd_deixada}</td>
                                <td className="p-4 text-center flex items-center justify-center gap-2">
                                  
                                  <button onClick={(e) => { e.stopPropagation(); editarConsignacao(cons); }} className="w-8 h-8 flex justify-center items-center bg-zinc-800 hover:bg-amber-500 text-zinc-400 hover:text-zinc-950 rounded-lg transition-colors border border-zinc-700 hover:border-amber-500" title="Editar Dados da Entrega">✏️</button>

                                  {cons.status === 'Ativo' ? (
                                    <span className="text-[10px] text-green-500 bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20 font-bold uppercase tracking-widest">
                                      Em Exposição
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 pl-2 pr-1 py-1 rounded-lg">
                                      <span className="text-[10px] text-zinc-500 font-mono">
                                        V: {cons.qtd_vendida} | P: {Number(cons.qtd_vencida) + Number(cons.qtd_trocada)}
                                      </span>
                                      <button onClick={(e) => { e.stopPropagation(); abrirFecho(cons); }} className="w-6 h-6 flex justify-center items-center rounded bg-zinc-900 text-amber-500 hover:text-white hover:bg-amber-500 transition-colors" title="Corrigir Erro no Balanço">✏️</button>
                                    </div>
                                  )}

                                  <button onClick={(e) => { e.stopPropagation(); excluirRegisto(cons.id); }} className="w-8 h-8 flex justify-center items-center bg-zinc-950 hover:bg-red-500/20 text-zinc-600 hover:text-red-400 rounded-lg transition-colors border border-zinc-900 hover:border-red-500/30 ml-2" title="Excluir Pedido Inteiro">🗑️</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* MODAL: BALANÇO EM MASSA (TODOS OS SABORES) */}
      {fechoMassa && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-center items-center p-4">
          <div className="bg-zinc-900 w-full max-w-4xl rounded-[32px] flex flex-col overflow-hidden shadow-2xl border border-amber-500/30 max-h-[95vh]">
            
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800 bg-amber-500/5 shrink-0">
              <div>
                <h2 className="text-xl font-black text-amber-500">📝 Balanço da Visita</h2>
                <p className="text-xs text-zinc-400 mt-1">Preencha o resultado dos produtos expostos na <strong>{fechoMassa.parceiro}</strong></p>
              </div>
              <button onClick={() => setFechoMassa(null)} className="w-8 h-8 flex justify-center items-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {fechoMassa.itens.map(item => (
                <div key={item.id} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
                  
                  <div className="flex-1 w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-white">{item.produto}</span>
                      <span className="bg-zinc-800 text-amber-500 font-mono px-2 py-0.5 rounded text-[10px] font-bold">LOTE: {item.lote}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      Data Entrega: {new Date(item.data_registo).toLocaleDateString('pt-PT')}
                    </div>
                    <div className="text-xs font-bold mt-2 text-zinc-400">
                      Entregues / Deixados: <span className="text-lg text-white font-black">{item.qtd_deixada}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full lg:w-auto bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                    <div className="flex-1 lg:w-24">
                      <label className="block text-[10px] font-black text-green-400 uppercase text-center mb-1">💰 Vendidos</label>
                      <input type="number" min="0" value={item.qtd_vendida} onChange={e => atualizarItemMassa(item.id, 'qtd_vendida', e.target.value)} className="w-full bg-zinc-950 border border-green-500/50 rounded-lg px-2 py-2 text-base font-black text-green-400 text-center outline-none focus:border-green-400" />
                    </div>
                    <div className="flex-1 lg:w-24">
                      <label className="block text-[10px] font-black text-orange-400 uppercase text-center mb-1">🔄 Trocados</label>
                      <input type="number" min="0" value={item.qtd_trocada} onChange={e => atualizarItemMassa(item.id, 'qtd_trocada', e.target.value)} className="w-full bg-zinc-950 border border-orange-500/50 rounded-lg px-2 py-2 text-base font-black text-orange-400 text-center outline-none focus:border-orange-400" />
                    </div>
                    <div className="flex-1 lg:w-24">
                      <label className="block text-[10px] font-black text-red-400 uppercase text-center mb-1">🗑️ Vencidos</label>
                      <input type="number" min="0" value={item.qtd_vencida} onChange={e => atualizarItemMassa(item.id, 'qtd_vencida', e.target.value)} className="w-full bg-zinc-950 border border-red-500/50 rounded-lg px-2 py-2 text-base font-black text-red-400 text-center outline-none focus:border-red-400" />
                    </div>
                  </div>

                </div>
              ))}
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-900 shrink-0">
              <button onClick={salvarFechoMassa} disabled={processando} className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 py-4 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50 transition-colors">
                {processando ? 'A Encerrar Lotes...' : 'Gravar Balanço Completo da Visita'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: GESTÃO DE REVENDEDORES */}
      {modalRevendedorAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-center items-center p-4">
          <div className="bg-zinc-900 w-full max-w-4xl rounded-[32px] flex flex-col overflow-hidden shadow-2xl border border-zinc-700 max-h-[90vh]">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800 bg-zinc-950/50">
              <h2 className="text-xl font-black text-white">🏪 Gestão de Parceiros Comerciais</h2>
              <button onClick={() => setModalRevendedorAberto(false)} className="w-8 h-8 flex justify-center items-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white">✕</button>
            </div>
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              <div className="flex-1 p-6 border-b md:border-b-0 md:border-r border-zinc-800 overflow-y-auto">
                <h3 className="text-sm font-bold text-amber-500 mb-6 uppercase tracking-widest">{formRevendedor.id ? '✏️ A Editar Registo...' : '➕ Novo Registo'}</h3>
                <form onSubmit={salvarRevendedor} className="space-y-4">
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-black uppercase mb-1">Empresa / Ponto de Venda</label>
                    <input required type="text" value={formRevendedor.nome_empresa} onChange={e => setFormRevendedor({...formRevendedor, nome_empresa: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500" placeholder="Ex: Pastelaria Central" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-black uppercase mb-1">Responsável</label>
                      <input type="text" value={formRevendedor.responsavel} onChange={e => setFormRevendedor({...formRevendedor, responsavel: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500" placeholder="Nome..." />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-black uppercase mb-1">Contacto</label>
                      <input type="text" value={formRevendedor.contacto} onChange={e => setFormRevendedor({...formRevendedor, contacto: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500" placeholder="Ex: 912 345 678" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 font-black uppercase mb-1">Morada / Zona</label>
                    <input type="text" value={formRevendedor.morada} onChange={e => setFormRevendedor({...formRevendedor, morada: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500" placeholder="Rua..." />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button type="submit" disabled={processando} className="flex-1 bg-white hover:bg-zinc-200 text-zinc-950 py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50">
                      {processando ? 'A Processar...' : formRevendedor.id ? 'Atualizar Dados' : 'Registar Parceiro'}
                    </button>
                    {formRevendedor.id && (
                      <button type="button" onClick={() => setFormRevendedor({id:'', nome_empresa:'', responsavel:'', contacto:'', morada:''})} className="px-5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold uppercase">Cancelar</button>
                    )}
                  </div>
                </form>
              </div>
              <div className="flex-1 p-6 overflow-y-auto bg-zinc-950/30">
                <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-widest flex justify-between items-center">
                  Lista de Clientes <span className="bg-zinc-800 px-2 py-0.5 rounded-full text-white">{revendedoresDB.length}</span>
                </h3>
                <div className="space-y-3">
                  {revendedoresDB.length === 0 ? (
                    <p className="text-sm text-zinc-600 italic">Nenhuma empresa registada.</p>
                  ) : (
                    revendedoresDB.map(rev => (
                      <div key={rev.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex justify-between items-center group hover:border-amber-500/50 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-white">{rev.nome_empresa || rev.nome}</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">Resp: {rev.responsavel || '-'} • Tel: {rev.contacto || '-'}</p>
                        </div>
                        <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => editarRevendedor(rev)} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-amber-500 hover:text-zinc-900 flex justify-center items-center text-zinc-400 transition-colors" title="Editar">✏️</button>
                          <button onClick={() => excluirRevendedor(rev.id)} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-red-500 hover:text-white flex justify-center items-center text-zinc-400 transition-colors" title="Excluir">🗑️</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LANÇAR / EDITAR LOTE NA RUA */}
      {modalNovoAberto && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-center items-center p-4">
          <div className="bg-zinc-900 w-full max-w-lg rounded-[32px] flex flex-col overflow-hidden shadow-2xl border border-zinc-800">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800">
              <h2 className="text-xl font-black text-white">{formNovo.id ? '✏️ Editar Entrega do Lote' : '📦 Entregar Lote'}</h2>
              <button onClick={() => setModalNovoAberto(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            <form onSubmit={salvarNovaConsignacao} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-amber-500 font-black uppercase mb-1">Ponto de Venda</label>
                  <select required value={formNovo.parceiro} onChange={e => setFormNovo({...formNovo, parceiro: e.target.value})} className="w-full bg-amber-950/20 border border-amber-500/30 rounded-xl px-4 py-3 text-sm font-bold text-amber-400 outline-none focus:border-amber-500 cursor-pointer">
                    <option value="" className="bg-zinc-900 text-zinc-500">Selecione o Revendedor...</option>
                    {revendedoresDB.map(rev => (
                      <option key={rev.id} value={rev.nome_empresa || rev.nome} className="bg-zinc-900 text-white">{rev.nome_empresa || rev.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-amber-500 font-black uppercase mb-1">Data da Visita / Entrega</label>
                  <input required type="date" value={formNovo.data_registo} onChange={e => setFormNovo({...formNovo, data_registo: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-amber-500 transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase mb-1">Produto (Apenas Brownies)</label>
                  <select required value={formNovo.produto} onChange={aoSelecionarProduto} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500 cursor-pointer">
                    <option value="">Selecione o Brownie...</option>
                    {produtosDB.filter(p => (p.nome || p.descricao || '').toLowerCase().includes('brownie')).map(p => (
                      <option key={p.id} value={p.nome || p.descricao}>{p.nome || p.descricao}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase mb-1">Qtd. Entregue</label>
                  <input required type="number" value={formNovo.qtd_deixada || ''} onChange={e => setFormNovo({...formNovo, qtd_deixada: parseInt(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-lg font-black text-white text-center outline-none focus:border-amber-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-amber-500 font-black uppercase mb-1">Lote Produção</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                      <span className="text-amber-500 font-black">BR</span>
                    </div>
                    <input required type="text" value={formNovo.lote.replace(/^BR/, '')} onChange={e => { const val = e.target.value.toUpperCase().replace(/^BR/, ''); setFormNovo({...formNovo, lote: 'BR' + val}); }} onBlur={(e) => cruzarLoteComProducao('BR' + e.target.value.toUpperCase().replace(/^BR/, ''))} className="w-full bg-amber-950/20 border border-amber-500/30 rounded-xl pl-11 pr-4 py-3 text-sm font-mono font-bold text-amber-400 outline-none focus:border-amber-500 transition-all" placeholder="001" />
                  </div>
                  {buscandoLote && <span className="text-[10px] text-amber-500 animate-pulse mt-1 ml-1 flex items-center gap-1">🔄 A procurar...</span>}
                </div>
                <div>
                  <label className="block text-[10px] text-red-400 font-black uppercase mb-1">Data Validade Auto</label>
                  <input required type="date" value={formNovo.data_validade} readOnly className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold text-zinc-500 cursor-not-allowed outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1">
                <div>
                  <label className="block text-[10px] text-zinc-400 font-black uppercase mb-1">Preço Revenda (Auto €)</label>
                  <input required type="number" step="0.01" value={formNovo.preco_unidade || ''} onChange={e => setFormNovo({...formNovo, preco_unidade: parseFloat(e.target.value) || 0})} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-lg font-bold text-green-400 text-center outline-none focus:border-green-500" />
                </div>
              </div>
              <button type="submit" disabled={processando} className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 py-4 mt-2 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50">
                {processando ? 'A Gravar...' : formNovo.id ? 'Atualizar Entrega' : 'Registar Visita e Lote'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BALANÇO INDIVIDUAL PÓS-FECHO (CORREÇÕES) */}
      {modalFechoAberto && formFecho && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[60] flex flex-col justify-center items-center p-4">
          <div className="bg-zinc-900 w-full max-w-md rounded-[32px] flex flex-col overflow-hidden shadow-2xl border border-amber-500/30">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-zinc-800 bg-amber-500/5">
              <h2 className="text-xl font-black text-amber-500">{formFecho.status === 'Fechado' ? '✏️ Corrigir Balanço' : '📝 Balanço da Visita'}</h2>
              <button onClick={() => setModalFechoAberto(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            <div className="px-6 pt-4 pb-2 text-center">
              <p className="text-xs text-zinc-400">Em {new Date(formFecho.data_registo).toLocaleDateString('pt-PT')}, deixou no <strong>{formFecho.parceiro}</strong>:</p>
              <div className="text-3xl font-black text-white mt-2">{formFecho.qtd_deixada}x {formFecho.produto}</div>
              <p className="text-sm text-zinc-500 font-bold mt-1">Sabor: {formFecho.sabor} | <span className="font-mono">LOTE {formFecho.lote}</span></p>
            </div>
            <form onSubmit={salvarFecho} className="p-6 pt-0 space-y-4">
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-4 mt-4">
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-bold text-green-400 flex-1">💰 Vendidos</label>
                  <input required type="number" min="0" value={formFecho.qtd_vendida} onChange={e => setFormFecho({...formFecho, qtd_vendida: parseInt(e.target.value) || 0})} className="w-24 bg-zinc-900 border border-green-500/50 rounded-lg px-3 py-2 text-lg font-bold text-green-400 text-center outline-none focus:border-green-400" />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-bold text-orange-400 flex-1">🔄 Trocados</label>
                  <input required type="number" min="0" value={formFecho.qtd_trocada} onChange={e => setFormFecho({...formFecho, qtd_trocada: parseInt(e.target.value) || 0})} className="w-24 bg-zinc-900 border border-orange-500/50 rounded-lg px-3 py-2 text-lg font-bold text-orange-400 text-center outline-none focus:border-orange-400" />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-bold text-red-400 flex-1">🗑️ Vencidos (Lixo)</label>
                  <input required type="number" min="0" value={formFecho.qtd_vencida} onChange={e => setFormFecho({...formFecho, qtd_vencida: parseInt(e.target.value) || 0})} className="w-24 bg-zinc-900 border border-red-500/50 rounded-lg px-3 py-2 text-lg font-bold text-red-400 text-center outline-none focus:border-red-400" />
                </div>
              </div>
              <button type="submit" disabled={processando} className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 py-4 mt-2 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50">
                {processando ? 'A Processar...' : formFecho.status === 'Fechado' ? 'Atualizar Números do Fecho' : 'Encerrar Lote no Ponto de Venda'}
              </button>
              {formFecho.status === 'Fechado' && (
                <button type="button" onClick={() => anularFecho(formFecho.id)} disabled={processando} className="w-full bg-zinc-950 hover:bg-zinc-800 text-white py-3 mt-2 rounded-xl text-sm font-bold uppercase border border-zinc-800 transition-colors">🔄 Anular e Voltar a "Ativo"</button>
              )}
            </form>
          </div>
        </div>
      )}

    </div>
  );
}