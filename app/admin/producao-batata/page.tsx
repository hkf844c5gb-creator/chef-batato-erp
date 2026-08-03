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
  unidade: string;
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
    quantidade_produzida: 10,
    unidade_produzida: 'potes',
    data_validade: '',
    observacoes: ''
  });

  const [ingredientesGastos, setIngredientesGastos] = useState<IngredienteGasto[]>([]);
  const [processando, setProcessando] = useState(false);

  // Fichas técnicas completas com rendimento exato de 10 potes
  const receitasPredefinidas: Record<string, { rendimento: number, unidadeRendimento: string, itens: { nomeBusca: string, qtd: number, unidade: string }[] }> = {
    'Base Batata': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nomeBusca: 'batata', qtd: 3, unidade: 'kg' },
        { nomeBusca: 'alho em pó', qtd: 15, unidade: 'g' },
        { nomeBusca: 'margarina', qtd: 125, unidade: 'g' },
        { nomeBusca: 'sal', qtd: 30, unidade: 'g' }
      ]
    },
    'Molho Branco': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nomeBusca: 'mussarela', qtd: 200, unidade: 'g' },
        { nomeBusca: 'alho', qtd: 15, unidade: 'g' },
        { nomeBusca: 'cebola', qtd: 15, unidade: 'g' },
        { nomeBusca: 'margarina', qtd: 17, unidade: 'g' },
        { nomeBusca: 'nata', qtd: 600, unidade: 'ml' },
        { nomeBusca: 'cream cheese', qtd: 90, unidade: 'g' },
        { nomeBusca: 'leite', qtd: 600, unidade: 'ml' },
        { nomeBusca: 'sal', qtd: 30, unidade: 'g' }
      ]
    },
    'Strogonoff': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nomeBusca: 'carne', qtd: 1, unidade: 'kg' },
        { nomeBusca: 'alho', qtd: 15, unidade: 'g' },
        { nomeBusca: 'cebola', qtd: 15, unidade: 'g' },
        { nomeBusca: 'shoyo', qtd: 45, unidade: 'ml' },
        { nomeBusca: 'nata', qtd: 600, unidade: 'ml' },
        { nomeBusca: 'molho de tomate', qtd: 150, unidade: 'ml' },
        { nomeBusca: 'sal', qtd: 15, unidade: 'g' }
      ]
    },
    'Frango Cremoso': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nomeBusca: 'frango', qtd: 1.275, unidade: 'kg' },
        { nomeBusca: 'alho', qtd: 15, unidade: 'g' },
        { nomeBusca: 'cebola', qtd: 15, unidade: 'g' },
        { nomeBusca: 'shoyo', qtd: 45, unidade: 'ml' },
        { nomeBusca: 'milho', qtd: 300, unidade: 'g' },
        { nomeBusca: 'sal', qtd: 15, unidade: 'g' }
      ]
    },
    'Calabresa': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nomeBusca: 'calabresa', qtd: 253, unidade: 'g' },
        { nomeBusca: 'cebola', qtd: 309, unidade: 'g' },
        { nomeBusca: 'tomate', qtd: 470, unidade: 'g' },
        { nomeBusca: 'molho de tomate', qtd: 120, unidade: 'ml' },
        { nomeBusca: 'sal', qtd: 7, unidade: 'g' }
      ]
    },
    'Brócolos com bacon': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nomeBusca: 'brócolos', qtd: 590, unidade: 'g' },
        { nomeBusca: 'alho', qtd: 15, unidade: 'g' },
        { nomeBusca: 'cebola', qtd: 15, unidade: 'g' },
        { nomeBusca: 'margarina', qtd: 20, unidade: 'g' },
        { nomeBusca: 'sal', qtd: 15, unidade: 'g' },
        { nomeBusca: 'bacon', qtd: 20, unidade: 'g' }
      ]
    },
    'Queijo e Fiambre': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nomeBusca: 'mussarela', qtd: 60, unidade: 'g' },
        { nomeBusca: 'fiambre', qtd: 30, unidade: 'g' }
      ]
    },
    'Costela': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nomeBusca: 'costela', qtd: 1.850, unidade: 'kg' },
        { nomeBusca: 'bacon', qtd: 100, unidade: 'g' },
        { nomeBusca: 'linguiça', qtd: 125, unidade: 'g' },
        { nomeBusca: 'alho', qtd: 15, unidade: 'g' },
        { nomeBusca: 'cebola', qtd: 500, unidade: 'g' },
        { nomeBusca: 'paprica', qtd: 4, unidade: 'g' },
        { nomeBusca: 'cominho', qtd: 4, unidade: 'g' },
        { nomeBusca: 'pimenta', qtd: 4, unidade: 'g' },
        { nomeBusca: 'louro', qtd: 0.5, unidade: 'unidade' },
        { nomeBusca: 'azeite', qtd: 15, unidade: 'ml' },
        { nomeBusca: 'barbecue', qtd: 150, unidade: 'g' },
        { nomeBusca: 'margarina', qtd: 15, unidade: 'g' }
      ]
    }
  };

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: dadosLotes } = await supabase.from('producao').select('*').eq('lote_ativo', true).order('data_validade', { ascending: true });
      setLotes(dadosLotes || []);

      const { data: dadosInsumos } = await supabase.from('insumos').select('id, nome, unidade_medida, quantidade_atual').order('nome', { ascending: true });
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

  const selecionarReceita = (nomeReceita: string) => {
    const receita = receitasPredefinidas[nomeReceita];
    if (receita) {
      setForm({
        ...form,
        nome_receita: nomeReceita,
        quantidade_produzida: receita.rendimento,
        unidade_produzida: receita.unidadeRendimento
      });

      const novosIngredientes: IngredienteGasto[] = [];
      receita.itens.forEach(item => {
        const insumoEncontrado = insumos.find(i => i.nome.toLowerCase().includes(item.nomeBusca.toLowerCase()));
        if (insumoEncontrado) {
          novosIngredientes.push({ insumo_id: insumoEncontrado.id, quantidade: item.qtd, unidade: item.unidade });
        }
      });
      setIngredientesGastos(novosIngredientes);
    }
  };

  const adicionarLinhaIngrediente = () => {
    setIngredientesGastos([...ingredientesGastos, { insumo_id: '', quantidade: 0, unidade: 'g' }]);
  };

  const removerLinhaIngrediente = (index: number) => {
    setIngredientesGastos(ingredientesGastos.filter((_, i) => i !== index));
  };

  const atualizarIngrediente = (index: number, campo: keyof IngredienteGasto, valor: any) => {
    const novos = [...ingredientesGastos];
    novos[index] = { ...novos[index], [campo]: valor };
    setIngredientesGastos(novos);
  };

  const registarProducao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome_receita || form.quantidade_produzida <= 0 || !form.data_validade) {
      return alert('Preencha todos os campos obrigatórios.');
    }

    setProcessando(true);
    try {
      let resumoGastosTexto = '';

      for (const ing of ingredientesGastos) {
        if (!ing.insumo_id || ing.quantidade <= 0) continue;

        const insumoAtual = insumos.find(i => i.id === ing.insumo_id);
        if (insumoAtual) {
          let qtdParaDescontar = Number(ing.quantidade);
          if (ing.unidade === 'g' && insumoAtual.unidade_medida.toLowerCase() === 'kg') {
            qtdParaDescontar = qtdParaDescontar / 1000;
          } else if (ing.unidade === 'ml' && insumoAtual.unidade_medida.toLowerCase() === 'l') {
            qtdParaDescontar = qtdParaDescontar / 1000;
          }

          const novaQtd = Number(insumoAtual.quantidade_atual) - qtdParaDescontar;
          await supabase.from('insumos').update({ quantidade_atual: novaQtd }).eq('id', insumoAtual.id);
          resumoGastosTexto += `• ${ing.quantidade} ${ing.unidade} de ${insumoAtual.nome}\n`;
        }
      }

      const payloadLote = {
        data_fabricacao: form.data_fabricacao,
        nome_recheio: form.nome_receita,
        quantidade: form.quantidade_produzida,
        unidade: form.unidade_produzida,
        data_validade: form.data_validade,
        lote_ativo: true,
        observacoes: `Material Usado:\n${resumoGastosTexto}${form.observacoes ? `Obs: ${form.observacoes}` : ''}`
      };

      await supabase.from('producao').insert([payloadLote]);

      alert('✅ Produção registada e stock de insumos atualizado!');
      carregarDados();
    } catch (err: any) {
      alert('Erro ao registar: ' + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const finalizarLote = async (id: string) => {
    if (!confirm('Deseja dar este lote como terminado?')) return;
    await supabase.from('producao').update({ lote_ativo: false }).eq('id', id);
    setLotes(lotes.filter(l => l.id !== id));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col pb-12 p-8">
      <h1 className="text-2xl font-black text-orange-500 mb-6">🥔 Controlo de Produção e Rendimento</h1>

      <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl mb-8 shadow-xl">
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.keys(receitasPredefinidas).map(nomeRec => (
            <button
              key={nomeRec}
              type="button"
              onClick={() => selecionarReceita(nomeRec)}
              className="bg-zinc-950 border border-zinc-800 text-orange-400 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-orange-600 hover:text-white transition-all"
            >
              {nomeRec}
            </button>
          ))}
        </div>

        <form onSubmit={registarProducao} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Nome do Preparado</label>
              <input type="text" value={form.nome_receita} onChange={e => setForm({...form, nome_receita: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold" />
            </div>
            <div>
              <label className="block text-[10px] text-green-500 font-bold uppercase mb-1">Quantidade Produzida (Rendimento)</label>
              <input type="number" step="1" value={form.quantidade_produzida} onChange={e => setForm({...form, quantidade_produzida: parseInt(e.target.value) || 0})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold text-green-400" />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Unidade</label>
              <input type="text" value={form.unidade_produzida} onChange={e => setForm({...form, unidade_produzida: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-bold" />
            </div>
          </div>

          <div className="bg-orange-950/20 border border-orange-900/30 p-5 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-orange-400 uppercase">Ingredientes Gastos na Receita</span>
              <button type="button" onClick={adicionarLinhaIngrediente} className="text-xs text-orange-400 hover:underline">+ Adicionar</button>
            </div>
            {ingredientesGastos.map((ing, index) => (
              <div key={index} className="flex gap-2 items-center">
                <select value={ing.insumo_id} onChange={e => atualizarIngrediente(index, 'insumo_id', e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs">
                  <option value="">Selecione o insumo...</option>
                  {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade_medida})</option>)}
                </select>
                <input type="number" step="0.001" value={ing.quantidade || ''} onChange={e => atualizarIngrediente(index, 'quantidade', parseFloat(e.target.value) || 0)} placeholder="Qtd" className="w-24 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono" />
                <select value={ing.unidade} onChange={e => atualizarIngrediente(index, 'unidade', e.target.value)} className="w-20 bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-2 text-xs text-orange-400 font-bold">
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="l">l</option>
                  <option value="unidade">un</option>
                </select>
                <button type="button" onClick={() => removerLinhaIngrediente(index)} className="text-zinc-500 hover:text-red-400 px-2">✕</button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-orange-500 font-bold uppercase mb-1">Data de Validade</label>
              <input type="date" value={form.data_validade} onChange={e => setForm({...form, data_validade: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-orange-400 cursor-pointer" />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-400 font-bold uppercase mb-1">Observações</label>
              <input type="text" value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs" placeholder="Notas do lote..." />
            </div>
          </div>

          <button type="submit" disabled={processando} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider">
            Registar Produção e Baixar Stock 🚀
          </button>
        </form>
      </div>

      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Lotes Ativos em Stock</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {lotes.map(lote => (
          <div key={lote.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-white text-sm">{lote.nome_recheio}</h3>
              <button onClick={() => finalizarLote(lote.id)} className="text-xs bg-zinc-950 border border-zinc-800 px-2.5 py-1 rounded-lg text-zinc-400 hover:text-green-400">Terminar ✔</button>
            </div>
            <div className="text-2xl font-black font-mono text-orange-400">{lote.quantidade} <span className="text-xs text-zinc-400 font-normal">{lote.unidade}</span></div>
            <div className="text-[10px] font-mono text-zinc-400 whitespace-pre-line bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">{lote.observacoes}</div>
            <div className="text-[11px] text-zinc-400">Validade: <strong className="text-white">{lote.data_validade ? new Date(lote.data_validade).toLocaleDateString('pt-PT') : 'N/D'}</strong></div>
          </div>
        ))}
      </div>
    </div>
  );
}