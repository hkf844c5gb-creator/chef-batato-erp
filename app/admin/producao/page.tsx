'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface ProdutoBrownie {
  id: string;
  nome: string;
}

interface Lote {
  id: string;
  codigo_lote: string;
  produto_id: string;
  nome_produto: string;
  quantidade_produzida: number;
  quantidade_disponivel: number;
  data_fabrico: string;
  data_validade: string;
}

export default function CadastrosProducao() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [brownies, setBrownies] = useState<ProdutoBrownie[]>([]);
  const [lotesAtivos, setLotesAtivos] = useState<Lote[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);

  // Filtro Mensal
  const [mesFiltro, setMesFiltro] = useState('Todos');

  // Controlo de UI
  const [lotesExpandidos, setLotesExpandidos] = useState<Record<string, boolean>>({});

  // Campos do Formulário
  const [editandoLoteId, setEditandoLoteId] = useState<string | null>(null);
  const [produtoEditId, setProdutoEditId] = useState(''); 
  const [quantidadeEdit, setQuantidadeEdit] = useState(0); 
  const [contagens, setContagens] = useState<Record<string, number>>({});
  
  // Dados Comuns
  const [codigoLote, setCodigoLote] = useState('');
  const [dataFabrico, setDataFabrico] = useState(() => new Date().toISOString().split('T')[0]);
  const [diasValidade, setDiasValidade] = useState(20);
  const [isLoteExistente, setIsLoteExistente] = useState(false);

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: dataProds, error: errProds } = await supabase
        .from('produtos')
        .select('id, nome, categoria')
        .eq('ativo', true);
      
      if (errProds) throw errProds;

      const lista = (dataProds || []).filter((p: any) => 
        p.categoria?.toLowerCase() === 'brownie' || p.nome.toLowerCase().includes('brownie')
      ).map((p: any) => ({ id: p.id, nome: p.nome }));
      
      setBrownies(lista);

      const { data: dataLotes, error: errLotes } = await supabase
        .from('lotes_producao')
        .select('id, codigo_lote, produto_id, quantidade_produzida, quantidade_disponivel, data_fabrico, data_validade, produtos(nome)')
        .order('data_validade', { ascending: true });
        
      if (errLotes) throw errLotes;

      const formatados = (dataLotes || []).map((l: any) => ({
        id: l.id,
        codigo_lote: l.codigo_lote,
        produto_id: l.produto_id,
        nome_produto: l.produtos?.nome || 'Produto Desconhecido',
        quantidade_produzida: l.quantidade_produzida || 0,
        quantidade_disponivel: l.quantidade_disponivel || 0,
        data_fabrico: l.data_fabrico,
        data_validade: l.data_validade
      }));
      setLotesAtivos(formatados);

    } catch (err: any) {
      alert('Erro ao carregar dados de produção: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDados(); }, []);

  const buscarOuGerarLoteDaData = async (dateF: string) => {
    if (!dateF || editandoLoteId) return; 
    
    try {
      const { data: existente, error: errExistente } = await supabase
        .from('lotes_producao')
        .select('codigo_lote')
        .eq('data_fabrico', dateF)
        .not('codigo_lote', 'ilike', '%LEGADO%') 
        .not('codigo_lote', 'ilike', '%HIST%')
        .limit(1);

      if (!errExistente && existente && existente.length > 0) {
        setCodigoLote(existente[0].codigo_lote);
        setIsLoteExistente(true);
      } else {
        const { data, error } = await supabase
          .from('lotes_producao')
          .select('codigo_lote')
          .like('codigo_lote', 'BR%')
          .order('codigo_lote', { ascending: false })
          .limit(1);

        let proximoCodigo = 'BR003';
        if (!error && data && data.length > 0) {
          const ultimoCodigo = data[0].codigo_lote;
          const numeros = ultimoCodigo.match(/\d+/);
          if (numeros) {
            const proximoNumero = parseInt(numeros[0], 10) + 1;
            const tamanhoDigitos = numeros[0].length;
            proximoCodigo = `BR${String(proximoNumero).padStart(tamanhoDigitos, '0')}`;
          }
        }
        setCodigoLote(proximoCodigo);
        setIsLoteExistente(false);
      }
    } catch (err) {}
  };

  useEffect(() => {
    if (modalAberto && dataFabrico && !editandoLoteId) {
      buscarOuGerarLoteDaData(dataFabrico);
    }
  }, [dataFabrico, modalAberto, editandoLoteId]);

  const abrirModalNovaFornada = () => {
    setEditandoLoteId(null);
    const iniciarContagens: Record<string, number> = {};
    brownies.forEach(b => iniciarContagens[b.id] = 0);
    setContagens(iniciarContagens);
    setDiasValidade(20);
    setDataFabrico(new Date().toISOString().split('T')[0]);
    setIsLoteExistente(false);
    setModalAberto(true);
  };

  const abrirEdicaoLote = (lote: Lote) => {
    setEditandoLoteId(lote.id);
    setProdutoEditId(lote.produto_id);
    setCodigoLote(lote.codigo_lote);
    setQuantidadeEdit(lote.quantidade_produzida);
    setDataFabrico(lote.data_fabrico);
    
    const inicio = new Date(lote.data_fabrico || new Date());
    const fim = new Date(lote.data_validade || new Date());
    const diff = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
    setDiasValidade(diff || 20);
    
    setModalAberto(true);
  };

  const apagarLote = async (id: string) => {
    if (!confirm('Tem a certeza que deseja eliminar este registo? O estoque será recalculado.')) return;
    try {
      await supabase.from('lotes_producao').delete().eq('id', id);
      carregarDados();
    } catch (err) {}
  };

  const atualizarContagem = (id: string, valor: number) => {
    setContagens(prev => ({ ...prev, [id]: valor }));
  };

  const toggleLoteExpandido = (codigo: string) => {
    setLotesExpandidos(prev => ({ ...prev, [codigo]: !prev[codigo] }));
  };

  const salvarFornada = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataF = new Date(dataFabrico);
    dataF.setDate(dataF.getDate() + diasValidade);
    const dataValidadeFinal = dataF.toISOString().split('T')[0];

    try {
      if (editandoLoteId) {
        if (quantidadeEdit <= 0) return alert('A quantidade deve ser maior que zero.');
        if (!codigoLote.trim()) return alert('O código do lote não pode estar vazio.');
        
        const { data: loteExistente } = await supabase.from('lotes_producao').select('quantidade_produzida, quantidade_disponivel').eq('id', editandoLoteId).single();
        
        const saidaAntiga = (loteExistente?.quantidade_produzida || 0) - (loteExistente?.quantidade_disponivel || 0);
        const novoDisponivel = Math.max(0, quantidadeEdit - saidaAntiga);

        await supabase.from('lotes_producao').update({
          codigo_lote: codigoLote.trim().toUpperCase(),
          quantidade_produzida: quantidadeEdit,
          quantidade_disponivel: novoDisponivel, 
          quantidade_atual: novoDisponivel,
          data_fabrico: dataFabrico,
          data_validade: dataValidadeFinal
        }).eq('id', editandoLoteId);
        
        alert('Registo atualizado com sucesso!');
        setLotesExpandidos(prev => ({ ...prev, [codigoLote.trim().toUpperCase()]: true }));
        
      } else {
        const produtosValidos = brownies.filter(b => contagens[b.id] > 0);
        if (produtosValidos.length === 0) return alert('Preencha a quantidade de pelo menos um brownie.');

        setLoading(true);

        for (const b of produtosValidos) {
          const qtd = contagens[b.id];

          const { data: loteAtual } = await supabase
            .from('lotes_producao')
            .select('quantidade_produzida, quantidade_disponivel, quantidade_atual')
            .eq('produto_id', b.id)
            .eq('data_fabrico', dataFabrico)
            .limit(1);

          if (loteAtual && loteAtual.length > 0) {
            const novaProd = (loteAtual[0].quantidade_produzida || 0) + qtd;
            const novaDisp = (loteAtual[0].quantidade_disponivel || 0) + qtd;
            const novaAtual = (loteAtual[0].quantidade_atual || 0) + qtd;

            await supabase.from('lotes_producao').update({
              quantidade_produzida: novaProd,
              quantidade_disponivel: novaDisp,
              quantidade_atual: novaAtual,
              data_validade: dataValidadeFinal 
            }).eq('produto_id', b.id).eq('data_fabrico', dataFabrico);
            
          } else {
            await supabase.from('lotes_producao').insert([{
              produto_id: b.id,
              codigo_lote: codigoLote.trim().toUpperCase(),
              quantidade_produzida: qtd,
              quantidade_disponivel: qtd, 
              quantidade_atual: qtd,
              data_fabrico: dataFabrico,
              data_validade: dataValidadeFinal,
              status: 'Ativo'
            }]);
          }
        }
        alert(`Fornada(s) registada(s) sob o lote: ${codigoLote}`);
        setLotesExpandidos(prev => ({ ...prev, [codigoLote.toUpperCase()]: true }));
      }
      
      setModalAberto(false);
      carregarDados();
    } catch (err: any) {
      alert(`Erro ao guardar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- LÓGICA DO FILTRO MENSAL ---
  // 1. Extrair todos os meses/anos únicos disponíveis nos lotes
  const mesesDisponiveis = Array.from(new Set(lotesAtivos.map(l => {
    if (!l.data_fabrico) return 'Histórico';
    return l.data_fabrico.substring(0, 7); // Formato YYYY-MM
  }))).sort((a, b) => b.localeCompare(a)); // Ordena do mais recente para o mais antigo

  const formatarNomeMes = (yyyyMM: string) => {
    if (yyyyMM === 'Histórico') return 'Lotes Históricos / Legado';
    const [ano, mes] = yyyyMM.split('-');
    const data = new Date(parseInt(ano), parseInt(mes) - 1);
    const nomeMes = data.toLocaleDateString('pt-PT', { month: 'long' });
    return `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} de ${ano}`;
  };

  // 2. Agrupar os Lotes
  let lotesAgrupados = Object.values(lotesAtivos.reduce((acc, lote) => {
    if (!acc[lote.codigo_lote]) {
      acc[lote.codigo_lote] = {
        codigo_lote: lote.codigo_lote,
        data_fabrico: lote.data_fabrico,
        data_validade: lote.data_validade,
        itens: []
      };
    }
    acc[lote.codigo_lote].itens.push(lote);
    return acc;
  }, {} as Record<string, { codigo_lote: string, data_fabrico: string, data_validade: string, itens: Lote[] }>));

  // 3. Aplicar Filtro
  if (mesFiltro !== 'Todos') {
    lotesAgrupados = lotesAgrupados.filter(g => {
      if (mesFiltro === 'Histórico') return !g.data_fabrico || g.codigo_lote.includes('LEGADO');
      return g.data_fabrico && g.data_fabrico.startsWith(mesFiltro);
    });
  }

  lotesAgrupados.sort((a, b) => {
    if (a.codigo_lote.includes('LEGADO') || a.codigo_lote.includes('HIST')) return 1; 
    if (b.codigo_lote.includes('LEGADO') || b.codigo_lote.includes('HIST')) return -1;
    return new Date(b.data_fabrico).getTime() - new Date(a.data_fabrico).getTime(); 
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-20 md:pb-0">
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 sticky top-0 z-10 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-lg font-black text-orange-500 tracking-tight">🧑‍🍳 Cozinha: Produção</h1>
          <p className="text-[10px] text-zinc-400 mt-0.5">Controlo de Estoque Central Mensal</p>
        </div>
        <button onClick={abrirModalNovaFornada} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-all">
          + Registar Fornada
        </button>
      </header>

      <main className="flex-1 p-4 overflow-y-auto space-y-4">
        
        {/* BARRA DE FILTROS */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-zinc-900 p-3 rounded-2xl border border-zinc-800">
          <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider">📦 Todos os Lotes</h3>
          <select 
            value={mesFiltro} 
            onChange={(e) => setMesFiltro(e.target.value)}
            className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs px-3 py-2 rounded-lg font-bold outline-none cursor-pointer focus:border-orange-500"
          >
            <option value="Todos">📅 Ver Todos os Meses</option>
            {mesesDisponiveis.map(m => (
              <option key={m} value={m}>{formatarNomeMes(m)}</option>
            ))}
          </select>
        </div>
        
        {loading ? (
          <div className="text-center p-8 text-zinc-500 text-sm animate-pulse">A ler dados do estoque...</div>
        ) : lotesAgrupados.length === 0 ? (
          <div className="text-center p-8 text-zinc-500 text-xs bg-zinc-900/50 rounded-2xl border border-zinc-800 border-dashed">
            Nenhum lote registado para o filtro selecionado.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {lotesAgrupados.map(grupo => {
              const isHist = grupo.codigo_lote.includes('LEGADO') || grupo.codigo_lote.includes('HIST');
              const dataVal = new Date(grupo.data_validade);
              const hoje = new Date();
              const diferencaDias = Math.ceil((dataVal.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
              const estaCritico = diferencaDias <= 3 && diferencaDias >= 0 && !isHist;
              const isExpandido = lotesExpandidos[grupo.codigo_lote];

              const totalProduzido = grupo.itens.reduce((sum, item) => sum + item.quantidade_produzida, 0);
              const totalDisponivel = grupo.itens.reduce((sum, item) => sum + item.quantidade_disponivel, 0);

              return (
                <div key={grupo.codigo_lote} className={`rounded-2xl border shadow-sm flex flex-col transition-all overflow-hidden ${estaCritico ? 'border-red-500/40 bg-red-950/10' : (isHist ? 'border-zinc-800 bg-zinc-950/80 opacity-70' : 'border-zinc-800 bg-zinc-900')}`}>
                  
                  <div 
                    onClick={() => toggleLoteExpandido(grupo.codigo_lote)}
                    className="p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors flex justify-between items-center select-none"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className={`font-black text-lg uppercase tracking-tight ${isHist ? 'text-zinc-400' : 'text-orange-500'}`}>{grupo.codigo_lote}</h4>
                        <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-bold">{totalDisponivel} un</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-1 flex gap-3">
                        <span><b className="text-zinc-500">Fab:</b> {grupo.data_fabrico ? new Date(grupo.data_fabrico).toLocaleDateString('pt-PT') : 'Histórico'}</span>
                        {!isHist && <span className={estaCritico ? 'text-red-400 font-bold' : ''}><b className="text-zinc-500 font-normal">Val:</b> {grupo.data_validade ? new Date(grupo.data_validade).toLocaleDateString('pt-PT') : '-'}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                       {estaCritico && <span className="text-[9px] font-black uppercase text-red-500 animate-pulse bg-red-950/50 px-2 py-0.5 rounded border border-red-900">Crítico ({diferencaDias}d)</span>}
                       <span className="text-zinc-600 text-xl font-light">{isExpandido ? '▴' : '▾'}</span>
                    </div>
                  </div>

                  {isExpandido && (
                    <div className="bg-zinc-950 border-t border-zinc-800/80 p-3 flex flex-col gap-2">
                      <div className="grid grid-cols-5 gap-1 text-[9px] text-zinc-500 font-black uppercase px-2 mb-1">
                        <div className="col-span-2">Sabor</div>
                        <div className="text-center" title="Produzido / Início">Início</div>
                        <div className="text-center" title="Saídas / Vendido">Saída</div>
                        <div className="text-center text-orange-500" title="Disponível / Atual">Atual</div>
                      </div>

                      {grupo.itens.map(item => {
                        const saida = item.quantidade_produzida - item.quantidade_disponivel;
                        
                        return (
                          <div key={item.id} className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl p-2 gap-2">
                            <div className="grid grid-cols-5 gap-1 items-center px-1">
                              <div className="col-span-2 font-bold text-zinc-200 text-xs truncate pr-2">{item.nome_produto}</div>
                              <div className="text-center text-xs text-zinc-400 font-mono">{item.quantidade_produzida}</div>
                              <div className="text-center text-xs text-red-400 font-mono">{saida}</div>
                              <div className="text-center text-xs font-black text-orange-400 bg-orange-500/10 rounded py-0.5">{item.quantidade_disponivel}</div>
                            </div>

                            <div className="flex justify-end gap-1.5 pt-2 border-t border-zinc-800/50">
                              <button onClick={() => abrirEdicaoLote(item)} className="text-[10px] font-bold uppercase text-zinc-400 hover:text-white px-2 py-1 rounded transition-colors">Editar</button>
                              <button onClick={() => apagarLote(item.id)} className="text-[10px] font-bold uppercase text-red-500/70 hover:text-red-400 px-2 py-1 rounded transition-colors">Apagar</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 📱 MODAL ENTRADA / EDIÇÃO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-zinc-950 md:bg-black/80 z-50 flex flex-col md:justify-center md:items-center">
          <div className="bg-zinc-950 md:bg-zinc-900 md:border md:border-zinc-800 w-full md:max-w-md h-full md:h-auto md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            
            <div className="p-4 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-orange-500">{editandoLoteId ? '✏️ Alterar Registo' : '🥣 Registar Fornada'}</h2>
                {!editandoLoteId && <span className="text-[10px] text-zinc-400 font-mono">Lote Alvo: {codigoLote}</span>}
              </div>
              <button onClick={() => setModalAberto(false)} className="bg-zinc-800 p-2 rounded-full w-8 h-8 flex items-center justify-center text-zinc-400 font-bold">✕</button>
            </div>

            <form onSubmit={salvarFornada} className="flex-1 overflow-y-auto p-4 space-y-4">
              
              <div className="grid grid-cols-2 gap-3 bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                <div>
                  <label className="block text-[9px] font-bold text-zinc-500 uppercase">Data de Fabrico</label>
                  <input required type="date" value={dataFabrico} onChange={e => setDataFabrico(e.target.value)} className="w-full bg-transparent text-sm text-zinc-200 mt-1 outline-none" />
                </div>
                <div className="border-l border-zinc-800 pl-3">
                  <label className="block text-[9px] font-bold text-zinc-500 uppercase">Dias Validade</label>
                  <input required type="number" min="1" value={diasValidade} onChange={e => setDiasValidade(parseInt(e.target.value) || 0)} className="w-full bg-transparent text-sm text-zinc-200 mt-1 outline-none" />
                </div>
                {!editandoLoteId && (
                  <div className="col-span-2 pt-2 border-t border-zinc-800/60 mt-1">
                    {isLoteExistente ? (
                      <span className="text-[10px] text-green-400 font-bold">✓ Lote diário ativo. Produção será acumulada.</span>
                    ) : (
                      <span className="text-[10px] text-orange-400 font-bold">✧ Vai ser gerado o novo Lote {codigoLote}.</span>
                    )}
                  </div>
                )}
              </div>

              {!editandoLoteId ? (
                <div className="space-y-2 mt-4">
                  <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Produção por Sabor</h3>
                  {brownies.map(b => (
                    <div key={b.id} className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                      <span className="font-bold text-sm text-zinc-300">{b.nome}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold">Qtd:</span>
                        <input type="number" min="0" inputMode="numeric" value={contagens[b.id] || ''} onChange={e => atualizarContagem(b.id, parseInt(e.target.value) || 0)} placeholder="0" className="w-16 bg-zinc-950 border border-zinc-700 rounded-lg py-1.5 text-center text-orange-400 font-bold outline-none focus:border-orange-500" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase">Código do Lote</label>
                      <input required type="text" value={codigoLote} onChange={e => setCodigoLote(e.target.value.toUpperCase())} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 text-sm font-bold text-orange-400 uppercase outline-none focus:border-orange-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase">Produção (Início)</label>
                      <input required type="number" min="1" value={quantidadeEdit} onChange={e => setQuantidadeEdit(parseInt(e.target.value) || 0)} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 text-sm font-bold text-orange-400 outline-none focus:border-orange-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase">Sabor Selecionado</label>
                    <select disabled value={produtoEditId} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 text-sm text-white opacity-50">
                      {brownies.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
                    </select>
                  </div>
                  <span className="text-[9px] text-zinc-500 mt-1 block">Atenção: A quantidade Atual/Disponível será recalculada automaticamente mantendo os descontos das saídas e vendas já feitas.</span>
                </div>
              )}
            </form>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900">
              <button disabled={loading} type="submit" onClick={salvarFornada} className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 py-4 rounded-xl text-sm font-black text-white shadow-lg">
                {editandoLoteId ? '💾 Gravar Alterações' : '🚀 Registar Fornada no Estoque'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}