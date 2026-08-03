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

interface IngredienteGasto {
  insumo_id: string;
  quantidade: number;
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
    nome_receita: 'Base Batata',
    quantidade_produzida: 0,
    unidade_produzida: 'unidades',
    data_validade: '',
    observacoes: ''
  });

  // Lista dinâmica de ingredientes gastos na preparação
  const [ingredientesGastos, setIngredientesGastos] = useState<IngredienteGasto[]>([
    { insumo_id: '', quantidade: 0 }
  ]);

  const [processando, setProcessando] = useState(false);

  // Receitas pré-definidas baseadas nos dados fornecidos para preenchimento rápido opcional
  const receitasPredefinidas: Record<string, { itens: { nomeBusca: string, qtd: number }[] }> = {
    'Base Batata': { itens: [{ nomeBusca: 'batata', qtd: 3 }, { nomeBusca: 'alho em pó', qtd: 0.015 }, { nomeBusca: 'margarina', qtd: 0.125 }, { nomeBusca: 'sal', qtd: 0.03 }] },
    'Molho Branco': { itens: [{ nomeBusca: 'mussarela', qtd: 0.200 }, { nomeBusca: 'alho', qtd: 0.015 }, { nomeBusca: 'cebola', qtd: 0.015 }, { nomeBusca: 'margarina', qtd: 0.017 }, { nomeBusca: 'nata', qtd: 0.600 }, { nomeBusca: 'cream cheese', qtd: 0.090 }, { nomeBusca: 'leite', qtd: 0.600 }, { nomeBusca: 'sal', qtd: 0.030 }] },
    'Strogonoff': { itens: [{ nomeBusca: 'carne', qtd: 1.000 }, { nomeBusca: 'alho', qtd: 0.015 }, { nomeBusca: 'cebola', qtd: 0.015 }, { nomeBusca: 'shoyo', qtd: 0.045 }, { nomeBusca: 'nata', qtd: 0.600 }, { nomeBusca: 'molho de tomate', qtd: 0.150 }, { nomeBusca: 'sal', qtd: 0.015 }] },
    'Frango Cremoso': { itens: [{ nomeBusca: 'frango', qtd: 1.275 }, { nomeBusca: 'alho', qtd: 0.015 }, { nomeBusca: 'cebola', qtd: 0.015 }, { nomeBusca: 'shoyo', qtd: 0.045 }, { nomeBusca: 'milho', qtd: 0.300 }, { nomeBusca: 'sal', qtd: 0.015 }] },
    'Calabresa': { itens: [{ nomeBusca: 'calabresa', qtd: 0.253 }, { nomeBusca: 'cebola', qtd: 0.309 }, { nomeBusca: 'tomate', qtd: 0.470 }, { nomeBusca: 'molho de tomate', qtd: 0.120 }, { nomeBusca: 'sal', qtd: 0.007 }] },
    'Brócolos com bacon': { itens: [{ nomeBusca: 'brócolos', qtd: 0.590 }, { nomeBusca: 'alho', qtd: 0.015 }, { nomeBusca: 'cebola', qtd: 0.015 }, { nomeBusca: 'margarina', qtd: 0.020 }, { nomeBusca: 'sal', qtd: 0.015 }, { nomeBusca: 'bacon', qtd: 0.020 }] },
    'Queijo e Fiambre': { itens: [{ nomeBusca: 'mussarela', qtd: 0.060 }, { nomeBusca: 'fiambre', qtd: 0.030 }] },
    'Costela': { itens: [{ nomeBusca: 'costela', qtd: 1.850 }, { nomeBusca: 'bacon', qtd: 0.100 }, { nomeBusca: 'linguiça', qtd: 0.125 }, { nomeBusca: 'alho', qtd: 0.015 }, { nomeBusca: 'cebola', qtd: 0.500 }, { nomeBusca: 'paprica', qtd: 0.004 }, { nomeBusca: 'cominho', qtd: 0.004 }, { nomeBusca: 'pimenta', qtd: 0.004 }, { nomeBusca: 'louro', qtd: 0.5 }, { nomeBusca: 'azeite', qtd: 0.015 }, { nomeBusca: 'barbecue', qtd: 0.150 }, { nomeBusca: 'margarina', qtd: 0.015 }] }
  };

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: dadosLotes, error: errLotes } = await supabase
        .from('producao')
        .select('*')
        .eq('lote_ativo', true)
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

  // Preenche automaticamente os ingredientes ao selecionar uma receita conhecida
  const selecionarReceita = (nomeReceita: string) => {
    setForm({ ...form, nome_receita: nomeReceita });
    const receita = receitasPredefinidas[nomeReceita];
    if (receita && insumos.length > 0) {
      const novosIngredientes: IngredienteGasto[] = [];
      receita.itens.forEach(item => {
        const insumoEncontrado = insumos.find(i => i.nome.toLowerCase().includes(item.nomeBusca.toLowerCase()));
        if (insumoEncontrado) {
          novosIngredientes.push({ insumo_id: insumoEncontrado.id, quantidade: item.qtd });
        }
      });
      if (novosIngredientes.length > 0) {
        setIngredientesGastos(novosIngredientes);
      }
    }
  };

  const adicionarLinhaIngrediente = () => {
    setIngredientesGastos([...ingredientesGastos, { insumo_id: '', quantidade: 0 }]);
  };

  const removerLinhaIngrediente = (index: number) => {
    setIngredientesGastos(ingredientesGastos.filter((_, i) => i !== index));
  };

  const atualizarIngrediente = (index: number, campo: 'insumo_id' | 'quantidade', valor: any) => {
    const novos = [...ingredientesGastos];
    novos[index] = { ...novos[index], [campo]: valor };
    setIngredientesGastos(novos);
  };

  const registarProducao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome_receita || form.quantidade_produzida <= 0 || !form.data_validade) {
      return alert('Preencha o nome do preparado, a quantidade rendida e a validade.');
    }

    setProcessando(true);
    try {
      let resumoGastosTexto = '';

      // 1. Processar a baixa de cada insumo gasto na tabela 'insumos'
      for (const ing of ingredientesGastos) {
        if (!ing.insumo_id || ing.quantidade <= 0) continue;

        const insumoAtual = insumos.find(i => i.id === ing.insumo_id);
        if (insumoAtual) {
          const novaQtd = Number(insumoAtual.quantidade_atual) - Number(ing.quantidade);
          const { error: errSub } = await supabase
            .from('insumos')
            .update({ quantidade_atual: novaQtd })
            .eq('id', insumoAtual.id);

          if (errSub) throw errSub;
          resumoGastosTexto += `• ${ing.quantidade} ${insumoAtual.unidade_medida} de ${insumoAtual.nome}\n`;
        }
      }

      // 2. Inserir o lote produzido na tabela 'producao'
      const payloadLote = {
        data_fabricacao: form.data_fabricacao,
        nome_recheio: form.nome_receita,
        quantidade: form.quantidade_produzida,
        unidade: form.unidade_produzida,
        data_validade: form.data_validade,
        lote_ativo: true,
        observacoes: `Materiais Usados:\n${resumoGastosTexto}${form.observacoes ? `Obs: ${form.observacoes}` : ''}`
      };

      const { error: errLote } = await supabase.from('producao').insert([payloadLote]);
      if (errLote) throw errLote;

      alert('✅ Preparado registado e stock atualizado com sucesso!');
      setForm({
        data_fabricacao: hoje,
        nome_receita: 'Base Batata',
        quantidade_produzida: 0,
        unidade_produzida: 'unidades',
        data_validade: '',
        observacoes: ''
      });
      setIngredientesGastos([{ insumo_id: '', quantidade: 0 }]);
      carregarDados();
    } catch (err: any) {
      alert('Erro ao registar produção: ' + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const finalizarLote = async (id: string) => {
    if (!confirm('Tem a certeza que este lote / preparado já acabou? Ele sairá da lista.')) return;
    try {
      const { error } = await supabase.from('producao').update({ lote_ativo: false }).eq('id', id);
      if (error) throw error;
      setLotes(lotes.filter(l => l.id !== id));
    } catch (err: any) {
      alert("Erro ao finalizar lote: " + err.message);
    }
  };

  const calcularStatusValidade = (dataValidade: string) => {
    if (!dataValidade) return { texto: 'SEM VALIDADE', cor: 'bg-zinc-800 text-zinc-400', alerta: false };
    const validade = new Date(dataValidade).getTime();
    const agora = new Date(hoje).getTime();
    const diferencaDias = Math.ceil((validade - agora) / (1000 * 3600 * 24));

    if (diferencaDias < 0) return { texto: 'CADUCADO', cor: 'bg-red-600 text-white animate-pulse', alerta: true };
    if (diferencaDias === 0) return { texto: 'CADUCA HOJE', cor: 'bg-orange-600 text-white', alerta: true };
    if (diferencaDias <= 2) return { texto: `Expira em ${diferencaDias} dias`, cor: 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50', alerta: false };
    return { texto: `Expira em ${diferencaDias} dias`, cor: 'bg-green-500/20 text-green-500 border border-green-500/50', alerta: false };
  };

  if (loading && lotes.length === 0) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold uppercase tracking-widest text-xs">A carregar cozinha...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-12 selection:bg-orange-500/30">
      
      <header className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-5 py-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center shadow-lg shadow-orange-900/40 text-2xl">
            🥔
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Estação de Produção e Preparados</h1>
            <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Controlo de Fichas Técnicas, Ingredientes e Stock</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto p-5 md:p-8 space-y-8">
        
        <section className="bg-zinc-900 border border-zinc-800 rounded-[32px] overflow-hidden flex flex-col shadow-xl">
          <div className="p-6 border-b border-zinc-800/80 bg-zinc-950/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-lg font-black uppercase text-zinc-300 tracking-widest flex items-center gap-2">
                <span className="text-orange-500">🔥</span> Registar Produção / Preparado
              </h2>
              <p className="text-xs text-zinc-500 mt-1">Selecione o preparado, verifique os ingredientes gastos e indique quanto rendeu.</p>
            </div>

            {/* Atalhos rápidos para preencher receitas */}
            <div className="flex flex-wrap gap-1.5 max-w-md">
              {Object.keys(receitasPredefinidas).map(nomeRec => (
                <button
                  key={nomeRec}
                  type="button"
                  onClick={() => selecionarReceita(nomeRec)}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${form.nome_receita === nomeRec ? 'bg-orange-600 border-orange-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}
                >
                  {nomeRec}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={registarProducao} className="p-6 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Nome do Preparado / Recheio</label>
                <input 
                  required 
                  type="text" 
                  value={form.nome_receita} 
                  onChange={e => setForm({...form, nome_receita: e.target.value})} 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500 font-bold" 
                  placeholder="Ex: Strogonoff" 
                />
              </div>

              <div>
                <label className="block text-[10px] text-green-500 font-bold uppercase mb-1">Quanto Rendeu (Quantidade)</label>
                <input 
                  required 
                  type="number" 
                  step="0.01" 
                  min="0.01" 
                  value={form.quantidade_produzida || ''} 
                  onChange={e => setForm({...form, quantidade_produzida: parseFloat(e.target.value) || 0})} 
                  className="w-full bg-zinc-950 border border-green-900/50 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-green-500 font-bold" 
                  placeholder="Ex: 10 ou 1.5" 
                />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Unidade de Medida</label>
                <select 
                  value={form.unidade_produzida} 
                  onChange={e => setForm({...form, unidade_produzida: e.target.value})} 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500 cursor-pointer"
                >
                  <option value="unidades">Unidades</option>
                  <option value="kg">Quilos (kg)</option>
                  <option value="litros">Litros (L)</option>
                  <option value="porções">Porções</option>
                </select>
              </div>
            </div>

            {/* BLOCO DE INGREDIENTES GASTOS */}
            <div className="bg-orange-950/20 border border-orange-900/30 p-5 rounded-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-orange-900/50 pb-2">
                <h3 className="text-xs font-black text-orange-500 uppercase tracking-widest">📉 Material Usado / Ingredientes Gastos (Desconta Stock)</h3>
                <button 
                  type="button" 
                  onClick={adicionarLinhaIngrediente}
                  className="bg-orange-600/20 hover:bg-orange-600 text-orange-300 hover:text-white px-3 py-1 rounded-lg text-xs font-bold transition-all border border-orange-500/30"
                >
                  + Adicionar Ingrediente
                </button>
              </div>

              <div className="space-y-3">
                {ingredientesGastos.map((ing, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <select 
                      required 
                      value={ing.insumo_id} 
                      onChange={e => atualizarIngrediente(index, 'insumo_id', e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500 cursor-pointer"
                    >
                      <option value="">-- Selecione o Insumo / Matéria-prima --</option>
                      {insumos.map(i => (
                        <option key={i.id} value={i.id}>{i.nome} (Atual: {i.quantidade_atual} {i.unidade_medida})</option>
                      ))}
                    </select>

                    <input 
                      required 
                      type="number" 
                      step="0.001" 
                      min="0.001" 
                      value={ing.quantidade || ''} 
                      onChange={e => atualizarIngrediente(index, 'quantidade', parseFloat(e.target.value) || 0)}
                      placeholder="Qtd" 
                      className="w-28 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500 font-mono"
                    />

                    {ingredientesGastos.length > 1 && (
                      <button 
                        type="button" 
                        onClick={() => removerLinhaIngrediente(index)}
                        className="text-zinc-500 hover:text-red-400 p-2 font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* DATAS E OBSERVAÇÕES */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-zinc-800/80 pt-4">
              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Data de Fabricação</label>
                <input required type="date" value={form.data_fabricacao} onChange={e => setForm({...form, data_fabricacao: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-orange-500 cursor-pointer" />
              </div>

              <div>
                <label className="block text-[10px] text-orange-500 font-bold uppercase mb-1">Data de Validade</label>
                <input required type="date" value={form.data_validade} onChange={e => setForm({...form, data_validade: e.target.value})} className="w-full bg-orange-950/20 border border-orange-900/50 rounded-xl px-4 py-2 text-xs text-orange-400 outline-none focus:border-orange-500 cursor-pointer" />
              </div>

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Observações / Lote</label>
                <input type="text" value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-orange-500" placeholder="Ex: Forno 1..." />
              </div>
            </div>

            <button type="submit" disabled={processando} className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded-xl px-4 py-3.5 text-xs font-black transition-all shadow-lg active:scale-95 disabled:opacity-50 tracking-wider uppercase">
              🔄 Registar Preparado / Baixar Stock de Ingredientes
            </button>
          </form>
        </section>

        {/* LISTAGEM DE LOTES ATIVOS */}
        <section>
          <h2 className="text-sm font-black uppercase text-zinc-400 tracking-widest mb-4 px-2">Preparados e Lotes Ativos em Stock</h2>
          
          {lotes.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-[24px] p-8 text-center text-zinc-500 text-xs">
              Nenhum lote ou preparado ativo no momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lotes.map(lote => {
                const status = calcularStatusValidade(lote.data_validade);
                
                return (
                  <div key={lote.id} className={`bg-zinc-900 border rounded-[24px] p-5 flex flex-col relative overflow-hidden transition-all hover:border-zinc-700
                    ${status.alerta ? 'border-red-900/50 shadow-[0_0_15px_rgba(220,38,38,0.15)]' : 'border-zinc-800'}`}>
                    
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-black text-base text-white pr-4">{lote.nome_recheio}</h3>
                      <button onClick={() => finalizarLote(lote.id)} className="w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-green-500 hover:border-green-500 flex items-center justify-center transition-colors flex-shrink-0" title="Marcar Lote como Terminado">
                        ✔
                      </button>
                    </div>

                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-3xl font-black font-mono text-orange-400 tracking-tighter">{lote.quantidade}</span>
                      <span className="text-xs font-bold text-zinc-500 uppercase">{lote.unidade}</span>
                    </div>

                    <div className="space-y-1.5 mt-auto">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-zinc-500">Fabricação:</span>
                        <span className="text-zinc-300">{lote.data_fabricacao ? new Date(lote.data_fabricacao).toLocaleDateString('pt-PT') : 'N/D'}</span>
                      </div>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-zinc-500">Validade:</span>
                        <span className="text-zinc-300">{lote.data_validade ? new Date(lote.data_validade).toLocaleDateString('pt-PT') : 'N/D'}</span>
                      </div>
                      
                      {lote.observacoes && (
                        <div className="text-[10px] text-zinc-400 whitespace-pre-line mt-2 border-t border-zinc-800/50 pt-2 bg-zinc-950/40 p-2.5 rounded-xl font-mono">
                          {lote.observacoes}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-800/80">
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