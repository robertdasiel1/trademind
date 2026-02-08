
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Plus, Trash2, StickyNote, Search, ImageIcon, X, Maximize2, Tag, Filter, Pencil, Clock, Calendar, SortDesc, SortAsc, Check, ChevronDown, Type, FileText, Folder, Book, MoreHorizontal } from 'lucide-react';
import { GlobalNote } from '../types';

interface Props {
  notes: GlobalNote[];
  onUpdateNotes: (notes: GlobalNote[]) => void;
}

const PREDEFINED_TAGS = [
  { label: 'Inbox', color: 'bg-rose-900/40 text-rose-200 border-rose-800' }, // Notion-like Inbox style
  { label: 'Ideas', color: 'bg-blue-500 text-blue-100 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200 dark:border-blue-500/30' },
  { label: 'Recordatorios', color: 'bg-amber-500 text-amber-100 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' },
  { label: 'Estrategias', color: 'bg-purple-500 text-purple-100 dark:bg-purple-500/20 dark:text-purple-300 border-purple-200 dark:border-purple-500/30' },
  { label: 'Psicología', color: 'bg-rose-500 text-rose-100 dark:bg-rose-500/20 dark:text-rose-300 border-rose-200 dark:border-rose-500/30' },
  { label: 'Errores', color: 'bg-red-500 text-red-100 dark:bg-red-500/20 dark:text-red-300 border-red-200 dark:border-red-500/30' },
  { label: 'Lecciones', color: 'bg-emerald-500 text-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30' },
  { label: 'Setup', color: 'bg-indigo-500 text-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30' },
  { label: 'Backtesting', color: 'bg-slate-500 text-slate-100 dark:bg-slate-500/20 dark:text-slate-300 border-slate-200 dark:border-slate-500/30' },
];

// Helper Component for Notion-like Property Row
const PropertyRow = ({ icon: Icon, label, children, onClick }: { icon: any, label: string, children?: React.ReactNode, onClick?: () => void }) => (
  <div className="flex items-start py-1.5 gap-4 group">
    <div className="w-36 flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm shrink-0 pt-0.5">
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </div>
    <div className="flex-1 text-slate-700 dark:text-slate-200 text-sm min-h-[24px] flex items-center flex-wrap gap-1 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded px-1 -ml-1 transition-colors" onClick={onClick}>
      {children}
    </div>
  </div>
);

const NotesView: React.FC<Props> = ({ notes, onUpdateNotes }) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null); 
  const [dateFilter, setDateFilter] = useState<string>(''); 
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [showTagMenu, setShowTagMenu] = useState(false);

  const [fullImage, setFullImage] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    tags: string[];
    screenshots: string[];
    date: string;
    updatedAt?: string;
  }>({
    title: '',
    content: '',
    tags: [],
    screenshots: [],
    date: new Date().toISOString()
  });

  const filterRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  // Close filters when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilters(false);
      }
      if (tagMenuRef.current && !tagMenuRef.current.contains(event.target as Node)) {
        setShowTagMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync editor content with formData.content on open
  useEffect(() => {
    if (isEditModalOpen && editorRef.current) {
        editorRef.current.innerHTML = formData.content || '';
    }
  }, [isEditModalOpen]); 

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      if (!n) return false;
      // Ensure content is string before replace
      const contentText = (n.content || '').replace(/<[^>]*>?/gm, '');
      const matchesSearch = 
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        contentText.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (n.tags && n.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())));
      
      const matchesTag = activeFilter ? n.tags && n.tags.includes(activeFilter) : true;

      let matchesDate = true;
      if (dateFilter) {
          const noteDate = new Date(n.date).toISOString().split('T')[0];
          matchesDate = noteDate === dateFilter;
      }

      return matchesSearch && matchesTag && matchesDate;
    }).sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [notes, searchTerm, activeFilter, dateFilter, sortOrder]);

  const activeFilterCount = (activeFilter ? 1 : 0) + (dateFilter ? 1 : 0);

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            e.preventDefault();
            const blob = items[i].getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    const imgTag = `<img src="${event.target.result}" class="max-w-full h-auto rounded-md my-2 border border-slate-200 dark:border-slate-700 shadow-sm block" />&nbsp;<br/>`;
                    document.execCommand('insertHTML', false, imgTag);
                }
            };
            if (blob) reader.readAsDataURL(blob);
        }
    }
  };

  const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
      // Use editorRef preferentially if available for stability
      const target = editorRef.current || e.currentTarget;
      if (target) {
          setFormData(prev => ({ ...prev, content: target.innerHTML || '' }));
      }
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
          setFullImage((target as HTMLImageElement).src);
      }
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
    const now = new Date();
    // Default title is the formatted date as per request example "11/25/2025"
    const defaultTitle = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    
    setEditingId(null);
    setFormData({ 
        title: defaultTitle, 
        content: '', 
        tags: ['Inbox'], // Default status
        screenshots: [],
        date: now.toISOString()
    });
    setIsEditModalOpen(true);
  };

  const openEditNoteModal = (note: GlobalNote) => {
    setEditingId(note.id);
    setFormData({
        title: note.title,
        content: note.content || '',
        tags: note.tags || [],
        screenshots: note.screenshots || (note.screenshot ? [note.screenshot] : []),
        date: note.date,
        updatedAt: note.updatedAt
    });
    setIsEditModalOpen(true);
  };

  const handleSaveNote = () => {
    if (!formData.title) return;

    // Defensive check for editor ref content with safe fallback
    const finalContent = editorRef.current?.innerHTML ?? formData.content ?? '';
        
    const now = new Date().toISOString();

    if (editingId) {
        const updatedNotes = notes.map(n => n.id === editingId ? {
            ...n,
            title: formData.title,
            content: finalContent,
            tags: formData.tags,
            screenshots: formData.screenshots,
            updatedAt: now
        } : n);
        onUpdateNotes(updatedNotes);
    } else {
        const note: GlobalNote = {
          id: crypto.randomUUID(),
          title: formData.title,
          content: finalContent,
          tags: formData.tags,
          date: formData.date, // Preserve creation time
          updatedAt: now,
          screenshots: formData.screenshots
        };
        onUpdateNotes([note, ...notes]);
    }
  };

  // Explicit Save & Close
  const handleClose = () => {
      handleSaveNote(); // Auto save on close
      setIsEditModalOpen(false);
      setEditingId(null);
  };

  const deleteNote = (id: string) => {
    if (confirm('¿Eliminar esta nota permanentemente?')) {
      onUpdateNotes(notes.filter(n => n.id !== id));
      if (editingId === id) setIsEditModalOpen(false);
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

  const getThumbnail = (note: GlobalNote) => {
      if (!note) return null;
      const div = document.createElement('div');
      div.innerHTML = note.content || '';
      const img = div.querySelector('img');
      if (img) return img.src;
      if (note.screenshots && note.screenshots.length > 0) return note.screenshots[0];
      if (note.screenshot) return note.screenshot;
      return null;
  };

  const getPlainTextSnippet = (html: string) => {
      const div = document.createElement('div');
      div.innerHTML = html || '';
      return div.textContent || div.innerText || "";
  };

  // Format date like Notion "November 25, 2025 1:25 PM"
  const formatNotionDate = (isoString: string) => {
      if (!isoString) return 'Empty';
      return new Date(isoString).toLocaleString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          hour12: true
      });
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
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-2 block">Orden</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setSortOrder('newest')} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${sortOrder === 'newest' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}><SortDesc className="w-3 h-3" /> Recientes</button>
                                    <button onClick={() => setSortOrder('oldest')} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${sortOrder === 'oldest' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}><SortAsc className="w-3 h-3" /> Antiguas</button>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-2 block flex items-center gap-1"><Calendar className="w-3 h-3" /> Fecha Específica</label>
                                <input type="date" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-2 block flex items-center gap-1"><Tag className="w-3 h-3" /> Categoría</label>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => setActiveFilter(null)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${activeFilter === null ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}>Todas</button>
                                    {PREDEFINED_TAGS.map(tag => (
                                        <button key={tag.label} onClick={() => setActiveFilter(activeFilter === tag.label ? null : tag.label)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${activeFilter === tag.label ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
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

            <button onClick={openNewNoteModal} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all shrink-0">
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nueva</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
        {filteredNotes.length > 0 ? (
          filteredNotes.map(note => {
            if (!note) return null;
            const thumbnail = getThumbnail(note);
            const plainText = getPlainTextSnippet(note.content);
            return (
            <div 
              key={note.id} 
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 hover:shadow-xl hover:border-emerald-500/30 transition-all duration-300 flex flex-col h-[340px] cursor-pointer"
              onClick={() => openEditNoteModal(note)}
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
                    <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                 </div>
              </div>

              <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-2 line-clamp-1 group-hover:text-emerald-500 transition-colors" title={note.title}>{note.title}</h3>
              
              <div className="flex-1 overflow-hidden relative mb-3">
                <p className={`text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap ${thumbnail ? 'line-clamp-3' : 'line-clamp-6'}`}>{plainText}</p>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-slate-900 to-transparent pointer-events-none"></div>
              </div>

              {thumbnail && (
                <div className="relative w-full h-32 mb-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group/image">
                    <img 
                        src={thumbnail} 
                        alt="Adjunto" 
                        className="w-full h-full object-cover transition-transform group-hover/image:scale-105 cursor-zoom-in"
                        onClick={(e) => {
                            e.stopPropagation();
                            setFullImage(thumbnail);
                        }}
                    />
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 mt-auto">
                 <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(note.date).toLocaleDateString([], {day: '2-digit', month: '2-digit'})}</span>
                 </div>
                {thumbnail && <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Img</span>}
              </div>
            </div>
          )})
        ) : (
          <div className="col-span-full py-20 text-center text-slate-400">
            <StickyNote className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No se encontraron notas con estos filtros.</p>
            {(activeFilter || dateFilter || searchTerm) && <button onClick={clearFilters} className="mt-2 text-emerald-500 font-bold text-sm hover:underline">Limpiar Filtros</button>}
          </div>
        )}
      </div>

      {/* NOTION STYLE MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[60] bg-[#191919]/50 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 md:p-4">
          <div className="bg-white dark:bg-[#191919] w-full max-w-4xl h-full md:h-[90vh] md:rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Header / Top Bar Controls */}
            <div className="h-12 flex items-center justify-between px-4 shrink-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
               <div className="flex items-center gap-2 text-slate-400">
                  <Maximize2 className="w-4 h-4 cursor-pointer hover:text-slate-200" />
                  <span className="text-xs text-slate-500">My Trading Journal / {formData.title || 'Untitled'}</span>
               </div>
               <div className="flex items-center gap-2">
                   <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400"><MoreHorizontal className="w-5 h-5" /></button>
                   <button onClick={handleClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400"><X className="w-5 h-5" /></button>
               </div>
            </div>

            {/* Main Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
               <div className="max-w-3xl mx-auto px-12 py-10">
                  
                  {/* Notion Header Area */}
                  <div className="group mb-8">
                      {/* Title */}
                      <input 
                          type="text" 
                          placeholder="Untitled" 
                          className="w-full text-4xl font-bold bg-transparent border-none px-0 py-2 text-slate-900 dark:text-[#ffffff] focus:ring-0 placeholder:text-slate-300 dark:placeholder:text-slate-600 mb-6"
                          value={formData.title}
                          onChange={e => setFormData({...formData, title: e.target.value})}
                      />

                      {/* Properties Grid */}
                      <div className="space-y-0.5">
                          {/* Status / Tags */}
                          <div className="relative" ref={tagMenuRef}>
                              <PropertyRow 
                                icon={Check} 
                                label="Status" 
                                onClick={() => setShowTagMenu(!showTagMenu)}
                              >
                                  {formData.tags.length > 0 ? (
                                      formData.tags.map(tag => {
                                          // Find predefined color or default to inbox style
                                          const style = PREDEFINED_TAGS.find(t => t.label === tag)?.color || 'bg-slate-700 text-slate-300';
                                          return (
                                              <span key={tag} className={`px-2 py-0.5 rounded-sm text-xs border ${style}`}>
                                                  {tag}
                                              </span>
                                          );
                                      })
                                  ) : (
                                      <span className="text-slate-500 text-xs italic">Empty</span>
                                  )}
                              </PropertyRow>
                              
                              {/* Inline Tag Menu */}
                              {showTagMenu && (
                                  <div className="absolute top-8 left-36 z-50 w-48 bg-[#252525] border border-[#373737] rounded-md shadow-xl py-1">
                                      {PREDEFINED_TAGS.map(tag => (
                                          <button
                                              key={tag.label}
                                              onClick={() => { toggleTag(tag.label); setShowTagMenu(false); }}
                                              className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-[#373737] flex items-center gap-2"
                                          >
                                              <div className={`w-2 h-2 rounded-full ${tag.color.split(' ')[0].replace('/40','').replace('/20','')}`}></div>
                                              {tag.label}
                                              {formData.tags.includes(tag.label) && <Check className="w-3 h-3 ml-auto" />}
                                          </button>
                                      ))}
                                  </div>
                              )}
                          </div>

                          {/* Notebook (Folder) */}
                          <PropertyRow icon={Book} label="Notebook">
                              <div className="flex items-center gap-1.5 text-slate-300 hover:bg-[#2c2c2c] px-1.5 py-0.5 rounded cursor-pointer transition-colors">
                                  <Book className="w-3 h-3 text-rose-400" />
                                  <span className="underline decoration-slate-600 underline-offset-2">General Notes</span>
                              </div>
                          </PropertyRow>

                          {/* Type */}
                          <PropertyRow icon={FileText} label="Type">
                              <span className="text-slate-500 text-xs">Page</span>
                          </PropertyRow>

                          {/* Created Time */}
                          <PropertyRow icon={Clock} label="Created time">
                              <span className="text-slate-400 text-xs">{formatNotionDate(formData.date)}</span>
                          </PropertyRow>

                          {/* Last Modified */}
                          <PropertyRow icon={Calendar} label="Last Modified">
                              <span className="text-slate-400 text-xs">{formatNotionDate(formData.updatedAt || formData.date)}</span>
                          </PropertyRow>
                      </div>
                  </div>

                  <hr className="border-slate-200 dark:border-[#2f2f2f] mb-8" />

                  {/* Editor */}
                  <div className="min-h-[400px]">
                      <div className="text-xs text-slate-400 mb-2 flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity">
                          <Type className="w-3 h-3" />
                          <span>Tip: Press <kbd className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">Ctrl+V</kbd> to paste images inline.</span>
                      </div>
                      <div 
                          ref={editorRef}
                          contentEditable
                          onInput={handleEditorInput}
                          onPaste={handlePaste}
                          onClick={handleEditorClick}
                          className="w-full h-full outline-none text-base leading-7 text-slate-800 dark:text-[#d4d4d4] empty:before:content-[attr(data-placeholder)] empty:before:text-slate-500 cursor-text prose prose-slate dark:prose-invert max-w-none"
                          data-placeholder="Press 'Enter' to continue with an empty page, or start writing..."
                      />
                  </div>
               </div>
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
