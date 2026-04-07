import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Recipe, InventoryItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, ChefHat, Sparkles, Clock, Utensils, Filter, Search, Heart } from 'lucide-react';
import { cn } from '../lib/utils';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(collection(db, 'households', 'default-household', 'recipes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recipesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipe));
      setRecipes(recipesData);
    });

    const invQ = query(collection(db, 'households', 'default-household', 'inventoryItems'));
    const invUnsubscribe = onSnapshot(invQ, (snapshot) => {
      const invData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setInventory(invData);
    });

    return () => {
      unsubscribe();
      invUnsubscribe();
    };
  }, []);

  const generateRecipe = async () => {
    setIsGenerating(true);
    try {
      const inventoryList = inventory.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ');
      const prompt = `Based on these ingredients in my kitchen: ${inventoryList}. 
      Suggest a simple, healthy recipe. 
      Return the response in JSON format with title, ingredients (array of {name, amount, unit}), instructions (array of strings), and dietaryTags (array of strings).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const recipeData = JSON.parse(response.text || '{}');
      if (recipeData.title) {
        await addDoc(collection(db, 'households', 'default-household', 'recipes'), {
          ...recipeData,
          householdId: 'default-household',
          dueScore: Math.floor(Math.random() * 100), // Mock due score
        });
      }
    } catch (error) {
      console.error('Error generating recipe:', error);
    }
    setIsGenerating(false);
  };

  const filters = ['All', 'Keto', 'Vegan', 'Gluten-free', 'Low Carb'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-orange-900 uppercase tracking-tight">Recipe Book</h2>
        <button
          onClick={generateRecipe}
          disabled={isGenerating}
          className="bg-orange-500 text-white px-4 py-2 rounded-2xl font-bold text-xs flex items-center gap-2 hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 disabled:opacity-50"
        >
          {isGenerating ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          AI Suggest
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={cn(
              'px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all border-2',
              activeFilter === f
                ? 'bg-orange-100 border-orange-500 text-orange-700'
                : 'bg-white border-orange-50 text-gray-400 hover:border-orange-200'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Recipe Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {recipes.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full bg-white rounded-[2rem] p-12 text-center border-4 border-dashed border-orange-100"
            >
              <div className="text-6xl mb-4">🍳</div>
              <h3 className="font-bold text-gray-900">No recipes yet!</h3>
              <p className="text-sm text-gray-500 mt-2">Use AI to suggest recipes based on your inventory.</p>
            </motion.div>
          ) : (
            recipes.map((recipe) => (
              <motion.div
                key={recipe.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-orange-50 hover:shadow-xl hover:border-orange-200 transition-all group relative overflow-hidden"
              >
                {/* Due Score Badge */}
                <div className="absolute top-4 right-4 bg-orange-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-200">
                  Due: {recipe.dueScore}%
                </div>

                <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-2xl mb-4">
                  🥘
                </div>

                <h3 className="text-lg font-black text-gray-900 mb-2 leading-tight">{recipe.title}</h3>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {recipe.dietaryTags?.map(tag => (
                    <span key={tag} className="text-[8px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                      <Clock className="w-3 h-3" /> 25m
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                      <Utensils className="w-3 h-3" /> {recipe.ingredients.length} items
                    </div>
                  </div>
                  <button className="p-2 bg-orange-50 text-orange-500 rounded-xl hover:bg-orange-500 hover:text-white transition-all">
                    <Heart className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
