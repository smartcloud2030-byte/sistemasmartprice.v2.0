import React, { useState } from 'react';
import { useStore, Announcement } from '../store';
import { Megaphone, Plus, Trash2, Users, Building2, Globe, Send, X } from 'lucide-react';
import { toast } from 'sonner';

export default function AnnouncementManager() {
  const { 
    announcements, addAnnouncement, deleteAnnouncement, 
    userGroups, allowedStores 
  } = useStore();
  
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'group' | 'cnpj'>('all');
  const [targetValue, setTargetValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    if (!title.trim() || !message.trim()) {
      toast.error('Preencha o título e a mensagem');
      return;
    }

    if (targetType !== 'all' && !targetValue) {
      toast.error('Selecione o destino');
      return;
    }

    const newAnnouncement: Announcement = {
      id: `ann_${Date.now()}`,
      title,
      message,
      targetType,
      targetValue: targetType === 'all' ? undefined : targetValue,
      createdAt: new Date().toISOString()
    };

    addAnnouncement(newAnnouncement);
    setTitle('');
    setMessage('');
    setTargetValue('');
    setIsAdding(false);
    toast.success('Comunicado enviado com sucesso!');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold flex items-center gap-2 text-black dark:text-white">
          <Megaphone className="w-5 h-5 text-blue-600" />
          Comunicados do Sistema
        </h3>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-tighter hover:bg-blue-700 transition-all"
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? 'Cancelar' : 'Novo Comunicado'}
        </button>
      </div>

      {isAdding && (
        <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-700 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60">Título do Aviso</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Manutenção Programada"
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-black dark:text-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60">Destinatários</label>
              <div className="flex gap-2">
                <select
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value as any);
                    setTargetValue('');
                  }}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-black dark:text-white"
                >
                  <option value="all">Todos</option>
                  <option value="group">Grupo</option>
                  <option value="cnpj">CNPJ Específico</option>
                </select>
                
                {targetType === 'group' && (
                  <select
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className="flex-grow bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-black dark:text-white"
                  >
                    <option value="">Selecionar Grupo</option>
                    {userGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                )}

                {targetType === 'cnpj' && (
                  <select
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className="flex-grow bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-black dark:text-white"
                  >
                    <option value="">Selecionar Loja</option>
                    {allowedStores.map(s => (
                      <option key={s.cnpj} value={s.cnpj}>{s.bandeira} ({s.cnpj})</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60">Mensagem</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite o conteúdo do comunicado..."
              rows={3}
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none text-black dark:text-white"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase tracking-tighter shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
              Enviar Comunicado
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60">
          <Globe className="w-3 h-3" />
          Histórico de Envios
        </div>

        {announcements.length === 0 ? (
          <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-800/30 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-700">
            <Megaphone className="w-8 h-8 text-black dark:text-white opacity-20 mx-auto mb-2" />
            <p className="text-xs text-black dark:text-white opacity-40 font-medium">Nenhum comunicado enviado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {[...announcements].reverse().map((ann) => (
              <div 
                key={ann.id}
                className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-start group hover:border-blue-500/30 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-black dark:text-white">{ann.title}</h4>
                    <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-black dark:text-white opacity-60">
                      {new Date(ann.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded text-[8px] font-black uppercase tracking-widest text-blue-600">
                      {ann.targetType === 'all' && <Globe className="w-2 h-2" />}
                      {ann.targetType === 'group' && <Users className="w-2 h-2" />}
                      {ann.targetType === 'cnpj' && <Building2 className="w-2 h-2" />}
                      {ann.targetType === 'all' ? 'Todos' : ann.targetType === 'group' ? 'Grupo' : 'CNPJ'}
                      {ann.targetValue && <span className="opacity-60 ml-1">({ann.targetValue})</span>}
                    </div>
                  </div>
                  <p className="text-xs text-black dark:text-white opacity-60 line-clamp-2">{ann.message}</p>
                </div>
                <button
                  onClick={() => deleteAnnouncement(ann.id)}
                  className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
