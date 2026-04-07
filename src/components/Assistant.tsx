import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Sparkles } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function Assistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('Hi! I\'m Chef Buddy. Need help with your pantry?');
  const [isThinking, setIsThinking] = useState(false);

  const tips = [
    "Did you know? Keeping onions and potatoes together makes them sprout faster!",
    "Check your freezer! Those frozen peas are perfect for a quick pasta.",
    "Your milk expires in 2 days. Time for some pancakes?",
    "Sharing is caring! You have extra flour, maybe a neighbor needs some?",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isOpen) {
        const randomTip = tips[Math.floor(Math.random() * tips.length)];
        setMessage(randomTip);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const askGemini = async (prompt: string) => {
    setIsThinking(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: "You are Chef Buddy, a friendly cartoon kitchen assistant. Keep answers short, fun, and helpful for a family managing their food inventory.",
        },
      });
      setMessage(response.text || "I'm not sure, but let's check the fridge!");
    } catch (error) {
      console.error(error);
      setMessage("Oops, my chef hat fell off! Try again?");
    }
    setIsThinking(false);
  };

  return (
    <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-4">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl border-2 border-orange-200 p-6 w-72 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-yellow-400"></div>
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-3 right-3 p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>

            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center text-2xl">
                👨‍🍳
              </div>
              <div>
                <h3 className="font-bold text-orange-900">Chef Buddy</h3>
                <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">AI Assistant</p>
              </div>
            </div>

            <div className="bg-orange-50 rounded-2xl p-4 text-sm text-gray-700 mb-4 min-h-[60px]">
              {isThinking ? (
                <div className="flex gap-1">
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-2 h-2 bg-orange-400 rounded-full" />
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-2 h-2 bg-orange-400 rounded-full" />
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-2 h-2 bg-orange-400 rounded-full" />
                </div>
              ) : (
                <p>{message}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => askGemini("Suggest a quick dinner with what I have.")}
                className="text-[10px] bg-white border border-orange-200 px-3 py-1.5 rounded-full hover:bg-orange-50 transition-colors font-bold text-orange-700"
              >
                Dinner ideas?
              </button>
              <button
                onClick={() => askGemini("How do I store avocados?")}
                className="text-[10px] bg-white border border-orange-200 px-3 py-1.5 rounded-full hover:bg-orange-50 transition-colors font-bold text-orange-700"
              >
                Food storage tips
              </button>
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
