import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { ShoppingListItem, InventoryItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, CheckCircle, Circle, ShoppingBag, Sparkles, AlertCircle } from 'lucide-react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';

import { useHousehold } from '../contexts/HouseholdContext';

export default function ShoppingList() {
  const { profile } = useHousehold();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [newItemName, setNewItemName] = useState('');

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user && profile?.householdId) {
        const shoppingPath = `households/${profile.householdId}/shoppingList`;
        const q = query(collection(db, shoppingPath));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShoppingListItem));
          setItems(itemsData);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, shoppingPath);
        });

        const invPath = `households/${profile.householdId}/inventoryItems`;
        const invQ = query(collection(db, invPath));
        const invUnsubscribe = onSnapshot(invQ, (snapshot) => {
          const invData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
          setInventoryItems(invData);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, invPath);
        });

        return () => {
          unsubscribe();
          invUnsubscribe();
        };
      } else {
        setItems([]);
        setInventoryItems([]);
      }
    });

    return () => unsubscribeAuth();
  }, [profile?.householdId]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !auth.currentUser || !profile?.householdId) return;

    try {
      await addDoc(collection(db, `households/${profile.householdId}/shoppingList`), {
        name: newItemName,
        quantity: 1,
        unit: 'pcs',
        status: 'pending',
        householdId: profile.householdId,
        addedBy: auth.currentUser.uid,
      });
      setNewItemName('');
    } catch (error) {
      console.error('Error adding shopping item:', error);
    }
  };

  const toggleStatus = async (item: ShoppingListItem) => {
    if (!profile?.householdId) return;
    try {
      await updateDoc(doc(db, `households/${profile.householdId}/shoppingList`, item.id), {
        status: item.status === 'pending' ? 'bought' : 'pending',
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!profile?.householdId) return;
    try {
      await deleteDoc(doc(db, `households/${profile.householdId}/shoppingList`, id));
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const lowStockItems = inventoryItems.filter(i => (i.quantity || 0) <= (i.lowStockThreshold || 1));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-orange-900 uppercase tracking-tight">Shopping List</h2>
        <div className="bg-orange-50 px-3 py-1 rounded-full flex items-center gap-2 border border-orange-100">
          <ShoppingBag className="w-4 h-4 text-orange-400" />
          <span className="text-xs font-bold text-orange-700">{items.filter(i => i.status === 'pending').length} items</span>
        </div>
      </div>

      {/* Quick Add */}
      <form onSubmit={handleAddItem} className="relative">
        <input
          type="text"
          placeholder="Add item to buy..."
          value={newItemName}
          onChange={e => setNewItemName(e.target.value)}
          className="w-full bg-white border-4 border-orange-100 rounded-3xl px-6 py-4 pr-16 focus:outline-none focus:border-orange-500 transition-all shadow-sm"
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="submit"
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-linear-to-r from-orange-400 to-rose-400 text-white p-2 rounded-2xl hover:from-orange-500 hover:to-rose-500 transition-all shadow-lg shadow-orange-200/50"
        >
          <Plus className="w-6 h-6" />
        </motion.button>
      </form>

      {/* Smart Suggestions */}
      {lowStockItems.length > 0 && (
        <div className="bg-yellow-50 border-2 border-yellow-100 rounded-[2rem] p-6 space-y-4">
          <div className="flex items-center gap-2 text-yellow-700">
            <Sparkles className="w-5 h-5" />
            <h3 className="font-bold text-sm uppercase tracking-widest">Smart Suggestions</h3>
          </div>
          <p className="text-xs text-yellow-600 font-medium">These items are running low in your pantry:</p>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map(item => (
              <button
                key={item.id}
                onClick={async () => {
                  if (!profile?.householdId) return;
                  await addDoc(collection(db, `households/${profile.householdId}/shoppingList`), {
                    name: item.name,
                    quantity: 1,
                    unit: item.unit,
                    status: 'pending',
                    householdId: profile.householdId,
                    addedBy: auth.currentUser?.uid,
                  });
                }}
                className="bg-white border border-yellow-200 px-3 py-1.5 rounded-xl text-[10px] font-bold text-yellow-700 hover:bg-yellow-100 transition-colors flex items-center gap-2"
              >
                <Plus className="w-3 h-3" /> {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {items.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-[2rem] p-12 text-center border-4 border-dashed border-orange-100"
            >
              <div className="text-6xl mb-4">📝</div>
              <h3 className="font-bold text-gray-900">List is empty!</h3>
              <p className="text-sm text-gray-500 mt-2">Add items manually or check suggestions.</p>
            </motion.div>
          ) : (
            items.sort((a, b) => (a.status === 'bought' ? 1 : -1)).map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  "bg-white rounded-3xl p-4 flex items-center gap-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-orange-50/50 transition-all group hover:shadow-[0_20px_50px_rgba(249,115,22,0.08)]",
                  item.status === 'bought' ? 'opacity-50 border-gray-100' : 'border-orange-50'
                )}
              >
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => toggleStatus(item)}
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                    item.status === 'bought' ? 'bg-green-100 text-green-600' : 'bg-orange-50 text-orange-400 hover:bg-orange-100'
                  )}
                >
                  {item.status === 'bought' ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </motion.button>

                <div className="flex-1 min-w-0">
                  <h3 className={cn("font-bold text-gray-900 truncate", item.status === 'bought' && 'line-through text-gray-400')}>
                    {item.name}
                  </h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                    {item.quantity} {item.unit}
                  </p>
                </div>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleDeleteItem(item.id)}
                  className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-5 h-5" />
                </motion.button>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Clear Bought Button */}
      {items.some(i => i.status === 'bought') && (
        <button
          onClick={() => {
            items.filter(i => i.status === 'bought').forEach(i => handleDeleteItem(i.id));
          }}
          className="w-full py-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 hover:text-red-500 transition-colors"
        >
          Clear Bought Items
        </button>
      )}
    </div>
  );
}
