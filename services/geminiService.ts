
import { GoogleGenAI, Chat } from "@google/genai";
import { Trade, GlobalNote, Playbook } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Función existente para análisis visual (One-shot)
export async function getTradeAnalysis(trades: Trade[], goal: number) {
  const recentTrades = trades.slice(0, 5); 
  const totalProfit = trades.reduce((acc, t) => acc + t.profit, 0);
  
  const parts: any[] = [];

  const textPrompt = `
    Eres un mentor de trading institucional senior. Tu misión es analizar mi desempeño y mis gráficos para ayudarme a alcanzar mi meta de $${goal}.
    
    Contexto Actual:
    - Ganancia Acumulada: $${totalProfit.toFixed(2)}
    - Distancia a la Meta: $${(goal - totalProfit).toFixed(2)}
    - Total de Operaciones: ${trades.length}
    
    Datos de los últimos trades:
    ${JSON.stringify(recentTrades.map(t => ({ 
      date: t.date,
      asset: t.asset, 
      size: t.size,
      entry: t.entryPrice,
      exit: t.exitPrice,
      profit: t.profit, 
      direction: t.direction,
      emotions: t.emotions,
      notes: t.notes 
    })))}
    
    INSTRUCCIONES:
    1. Analiza las CAPTURAS DE PANTALLA adjuntas (si las hay). Puede haber múltiples imágenes por operación (Entrada, Desarrollo, Salida). Úsalas para reconstruir la narrativa del trade.
    2. Identifica patrones técnicos, soportes/resistencias y calidad de las entradas basándote en la evidencia visual.
    3. Cruza los datos visuales con mis notas y emociones. ¿Mi psicología está afectando mi ejecución técnica?
    4. Dame 3 críticas constructivas "sin filtro" sobre mis setups.
    5. Proporciona un ajuste táctico para la próxima semana.
    
    Responde en español, con un tono profesional, analítico y motivador. Usa Markdown.
  `;

  parts.push({ text: textPrompt });

  recentTrades.forEach((trade) => {
    if (trade.screenshots && trade.screenshots.length > 0) {
      trade.screenshots.forEach((shot) => {
        const matches = shot.match(/^data:([^;]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          parts.push({
            inlineData: {
              mimeType: matches[1],
              data: matches[2]
            }
          });
        }
      });
    }
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts }],
    });
    
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "El mentor está analizando demasiados gráficos ahora mismo. Por favor, intenta de nuevo en unos momentos.";
  }
}

export async function getNotesAnalysis(notes: GlobalNote[]) {
    // Take the last 10 notes to fit context
    const recentNotes = notes.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
    
    if (recentNotes.length === 0) {
        return "No tienes notas registradas. Crea algunas notas en la sección 'Notas' para que pueda analizar tu diario de trading.";
    }

    const parts: any[] = [];
    
    const textPrompt = `
      Eres un mentor de trading especializado en psicología y desarrollo estratégico.
      
      He compartido contigo mis últimas notas de trading (Diario). Tu objetivo es leer entre líneas para entender mi estado mental actual, mis ideas de mercado y detectar sesgos cognitivos o patrones de pensamiento.
      
      CONTENIDO DE LAS NOTAS:
      ${JSON.stringify(recentNotes.map(n => ({ 
          date: n.date, 
          title: n.title, 
          content: n.content, 
          tags: n.tags 
      })))}
      
      INSTRUCCIONES:
      1. Lee el contenido de mis notas y observa las imágenes adjuntas (si las hay).
      2. Detecta patrones recurrentes en mi pensamiento (ej: exceso de confianza, miedo, falta de planificación, buenas ideas de backtesting).
      3. Si hay imágenes de análisis (capturas de pantalla), coméntalas en relación con lo que escribí.
      4. Dame un resumen de "Fortalezas Mentales" y "Áreas de Riesgo Psicológico" basado en estos escritos.
      5. Concluye con un consejo práctico para mejorar mi proceso de journaling o mi enfoque mental.

      Responde en español. Sé empático pero directo. Usa Markdown.
    `;

    parts.push({ text: textPrompt });

    recentNotes.forEach((note) => {
        // Handle new array structure
        if (note.screenshots && note.screenshots.length > 0) {
            note.screenshots.forEach(shot => {
                const matches = shot.match(/^data:([^;]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    parts.push({
                        inlineData: {
                            mimeType: matches[1],
                            data: matches[2]
                        }
                    });
                }
            });
        }
        // Handle legacy single screenshot
        else if (note.screenshot) {
            const matches = note.screenshot.match(/^data:([^;]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                parts.push({
                    inlineData: {
                        mimeType: matches[1],
                        data: matches[2]
                    }
                });
            }
        }
    });

    try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{ parts }],
        });
        
        return response.text;
    } catch (error) {
        console.error("Error calling Gemini for Notes:", error);
        return "Hubo un error al leer tu diario. Intenta con menos imágenes o texto más breve.";
    }
}

// Analizar Playbook PDF
export async function analyzePlaybook(pdfBase64: string): Promise<string> {
  const parts: any[] = [];
  
  // Extraer solo la data base64 si viene con prefijo
  const matches = pdfBase64.match(/^data:application\/pdf;base64,(.+)$/);
  const cleanData = matches && matches.length === 2 ? matches[1] : pdfBase64;

  const textPrompt = `
    He adjuntado mi Playbook / Estrategia de Trading en PDF.
    
    TU TAREA:
    1. Lee el documento completamente.
    2. Extrae las "Reglas de Oro", "Criterios de Entrada" y "Gestión de Riesgo" que encuentre.
    3. Genera un resumen ejecutivo de mi propia estrategia.
    4. Confírmame que has entendido mi plan y que usarás estas reglas para juzgar mis futuros trades.
    
    Responde en español, usando Markdown. Sé estructurado.
  `;

  parts.push({ text: textPrompt });
  parts.push({
    inlineData: {
      mimeType: 'application/pdf',
      data: cleanData
    }
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Flash es excelente para documentos largos
      contents: [{ parts }],
    });
    return response.text || "No pude leer el PDF.";
  } catch (error) {
    console.error("Error analyzing PDF:", error);
    return "Error al analizar el Playbook. Asegúrate de que el PDF no sea demasiado pesado o esté protegido.";
  }
}

export async function getRecoverySuggestion(trades: Trade[], goal: number) {
  const totalProfit = trades.reduce((acc, t) => acc + t.profit, 0);
  const lastTrades = trades.slice(0, 3);

  const prompt = `
    ACTÚA COMO UN PSICÓLOGO Y ESTRATEGA DE TRADING. 
    El usuario viene de una racha de pérdidas consecutivas. 
    Meta Final: $${goal}. Progreso actual: $${totalProfit}.
    Últimas operaciones: ${JSON.stringify(lastTrades.map(t => ({ asset: t.asset, profit: t.profit, notes: t.notes })))}.
    
    TAREA:
    Genera un breve consejo (máximo 300 caracteres) que proponga un setup de "bajo riesgo / alta probabilidad" para romper la racha. 
    Enfócate en:
    1. Reducción de lote (size).
    2. Esperar confirmación extra (ej. esperar el re-test).
    3. Un mensaje de calma.
    
    Responde en español, tono directo y protector. Sin formato Markdown complejo, solo texto fluido.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    return "Respira profundo. Reduce tu posición a la mitad y busca solo setups 'A+'. La disciplina es tu mayor ganancia hoy.";
  }
}

// NUEVA FUNCIÓN: Inicializar Chat con Playbook opcional
export function createTradingChatSession(trades: Trade[], goal: number, notes: GlobalNote[], playbook?: Playbook | null): Chat {
  const totalProfit = trades.reduce((acc, t) => acc + t.profit, 0);
  const recentHistory = trades.slice(0, 20).map(t => ({
      date: t.date,
      asset: t.asset,
      size: t.size,
      entry: t.entryPrice,
      exit: t.exitPrice,
      direction: t.direction,
      result: t.profit,
      notes: t.notes,
      emotions: t.emotions,
      rating: t.rating
  }));

  // Include recent notes in context (last 10)
  const recentNotes = notes.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10).map(n => ({
      date: n.date,
      title: n.title,
      tags: n.tags,
      content: n.content.length > 500 ? n.content.substring(0, 500) + "..." : n.content // Truncate long content
  }));

  let systemInstruction = `
    Eres "Titan", un mentor de trading institucional de alto rendimiento y psicólogo de mercado.
    Estás hablando con un trader que busca alcanzar una meta de $${goal} en 6 meses.
    
    ESTADO ACTUAL DEL TRADER:
    - Balance P/L: $${totalProfit.toFixed(2)}
    - Meta: $${goal}
    - Progreso: ${((totalProfit / goal) * 100).toFixed(1)}%
    
    HISTORIAL RECIENTE DE TRADES (JSON):
    ${JSON.stringify(recentHistory)}

    NOTAS RECIENTES DEL DIARIO (JSON):
    ${JSON.stringify(recentNotes)}

    TU PERSONALIDAD:
    - Directo, profesional, pero empático cuando es necesario.
    - Te enfocas en la gestión de riesgo, la psicología y la ejecución técnica.
    - Odias las excusas. Amas la disciplina.
    - Usas terminología de trading correcta (Drawdown, R:R, Break Even, FOMO, Tilt).
    - Tienes acceso total a los trades y notas del usuario. Úsalos para dar contexto a tus respuestas.
  `;

  if (playbook) {
      systemInstruction += `
      
      IMPORTANTE - PLAYBOOK DEL USUARIO:
      El usuario ha cargado su estrategia (Playbook). Debes alinear TODOS tus consejos a las reglas definidas en su estrategia.
      
      RESUMEN DE SU ESTRATEGIA (Generado previamente):
      ${playbook.summary || "No hay resumen disponible, pídele al usuario que te recuerde sus reglas."}
      
      Si el usuario toma un trade que viola sus propias reglas (basado en lo que sabes de su Playbook), SEVERAMENTE llámale la atención. Tu trabajo es asegurar que siga SU plan.
      `;
  } else {
      systemInstruction += `
      - TUS TAREAS:
      - Responder preguntas sobre los trades y notas del usuario.
      - Dar consejos de psicología si detectas "Tilt" o "Miedo" en el historial.
      - Mantén las respuestas concisas.
      - Habla siempre en Español.
      `;
  }

  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: systemInstruction,
    },
  });
}
