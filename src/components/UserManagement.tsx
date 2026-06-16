import React, { useState } from 'react';
import { useStore } from '../store';
import { Plus, Trash2, Shield, Store, Search, X, User, Flag, Pencil, Save, Loader2, Settings as SettingsIcon, Layout as LayoutGrid, Layout, Users, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

export default function UserManagement() {
  const { allowedStores, addAllowedStore, removeAllowedStore, flags, addFlag, removeFlag, updateFlag, saveUsersAndFlags, loadUsersAndFlags, layouts, toggleEncarteAccess, toggleSuspension, userGroups, addUserGroup, removeUserGroup, updateUserGroup, setUserGroup } = useStore();
  const [activeTab, setActiveTab] = useState<'stores' | 'flags' | 'groups' | 'access'>('stores');

  // Auto-refresh access status when tab is active
  React.useEffect(() => {
    if (activeTab === 'access') {
      const interval = setInterval(() => {
        loadUsersAndFlags();
      }, 10000); // Every 10 seconds while tab is open
      
      return () => clearInterval(interval);
    }
  }, [activeTab, loadUsersAndFlags]);
  const [newCnpj, setNewCnpj] = useState('');
  const [newBandeira, setNewBandeira] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newStoreGroupId, setNewStoreGroupId] = useState<string>('');
  const [newFlagName, setNewFlagName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedLayouts, setSelectedLayouts] = useState<number[]>([]);
  const [editingStoreLayouts, setEditingStoreLayouts] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [bulkFlag, setBulkFlag] = useState('');
  const [isBulkApplyOpen, setIsBulkApplyOpen] = useState(false);
  const [bulkApplySource, setBulkApplySource] = useState<'new' | string | null>(null);

  // Fix: Ensure newBandeira is set when flags are loaded
  React.useEffect(() => {
    if (!newBandeira && flags.length > 0) {
      setNewBandeira(flags[0]);
    }
  }, [flags, newBandeira]);

  // Pre-select layouts when group and flag are selected to facilitate adding new stores
  React.useEffect(() => {
    // Only pre-select when we are in the "New Store" context or when no bulk apply is active
    const targetGroup = bulkApplySource === 'new' ? bulkGroupId : (bulkApplySource === null ? newStoreGroupId : null);
    const targetFlag = bulkApplySource === 'new' ? bulkFlag : (bulkApplySource === null ? newBandeira : null);

    if (targetGroup && targetFlag) {
      // Find the most recent store with this group and flag to use as a template
      const templateStore = [...allowedStores].reverse().find(s => 
        s.groupId === targetGroup && 
        s.bandeira === targetFlag && 
        s.allowedLayouts !== undefined && 
        s.allowedLayouts.length > 0
      );

      if (templateStore && templateStore.allowedLayouts) {
        // Only update if current selection is empty to avoid overwriting user edits
        // or if we explicitly want to follow the template
        setSelectedLayouts(templateStore.allowedLayouts);
      }
    }
  }, [bulkGroupId, bulkFlag, newStoreGroupId, newBandeira, bulkApplySource, allowedStores]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCnpj.trim()) return;
    
    addAllowedStore({
      cnpj: newCnpj.trim(),
      bandeira: newBandeira,
      allowedLayouts: selectedLayouts,
      groupId: newStoreGroupId || undefined
    });
    
    setNewCnpj('');
    setSelectedLayouts([]);
    setNewStoreGroupId('');
  };

  const toggleLayout = (index: number) => {
    setSelectedLayouts(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index) 
        : [...prev, index]
    );
  };

  const toggleStoreLayout = (cnpj: string, index: number) => {
    const normalizedCnpj = cnpj?.replace(/[^\d]/g, '') || '';
    const store = allowedStores.find(s => s.cnpj?.replace(/[^\d]/g, '') === normalizedCnpj);
    if (!store) return;

    // If allowedLayouts is undefined, it means ALL are allowed. 
    // To toggle one, we first need to initialize it with ALL layouts.
    const currentAllowed = store.allowedLayouts !== undefined 
      ? store.allowedLayouts 
      : layouts.map((_, i) => i);
      
    const newAllowed = currentAllowed.includes(index)
      ? currentAllowed.filter(i => i !== index)
      : [...currentAllowed, index];

    addAllowedStore({
      ...store,
      allowedLayouts: newAllowed
    });
  };

  const handleBulkApply = (layoutsToApply: number[]) => {
    if (!bulkGroupId || !bulkFlag) {
      toast.error('Selecione um grupo e uma bandeira para aplicar.');
      return;
    }

    const { bulkUpdateStoreLayouts, allowedStores } = useStore.getState();
    const matchingStores = allowedStores.filter(s => s.groupId === bulkGroupId && s.bandeira === bulkFlag);
    
    if (matchingStores.length === 0) {
      toast.error('Nenhuma loja encontrada para este grupo e bandeira.');
      return;
    }

    bulkUpdateStoreLayouts(bulkGroupId, bulkFlag, layoutsToApply);
    
    toast.success(`Modelos aplicados para ${matchingStores.length} lojas do grupo.`);
    setBulkApplySource(null);
    setBulkGroupId('');
    setBulkFlag('');
  };

  const [editingFlag, setEditingFlag] = useState<string | null>(null);
  const [editFlagName, setEditFlagName] = useState('');

  const handleAddFlag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlagName.trim()) return;
    addFlag(newFlagName.trim());
    setNewFlagName('');
  };

  const handleAddGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    addUserGroup(newGroupName.trim());
    setNewGroupName('');
  };

  const handleUpdateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup || !editGroupName.trim()) return;
    updateUserGroup(editingGroup, editGroupName.trim());
    setEditingGroup(null);
    setEditGroupName('');
  };

  const handleUpdateFlag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFlag || !editFlagName.trim()) return;
    updateFlag(editingFlag, editFlagName.trim());
    setEditingFlag(null);
    setEditFlagName('');
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const { saveAll } = useStore.getState();
      await saveAll();
      toast.success('Configurações salvas com sucesso no Supabase!');
    } catch (error) {
      toast.error('Erro ao salvar no Supabase. Verifique sua conexão.');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (flag: string) => {
    setEditingFlag(flag);
    setEditFlagName(flag);
  };

  const startEditingGroup = (group: { id: string; name: string }) => {
    setEditingGroup(group.id);
    setEditGroupName(group.name);
  };

  const filteredStores = allowedStores.filter(store => {
    const normalizedSearch = searchTerm?.replace(/[^\d]/g, '') || '';
    const normalizedCnpj = store.cnpj?.replace(/[^\d]/g, '') || '';
    return normalizedCnpj.includes(normalizedSearch) || 
           store.cnpj.includes(searchTerm) ||
           store.bandeira.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredFlags = flags.filter(flag => 
    flag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredGroups = userGroups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group layouts by bandeira and localidade
  const groupedLayouts = layouts.reduce((acc, layout, index) => {
    const bandeira = layout.bandeira || 'Sem Bandeira';
    const localidade = layout.localidade || 'Sem Localidade';
    
    if (!acc[bandeira]) acc[bandeira] = {};
    if (!acc[bandeira][localidade]) acc[bandeira][localidade] = [];
    
    acc[bandeira][localidade].push({ layout, index });
    return acc;
  }, {} as Record<string, Record<string, { layout: any; index: number }[]>>);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6">
        <div className="flex overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('stores')}
            className={cn(
              "py-4 px-6 text-xs font-black uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
              activeTab === 'stores' 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent text-black dark:text-white opacity-60 hover:opacity-100"
            )}
          >
            <Store className="w-4 h-4" />
            Lojas Autorizadas
          </button>
          <button 
            onClick={() => setActiveTab('flags')}
            className={cn(
              "py-4 px-6 text-xs font-black uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
              activeTab === 'flags' 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent text-black dark:text-white opacity-60 hover:opacity-100"
            )}
          >
            <Flag className="w-4 h-4" />
            Bandeiras
          </button>
          <button 
            onClick={() => setActiveTab('groups')}
            className={cn(
              "py-4 px-6 text-xs font-black uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
              activeTab === 'groups' 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent text-black dark:text-white opacity-60 hover:opacity-100"
            )}
          >
            <Users className="w-4 h-4" />
            Grupos
          </button>
          <button 
            onClick={() => setActiveTab('access')}
            className={cn(
              "py-4 px-6 text-xs font-black uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
              activeTab === 'access' 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent text-black dark:text-white opacity-60 hover:opacity-100"
            )}
          >
            <User className="w-4 h-4" />
            Acesso
          </button>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-green-500/20 hover:bg-green-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Salvar Alterações
        </button>
      </div>

      <div className="p-6 space-y-8 overflow-y-auto">
        {activeTab === 'stores' ? (
          <>
            {/* Add New Store Form */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg text-black dark:text-white">Autorizar Novo Acesso</h3>
              </div>
              
              <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60 ml-1">CNPJ da Loja</label>
                  <input
                    type="text"
                    value={newCnpj}
                    onChange={(e) => setNewCnpj(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono text-black dark:text-white"
                    required
                  />
                </div>
                
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60 ml-1">Bandeira</label>
                    <select
                      value={newBandeira}
                      onChange={(e) => setNewBandeira(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-black dark:text-white"
                    >
                      {flags.map(flag => (
                        <option key={flag} value={flag}>{flag}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60 ml-1">Grupo (Empresa)</label>
                    <select
                      value={newStoreGroupId}
                      onChange={(e) => setNewStoreGroupId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-black dark:text-white"
                    >
                      <option value="">Sem Grupo</option>
                      {userGroups.map(group => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                  </div>

                <div className="space-y-1 md:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60 ml-1">Modelos de Plaquinhas Permitidos</label>
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => {
                          setBulkApplySource(bulkApplySource === 'new' ? null : 'new');
                          if (bulkApplySource !== 'new') {
                            setBulkGroupId(newStoreGroupId);
                            setBulkFlag(newBandeira);
                          }
                        } }
                        className={cn(
                          "text-[9px] font-black uppercase tracking-tighter hover:opacity-100 transition-all flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded",
                          bulkApplySource === 'new' ? "text-blue-600 opacity-100" : "text-black dark:text-white opacity-40"
                        )}
                      >
                        <Users className="w-2.5 h-2.5" />
                        Aplicar para grupo
                      </button>
                      <button 
                        type="button"
                        onClick={() => setSelectedLayouts(layouts.map((_, i) => i))}
                        className="text-[9px] font-black text-blue-600 uppercase tracking-tighter hover:underline"
                      >
                        Selecionar Todos
                      </button>
                      <button 
                        type="button"
                        onClick={() => setSelectedLayouts([])}
                        className="text-[9px] font-black text-red-500 uppercase tracking-tighter hover:underline"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>

                  {bulkApplySource === 'new' && (
                    <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-300">
                      <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1.5">
                        <Users className="w-3 h-3" />
                        Replicar modelos selecionados para:
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase tracking-widest text-blue-600 opacity-60 ml-1">Grupo (Empresa)</label>
                          <select
                            value={bulkGroupId}
                            onChange={(e) => setBulkGroupId(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-700 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all text-black dark:text-white"
                          >
                            <option value="">Selecionar Grupo</option>
                            {userGroups.map(group => (
                              <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase tracking-widest text-blue-600 opacity-60 ml-1">Bandeira</label>
                          <select
                            value={bulkFlag}
                            onChange={(e) => setBulkFlag(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-700 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all text-black dark:text-white"
                          >
                            <option value="">Selecionar Bandeira</option>
                            {flags.map(flag => (
                              <option key={flag} value={flag}>{flag}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setBulkApplySource(null)}
                          className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-700"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBulkApply(selectedLayouts)}
                          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
                        >
                          Confirmar Replicação
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl max-h-64 overflow-y-auto custom-scrollbar">
                    {Object.entries(groupedLayouts).map(([bandeira, localidades]) => (
                      <div key={bandeira} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Flag className="w-3 h-3 text-blue-600" />
                          <h5 className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
                            {bandeira}
                          </h5>
                        </div>
                        <div className="pl-4 space-y-4">
                          {Object.entries(localidades).map(([localidade, items]) => (
                            <div key={localidade} className="space-y-1.5">
                              <p className="text-[8px] font-bold uppercase tracking-tight text-zinc-400 ml-1">
                                {localidade}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {items.map(({ layout, index }) => (
                                  <button
                                    key={layout.name}
                                    type="button"
                                    onClick={() => toggleLayout(index)}
                                    className={cn(
                                      "px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all border",
                                      selectedLayouts.includes(index)
                                        ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20"
                                        : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-400"
                                    )}
                                  >
                                    {layout.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {layouts.length === 0 && (
                      <span className="text-[10px] text-black dark:text-white opacity-40 font-bold italic py-1.5">Nenhum selecionado (o usuário não verá nenhum modelo até que você selecione)</span>
                    )}
                  </div>
                </div>

                <div className="flex items-end md:col-span-1">
                  <button
                    type="submit"
                    className="w-full h-[46px] bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-tighter rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                    Autorizar CNPJ
                  </button>
                </div>
              </form>
            </div>

            {/* Allowed Stores List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-zinc-400" />
                  <h3 className="font-bold text-lg text-black dark:text-white">Lojas Autorizadas</h3>
                  <span className="bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white opacity-60 text-[10px] px-2 py-0.5 rounded-full font-black">
                    {allowedStores.length}
                  </span>
                </div>
                
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar CNPJ ou Bandeira..."
                    className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-xl text-sm focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-black dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {filteredStores.length === 0 ? (
                  <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-800/30 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                    <p className="text-black dark:text-white opacity-40 font-bold uppercase tracking-widest text-xs">Nenhuma loja encontrada</p>
                  </div>
                ) : (
                  filteredStores.map((store) => (
                    <div 
                      key={store.cnpj}
                      className="group flex flex-col p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-500/50 transition-all shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600 transition-colors">
                            <Store className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{store.cnpj}</p>
                            {store.groupId && (
                              <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400 -mt-1 mb-0.5">
                                {userGroups.find(g => g.id === store.groupId)?.name || 'Grupo Removido'}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black uppercase tracking-tighter text-blue-600">{store.bandeira}</p>
                              {store.isSuspended && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[8px] font-black uppercase tracking-widest rounded-md border border-red-200 dark:border-red-800 animate-pulse">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Suspenso
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <select
                            value={store.groupId || ''}
                            onChange={(e) => setUserGroup(store.cnpj, e.target.value || undefined)}
                            className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-500 transition-all text-black dark:text-white"
                          >
                            <option value="">Sem Grupo</option>
                            {userGroups.map(group => (
                              <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setEditingStoreLayouts(editingStoreLayouts === store.cnpj ? null : store.cnpj)}
                            className={cn(
                              "p-2 rounded-lg transition-all",
                              editingStoreLayouts === store.cnpj 
                                ? "bg-blue-600 text-white" 
                                : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            )}
                            title="Gerenciar Modelos Permitidos"
                          >
                            <SettingsIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => removeAllowedStore(store.cnpj)}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                            title="Remover Autorização"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {/* Layouts Selection for this store */}
                      <div className={cn(
                        "overflow-hidden transition-all duration-300",
                        editingStoreLayouts === store.cnpj ? "max-h-[500px] opacity-100 mt-2" : "max-h-0 opacity-0"
                      )}>
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <LayoutGrid className="w-4 h-4 text-blue-600" />
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60">Modelos Permitidos para este CNPJ</h4>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => {
                                  if (bulkApplySource === store.cnpj) {
                                    setBulkApplySource(null);
                                  } else {
                                    setBulkApplySource(store.cnpj);
                                    setBulkGroupId(store.groupId || '');
                                    setBulkFlag(store.bandeira);
                                  }
                                }}
                                className={cn(
                                  "text-[8px] font-black uppercase tracking-tighter hover:opacity-100 transition-all flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded",
                                  bulkApplySource === store.cnpj ? "text-blue-600 opacity-100" : "text-black dark:text-white opacity-40"
                                )}
                              >
                                <Users className="w-2 h-2" />
                                Replicar p/ Grupo
                              </button>
                              <button 
                                onClick={() => addAllowedStore({ ...store, allowedLayouts: layouts.map((_, i) => i) })}
                                className="text-[8px] font-black text-blue-600 uppercase tracking-tighter hover:underline"
                              >
                                Todos
                              </button>
                              <button 
                                onClick={() => addAllowedStore({ ...store, allowedLayouts: [] })}
                                className="text-[8px] font-black text-red-500 uppercase tracking-tighter hover:underline"
                              >
                                Nenhum
                              </button>
                            </div>
                          </div>

                          {bulkApplySource === store.cnpj && (
                            <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-300">
                              <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1.5">
                                <Users className="w-3 h-3" />
                                Replicar modelos deste CNPJ para o grupo selecionado:
                              </p>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[8px] font-black uppercase tracking-widest text-blue-600 opacity-60 ml-1">Grupo (Empresa)</label>
                                  <select
                                    value={bulkGroupId}
                                    onChange={(e) => setBulkGroupId(e.target.value)}
                                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-700 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all text-black dark:text-white"
                                  >
                                    <option value="">Selecionar Grupo</option>
                                    {userGroups.map(group => (
                                      <option key={group.id} value={group.id}>{group.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[8px] font-black uppercase tracking-widest text-blue-600 opacity-60 ml-1">Bandeira</label>
                                  <select
                                    value={bulkFlag}
                                    onChange={(e) => setBulkFlag(e.target.value)}
                                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-700 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all text-black dark:text-white"
                                  >
                                    <option value="">Selecionar Bandeira</option>
                                    {flags.map(flag => (
                                      <option key={flag} value={flag}>{flag}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setBulkApplySource(null)}
                                  className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-700"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBulkApply(store.allowedLayouts || layouts.map((_, i) => i))}
                                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
                                >
                                  Confirmar Replicação
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="space-y-4 max-h-64 overflow-y-auto custom-scrollbar p-2">
                            {Object.entries(groupedLayouts).map(([bandeira, localidades]) => (
                              <div key={bandeira} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Flag className="w-3 h-3 text-blue-600" />
                                  <h5 className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
                                    {bandeira}
                                  </h5>
                                </div>
                                <div className="pl-4 space-y-4">
                                  {Object.entries(localidades).map(([localidade, items]) => (
                                    <div key={localidade} className="space-y-1.5">
                                      <p className="text-[8px] font-bold uppercase tracking-tight text-zinc-400 ml-1">
                                        {localidade}
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {items.map(({ layout, index }) => {
                                          const isAllowed = store.allowedLayouts === undefined || store.allowedLayouts.includes(index);
                                          return (
                                            <button
                                              key={layout.name}
                                              onClick={() => toggleStoreLayout(store.cnpj, index)}
                                              className={cn(
                                                "px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter transition-all border",
                                                isAllowed
                                                  ? "bg-blue-600 border-blue-600 text-white"
                                                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-400"
                                              )}
                                            >
                                              {layout.name}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Encarte Online Access Toggle */}
                      <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Layout className="w-4 h-4 text-emerald-600" />
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60">Acesso ao Encarte Online</h4>
                          </div>
                          <button
                            onClick={() => toggleEncarteAccess(store.cnpj)}
                            className={cn(
                              "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm",
                              store.hasEncarteAccess
                                ? "bg-emerald-600 border-emerald-600 text-white"
                                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-400"
                            )}
                          >
                            {store.hasEncarteAccess ? 'Ativado' : 'Desativado'}
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60">Status do CNPJ (Suspensão)</h4>
                          </div>
                          <button
                            onClick={() => toggleSuspension(store.cnpj)}
                            className={cn(
                              "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm",
                              store.isSuspended
                                ? "bg-red-600 border-red-600 text-white"
                                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-400"
                            )}
                          >
                            {store.isSuspended ? 'Suspenso' : 'Ativo'}
                          </button>
                        </div>
                      </div>

                      {/* Summary of allowed layouts when not editing */}
                      {editingStoreLayouts !== store.cnpj && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {store.allowedLayouts === undefined || store.allowedLayouts.length === 0 ? (
                            <span className="text-[8px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded uppercase">
                              Nenhum Modelo Liberado
                            </span>
                          ) : (
                            <>
                              {store.allowedLayouts.slice(0, 5).map(idx => (
                                <span key={idx} className="text-[8px] font-bold text-black dark:text-white opacity-40 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded uppercase">
                                  {layouts[idx]?.name || `Modelo ${idx + 1}`}
                                </span>
                              ))}
                              {store.allowedLayouts.length > 5 && (
                                <span className="text-[8px] font-bold text-black dark:text-white opacity-40 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded uppercase">
                                  +{store.allowedLayouts.length - 5}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/20 rounded-2xl">
              <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold uppercase leading-relaxed">
                Atenção: Apenas os CNPJs listados acima poderão acessar o sistema SmartPrice. 
                O acesso administrativo (usuário "Adm") ignora esta restrição para permitir o gerenciamento.
              </p>
            </div>
          </>
        ) : activeTab === 'flags' ? (
          <div className="space-y-8">
            {/* Add New Flag Form */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-4">
                <Flag className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg text-black dark:text-white">Adicionar Nova Bandeira</h3>
              </div>
              
              <form onSubmit={handleAddFlag} className="flex gap-4">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60 ml-1">Nome da Bandeira</label>
                  <input
                    type="text"
                    value={newFlagName}
                    onChange={(e) => setNewFlagName(e.target.value)}
                    placeholder="Ex: Farmácia Popular"
                    className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-black dark:text-white"
                    required
                  />
                </div>
                
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="h-[46px] px-8 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-tighter rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                    Adicionar
                  </button>
                </div>
              </form>
            </div>

            {/* Flags List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flag className="w-5 h-5 text-zinc-400" />
                  <h3 className="font-bold text-lg text-black dark:text-white">Bandeiras Disponíveis</h3>
                  <span className="bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white opacity-60 text-[10px] px-2 py-0.5 rounded-full font-black">
                    {flags.length}
                  </span>
                </div>
                
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar bandeira..."
                    className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-xl text-sm focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-black dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredFlags.length === 0 ? (
                   <div className="col-span-full text-center py-12 bg-zinc-50 dark:bg-zinc-800/30 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                    <p className="text-black dark:text-white opacity-40 font-bold uppercase tracking-widest text-xs">Nenhuma bandeira encontrada</p>
                  </div>
                ) : (
                  filteredFlags.map((flag) => (
                    <div 
                      key={flag}
                      className="group flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-500/50 transition-all shadow-sm"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600 transition-colors">
                          <Flag className="w-5 h-5" />
                        </div>
                        
                        {editingFlag === flag ? (
                          <form onSubmit={handleUpdateFlag} className="flex-1 flex gap-2">
                            <input
                              type="text"
                              value={editFlagName}
                              onChange={(e) => setEditFlagName(e.target.value)}
                              className="flex-1 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                              autoFocus
                            />
                            <button type="submit" className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg">
                              <Plus className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setEditingFlag(null)} className="p-2 text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg">
                              <X className="w-4 h-4" />
                            </button>
                          </form>
                        ) : (
                          <p className="font-bold text-zinc-900 dark:text-zinc-100">{flag}</p>
                        )}
                      </div>
                      
                      {editingFlag !== flag && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => startEditing(flag)}
                            className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg transition-all"
                            title="Editar Bandeira"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => removeFlag(flag)}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                            title="Remover Bandeira"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'groups' ? (
          <div className="space-y-8">
            {/* Add New Group Form */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg text-black dark:text-white">Adicionar Novo Grupo (Empresa)</h3>
              </div>
              
              <form onSubmit={handleAddGroup} className="flex gap-4">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60 ml-1">Nome do Grupo</label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Ex: Grupo Pão de Açúcar"
                    className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-black dark:text-white"
                    required
                  />
                </div>
                
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="h-[46px] px-8 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-tighter rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                    Adicionar
                  </button>
                </div>
              </form>
            </div>

            {/* Groups List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-zinc-400" />
                  <h3 className="font-bold text-lg text-black dark:text-white">Grupos Disponíveis</h3>
                  <span className="bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white opacity-60 text-[10px] px-2 py-0.5 rounded-full font-black">
                    {userGroups.length}
                  </span>
                </div>
                
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar grupo..."
                    className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-xl text-sm focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-black dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredGroups.length === 0 ? (
                   <div className="col-span-full text-center py-12 bg-zinc-50 dark:bg-zinc-800/30 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                    <p className="text-black dark:text-white opacity-40 font-bold uppercase tracking-widest text-xs">Nenhum grupo encontrado</p>
                  </div>
                ) : (
                  filteredGroups.map((group) => (
                    <div 
                      key={group.id}
                      className="group flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-500/50 transition-all shadow-sm"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600 transition-colors">
                          <Users className="w-5 h-5" />
                        </div>
                        
                        {editingGroup === group.id ? (
                          <form onSubmit={handleUpdateGroup} className="flex-1 flex gap-2">
                            <input
                              type="text"
                              value={editGroupName}
                              onChange={(e) => setEditGroupName(e.target.value)}
                              className="flex-1 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                              autoFocus
                            />
                            <button type="submit" className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg">
                              <Plus className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setEditingGroup(null)} className="p-2 text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg">
                              <X className="w-4 h-4" />
                            </button>
                          </form>
                        ) : (
                          <div>
                            <p className="font-bold text-black dark:text-white">{group.name}</p>
                            <p className="text-[10px] font-black text-black dark:text-white opacity-40 uppercase tracking-widest">
                              {allowedStores.filter(s => s.groupId === group.id).length} Lojas vinculadas
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {editingGroup !== group.id && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => startEditingGroup(group)}
                            className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg transition-all"
                            title="Editar Grupo"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => removeUserGroup(group.id)}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                            title="Remover Grupo"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'access' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-zinc-400" />
                <h3 className="font-bold text-lg text-black dark:text-white">Status de Acesso</h3>
                <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                  {allowedStores.filter(s => s.isOnline).length} Online
                </span>
              </div>

              {/* Support Chat Global Toggle */}
              <div className="flex items-center gap-3 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700">
                <div className="flex flex-col text-right">
                  <span className="text-[9px] font-black uppercase tracking-widest text-black dark:text-white opacity-40 leading-none mb-1">Chat de Suporte</span>
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-tighter",
                    isChatEnabled ? "text-emerald-600" : "text-amber-600"
                  )}>
                    {isChatEnabled ? 'Ativado' : 'Desativado'}
                  </span>
                </div>
                <button
                  onClick={() => setIsChatEnabled(!isChatEnabled)}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500",
                    isChatEnabled ? "bg-emerald-500" : "bg-zinc-400 shadow-inner"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300",
                    isChatEnabled ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
              
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar usuário ou CNPJ..."
                  className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-xl text-sm focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-black dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {allowedStores
                .filter(store => {
                  const search = searchTerm.toLowerCase();
                  return store.cnpj.includes(search) || 
                         store.bandeira.toLowerCase().includes(search) ||
                         (store.lastUsername?.toLowerCase() || '').includes(search);
                })
                .sort((a, b) => {
                  // Online users first, then by last access
                  if (a.isOnline && !b.isOnline) return -1;
                  if (!a.isOnline && b.isOnline) return 1;
                  const dateA = a.lastAccess ? new Date(a.lastAccess).getTime() : 0;
                  const dateB = b.lastAccess ? new Date(b.lastAccess).getTime() : 0;
                  return dateB - dateA;
                })
                .map((store) => (
                <div 
                  key={store.cnpj}
                  className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400">
                        <User className="w-6 h-6" />
                      </div>
                      <div className={cn(
                        "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-zinc-900 shadow-sm",
                        store.isOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                      )} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">
                          {store.lastUsername || 'Usuário'}
                        </p>
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                          store.isOnline 
                            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" 
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        )}>
                          {store.isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono font-bold text-zinc-400">CNPJ: {store.cnpj}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-blue-600/60">{store.bandeira}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Último Acesso</p>
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      {store.lastAccess ? (
                        new Date(store.lastAccess).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      ) : (
                        'Nenhum registro'
                      )}
                    </p>
                  </div>
                </div>
              ))}

              {allowedStores.length === 0 && (
                <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-800/30 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                  <p className="text-black dark:text-white opacity-40 font-bold uppercase tracking-widest text-xs">Nenhum acesso registrado</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
