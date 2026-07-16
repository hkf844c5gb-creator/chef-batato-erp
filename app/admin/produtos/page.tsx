'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  preco_cardapio: number;
  preco_whatsapp: number;
  preco_glovo: number;
  custo_unitario: number;
  ativo: boolean;
  esgotado: boolean;
}

export default function GestaoProdutos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados do Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // Campos do Formulário
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('batata');
  const [precoCardapio, setPrecoCardapio] = useState('');
  const [precoWhatsapp, setPrecoWhatsapp] = useState('');
  const [precoGlovo, setPrecoGlovo] = useState('');
  const [custoUnitario, setCustoUnitario] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [esgotado, setEsgotado] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function carregarProdutos() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .order('categoria', { ascending: true })
        .order('nome', { ascending: true });

      if (error) throw error;
      setProdutos(data || []);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar produtos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  const abrirModalNovo = () => {
    setEditandoId(null);
    setCodigo('');
    setNome('');
    setCategoria('batata');
    setPrecoCardapio('');
    setPrecoWhatsapp('');
    setPrecoGlovo('');
    setCustoUnitario('');
    setAtivo(true);
    setEsgotado(false);
    setModalAberto(true);
  };

  const abrirModalEditar = (prod: Produto) => {
    setEditandoId(prod.id);
    setCodigo(prod.codigo || '');
    setNome(prod.nome || '');
    setCategoria(prod.categoria || 'batata');
    setPrecoCardapio(prod.preco_cardapio?.toString() || '');
    setPrecoWhatsapp(prod.preco_whatsapp?.toString() || '');
    setPrecoGlovo(prod.preco_glovo?.toString() || '');
    setCustoUnitario(prod.custo_unitario?.toString() || '');
    setAtivo(prod.ativo);
    setEsgotado(prod.esgotado);
    setModalAberto(true);
  };

  const salvarProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !codigo) return alert('O código e o nome são obrigatórios.');

    const payload = {
      codigo,
      nome,
      categoria,
      preco_cardapio: parseFloat(precoCardapio) || 0,
      preco_whatsapp: parseFloat(precoWhatsapp) || 0,
      preco_glovo: parseFloat(precoGlovo) || 0,
      custo_unitario: parseFloat(custoUnitario) || 0,
      ativo,
      esgotado
    };

    try {
      if (editandoId) {
        // Atualizar
        const { error } = await supabase.from('produtos').update(payload).eq('id', editandoId);
        if (error) throw error;
        alert('Produto atualizado com sucesso!');
      } else {
        // Criar Novo
        const { error } = await supabase.from('produtos').insert([payload]);
        if (error) throw error;
        alert('Produto criado com sucesso!');
      }
      setModalAberto(false);
      carregarProdutos(); // Recarrega a lista
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao guardar: ${err.message || 'Verifique se o código já existe.'}`);
    }
  };

  const getCorCategoria = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'batata': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'adicional': 
      case 'extra': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'bebida': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'sobremesa':
      case 'brownie': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col">
      {/* Cabeçalho */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-orange-500">Gestão de Cardápio</h1>
          <p className="text-xs text-zinc-400 mt-1">Crie e edite produtos, adicionais e bebidas.</p>
        </div>
        <button onClick={abrirModalNovo} className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all">
          + Novo Produto
        </button>
      </header>

      {/* Tabela de Produtos */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-4 font-bold">Código</th>
                <th className="p-4 font-bold">Produto</th>
                <th className="p-4 font-bold">Categoria</th>
                <th className="p-4 font-bold">Balcão (€)</th>
                <th className="p-4 font-bold">WhatsApp (€)</th>
                <th className="p-4 font-bold">Glovo (€)</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr><td colSpan={8} className="text-center p-8 text-zinc-500">A carregar cardápio...</td></tr>
              ) : produtos.length === 0 ? (
                <tr><td colSpan={8} className="text-center p-8 text-zinc-500">Nenhum produto cadastrado.</td></tr>
              ) : (
                produtos.map(prod => (
                  <tr key={prod.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-4 font-mono text-xs text-zinc-400">{prod.codigo}</td>
                    <td className="p-4 font-medium text-zinc-200">{prod.nome}</td>
                    <td className="p-4">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getCorCategoria(prod.categoria)}`}>
                        {prod.categoria}
                      </span>
                    </td>
                    <td className="p-4 text-zinc-300">{prod.preco_cardapio.toFixed(2)}€</td>
                    <td className="p-4 text-zinc-300">{prod.preco_whatsapp.toFixed(2)}€</td>
                    <td className="p-4 text-zinc-300">{prod.preco_glovo.toFixed(2)}€</td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1 items-start">
                        {prod.ativo ? <span className="bg-green-500/10 text-green-500 border border-green-500/20 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">Ativo</span> : <span className="bg-red-500/10 text-red-500 border border-red-500/20 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">Inativo</span>}
                        {prod.esgotado && <span className="bg-orange-500/10 text-orange-500 border border-orange-500/20 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">Esgotado</span>}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => abrirModalEditar(prod)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-700 transition-all">
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal Criar/Editar Produto */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-2xl shadow-2xl relative my-8">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center sticky top-0 bg-zinc-900 rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-orange-500">{editandoId ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => setModalAberto(false)} className="text-zinc-400 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={salvarProduto} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1">CÓDIGO (Ex: BAT001, EXT001)</label>
                  <input required type="text" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1">CATEGORIA</label>
                  <select value={categoria} onChange={e => setCategoria(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none">
                    <option value="batata">Batata Principal</option>
                    <option value="adicional">Adicional / Extra</option>
                    <option value="bebida">Bebida</option>
                    <option value="sobremesa">Sobremesa / Brownie</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1">NOME DO PRODUTO</label>
                <input required type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Bacon Crocante" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none" />
              </div>

              <div className="grid grid-cols-3 gap-4 p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-1">PREÇO BALCÃO (€)</label>
                  <input type="number" step="0.10" required value={precoCardapio} onChange={e => setPrecoCardapio(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-1">PREÇO WHATSAPP (€)</label>
                  <input type="number" step="0.10" value={precoWhatsapp} onChange={e => setPrecoWhatsapp(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-1">PREÇO GLOVO (€)</label>
                  <input type="number" step="0.10" value={precoGlovo} onChange={e => setPrecoGlovo(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1">CUSTO UNITÁRIO (€) - Opcional</label>
                <input type="number" step="0.01" value={custoUnitario} onChange={e => setCustoUnitario(e.target.value)} placeholder="Para cálculo de margem de lucro futura" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none" />
              </div>

              <div className="flex gap-4 p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                  <span className="text-sm font-medium text-zinc-300">Produto Ativo (Visível)</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={esgotado} onChange={e => setEsgotado(e.target.checked)} className="w-4 h-4 accent-red-500" />
                  <span className="text-sm font-medium text-zinc-300">Produto Esgotado</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalAberto(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl text-sm font-bold text-zinc-300 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-700 py-3 rounded-xl text-sm font-bold shadow-lg transition-all">Guardar Produto</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
