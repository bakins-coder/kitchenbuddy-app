import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { SharedItem, BorrowRequest } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, MapPin, Share2, HandHelping, Calendar, MessageCircle, Search, Filter, ShieldCheck } from 'lucide-react';
import { cn, formatDate, handleFirestoreError, OperationType } from '../lib/utils';

export default function Community() {
  const [items, setItems] = useState<SharedItem[]>([]);
  const [requests, setRequests] = useState<BorrowRequest[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [newItem, setNewItem] = useState<Partial<SharedItem>>({
    name: '',
    description: '',
    terms: 'Return washed and in good condition.',
    status: 'available',
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const sharedPath = 'sharedItems';
        const q = query(collection(db, sharedPath));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SharedItem));
          setItems(itemsData);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, sharedPath);
        });

        const reqPath = 'borrowRequests';
        const reqQ = query(collection(db, reqPath), where('borrowerId', '==', user.uid));
        const reqUnsubscribe = onSnapshot(reqQ, (snapshot) => {
          const reqData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BorrowRequest));
          setRequests(reqData);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, reqPath);
        });

        return () => {
          unsubscribe();
          reqUnsubscribe();
        };
      } else {
        setItems([]);
        setRequests([]);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleShareItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      await addDoc(collection(db, 'sharedItems'), {
        ...newItem,
        ownerId: auth.currentUser.uid,
        location: { lat: 0, lng: 0 }, // Mock location
        status: 'available',
      });
      setShowShareModal(false);
      setNewItem({ name: '', description: '', terms: 'Return washed and in good condition.', status: 'available' });
    } catch (error) {
      console.error('Error sharing item:', error);
    }
  };

  const handleBorrowRequest = async (item: SharedItem) => {
    if (!auth.currentUser) return;

    try {
      await addDoc(collection(db, 'borrowRequests'), {
        itemId: item.id,
        borrowerId: auth.currentUser.uid,
        ownerId: item.ownerId,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending',
        termsAccepted: true,
      });
      alert('Borrow request sent! The owner will be notified.');
    } catch (error) {
      console.error('Error requesting borrow:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-orange-900 uppercase tracking-tight">Community Share</h2>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowShareModal(true)}
          className="bg-linear-to-r from-orange-400 to-rose-400 text-white px-4 py-2 rounded-2xl font-bold text-xs flex items-center gap-2 hover:from-orange-500 hover:to-rose-500 transition-all shadow-lg shadow-orange-200/50"
        >
          <Plus className="w-4 h-4" /> Share Item
        </motion.button>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search nearby items..."
            className="w-full bg-white border-2 border-orange-50 rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-orange-500 transition-all shadow-sm"
          />
        </div>
        <button className="p-3 bg-white border-2 border-orange-50 rounded-2xl hover:bg-orange-50 transition-colors">
          <Filter className="w-5 h-5 text-orange-600" />
        </button>
      </div>

      {/* Shared Items List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {items.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-[2rem] p-12 text-center border-4 border-dashed border-orange-100"
            >
              <div className="text-6xl mb-4">🤝</div>
              <h3 className="font-bold text-gray-900">No items shared yet!</h3>
              <p className="text-sm text-gray-500 mt-2">Be the first to share something with your neighbors.</p>
            </motion.div>
          ) : (
            items.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-[2.5rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-orange-50/50 hover:shadow-[0_20px_50px_rgba(249,115,22,0.08)] transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-3xl">
                    {item.name.toLowerCase().includes('tool') ? '🛠️' : '🍎'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-black text-gray-900 truncate">{item.name}</h3>
                      <span className={cn(
                        "text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg",
                        item.status === 'available' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                      )}>
                        {item.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                    
                    <div className="flex items-center gap-4 mt-4">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                        <MapPin className="w-3 h-3" /> 0.5 km away
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                        <ShieldCheck className="w-3 h-3" /> Terms Attached
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-50">
                  <button
                    onClick={() => handleBorrowRequest(item)}
                    disabled={item.status !== 'available' || item.ownerId === auth.currentUser?.uid}
                    className="flex-1 bg-linear-to-r from-orange-400 to-rose-400 text-white font-bold py-3 rounded-2xl hover:from-orange-500 hover:to-rose-500 transition-all shadow-lg shadow-orange-200/50 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <HandHelping className="w-4 h-4" /> Borrow Item
                  </button>
                  <button className="p-3 bg-orange-50 text-orange-500 rounded-2xl hover:bg-orange-500 hover:text-white transition-all">
                    <MessageCircle className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShareModal(false)}
              className="absolute inset-0 bg-orange-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[3rem] p-8 w-full max-w-md relative shadow-2xl border-4 border-orange-100"
            >
              <h2 className="text-2xl font-black text-orange-900 mb-6 flex items-center gap-2">
                <Share2 className="w-6 h-6" /> Share an Item
              </h2>
              
              <form onSubmit={handleShareItem} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Item Name</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Power Drill, Extra Flour"
                    value={newItem.name}
                    onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                    className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Description</label>
                  <textarea
                    placeholder="Tell your neighbors about it..."
                    value={newItem.description}
                    onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                    className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors h-24 resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Terms & Conditions</label>
                  <input
                    type="text"
                    value={newItem.terms}
                    onChange={e => setNewItem({ ...newItem, terms: e.target.value })}
                    className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowShareModal(false)}
                    className="flex-1 bg-gray-100 text-gray-500 font-bold py-4 rounded-2xl hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-linear-to-r from-orange-400 to-rose-400 text-white font-bold py-4 rounded-2xl hover:from-orange-500 hover:to-rose-500 transition-colors shadow-lg shadow-orange-200/50"
                  >
                    Share Now
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
