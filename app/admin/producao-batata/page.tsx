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
  const [abaAtiva, setAbaAtiva] = useState<'producao' | 'fichas'>('producao');
  
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

  // Fichas Técnicas Fixas Oficiais (Rendimento padrão de 10 potes)
  const fichasTecnicasFixas: Record<string, { rendimento: number, unidadeRendimento: string, itens: { nome: string, qtd: number, unidade: string }[] }> = {
    'Base Batata': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nome: 'Batata', qtd: 3, unidade: 'kg' },
        { nome: 'Alho em pó', qtd: 15, unidade: 'g' },
        { nome: 'Margarina', qtd: 125, unidade: 'g' },
        { nome: 'Sal', qtd: 30, unidade: 'g' }
      ]
    },
    'Molho Branco': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nome: 'Queijo Mussarela', qtd: 200, unidade: 'g' },
        { nome: 'Alho', qtd: 15, unidade: 'g' },
        { nome: 'Cebola', qtd: 15, unidade: 'g' },
        { nome: 'Margarina', qtd: 17, unidade: 'g' },
        { nome: 'Nata', qtd: 600, unidade: 'ml' },
        { nome: 'Cream Cheese', qtd: 90, unidade: 'g' },
        { nome: 'Leite', qtd: 600, unidade: 'ml' },
        { nome: 'Sal', qtd: 30, unidade: 'g' }
      ]
    },
    'Strogonoff': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nome: 'Carne (Rabadilha)', qtd: 1, unidade: 'kg' },
        { nome: 'Alho', qtd: 15, unidade: 'g' },
        { nome: 'Cebola', qtd: 15, unidade: 'g' },
        { nome: 'Shoyo', qtd: 45, unidade: 'ml' },
        { nome: 'Nata', qtd: 600, unidade: 'ml' },
        { nome: 'Molho de Tomate', qtd: 150, unidade: 'ml' },
        { nome: 'Sal', qtd: 15, unidade: 'g' }
      ]
    },
    'Frango Cremoso': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nome: 'Frango (Peito)', qtd: 1.275, unidade: 'kg' },
        { nome: 'Alho', qtd: 15, unidade: 'g' },
        { nome: 'Cebola', qtd: 15, unidade: 'g' },
        { nome: 'Shoyo', qtd: 45, unidade: 'ml' },
        { nome: 'Milho', qtd: 300, unidade: 'g' },
        { nome: 'Sal', qtd: 15, unidade: 'g' }
      ]
    },
    'Calabresa': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nome: 'Linguiça Calabresa', qtd: 253, unidade: 'g' },
        { nome: 'Cebola', qtd: 309, unidade: 'g' },
        { nome: 'Tomate', qtd: 470, unidade: 'g' },
        { nome: 'Molho de Tomate', qtd: 120, unidade: 'ml' },
        { nome: 'Sal', qtd: 7, unidade: 'g' }
      ]
    },
    'Brócolos com bacon': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nome: 'Brócolos', qtd: 590, unidade: 'g' },
        { nome: 'Alho', qtd: 15, unidade: 'g' },
        { nome: 'Cebola', qtd: 15, unidade: 'g' },
        { nome: 'Margarina', qtd: 20, unidade: 'g' },
        { nome: 'Sal', qtd: 15, unidade: 'g' },
        { nome: 'Bacon', qtd: 20, unidade: 'g' }
      ]
    },
    'Queijo e Fiambre': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nome: 'Queijo Mussarela', qtd: 60, unidade: 'g' },
        { nome: 'Fiambre', qtd: 30, unidade: 'g' }
      ]
    },
    'Costela': {
      rendimento: 10,
      unidadeRendimento: 'potes',
      itens: [
        { nome: 'Costela sem osso', qtd: 1.850, unidade: 'kg' },
        { nome: 'Bacon', qtd: 100, unidade: 'g' },
        { nome: 'Linguiça', qtd: 125, unidade: 'g' },
        { nome: 'Alho', qtd: 15, unidade: 'g' },
        { nome: 'Cebola', qtd: 500, unidade: 'g' },
        { nome: 'Páprica', qtd: 4, unidade: 'g' },
        { nome: 'Cominho', qtd: 4, unidade: 'g' },
        { nome: 'Pimenta', qtd: 4, unidade: 'g' },
        { nome: 'Folha de Louro', qtd: 0.5, unidade: 'unidade' },
        { nome: 'Azeite', qtd: 15, unidade: 'ml' },
        { nome: 'Barbecue', qtd: 150, unidade: 'g' },
        { nome: 'Margarina', qtd: 15, unidade: 'g' }
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
    const receita = fichasTecnicasFixas[nomeReceita];
    if (receita) {
      setForm({
        ...form,
        nome_receita: nomeReceita,
        quantidade_produzida: receita.rendimento,
        unidade_produzida: receita.unidadeRendimento
      });

      const novosIngredientes: IngredienteGasto[] = [];
      receita.itens.forEach(item => {
        const insumoEncontrado = insumos.find(i => i.nome.toLowerCase().includes(item.nome.toLowerCase()));
        if (insumoEncontrado) {
          novosIngredientes.push({ insumo_id: insumoEncontrado.id, quantidade: item.qtd, unidade: item.unidade });
        }
      });
      setIngredientesGastos(novosIngredientes);
    }
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h1 className="text-2xl font-black text-orange-500">🥔 Produção, Rendimento & Fichas Técnicas Fixas</h1>
        
        {/* ABAS DE NAVEGAÇÃO */}
        <div className="flex gap-2 bg-zinc-900 border border-zinc-800 p-1.5 rounded-2xl">
          <button 
            onClick={() => setAbaAtiva('producao')} 
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === 'producao' ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            🔥 Registar Produção
          </button>
          <button 
            onClick={() => setAbaAtiva('fichas')} 
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${abaAtiva === 'fichas' ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            📖 Ver Fichas Técnicas Fixas
          </button>
        </div>
      </div>

      {abaAtiva === 'fichas' ? (
        /* VISUALIZAÇÃO DAS FICHAS TÉCNICAS FIXAS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(fichasTecnicasFixas).map(([nomeReceita, dados]) => (
            <div key={nomeReceita} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col gap-4 shadow-lg">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                <h3 className="font-black text-white text-base">{nomeReceita}</h3>
                <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/30 px-2.5 py-1 rounded-lg font-bold">
                  Rende: {dados.rendimento} {dados.unidadeRendimento}
                </span>
              </div>
              <ul className="space-y-2 flex-1">
                {dados.itens.map((item, idx) => (
                  <li key={idx} className="flex justify-between text-xs bg-zinc-950 px-3.5 py-2 rounded-xl border border-zinc-800">
                    <span className="text-zinc-300 font-medium">{item.nome}</span>
                    <span className="font-mono font-bold text-orange-400">{item.qtd} {item.unidade}</span>
                  </li>
                ))}
              </ul>
              <button 
                onClick={() => { selecionarReceita(nomeReceita); setAbaAtiva('producao'); }} 
                className="w-full bg-zinc-800 hover:bg-orange-600 text-zinc-200 hover:text-white font-bold py-2.5 rounded-xl text-xs transition-all"
              >
                Usar na Produção ⚡
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* FORMULÁRIO DE PRODUÇÃO */
        <>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl mb-8 shadow-xl">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">Selecione uma Ficha Técnica Fixa para carregar automaticamente:</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {Object.keys(fichasTecnicasFixas).map(nomeRec => (
                <button
                  key={nomeRec}
                  type="button"
                  onClick={() => selecionarReceita(nomeRec)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${form.nome_receita === nomeRec ? 'bg-orange-600 border-orange-500 text-white' : 'bg-zinc-950 border-zinc-800 text-orange-400 hover:bg-zinc-800'}`}
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
                <span className="text-xs font-bold text-orange-400 uppercase">Ingredientes Gastos (Calculados pela Ficha Fixa)</span>
                {ingredientesGastos.map((ing, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <select value={ing.insumo_id} onChange={e => {
                      const novos = [...ingredientesGastos];
                      novos[index].insumo_id = e.target.value;
                      setIngredientesGastos(novos);
                    }} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs">
                      <option value="">Selecione o insumo no stock...</option>
                      {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade_medida})</option>)}
                    </select>
                    <input type="number" step="0.001" value={ing.quantidade || ''} onChange={e => {
                      const novos = [...ingredientesGastos];
                      novos[index].quantidade = parseFloat(e.target.value) || 0;
                      setIngredientesGastos(novos);
                    }} placeholder="Qtd" className="w-24 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono" />
                    <span className="w-20 text-xs text-orange-400 font-bold px-2">{ing.unidade}</span>
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
        </>
      )}
    </div>
  );
}