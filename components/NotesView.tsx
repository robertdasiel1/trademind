
import React, { useState, useRef, useMemo } from 'react';
import { Plus, Trash2, StickyNote, Search, ImageIcon, UploadCloud, X, Hash, Maximize2, Tag, Filter, Pencil, Clock, Calendar, SortDesc, SortAsc, Check, ChevronDown } from 'lucide-react';
import { GlobalNote } from '../types';

interface Props {
  notes: GlobalNote[];
  onUpdateNotes: (notes: GlobalNote[]) => void;
}

const PREDEFINED_TAGS = [
  { label: 'Ideas', color: 'bg-blue-500 text-blue-100 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200 dark:border-blue-500/30' },
  { label: 'Recordatorios', color: 'bg-amber-500 text-amber-100 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' },
  { label: 'Estrategias', color: 'bg-purple-500 text-purple-100 dark:bg-purple-500/20 dark:text-purple-300 border-purple-200 dark:border-purple-500/30' },
  { label: 'Psicología', color: 'bg-rose-500 text-rose-100 dark:bg-rose-500/20 dark:text-rose-300 border-rose-200 dark:border-rose-500/30' },
  { label: 'Errores', color: 'bg-red-500 text-red-100 dark:bg-red-500/20 dark:text-red-300 border-red-200 dark:border-red-500/30' },
  { label: 'Lecciones', color: 'bg-emerald-500 text-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30' },
  { label: 'Setup', color: 'bg-indigo-500 text-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30' },
  { label: 'Backtesting', color: 'bg-slate-500 text-slate-100 dark:bg-slate-500/20 dark:text-slate-300 border-slate-200 dark:border-slate-500/30' },
];

const NotesView: React.FC<Props> = ({ notes, onUpdateNotes }) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [viewingNote, setViewingNote] = useState<GlobalNote | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null); // Tag Filter
  const [dateFilter, setDateFilter] = useState<string>(''); // Specific Date YYYY-MM-DD
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const [fullImage, setFullImage] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    tags: string[];
    screenshots: string[];
  }>({
    title: '',
    content: '',
    tags: [],
    screenshots: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close filters when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilters(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterRef]);

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      // 1. Search Term
      const matchesSearch = 
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        n.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (n.tags && n.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())));
      
      // 2. Tag Filter
      const matchesTag = activeFilter ? n.tags && n.tags.includes(activeFilter) : true;

      // 3. Date Filter
      let matchesDate = true;
      if (dateFilter) {
          const noteDate = new Date(n.date).toISOString().split('T')[0];
          matchesDate = noteDate === dateFilter;
      }

      return matchesSearch && matchesTag && matchesDate;
    }).sort((a, b) => {
        // 4. Sorting
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [notes, searchTerm, activeFilter, dateFilter, sortOrder]);

  const activeFilterCount = (activeFilter ? 1 : 0) + (dateFilter ? 1 : 0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            setFormData(prev => ({ 
                ...prev, 
                screenshots: [...prev.screenshots, reader.result as string] 
            }));
          }
        };
        reader.readAsDataURL(file as Blob);
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeScreenshot = (index: number) => {
    setFormData(prev => ({
        ...prev,
        screenshots: prev.screenshots.filter((_, i) => i !== index)
    }));
  };

  const toggleTag = (tag: string) => {
    setFormData(prev => {
      const exists = prev.tags.includes(tag);
      if (exists) {
        return { ...prev, tags: prev.tags.filter(t => t !== tag) };
      } else {
        return { ...prev, tags: [...prev.tags, tag] };
      }
    });
  };

  const openNewNoteModal = () => {
    setEditingId(null);
    setFormData({ title: '', content: '', tags: [], screenshots: [] });
    setIsEditModalOpen(true);
  };

  const openEditNoteModal = (note: GlobalNote) => {
    setEditingId(note.id);
    setFormData({
        title: note.title,
        content: note.content,
        tags: note.tags || [],
        screenshots: note.screenshots || (note.screenshot ? [note.screenshot] : [])
    });
    setIsEditModalOpen(true);
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.content) return;

    if (editingId) {
        // Edit Existing
        const updatedNotes = notes.map(n => n.id === editingId ? {
            ...n,
            title: formData.title,
            content: formData.content,
            tags: formData.tags,
            screenshots: formData.screenshots,
            updatedAt: new Date().toISOString()
        } : n);
        onUpdateNotes(updatedNotes);
    } else {
        // Create New
        const note: GlobalNote = {
          id: crypto.randomUUID(),
          title: formData.title,
          content: formData.content,
          tags: formData.tags,
          date: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          screenshots: formData.screenshots
        };
        onUpdateNotes([note, ...notes]);
    }

    setIsEditModalOpen(false);
    setFormData({ title: '', content: '', tags: [], screenshots: [] });
    setEditingId(null);
  };

  const deleteNote = (id: string) => {
    if (confirm('¿Eliminar esta nota permanentemente?')) {
      onUpdateNotes(notes.filter(n => n.id !== id));
      if (viewingNote?.id === id) setViewingNote(null);
    }
  };

  const getTagColor = (tagLabel: string) => {
    const found = PREDEFINED_TAGS.find(t => t.label === tagLabel);
    return found ? found.color : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  };

  const clearFilters = () => {
      setActiveFilter(null);
      setDateFilter('');
      setSortOrder('newest');
      setSearchTerm('');
      setShowFilters(false);
  };

  return (
    <div className="min-h-full flex flex-col space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <StickyNote className="w-6 h-6 text-emerald-500" />
            Notas de Trading
          </h2>
          <p className="text-slate-500 text-sm">Bitácora de pensamientos, estrategias y recordatorios</p>
        </div>
        
        <div className="flex flex-col md:flex-row w-full xl:w-auto gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar nota..." 
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            {/* Filter Button */}
            <div className="relative" ref={filterRef}>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                    showFilters || activeFilterCount > 0
                      ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900' 
                      : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  Filtros
                  {activeFilterCount > 0 && (
                      <span className="flex items-center justify-center bg-emerald-500 text-white text-[10px] w-5 h-5 rounded-full ml-1">
                          {activeFilterCount}
                      </span>
                  )}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>

                {/* Filter Dropdown Menu */}
                {showFilters && (
                    <div className="absolute right-0 top-full mt-2 w-[300px] md:w-[350px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50">
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Opciones de Filtro</span>
                            {activeFilterCount > 0 && (
                                <button onClick={clearFilters} className="text-xs font-bold text-rose-500 hover:text-rose-600">
                                    Borrar todo
                                </button>
                            )}
                        </div>
                        
                        <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            
                            {/* Sorting */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-2 block">Orden</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setSortOrder('newest')}
                                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${sortOrder === 'newest' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                                    >
                                        <SortDesc className="w-3 h-3" /> Recientes
                                    </button>
                                    <button 
                                        onClick={() => setSortOrder('oldest')}
                                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${sortOrder === 'oldest' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                                    >
                                        <SortAsc className="w-3 h-3" /> Antiguas
                                    </button>
                                </div>
                            </div>

                            {/* Date Filter */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-2 block flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> Fecha Específica
                                </label>
                                <input 
                                    type="date"
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                />
                            </div>

                            {/* Tag Filter */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-2 block flex items-center gap-1">
                                    <Tag className="w-3 h-3" /> Categoría
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => setActiveFilter(null)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                            activeFilter === null
                                            ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900'
                                            : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        Todas
                                    </button>
                                    {PREDEFINED_TAGS.map(tag => (
                                        <button
                                            key={tag.label}
                                            onClick={() => setActiveFilter(activeFilter === tag.label ? null : tag.label)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${
                                                activeFilter === tag.label
                                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                            }`}
                                        >
                                            {tag.label}
                                            {activeFilter === tag.label && <Check className="w-3 h-3" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* New Note Button */}
            <button 
                onClick={openNewNoteModal}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all shrink-0"
            >
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nueva</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
        {filteredNotes.length > 0 ? (
          filteredNotes.map(note => (
            <div 
              key={note.id} 
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 hover:shadow-xl hover:border-emerald-500/30 transition-all duration-300 flex flex-col h-[340px]"
            >
              <div className="flex justify-between items-start mb-3">
                 <div className="flex flex-wrap gap-1.5">
                    {note.tags && note.tags.slice(0, 3).map(t => (
                      <span key={t} className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getTagColor(t)}`}>
                        {t}
                      </span>
                    ))}
                 </div>
                 <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={(e) => { e.stopPropagation(); openEditNoteModal(note); }}
                        className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all"
                        title="Editar"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"
                        title="Eliminar"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
              </div>

              <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-2 line-clamp-1 cursor-pointer hover:text-emerald-500 transition-colors" onClick={() => setViewingNote(note)} title={note.title}>{note.title}</h3>
              
              <div className="flex-1 overflow-hidden relative mb-3 cursor-pointer" onClick={() => setViewingNote(note)}>
                <p className={`text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap ${note.screenshots && note.screenshots.length > 0 ? 'line-clamp-3' : 'line-clamp-6'}`}>
                  {note.content}
                </p>
                {/* Gradient fade for text overflow */}
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-slate-900 to-transparent pointer-events-none"></div>
              </div>

              {/* Thumbnail Display (First Image) */}
              {note.screenshots && note.screenshots.length > 0 && (
                <div 
                    className="relative w-full h-32 mb-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group/img cursor-zoom-in"
                    onClick={(e) => { e.stopPropagation(); setFullImage(note.screenshots![0]); }}
                >
                    <img 
                        src={note.screenshots[0]} 
                        alt="Adjunto" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" 
                    />
                    {note.screenshots.length > 1 && (
                        <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full backdrop-blur-sm">
                            +{note.screenshots.length - 1}
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                        <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-md" />
                    </div>
                </div>
              )}
              {/* Fallback for legacy screenshot */}
              {note.screenshot && (!note.screenshots || note.screenshots.length === 0) && (
                <div 
                    className="relative w-full h-32 mb-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group/img cursor-zoom-in"
                    onClick={(e) => { e.stopPropagation(); setFullImage(note.screenshot!); }}
                >
                    <img 
                        src={note.screenshot} 
                        alt="Adjunto" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" 
                    />
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 mt-auto">
                 <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>
                        {note.updatedAt 
                            ? new Date(note.updatedAt).toLocaleDateString([], {day: '2-digit', month: '2-digit', year:'2-digit', hour: '2-digit', minute:'2-digit'}) 
                            : new Date(note.date).toLocaleDateString([], {day: '2-digit', month: '2-digit'})}
                    </span>
                 </div>
                {(note.screenshots && note.screenshots.length > 0) || note.screenshot ? (
                   <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" /> Img
                   </span>
                ) : (
                    <span className="text-[10px] text-slate-300 dark:text-slate-600 italic">Texto</span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center text-slate-400">
            <StickyNote className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No se encontraron notas con estos filtros.</p>
            {(activeFilter || dateFilter || searchTerm) && (
                <button onClick={clearFilters} className="mt-2 text-emerald-500 font-bold text-sm hover:underline">
                    Limpiar Filtros
                </button>
            )}
          </div>
        )}
      </div>

      {/* VIEW NOTE MODAL (Read Only) */}
      {viewingNote && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden border border-slate-200 dark:border-slate-800">
                
                {/* Header */}
                <div className="p-6 md:p-8 pb-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start gap-4">
                   <div className="flex-1">
                      <div className="flex flex-wrap gap-2 mb-3">
                        {viewingNote.tags?.map(t => (
                           <span key={t} className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${getTagColor(t)}`}>
                             {t}
                           </span>
                        ))}
                      </div>
                      <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                         {viewingNote.title}
                      </h2>
                      <div className="flex items-center gap-3 mt-3 text-xs text-slate-500 font-medium">
                         <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(viewingNote.date).toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'})}</span>
                         {viewingNote.updatedAt && (
                             <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Editado: {new Date(viewingNote.updatedAt).toLocaleString()}</span>
                         )}
                      </div>
                   </div>
                   <button onClick={() => setViewingNote(null)} className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                      <X className="w-5 h-5 text-slate-500" />
                   </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                   <div className="prose prose-slate dark:prose-invert max-w-none mb-8 whitespace-pre-wrap leading-relaxed text-base md:text-lg text-slate-700 dark:text-slate-300">
                      {viewingNote.content}
                   </div>

                   {/* Gallery */}
                   {((viewingNote.screenshots && viewingNote.screenshots.length > 0) || viewingNote.screenshot) && (
                       <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                           <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Galería de Imágenes</h4>
                           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {viewingNote.screenshots?.map((shot, idx) => (
                                  <div key={idx} className="group relative aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 cursor-zoom-in bg-slate-100 dark:bg-slate-800" onClick={() => setFullImage(shot)}>
                                      <img src={shot} alt={`Capture ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                          <Maximize2 className="w-8 h-8 text-white drop-shadow-md" />
                                      </div>
                                  </div>
                              ))}
                              {/* Legacy Support */}
                              {!viewingNote.screenshots && viewingNote.screenshot && (
                                  <div className="group relative aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 cursor-zoom-in bg-slate-100 dark:bg-slate-800" onClick={() => setFullImage(viewingNote.screenshot!)}>
                                      <img src={viewingNote.screenshot} alt="Capture" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                          <Maximize2 className="w-8 h-8 text-white drop-shadow-md" />
                                      </div>
                                  </div>
                              )}
                           </div>
                       </div>
                   )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 md:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
                   <button 
                     onClick={() => {
                        openEditNoteModal(viewingNote);
                        setViewingNote(null);
                     }}
                     className="flex items-center gap-2 px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-colors"
                   >
                     <Pencil className="w-4 h-4" /> Editar
                   </button>
                   <button 
                     onClick={() => {
                         deleteNote(viewingNote.id);
                         setViewingNote(null);
                     }}
                     className="flex items-center gap-2 px-5 py-2.5 bg-rose-100 dark:bg-rose-900/20 hover:bg-rose-200 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-bold rounded-xl transition-colors"
                   >
                     <Trash2 className="w-4 h-4" /> Eliminar
                   </button>
                </div>
             </div>
          </div>
      )}

      {/* Note Modal (Add/Edit) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
               <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                 {editingId ? <Pencil className="w-5 h-5 text-blue-500" /> : <Plus className="w-5 h-5 text-emerald-500" />}
                 {editingId ? 'Editar Nota' : 'Nueva Nota'}
               </h3>
               <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <form id="note-form" onSubmit={handleSaveNote} className="space-y-6">
                 <div>
                    <input 
                        required
                        autoFocus
                        type="text" 
                        placeholder="Título de la nota..." 
                        className="w-full text-xl font-bold bg-transparent border-b border-slate-200 dark:border-slate-800 px-0 py-2 text-slate-900 dark:text-white focus:ring-0 focus:border-emerald-500 placeholder:text-slate-300 dark:placeholder:text-slate-600"
                        value={formData.title}
                        onChange={e => setFormData({...formData, title: e.target.value})}
                    />
                 </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2"><Tag className="w-3 h-3" /> Categorías</label>
                    <div className="flex flex-wrap gap-2">
                       {PREDEFINED_TAGS.map(tag => {
                         const isSelected = formData.tags.includes(tag.label);
                         return (
                           <button
                             key={tag.label}
                             type="button"
                             onClick={() => toggleTag(tag.label)}
                             className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                               isSelected 
                                 ? 'bg-emerald-500 text-white border-emerald-500 shadow-md transform scale-105' 
                                 : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                             }`}
                           >
                             {tag.label}
                           </button>
                         );
                       })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Contenido</label>
                    <textarea 
                      required
                      rows={8}
                      placeholder="Escribe tus ideas, análisis o recordatorios..." 
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500 resize-none leading-relaxed"
                      value={formData.content}
                      onChange={e => setFormData({...formData, content: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Adjuntos</label>
                    
                    <div className="space-y-3">
                        {/* Upload Button */}
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 rounded-xl p-6 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-slate-400"
                        >
                            <UploadCloud className="w-8 h-8" />
                            <span className="text-xs font-bold">Click para agregar imágenes</span>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileChange} />
                        </div>

                        {/* Image Grid */}
                        {formData.screenshots.length > 0 && (
                            <div className="grid grid-cols-3 gap-2 animate-in fade-in zoom-in duration-300">
                                {formData.screenshots.map((shot, index) => (
                                    <div key={index} className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square bg-slate-100 dark:bg-slate-800">
                                        <img src={shot} alt={`Screenshot ${index}`} className="w-full h-full object-cover" />
                                        <button 
                                          type="button" 
                                          onClick={() => removeScreenshot(index)} 
                                          className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                          title="Eliminar captura"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                <button 
                                  type="button"
                                  onClick={() => fileInputRef.current?.click()}
                                  className="flex items-center justify-center border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-lg aspect-square text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-500 transition-all"
                                >
                                  <Plus className="w-6 h-6" />
                                </button>
                            </div>
                        )}
                    </div>
                  </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="px-5 py-2.5 text-slate-500 font-bold hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                form="note-form"
                type="submit" 
                className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all transform active:scale-95"
              >
                {editingId ? 'Guardar Cambios' : 'Crear Nota'}
              </button>
            </div>
          </div>
        </div>
      )}

      {fullImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200" onClick={() => setFullImage(null)}>
          <img src={fullImage} alt="Nota ampliada" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
};

export default NotesView;
