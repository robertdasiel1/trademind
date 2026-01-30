
import React, { useState, useEffect, useRef } from 'react';
import { Trade, ChatMessage, GlobalNote, Playbook } from '../types';
import { createTradingChatSession, getTradeAnalysis, getNotesAnalysis, analyzePlaybook } from '../services/geminiService';
import { BrainCircuit, Send, User, Bot, Loader2, Sparkles, Image as ImageIcon, NotebookPen, MessageSquare, History, FileText, UploadCloud, CheckCircle2, AlertTriangle, BookOpen } from 'lucide-react';
import { Chat } from '@google/genai';

interface Props {
  trades: Trade[];
  goal: number;
  notes: GlobalNote[];
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  chatSessionRef: React.MutableRefObject<Chat | null>;
  playbook: Playbook | null;
  onUpdatePlaybook: (p: Playbook | null) => void;
}

type AICoachMode = 'chat' | 'trade_analysis' | 'note_analysis' | 'strategy';

const AICoach: React.FC<Props> = ({ trades, goal, notes, messages, setMessages, chatSessionRef, playbook, onUpdatePlaybook }) => {
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAnalyzingPDF, setIsAnalyzingPDF] = useState(false);
  const [mode, setMode] = useState<AICoachMode>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // If chat doesn't exist OR playbook changed significantly (optional, but good to reset context), create session
    if (!chatSessionRef.current) {
        chatSessionRef.current = createTradingChatSession(trades, goal, notes, playbook);
    }
    
    if (messages.length === 0) {
        const initialGreeting: ChatMessage = {
          id: 'init-1',
          role: 'model',
          text: `Hola. Soy tu mentor Titan. He analizado tus ${trades.length} trades, ${notes.length} notas y tu meta de $${goal.toLocaleString()}. ${playbook ? "También he revisado tu Playbook de Estrategia." : ""} ¿En qué nos enfocamos hoy?`
        };
        setMessages([initialGreeting]);
    }
  }, []); // Only on mount

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !chatSessionRef.current) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: inputText };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await chatSessionRef.current.sendMessage({ message: userMsg.text });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'model', text: response.text || "No pude procesar eso." };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: "Error de conexión. Intenta de nuevo." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handlePDFUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Por favor sube solo archivos PDF.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("El archivo es demasiado grande (Máx 5MB). Intenta comprimirlo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
       const base64 = evt.target?.result as string;
       setIsAnalyzingPDF(true);
       
       try {
           // 1. Analyze PDF with AI to get summary
           const summary = await analyzePlaybook(base64);
           
           // 2. Create Playbook Object
           const newPlaybook: Playbook = {
             fileName: file.name,
             fileData: base64,
             uploadDate: new Date().toISOString(),
             summary: summary
           };
           
           // 3. Save to App State
           onUpdatePlaybook(newPlaybook);
           
           // 4. Update Chat Session Context
           chatSessionRef.current = createTradingChatSession(trades, goal, notes, newPlaybook);
           
           // 5. Notify User in Chat
           setMessages(prev => [
             ...prev, 
             { id: crypto.randomUUID(), role: 'model', text: `**¡Playbook Recibido!**\n\nHe leído tu estrategia "${file.name}".\n\n**Resumen de tus reglas:**\n${summary}\n\nA partir de ahora, juzgaré todas tus decisiones basándome en estas reglas.` }
           ]);
           
           setMode('chat');
           
       } catch (error) {
           alert("Error al analizar el PDF.");
       } finally {
           setIsAnalyzingPDF(false);
       }
    };
    reader.readAsDataURL(file);
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const removePlaybook = () => {
      if (confirm("¿Olvidar tu estrategia actual? El mentor volverá a dar consejos genéricos.")) {
          onUpdatePlaybook(null);
          // Reset session without playbook
          chatSessionRef.current = createTradingChatSession(trades, goal, notes, null);
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: "Entendido. He olvidado tu Playbook. Volveré a usar criterios de mercado estándar." }]);
      }
  };

  const runNoteAnalysis = async () => {
    setIsTyping(true);
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: "Realiza un análisis profundo de mis notas de diario." }]);
    try {
      const result = await getNotesAnalysis(notes);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: result, isVisualAnalysis: true }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: "No pude analizar tus notas en este momento." }]);
    } finally {
      setIsTyping(false);
      setMode('chat');
    }
  };

  const runTradeAnalysis = async () => {
    setIsTyping(true);
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: "Analiza visualmente mis últimos gráficos de trading." }]);
    try {
      const result = await getTradeAnalysis(trades, goal);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: result, isVisualAnalysis: true }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: "Error al procesar las capturas de pantalla." }]);
    } finally {
      setIsTyping(false);
      setMode('chat');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden relative">
      <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 z-10">
         <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20"><BrainCircuit className="w-6 h-6 text-white" /></div>
            <div>
               <h2 className="font-bold text-slate-900 dark:text-white text-sm md:text-base">Titán AI Coach</h2>
               <div className="flex items-center gap-1.5">
                   <span className={`w-2 h-2 rounded-full animate-pulse ${playbook ? 'bg-purple-500' : 'bg-emerald-500'}`}></span>
                   <p className="text-[10px] text-slate-500 uppercase font-black">
                       {playbook ? "Estrategia Activa" : "Modo Genérico"}
                   </p>
               </div>
            </div>
         </div>
         
         {/* Segmented Control for Modes */}
         <div className="bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-xl flex gap-1 w-full md:w-auto overflow-x-auto no-scrollbar">
            <button onClick={() => setMode('chat')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${mode === 'chat' ? 'bg-white dark:bg-slate-700 text-emerald-500 shadow-sm' : 'text-slate-500'}`}>
               <MessageSquare className="w-3.5 h-3.5" /> Chat
            </button>
            <button onClick={() => setMode('trade_analysis')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${mode === 'trade_analysis' ? 'bg-white dark:bg-slate-700 text-emerald-500 shadow-sm' : 'text-slate-500'}`}>
               <ImageIcon className="w-3.5 h-3.5" /> Trades
            </button>
            <button onClick={() => setMode('note_analysis')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${mode === 'note_analysis' ? 'bg-white dark:bg-slate-700 text-emerald-500 shadow-sm' : 'text-slate-500'}`}>
               <NotebookPen className="w-3.5 h-3.5" /> Notas
            </button>
            <button onClick={() => setMode('strategy')} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${mode === 'strategy' ? 'bg-white dark:bg-slate-700 text-purple-500 shadow-sm' : 'text-slate-500'}`}>
               <BookOpen className="w-3.5 h-3.5" /> Estrategia
            </button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/50 scroll-smooth">
         {/* CHAT MESSAGES */}
         {mode === 'chat' && (
             <>
                 {messages.map((msg) => (
                    <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                       <div className={`flex max-w-[85%] gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-slate-200 dark:bg-slate-700 text-slate-600' : (playbook ? 'bg-purple-600' : 'bg-emerald-500') + ' text-white'}`}>
                              {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                          </div>
                          <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-sm'}`}>
                              {msg.isVisualAnalysis || msg.text.includes("**") ? (
                                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                                      {msg.isVisualAnalysis && <div className="flex items-center gap-2 mb-2 text-emerald-500 font-bold uppercase text-[10px] tracking-widest border-b border-emerald-500/20 pb-1"><Sparkles className="w-3 h-3" /> Análisis Profundo</div>}
                                      {msg.text}
                                  </div>
                              ) : (
                                  msg.text.split('\n').map((line, i) => <div key={i} className="min-h-[1.2em]">{line}</div>)
                              )}
                          </div>
                       </div>
                    </div>
                 ))}
                 {isTyping && (
                     <div className="flex justify-start w-full">
                         <div className="flex gap-3 max-w-[75%]">
                             <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white"><Bot className="w-5 h-5" /></div>
                             <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl flex items-center gap-2"><Loader2 className="w-4 h-4 text-emerald-500 animate-spin" /><span className="text-xs text-slate-400">Titan está analizando...</span></div>
                         </div>
                     </div>
                 )}
                 <div ref={messagesEndRef} />
             </>
         )}

         {/* STRATEGY UPLOAD MODE */}
         {mode === 'strategy' && (
             <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in fade-in duration-300">
                 <div className="max-w-md w-full bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl">
                     <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
                         <BookOpen className="w-8 h-8" />
                     </div>
                     
                     <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Tu Playbook de Trading</h3>
                     <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
                        Sube tu estrategia en PDF. El mentor leerá tus reglas y las usará para auditar tus operaciones.
                     </p>

                     {isAnalyzingPDF ? (
                         <div className="py-12 flex flex-col items-center gap-4">
                             <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
                             <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Analizando documento...</p>
                             <p className="text-xs text-slate-400">Esto puede tomar unos segundos</p>
                         </div>
                     ) : playbook ? (
                         <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 rounded-2xl p-6 mb-6">
                             <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold mb-2">
                                 <CheckCircle2 className="w-5 h-5" />
                                 Estrategia Activa
                             </div>
                             <p className="text-sm text-slate-600 dark:text-slate-300 font-medium mb-1 truncate">{playbook.fileName}</p>
                             <p className="text-xs text-slate-400 mb-4">Subido el {new Date(playbook.uploadDate).toLocaleDateString()}</p>
                             
                             <button 
                                onClick={removePlaybook}
                                className="text-xs text-rose-500 hover:text-rose-600 font-bold underline decoration-rose-500/30"
                             >
                                Eliminar y usar modo estándar
                             </button>
                         </div>
                     ) : (
                         <div 
                            onClick={() => pdfInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 rounded-2xl p-8 cursor-pointer transition-all group"
                         >
                             <UploadCloud className="w-10 h-10 text-slate-400 group-hover:text-purple-500 mx-auto mb-4 transition-colors" />
                             <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Click para subir PDF</p>
                             <p className="text-xs text-slate-400 mt-1">Máx 5MB</p>
                             <input 
                                type="file" 
                                ref={pdfInputRef} 
                                className="hidden" 
                                accept="application/pdf"
                                onChange={handlePDFUpload} 
                             />
                         </div>
                     )}
                     
                     <div className="mt-6 flex items-start gap-2 text-left bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-800/30">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                           <strong>Nota:</strong> Los archivos grandes pueden no guardarse permanentemente si cierras el navegador debido a límites de almacenamiento local.
                        </p>
                     </div>
                 </div>
             </div>
         )}
         
         {/* OTHER ANALYSIS MODES PLACEHOLDERS (Rendered simply to guide user back to buttons) */}
         {(mode === 'trade_analysis' || mode === 'note_analysis') && (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in fade-in duration-300">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${mode === 'trade_analysis' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
                      {mode === 'trade_analysis' ? <ImageIcon className="w-8 h-8" /> : <NotebookPen className="w-8 h-8" />}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                      {mode === 'trade_analysis' ? 'Análisis de Operaciones' : 'Análisis de Diario'}
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-xs mx-auto">
                    {mode === 'trade_analysis' ? 'El mentor revisará tus últimos 5 trades y sus gráficos.' : 'El mentor buscará patrones psicológicos en tus últimas 10 notas.'}
                  </p>
                  <button onClick={mode === 'trade_analysis' ? runTradeAnalysis : runNoteAnalysis} disabled={isTyping} className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 flex items-center gap-2 ${mode === 'trade_analysis' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
                      <Sparkles className="w-4 h-4" /> Ejecutar Análisis
                  </button>
            </div>
         )}
      </div>

      {mode === 'chat' && (
          <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <form onSubmit={handleSendMessage} className="relative flex gap-2">
                  <input type="text" className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Escribe tu duda técnica o mental..." value={inputText} onChange={(e) => setInputText(e.target.value)} disabled={isTyping} />
                  <button type="submit" disabled={!inputText.trim() || isTyping} className="p-3 bg-emerald-500 text-white rounded-xl shadow-md disabled:opacity-50"><Send className="w-4 h-4" /></button>
              </form>
          </div>
      )}
    </div>
  );
};

export default AICoach;
