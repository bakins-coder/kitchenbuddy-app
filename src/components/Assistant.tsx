import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Sparkles, Send, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

import { useHousehold } from '../contexts/HouseholdContext';

export default function Assistant() {
  const { profile } = useHousehold();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('Hi! I\'m Chef Buddy. Need help with your pantry?');
  const [isThinking, setIsThinking] = useState(false);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(true);
  const [inventory, setInventory] = useState<any[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const tips = [
    "Did you know? Keeping onions and potatoes together makes them sprout faster!",
    "Check your freezer! Those frozen peas are perfect for a quick pasta.",
    "Your milk expires in 2 days. Time for some pancakes?",
    "Sharing is caring! You have extra flour, maybe a neighbor needs some?",
  ];

  useEffect(() => {
    if (!profile?.householdId) return;

    const path = `households/${profile.householdId}/inventoryItems`;
    const q = query(collection(db, path));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInventory(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [profile?.householdId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isOpen) {
        const randomTip = tips[Math.floor(Math.random() * tips.length)];
        setMessage(randomTip);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        handleSend(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const speak = (text: string) => {
    if (!isSpeaking) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1.2;
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  const askGemini = async (prompt: string) => {
    setIsThinking(true);
    setImageUrl(null);
    try {
      const inventoryContext = inventory.map(item => 
        `${item.name}: ${item.quantity} ${item.unit} (Expires: ${item.expiryDate || 'N/A'}, Location: ${item.storageLocationId || 'Unknown'})`
      ).join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: prompt,
        config: {
          systemInstruction: `You are Chef Buddy, a friendly cartoon kitchen assistant. 
          Keep answers short, fun, and helpful for a family managing their food inventory.
          Here is the current inventory (including nutritional info like macroCategory and glycemicIndex):
          ${inventoryContext}
          
          Use this data to answer questions about what's in stock, what's expiring, or recipe suggestions.
          When items are added, feel free to mention their nutritional benefits (e.g., "Great choice! Spinach is a healthy fiber with a low glycemic index.").
          If they ask for a recipe, suggest something they can make with their current ingredients.
          
          CRITICAL: When explaining recipes, cooking directions, or food preparation, ALWAYS provide a photo-realistic illustration of the dish or the process. 
          The illustration should be high-quality, vibrant, and appetizing.`,
        },
      });
      
      let text = "";
      let img = null;

      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            img = `data:image/png;base64,${part.inlineData.data}`;
          } else if (part.text) {
            text += part.text;
          }
        }
      }

      const finalMessage = text || "I'm not sure, but let's check the fridge!";
      setMessage(finalMessage);
      setImageUrl(img);
      speak(finalMessage);
    } catch (error) {
      console.error(error);
      setMessage("Oops, my chef hat fell off! Try again?");
    }
    setIsThinking(false);
  };

  const handleSend = (text?: string) => {
    const queryText = text || input;
    if (!queryText.trim()) return;
    askGemini(queryText);
    setInput('');
  };

  return (
    <div className="fixed bottom-24 right-6 z-[200] flex flex-col items-end gap-4">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="bg-white rounded-[2.5rem] shadow-2xl border-4 border-orange-100 p-6 w-80 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-orange-400 to-yellow-400"></div>
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center text-2xl shadow-inner">
                  👨‍🍳
                </div>
                <div>
                  <h3 className="font-black text-orange-900 leading-none">Chef Buddy</h3>
                  <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest mt-1">AI Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsSpeaking(!isSpeaking)}
                  className={cn("p-2 rounded-xl transition-colors", isSpeaking ? "text-orange-500 bg-orange-50" : "text-gray-300 hover:bg-gray-50")}
                >
                  {isSpeaking ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="bg-orange-50/50 rounded-3xl p-4 text-sm text-gray-700 mb-4 min-h-[100px] border-2 border-orange-50 max-h-64 overflow-y-auto scrollbar-hide">
              {isThinking ? (
                <div className="flex items-center gap-2 h-full justify-center">
                  <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-2 h-2 bg-orange-400 rounded-full" />
                  <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-2 h-2 bg-orange-400 rounded-full" />
                  <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-2 h-2 bg-orange-400 rounded-full" />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="leading-relaxed font-medium">{message}</p>
                  {imageUrl && (
                    <motion.img 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={imageUrl} 
                      alt="Illustration" 
                      className="w-full rounded-2xl shadow-md border-2 border-white"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask me anything..."
                    className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 pr-10 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                  />
                  <button
                    onClick={() => handleSend()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-orange-500 hover:bg-orange-100 rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={toggleListening}
                  className={cn(
                    "p-3 rounded-2xl transition-all shadow-lg",
                    isListening 
                      ? "bg-red-500 text-white animate-pulse shadow-red-200" 
                      : "bg-orange-500 text-white shadow-orange-200"
                  )}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </motion.button>
              </div>

              <div className="flex flex-wrap gap-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => askGemini("What's expiring soon?")}
                  className="text-[10px] bg-white border-2 border-orange-50 px-3 py-1.5 rounded-xl hover:border-orange-200 transition-colors font-bold text-orange-700 uppercase tracking-wider"
                >
                  Expiring soon?
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => askGemini("Suggest a recipe with my current stock.")}
                  className="text-[10px] bg-white border-2 border-orange-50 px-3 py-1.5 rounded-xl hover:border-orange-200 transition-colors font-bold text-orange-700 uppercase tracking-wider"
                >
                  Recipe ideas
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-orange-200 border-4 border-white relative group"
      >
        <span className="text-3xl group-hover:scale-110 transition-transform">👨‍🍳</span>
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute -top-1 -right-1 bg-yellow-400 p-1 rounded-full border-2 border-white"
        >
          <Sparkles className="w-3 h-3 text-orange-900" />
        </motion.div>
      </motion.button>
    </div>
  );
}
