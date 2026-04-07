import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { InventoryItem, StorageLocation } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, Trash2, Calendar, MapPin, Camera, AlertTriangle, CheckCircle, ChevronRight, Filter, Sparkles, X, Loader2, FileText, ShoppingCart, Bell, Info, Mic, MicOff } from 'lucide-react';
import { cn, formatDate, getExpiryStatus } from '../lib/utils';
import { Html5Qrcode } from 'html5-qrcode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: '', type: 'fridge' as const });
  const [isDoorOpen, setIsDoorOpen] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<'barcode' | 'photo' | 'receipt'>('barcode');
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<Partial<InventoryItem>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: '',
    category: 'Vegetables',
    quantity: 1,
    unit: 'pcs',
    lowStockThreshold: 1,
    storageLocationId: '',
    expiryDate: new Date().toISOString().split('T')[0],
  });
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'warning' | 'info' }[]>([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        setIsListening(false);
        await processVoiceCommand(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  const processVoiceCommand = async (text: string) => {
    setIsAiScanning(true);
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Extract food item details from this voice command: "${text}". 
      Return a JSON object with: name, quantity (number), unit (string), category (one of: Vegetables, Dairy, Meat, Fruit, Bakery, Pantry, Other), estimatedExpiryDays (number).
      Example: "Add two liters of milk" -> {"name": "Milk", "quantity": 2, "unit": "liters", "category": "Dairy", "estimatedExpiryDays": 7}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const data = JSON.parse(response.text().replace(/```json|```/g, ''));

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (data.estimatedExpiryDays || 7));

      setNewItem({
        name: data.name || '',
        category: data.category || 'Other',
        quantity: data.quantity || 1,
        unit: data.unit || 'pcs',
        lowStockThreshold: 1,
        storageLocationId: newItem.storageLocationId || (activeTab === 'all' ? (locations[0]?.id || '') : activeTab),
        expiryDate: expiryDate.toISOString().split('T')[0],
      });
      
      // Auto-open modal if not open
      if (!showAddModal) setShowAddModal(true);
    } catch (error) {
      console.error("Voice processing error:", error);
    } finally {
      setIsAiScanning(false);
    }
  };

  const expiringSoonItems = useMemo(() => {
    const now = new Date();
    return items.filter(item => {
      if (!item.expiryDate) return false;
      const expiry = new Date(item.expiryDate);
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 3;
    }).sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime());
  }, [items]);

  const chartData = useMemo(() => {
    const data: { name: string; count: number }[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const count = items.filter(item => item.expiryDate === dateStr).length;
      data.push({
        name: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' }),
        count
      });
    }
    return data;
  }, [items]);

  useEffect(() => {
    const newNotifications: { id: string; message: string; type: 'warning' | 'info' }[] = [];

    if (expiringSoonItems.length > 0) {
      expiringSoonItems.forEach(item => {
        newNotifications.push({
          id: `expiry-${item.id}`,
          message: `${item.name} is expiring soon (${formatDate(item.expiryDate!)})`,
          type: 'warning'
        });
      });
    }

    const lowStockItems = items.filter(i => (i.quantity || 0) <= (i.lowStockThreshold || 1));
    if (lowStockItems.length > 0) {
      lowStockItems.forEach(item => {
        newNotifications.push({
          id: `lowstock-${item.id}`,
          message: `${item.name} is running low (${item.quantity} ${item.unit} left)`,
          type: 'info'
        });
      });
    }

    if (newNotifications.length > 0) {
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const uniqueNew = newNotifications.filter(n => !existingIds.has(n.id));
        return [...prev, ...uniqueNew];
      });
    }
  }, [expiringSoonItems, items]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const qItems = query(collection(db, 'households', 'default-household', 'inventoryItems'));
    const unsubscribeItems = onSnapshot(qItems, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setItems(itemsData);
    });

    const qLocs = query(collection(db, 'households', 'default-household', 'storageLocations'));
    const unsubscribeLocs = onSnapshot(qLocs, (snapshot) => {
      const locsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StorageLocation));
      if (locsData.length === 0) {
        // Seed default locations if none exist
        const defaults: Partial<StorageLocation>[] = [
          { name: 'Fridge', type: 'fridge', householdId: 'default-household' },
          { name: 'Pantry', type: 'pantry', householdId: 'default-household' },
          { name: 'Freezer', type: 'freezer', householdId: 'default-household' },
        ];
        defaults.forEach(d => addDoc(collection(db, 'households', 'default-household', 'storageLocations'), d));
      }
      setLocations(locsData);
    });

    return () => {
      unsubscribeItems();
      unsubscribeLocs();
    };
  }, []);

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'households', 'default-household', 'storageLocations'), {
        ...newLocation,
        householdId: 'default-household',
      });
      setShowLocationModal(false);
      setNewLocation({ name: '', type: 'fridge' });
    } catch (error) {
      console.error('Error adding location:', error);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (activeTab === id) setActiveTab('all');
    try {
      await deleteDoc(doc(db, 'households', 'default-household', 'storageLocations', id));
    } catch (error) {
      console.error('Error deleting location:', error);
    }
  };

  useEffect(() => {
    // Animate door when switching tabs
    setIsDoorOpen(false);
    const timer = setTimeout(() => setIsDoorOpen(true), 400);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const [isScannerLoading, setIsScannerLoading] = useState(false);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let isMounted = true;

    const startScanner = async () => {
      if (showScanner && scannerMode === 'barcode') {
        setIsScannerLoading(true);
        // Small delay to ensure the DOM element #reader is rendered
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!isMounted) return;

        try {
          html5QrCode = new Html5Qrcode("reader", { verbose: false });
          const config = { 
            fps: 20, 
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const qrboxWidth = Math.floor(minEdge * 0.8);
              const qrboxHeight = Math.floor(qrboxWidth * 0.6); // Rectangular for barcodes
              return {
                width: qrboxWidth,
                height: qrboxHeight
              };
            },
          };
          
          await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              if (isMounted) {
                handleBarcodeDetected(decodedText);
                html5QrCode?.stop().then(() => {
                  if (isMounted) setShowScanner(false);
                }).catch(err => console.error("Stop error:", err));
              }
            },
            (errorMessage) => {
              // Ignore frequent error messages
            }
          );
        } catch (err) {
          console.error("Scanner error:", err);
        } finally {
          if (isMounted) setIsScannerLoading(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (html5QrCode?.isScanning) {
        html5QrCode.stop().catch(err => console.error("Stop error:", err));
      }
    };
  }, [showScanner, scannerMode]);

  const handleBarcodeDetected = async (barcode: string) => {
    setIsAiScanning(true);
    setScannedItems([]);
    setShowAddModal(true);
    
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: `Identify the product with barcode ${barcode}. Return a JSON object with 'name', 'category' (one of: Vegetables, Dairy, Meat, Fruits, Pantry), 'quantity' (number), 'unit', 'estimatedExpiryDays' (number), and 'lowStockThreshold' (number, default to 1).` }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
              category: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              estimatedExpiryDays: { type: "number" },
              lowStockThreshold: { type: "number" },
            },
            required: ['name', 'category', 'quantity', 'unit'],
          } as any,
        },
      });

      const response = await result.response;
      const data = JSON.parse(response.text() || '{}');
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (data.estimatedExpiryDays || 7));

      setNewItem({
        name: data.name || `Item ${barcode}`,
        category: data.category || 'Vegetables',
        quantity: data.quantity || 1,
        unit: data.unit || 'pcs',
        lowStockThreshold: data.lowStockThreshold || 1,
        expiryDate: expiryDate.toISOString().split('T')[0],
        barcode
      });
    } catch (error) {
      console.error("Barcode identification error:", error);
      setNewItem(prev => ({ ...prev, barcode, name: `Item ${barcode}` }));
    } finally {
      setIsAiScanning(false);
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAiScanning(true);
    setShowScanner(false);
    setShowAddModal(true);
    setScannedItems([]);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        
        const isReceipt = scannerMode === 'receipt';
        const prompt = isReceipt 
          ? "Analyze this grocery receipt. Extract all food items. For each item, return a JSON object with 'name', 'category' (one of: Vegetables, Dairy, Meat, Fruits, Pantry), 'quantity' (number), 'unit', 'estimatedExpiryDays' (number), and 'lowStockThreshold' (number, default to 1). Return an array of these objects."
          : "Identify the food items in this photo. Return a JSON object with 'name', 'category' (one of: Vegetables, Dairy, Meat, Fruits, Pantry), 'quantity' (number), 'unit', 'estimatedExpiryDays' (number), and 'lowStockThreshold' (number, default to 1). If multiple items, just pick the most prominent one.";

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: file.type,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: (isReceipt ? {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  category: { type: "string" },
                  quantity: { type: "number" },
                  unit: { type: "string" },
                  estimatedExpiryDays: { type: "number" },
                  lowStockThreshold: { type: "number" },
                },
                required: ['name', 'category', 'quantity', 'unit'],
              }
            } : {
              type: "object",
              properties: {
                name: { type: "string" },
                category: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
                estimatedExpiryDays: { type: "number" },
                lowStockThreshold: { type: "number" },
              },
              required: ['name', 'category', 'quantity', 'unit'],
            }) as any,
          },
        });

        const response = await result.response;
        const data = JSON.parse(response.text() || (isReceipt ? '[]' : '{}'));
        
        if (isReceipt) {
          const items = (data as any[]).map(item => {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + (item.estimatedExpiryDays || 7));
            return {
              ...item,
              expiryDate: expiryDate.toISOString().split('T')[0]
            };
          });
          setScannedItems(items);
        } else {
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + (data.estimatedExpiryDays || 7));

          setNewItem({
            name: data.name || '',
            category: data.category || 'Vegetables',
            quantity: data.quantity || 1,
            unit: data.unit || 'pcs',
            lowStockThreshold: data.lowStockThreshold || 1,
            expiryDate: expiryDate.toISOString().split('T')[0],
          });
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("AI Scan error:", error);
    } finally {
      setIsAiScanning(false);
    }
  };

  const [showConsumeModal, setShowConsumeModal] = useState<string | null>(null);
  const [consumeAmount, setConsumeAmount] = useState<number>(1);
  const [lastAction, setLastAction] = useState<'add' | 'delete' | null>(null);

  const handleConsume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showConsumeModal) return;
    const item = items.find(i => i.id === showConsumeModal);
    if (!item) return;

    const newQuantity = Math.max(0, (item.quantity || 0) - consumeAmount);
    await handleUpdateQuantity(showConsumeModal, newQuantity);
    setShowConsumeModal(null);
    setConsumeAmount(1);
  };

  const handleAddScannedItems = async () => {
    if (!auth.currentUser || scannedItems.length === 0) return;
    
    try {
      const batch = writeBatch(db);
      scannedItems.forEach(item => {
        const docRef = doc(collection(db, 'households', 'default-household', 'inventoryItems'));
        batch.set(docRef, {
          ...item,
          householdId: 'default-household',
          storageLocationId: newItem.storageLocationId || (activeTab === 'all' ? (locations[0]?.id || 'fridge') : activeTab),
        });
      });
      await batch.commit();
      setShowAddModal(false);
      setScannedItems([]);
      setLastAction('add');
      setTimeout(() => setLastAction(null), 500);
    } catch (error) {
      console.error("Error adding scanned items:", error);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      await addDoc(collection(db, 'households', 'default-household', 'inventoryItems'), {
        ...newItem,
        householdId: 'default-household',
        storageLocationId: newItem.storageLocationId || (activeTab === 'all' ? (locations[0]?.id || 'fridge') : activeTab),
      });
      setShowAddModal(false);
      setNewItem({ 
        name: '', 
        category: 'Vegetables', 
        quantity: 1, 
        unit: 'pcs', 
        lowStockThreshold: 1, 
        storageLocationId: '',
        expiryDate: new Date().toISOString().split('T')[0] 
      });
      setLastAction('add');
      setTimeout(() => setLastAction(null), 500);
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const handleUpdateQuantity = async (id: string, newQuantity: number) => {
    if (newQuantity < 0) return;
    try {
      if (newQuantity === 0) {
        // If quantity is 0, we could delete or just keep it at 0. 
        // For now, let's just update it and let the user decide to delete.
        await updateDoc(doc(db, 'households', 'default-household', 'inventoryItems', id), {
          quantity: 0
        });
        setLastAction('delete');
      } else {
        await updateDoc(doc(db, 'households', 'default-household', 'inventoryItems', id), {
          quantity: newQuantity
        });
        setLastAction(newQuantity > items.find(i => i.id === id)!.quantity ? 'add' : 'delete');
      }
      setTimeout(() => setLastAction(null), 500);
    } catch (error) {
      console.error('Error updating quantity:', error);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'households', 'default-household', 'inventoryItems', id));
      setLastAction('delete');
      setTimeout(() => setLastAction(null), 500);
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const filteredItems = activeTab === 'all' 
    ? items 
    : items.filter(item => item.storageLocationId === activeTab);

  return (
    <div className="space-y-6">
      {/* Notifications */}
      <div className="fixed top-20 right-4 z-[150] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              className={cn(
                "pointer-events-auto p-4 rounded-2xl shadow-xl border-2 flex items-center gap-3 min-w-[280px] max-w-sm",
                notif.type === 'warning' ? "bg-orange-50 border-orange-200 text-orange-900" : "bg-blue-50 border-blue-200 text-blue-900"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                notif.type === 'warning' ? "bg-orange-200 text-orange-600" : "bg-blue-200 text-blue-600"
              )}>
                {notif.type === 'warning' ? <AlertTriangle className="w-6 h-6" /> : <Bell className="w-6 h-6" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold leading-tight">{notif.message}</p>
              </div>
              <button 
                onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                className="p-1 hover:bg-black/5 rounded-lg"
              >
                <X className="w-4 h-4 opacity-50" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Categories Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm transition-all whitespace-nowrap border-2',
            activeTab === 'all'
              ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200'
              : 'bg-white border-orange-100 text-gray-500 hover:border-orange-300'
          )}
        >
          <span>🏠</span>
          All
        </button>
        {locations.map((loc) => (
          <div key={loc.id} className="relative group">
            <button
              onClick={() => setActiveTab(loc.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm transition-all whitespace-nowrap border-2',
                activeTab === loc.id
                  ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200'
                  : 'bg-white border-orange-100 text-gray-500 hover:border-orange-300'
              )}
            >
              <span>{loc.type === 'fridge' ? '❄️' : loc.type === 'pantry' ? '🥫' : loc.type === 'freezer' ? '🧊' : loc.type === 'shelf' ? '📚' : '📦'}</span>
              {loc.name}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc.id); }}
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setShowLocationModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm transition-all whitespace-nowrap border-2 border-dashed border-orange-200 text-orange-400 hover:border-orange-400 hover:text-orange-500"
        >
          <Plus className="w-4 h-4" />
          Add Location
        </button>
      </div>

      {/* Visual Representation & Expiring Soon */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expiry Chart */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-white rounded-[2.5rem] p-6 border-4 border-orange-50 shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-black text-orange-900 uppercase tracking-tight">Expiry Forecast</h3>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Next 7 Days</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-orange-600" />
            </div>
          </div>
          
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 'bold', fill: '#9ca3af' }}
                />
                <Tooltip 
                  cursor={{ fill: '#fff7ed' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white p-3 rounded-2xl shadow-xl border-2 border-orange-100">
                          <p className="text-xs font-black text-orange-900">{payload[0].payload.name}</p>
                          <p className="text-sm font-bold text-orange-500">{payload[0].value} items expiring</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[8, 8, 8, 8]}>
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.count > 0 ? (index === 0 ? '#ef4444' : index < 3 ? '#f97316' : '#f59e0b') : '#f3f4f6'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Expiring Soon List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-orange-500 rounded-[2.5rem] p-6 text-white shadow-xl shadow-orange-200 relative overflow-hidden"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-lg font-black uppercase tracking-tight">Expiring Soon</h3>
            </div>
            
            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {expiringSoonItems.length === 0 ? (
                <div className="py-8 text-center opacity-80">
                  <p className="text-sm font-bold">All good! No items expiring in the next 3 days.</p>
                </div>
              ) : (
                expiringSoonItems.map((item) => {
                  const expiry = new Date(item.expiryDate!);
                  const diff = Math.ceil((expiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={item.id} className="bg-white/20 backdrop-blur-md p-3 rounded-2xl flex items-center justify-between border border-white/20">
                      <div className="min-w-0">
                        <p className="font-bold truncate text-sm">{item.name}</p>
                        <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">
                          {diff === 0 ? 'Expires Today' : diff === 1 ? 'Expires Tomorrow' : `In ${diff} days`}
                        </p>
                      </div>
                      <div className="bg-white text-orange-600 px-2 py-1 rounded-lg text-[10px] font-black">
                        {item.quantity} {item.unit}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          {/* Decorative background circle */}
          <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        </motion.div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Items', value: items.length, color: 'bg-blue-50 text-blue-600' },
          { label: 'Expiring Soon', value: items.filter(i => getExpiryStatus(i.expiryDate || '') === 'expiring-soon').length, color: 'bg-orange-50 text-orange-600' },
          { label: 'Expired', value: items.filter(i => getExpiryStatus(i.expiryDate || '') === 'expired').length, color: 'bg-red-50 text-red-600' },
          { label: 'Low Stock', value: items.filter(i => (i.quantity || 0) <= (i.lowStockThreshold || 1)).length, color: 'bg-yellow-50 text-yellow-600' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className={cn('p-4 rounded-3xl flex flex-col items-center justify-center text-center', stat.color)}
          >
            <span className="text-2xl font-black">{stat.value}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{stat.label}</span>
          </motion.div>
        ))}
      </div>

      {/* Inventory List */}
      <div className="space-y-3 relative">
        <div className="flex items-center justify-between px-2">
          <h2 className="font-black text-orange-900 text-lg uppercase tracking-tight">
            {activeTab === 'all' ? 'Your Inventory' : locations.find(l => l.id === activeTab)?.name || 'Inventory'}
          </h2>
          <button className="p-2 hover:bg-orange-100 rounded-full transition-colors">
            <Filter className="w-4 h-4 text-orange-600" />
          </button>
        </div>

        {/* Door Animation Container */}
        <div className="relative min-h-[400px]">
          <AnimatePresence mode="wait">
            {isDoorOpen ? (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, rotateY: -90, originX: 0 }}
                animate={{ 
                  opacity: 1, 
                  rotateY: 0, 
                  originX: 0,
                  scale: lastAction === 'add' ? [1, 1.02, 1] : lastAction === 'delete' ? [1, 0.98, 1] : 1
                }}
                exit={{ opacity: 0, rotateY: -90, originX: 0 }}
                transition={{ 
                  type: 'spring', 
                  damping: 20, 
                  stiffness: 100,
                  scale: { duration: 0.3 }
                }}
                className="space-y-3"
              >
                {filteredItems.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white rounded-[2rem] p-12 text-center border-4 border-dashed border-orange-100"
                  >
                    <div className="text-6xl mb-4">🛒</div>
                    <h3 className="font-bold text-gray-900">This area is empty!</h3>
                    <p className="text-sm text-gray-500 mt-2">Time to go shopping or add some items.</p>
                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="mt-6 bg-orange-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200"
                    >
                      Add First Item
                    </button>
                  </motion.div>
                ) : (
                  filteredItems.map((item) => {
                    const status = getExpiryStatus(item.expiryDate || '');
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -20, scale: 0.8 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5, y: 50 }}
                        className="bg-white rounded-3xl p-4 flex items-center gap-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-orange-50/50 hover:shadow-[0_20px_50px_rgba(249,115,22,0.1)] transition-all group"
                      >
                        <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-2xl">
                          {item.category === 'Vegetables' ? '🥦' : item.category === 'Dairy' ? '🥛' : item.category === 'Meat' ? '🥩' : '📦'}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900 truncate">{item.name}</h3>
                            {item.quantity === 0 ? (
                              <span className="bg-red-100 text-red-700 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter flex items-center gap-0.5">
                                <AlertTriangle className="w-2 h-2" /> Out of Stock
                              </span>
                            ) : (item.quantity || 0) <= (item.lowStockThreshold || 1) && (
                              <span className="bg-yellow-100 text-yellow-700 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter flex items-center gap-0.5">
                                <AlertTriangle className="w-2 h-2" /> Low Stock
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {locations.find(l => l.id === item.storageLocationId)?.name || 'Unknown'}
                            </span>
                            {item.expiryDate && (
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
                                status === 'expired' ? 'text-red-500' : status === 'expiring-soon' ? 'text-orange-500' : 'text-green-500'
                              )}>
                                <Calendar className="w-3 h-3" /> {formatDate(item.expiryDate)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-center bg-orange-50 rounded-2xl p-1 border border-orange-100">
                            <button 
                              onClick={() => handleUpdateQuantity(item.id, (item.quantity || 0) + 1)}
                              className="p-1 hover:bg-orange-200 rounded-xl transition-colors text-orange-600"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => {
                                setShowConsumeModal(item.id);
                                setConsumeAmount(1);
                              }}
                              className="text-center px-2 py-0.5 hover:bg-orange-100 rounded-lg transition-colors"
                            >
                              <p className="text-sm font-black text-orange-600 leading-none">{item.quantity}</p>
                              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{item.unit}</p>
                            </button>
                            <button 
                              onClick={() => handleUpdateQuantity(item.id, (item.quantity || 0) - 1)}
                              className="p-1 hover:bg-orange-200 rounded-xl transition-colors text-orange-600"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                          </div>
                          <button 
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                          {item.quantity === 0 && (
                            <button 
                              onClick={async () => {
                                await addDoc(collection(db, 'households', 'default-household', 'shoppingList'), {
                                  name: item.name,
                                  quantity: 1,
                                  unit: item.unit,
                                  status: 'pending',
                                  householdId: 'default-household',
                                  addedBy: auth.currentUser?.uid
                                });
                                // Optionally delete from inventory or keep as 0
                              }}
                              className="p-2 text-orange-500 hover:bg-orange-50 rounded-xl transition-all"
                              title="Add to Shopping List"
                            >
                              <ShoppingCart className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </motion.div>
            ) : (
              <motion.div
                key="door-closed"
                initial={{ opacity: 0, rotateY: 0 }}
                animate={{ opacity: 1, rotateY: 0 }}
                exit={{ opacity: 0, rotateY: 90, originX: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-orange-50 rounded-[3rem] border-4 border-orange-100 shadow-inner"
              >
                <div className="text-center">
                  <div className="w-24 h-48 bg-white rounded-xl border-4 border-orange-200 mx-auto relative shadow-lg">
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-12 bg-orange-200 rounded-full" />
                  </div>
                  <p className="mt-4 font-black text-orange-900 uppercase tracking-widest text-sm">Opening {locations.find(l => l.id === activeTab)?.name || 'Storage'}...</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Consume Modal */}
      <AnimatePresence>
        {showConsumeModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConsumeModal(null)}
              className="absolute inset-0 bg-orange-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[3rem] p-8 w-full max-w-sm relative shadow-2xl border-4 border-orange-100"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-orange-900">Consume</h2>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    {items.find(i => i.id === showConsumeModal)?.name}
                  </p>
                </div>
                <button onClick={() => setShowConsumeModal(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleConsume} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">How much did you use?</label>
                  <div className="flex items-center gap-4">
                    <input
                      required
                      type="number"
                      step="any"
                      min="0"
                      value={consumeAmount}
                      onChange={e => setConsumeAmount(parseFloat(e.target.value))}
                      className="flex-1 bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-4 text-2xl font-black text-orange-600 focus:outline-none focus:border-orange-500 transition-colors"
                    />
                    <span className="text-lg font-bold text-gray-500 uppercase">
                      {items.find(i => i.id === showConsumeModal)?.unit}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConsumeModal(null)}
                    className="bg-gray-100 text-gray-500 font-bold py-4 rounded-2xl hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200"
                  >
                    Confirm
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Location Modal */}
      <AnimatePresence>
        {showLocationModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLocationModal(false)}
              className="absolute inset-0 bg-orange-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[3rem] p-8 w-full max-w-md relative shadow-2xl border-4 border-orange-100"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-orange-900">Add Storage</h2>
                <button onClick={() => setShowLocationModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleAddLocation} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Location Name</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Main Fridge, Kitchen Pantry"
                    value={newLocation.name}
                    onChange={e => setNewLocation({ ...newLocation, name: e.target.value })}
                    className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'fridge', label: 'Fridge', icon: '❄️' },
                      { id: 'pantry', label: 'Pantry', icon: '🥫' },
                      { id: 'freezer', label: 'Freezer', icon: '🧊' },
                      { id: 'shelf', label: 'Shelf', icon: '📚' },
                      { id: 'other', label: 'Other', icon: '📦' },
                    ].map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setNewLocation({ ...newLocation, type: type.id as any })}
                        className={cn(
                          "flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all",
                          newLocation.type === type.id
                            ? "bg-orange-500 border-orange-500 text-white"
                            : "bg-gray-50 border-transparent text-gray-500 hover:bg-orange-50"
                        )}
                      >
                        <span className="text-xl">{type.icon}</span>
                        <span className="text-[10px] font-bold uppercase">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 mt-4"
                >
                  Create Storage
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Add Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-orange-500 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl shadow-orange-300 border-4 border-white z-40"
      >
        <Plus className="w-8 h-8" />
      </motion.button>

      {/* Add Item Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-orange-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[3rem] p-8 w-full max-w-md relative shadow-2xl border-4 border-orange-100"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-black text-orange-900">
                    {scannedItems.length > 0 ? 'Review Items' : 'Add Item'}
                  </h2>
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      isListening 
                        ? "bg-red-500 text-white animate-pulse" 
                        : "bg-orange-100 text-orange-600 hover:bg-orange-200"
                    )}
                    title="Add by voice"
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              {isListening && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 bg-orange-50 rounded-2xl border-2 border-orange-200 text-center"
                >
                  <p className="text-sm font-bold text-orange-800 animate-bounce">Listening...</p>
                  <p className="text-xs text-orange-600 mt-1">Try saying "Add three kilograms of apples"</p>
                </motion.div>
              )}

              {scannedItems.length > 0 ? (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {scannedItems.map((item, idx) => (
                    <div key={idx} className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-orange-900">{item.name}</p>
                        <p className="text-xs text-orange-600 font-medium">
                          {item.quantity} {item.unit} • {item.category}
                        </p>
                      </div>
                      <button 
                        onClick={() => setScannedItems(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-red-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-3 pt-4 sticky bottom-0 bg-white pb-2">
                    <button
                      onClick={() => setScannedItems([])}
                      className="flex-1 bg-gray-100 text-gray-500 font-bold py-4 rounded-2xl hover:bg-gray-200 transition-colors"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={handleAddScannedItems}
                      className="flex-1 bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-5 h-5" /> Add {scannedItems.length} Items
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAddItem} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Item Name</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Fresh Milk"
                      value={newItem.name}
                      onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                      className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Category</label>
                      <select
                        value={newItem.category}
                        onChange={e => setNewItem({ ...newItem, category: e.target.value })}
                        className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
                      >
                        <option>Vegetables</option>
                        <option>Dairy</option>
                        <option>Meat</option>
                        <option>Fruits</option>
                        <option>Pantry</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Expiry Date</label>
                      <input
                        type="date"
                        value={newItem.expiryDate}
                        onChange={e => setNewItem({ ...newItem, expiryDate: e.target.value })}
                        className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Quantity</label>
                      <input
                        type="number"
                        value={newItem.quantity}
                        onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                        className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Unit</label>
                      <input
                        type="text"
                        placeholder="pcs, kg, l"
                        value={newItem.unit}
                        onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                        className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Low Stock</label>
                      <input
                        type="number"
                        placeholder="1"
                        value={newItem.lowStockThreshold}
                        onChange={e => setNewItem({ ...newItem, lowStockThreshold: Number(e.target.value) })}
                        className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">Storage Location</label>
                    <select
                      value={newItem.storageLocationId || (activeTab === 'all' ? (locations[0]?.id || '') : activeTab)}
                      onChange={e => setNewItem({ ...newItem, storageLocationId: e.target.value })}
                      className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors appearance-none"
                    >
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="flex-1 bg-gray-100 text-gray-500 font-bold py-4 rounded-2xl hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200"
                    >
                      Save Item
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-3 gap-2">
                <button 
                  onClick={() => {
                    setScannerMode('barcode');
                    setShowScanner(true);
                    setShowAddModal(false);
                  }}
                  className="flex flex-col items-center gap-1 text-orange-600 font-bold text-[10px] uppercase tracking-wider hover:bg-orange-50 p-2 rounded-xl transition-colors"
                >
                  <Camera className="w-5 h-5" /> Barcode
                </button>
                <button 
                  onClick={() => {
                    setScannerMode('photo');
                    fileInputRef.current?.click();
                  }}
                  className="flex flex-col items-center gap-1 text-orange-600 font-bold text-[10px] uppercase tracking-wider hover:bg-orange-50 p-2 rounded-xl transition-colors"
                >
                  <Sparkles className="w-5 h-5" /> AI Photo
                </button>
                <button 
                  onClick={() => {
                    setScannerMode('receipt');
                    fileInputRef.current?.click();
                  }}
                  className="flex flex-col items-center gap-1 text-orange-600 font-bold text-[10px] uppercase tracking-wider hover:bg-orange-50 p-2 rounded-xl transition-colors"
                >
                  <FileText className="w-5 h-5" /> Receipt
                </button>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handlePhotoCapture}
                />
              </div>

              {isAiScanning && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-[3rem] z-50">
                  <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
                  <p className="font-bold text-orange-900">Chef Buddy is analyzing...</p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Scanner Modal */}
      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowScanner(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[2rem] p-6 w-full max-w-lg relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black text-orange-900">Scan Barcode</h2>
                <button onClick={() => setShowScanner(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>
              <div id="reader" className="w-full overflow-hidden rounded-2xl border-4 border-orange-100 bg-black min-h-[300px] relative">
                {isScannerLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-orange-900/20">
                    <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-2" />
                    <p className="text-orange-900 font-bold text-sm">Activating Camera...</p>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-32 border-2 border-orange-500/50 rounded-lg animate-pulse flex items-center justify-center">
                      <div className="w-full h-0.5 bg-orange-500/30 animate-scan"></div>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-center text-xs text-gray-500 mt-4 font-medium">
                Point your camera at a barcode to scan it automatically.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
