import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { InventoryItem, StorageLocation } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, Trash2, Calendar, MapPin, Camera, AlertTriangle, CheckCircle, ChevronRight, Filter, Sparkles, X, Loader2, FileText, ShoppingCart, Bell, Info, Mic, MicOff } from 'lucide-react';
import { cn, formatDate, getExpiryStatus, handleFirestoreError, OperationType } from '../lib/utils';
import { Html5Qrcode } from 'html5-qrcode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function Storage3D({ type, name, isOpen }: { type: string, name: string, isOpen: boolean }) {
  const getIcon = () => {
    switch (type) {
      case 'fridge': return '❄️';
      case 'pantry': return '🥫';
      case 'freezer': return '🧊';
      case 'shelf': return '📚';
      default: return '📦';
    }
  };

  return (
    <div className="relative w-32 h-40 perspective-1000 group cursor-pointer">
      {/* 3D Box Container */}
      <div className="relative w-full h-full preserve-3d">
        {/* Door (Front Face) */}
        <motion.div
          animate={{ rotateY: isOpen ? -110 : 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 100 }}
          className="absolute inset-0 rounded-xl border-4 flex flex-col items-center justify-center shadow-2xl backface-hidden origin-left z-30"
          style={{ 
            backgroundColor: type === 'fridge' ? "#f0f9ff" : "#fff7ed",
            borderColor: type === 'fridge' ? "#bae6fd" : "#fed7aa"
          }}
        >
          <div className="text-4xl mb-2">{getIcon()}</div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{name}</p>
          {/* Handle */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-12 bg-gray-300 rounded-full shadow-inner" />
        </motion.div>

        {/* Left Side Face */}
        <div className="absolute left-0 top-0 w-4 h-full bg-gray-300 origin-left -rotate-y-90 z-20" />
        
        {/* Right Side Face */}
        <div className="absolute right-0 top-0 w-4 h-full bg-gray-300 origin-right rotate-y-90 z-20" />

        {/* Inside Face (Back) */}
        <div className="absolute inset-0 bg-gray-100 rounded-xl border-4 border-gray-200 shadow-inner flex items-center justify-center z-10">
          <div className="grid grid-cols-2 gap-1 p-2 opacity-40">
            <div className="w-8 h-8 bg-gray-300 rounded-md" />
            <div className="w-8 h-8 bg-gray-300 rounded-md" />
            <div className="w-8 h-8 bg-gray-300 rounded-md" />
            <div className="w-8 h-8 bg-gray-300 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useHousehold } from '../contexts/HouseholdContext';

export default function Inventory() {
  const { profile } = useHousehold();
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
  const [carouselItems, setCarouselItems] = useState<InventoryItem[]>([]);
  const [draggedItem, setDraggedItem] = useState<InventoryItem | null>(null);
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
      Return a JSON object with: name, quantity (number), unit (string), category (one of: Vegetables, Dairy, Meat, Fruit, Bakery, Pantry, Other), estimatedExpiryDays (number), macroCategory (one of: Carbohydrate, Protein, Fat, Fiber, Other), glycemicIndex (number).
      Example: "Add two liters of milk" -> {"name": "Milk", "quantity": 2, "unit": "liters", "category": "Dairy", "estimatedExpiryDays": 7, "macroCategory": "Protein", "glycemicIndex": 27}`;

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
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user && profile?.householdId) {
        const itemsPath = `households/${profile.householdId}/inventoryItems`;
        const qItems = query(collection(db, itemsPath));
        const unsubscribeItems = onSnapshot(qItems, (snapshot) => {
          const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
          setItems(itemsData);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, itemsPath);
        });

        const locsPath = `households/${profile.householdId}/storageLocations`;
        const qLocs = query(collection(db, locsPath));
        const unsubscribeLocs = onSnapshot(qLocs, (snapshot) => {
          const locsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StorageLocation));
          if (locsData.length === 0) {
            // Seed default locations if none exist
            const defaults: Partial<StorageLocation>[] = [
              { name: 'Fridge', type: 'fridge', householdId: profile.householdId! },
              { name: 'Pantry', type: 'pantry', householdId: profile.householdId! },
              { name: 'Freezer', type: 'freezer', householdId: profile.householdId! },
            ];
            defaults.forEach(d => addDoc(collection(db, locsPath), d));
          }
          setLocations(locsData);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, locsPath);
        });

        return () => {
          unsubscribeItems();
          unsubscribeLocs();
        };
      } else {
        setItems([]);
        setLocations([]);
      }
    });

    return () => unsubscribeAuth();
  }, [profile?.householdId]);

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !profile?.householdId) return;
    try {
      await addDoc(collection(db, `households/${profile.householdId}/storageLocations`), {
        ...newLocation,
        householdId: profile.householdId,
      });
      setShowLocationModal(false);
      setNewLocation({ name: '', type: 'fridge' });
    } catch (error) {
      console.error('Error adding location:', error);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (activeTab === id) setActiveTab('all');
    if (!profile?.householdId) return;
    try {
      await deleteDoc(doc(db, `households/${profile.householdId}/storageLocations`, id));
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
        contents: [{ role: 'user', parts: [{ text: `Identify the product with barcode ${barcode}. Return a JSON object with 'name', 'category' (one of: Vegetables, Dairy, Meat, Fruits, Pantry), 'quantity' (number), 'unit', 'estimatedExpiryDays' (number), 'lowStockThreshold' (number, default to 1), 'macroCategory' (one of: Carbohydrate, Protein, Fat, Fiber, Other), 'glycemicIndex' (number).` }] }],
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
              macroCategory: { type: "string" },
              glycemicIndex: { type: "number" },
            },
            required: ['name', 'category', 'quantity', 'unit', 'macroCategory', 'glycemicIndex'],
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
          ? "Analyze this grocery receipt. Extract all food items. For each item, return a JSON object with 'name', 'category' (one of: Vegetables, Dairy, Meat, Fruits, Pantry), 'quantity' (number), 'unit', 'estimatedExpiryDays' (number), 'lowStockThreshold' (number, default to 1), 'macroCategory' (one of: Carbohydrate, Protein, Fat, Fiber, Other), 'glycemicIndex' (number). Return an array of these objects."
          : "Identify the food items in this photo. Return a JSON object with 'name', 'category' (one of: Vegetables, Dairy, Meat, Fruits, Pantry), 'quantity' (number), 'unit', 'estimatedExpiryDays' (number), 'lowStockThreshold' (number, default to 1), 'macroCategory' (one of: Carbohydrate, Protein, Fat, Fiber, Other), 'glycemicIndex' (number). If multiple items, just pick the most prominent one.";

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
                  macroCategory: { type: "string" },
                  glycemicIndex: { type: "number" },
                },
                required: ['name', 'category', 'quantity', 'unit', 'macroCategory', 'glycemicIndex'],
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
                macroCategory: { type: "string" },
                glycemicIndex: { type: "number" },
              },
              required: ['name', 'category', 'quantity', 'unit', 'macroCategory', 'glycemicIndex'],
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
  const [isAiConsuming, setIsAiConsuming] = useState(false);
  const consumeFileInputRef = useRef<HTMLInputElement>(null);

  const handleVisualConsume = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !showConsumeModal) return;

    const item = items.find(i => i.id === showConsumeModal);
    if (!item) return;

    setIsAiConsuming(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        
        const prompt = `Look at this photo of ${item.name}. Estimate the REMAINING quantity left in the container. 
        The unit of measurement is ${item.unit}. 
        Return a JSON object with 'remainingQuantity' (number) and a brief 'reasoning' (string).
        Be as accurate as possible based on the visual evidence.`;

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
            responseSchema: {
              type: "object",
              properties: {
                remainingQuantity: { type: "number" },
                reasoning: { type: "string" },
              },
              required: ['remainingQuantity'],
            } as any,
          },
        });

        const response = await result.response;
        const data = JSON.parse(response.text() || '{}');
        
        if (data.remainingQuantity !== undefined) {
          await handleUpdateQuantity(showConsumeModal, data.remainingQuantity);
          alert(`Chef Buddy estimated ${data.remainingQuantity} ${item.unit} remaining. ${data.reasoning || ''}`);
          setShowConsumeModal(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("AI Consumption Scan error:", error);
      alert("Chef Buddy couldn't quite see how much is left. Try manual entry!");
    } finally {
      setIsAiConsuming(false);
    }
  };

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
    if (!auth.currentUser || scannedItems.length === 0 || !profile?.householdId) return;
    
    try {
      const batch = writeBatch(db);
      scannedItems.forEach(item => {
        const docRef = doc(collection(db, `households/${profile.householdId}/inventoryItems`));
        batch.set(docRef, {
          ...item,
          householdId: profile.householdId,
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
    if (!auth.currentUser || !profile?.householdId) return;

    try {
      await addDoc(collection(db, `households/${profile.householdId}/inventoryItems`), {
        ...newItem,
        householdId: profile.householdId,
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
        expiryDate: new Date().toISOString().split('T')[0],
        macroCategory: 'Other',
        glycemicIndex: 0
      });
      setLastAction('add');
      setTimeout(() => setLastAction(null), 500);
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const autoFillItemInfo = async (name: string) => {
    if (!name || name.length < 3) return;
    setIsAiScanning(true);
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Provide nutritional info for "${name}". 
      Return a JSON object with: category (one of: Vegetables, Dairy, Meat, Fruit, Bakery, Pantry, Other), macroCategory (one of: Carbohydrate, Protein, Fat, Fiber, Other), glycemicIndex (number), estimatedExpiryDays (number).`;

      const result = await model.generateContent(prompt);
      const data = JSON.parse(result.response.text().replace(/```json|```/g, ''));
      
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (data.estimatedExpiryDays || 7));

      setNewItem(prev => ({
        ...prev,
        category: data.category || prev.category,
        macroCategory: data.macroCategory || 'Other',
        glycemicIndex: data.glycemicIndex || 0,
        expiryDate: expiryDate.toISOString().split('T')[0]
      }));
    } catch (error) {
      console.error("Auto-fill error:", error);
    } finally {
      setIsAiScanning(false);
    }
  };

  const handleUpdateQuantity = async (id: string, newQuantity: number) => {
    if (newQuantity < 0 || !profile?.householdId) return;
    try {
      if (newQuantity === 0) {
        // If quantity is 0, we could delete or just keep it at 0. 
        // For now, let's just update it and let the user decide to delete.
        await updateDoc(doc(db, `households/${profile.householdId}/inventoryItems`, id), {
          quantity: 0
        });
        setLastAction('delete');
      } else {
        await updateDoc(doc(db, `households/${profile.householdId}/inventoryItems`, id), {
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
    if (!profile?.householdId) return;
    try {
      await deleteDoc(doc(db, `households/${profile.householdId}/inventoryItems`, id));
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
      <div className="flex items-center gap-6 overflow-x-auto pb-8 scrollbar-hide px-2">
        <div className="flex flex-col items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTab('all')}
            className={cn(
              'relative transition-all',
              activeTab === 'all' ? 'scale-110' : 'opacity-60 grayscale hover:opacity-100 hover:grayscale-0'
            )}
          >
            <Storage3D type="other" name="All" isOpen={activeTab === 'all'} />
          </motion.button>
        </div>

        {locations.map((loc) => (
          <div key={loc.id} className="flex flex-col items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab(loc.id)}
              className={cn(
                'relative transition-all',
                activeTab === loc.id ? 'scale-110' : 'opacity-60 grayscale hover:opacity-100 hover:grayscale-0'
              )}
            >
              <Storage3D type={loc.type} name={loc.name} isOpen={activeTab === loc.id} />
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc.id); }}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg z-30"
              >
                <X className="w-3 h-3" />
              </motion.button>
            </motion.button>
          </div>
        ))}

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowLocationModal(true)}
          className="w-32 h-40 rounded-2xl border-4 border-dashed border-orange-200 flex flex-col items-center justify-center text-orange-300 hover:border-orange-400 hover:text-orange-400 transition-all shrink-0"
        >
          <Plus className="w-8 h-8 mb-2" />
          <span className="text-[10px] font-black uppercase tracking-widest">Add Space</span>
        </motion.button>
      </div>

      {/* Item Carousel Staging Area */}
      <div className="bg-white/50 backdrop-blur-md rounded-[3rem] p-6 border-4 border-orange-50 shadow-inner">
        <div className="flex items-center justify-between mb-4 px-4">
          <h3 className="text-xs font-black text-orange-400 uppercase tracking-[0.2em]">Quick Access Carousel</h3>
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-200" />
            <div className="w-2 h-2 rounded-full bg-orange-100" />
          </div>
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-2">
          {items.slice(0, 10).map((item) => (
            <motion.div
              key={item.id}
              drag
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0.1}
              onDragStart={() => setDraggedItem(item)}
              onDragEnd={(e, info) => {
                setDraggedItem(null);
                // Logic for "pulling" into sections could be based on drop zones
                if (info.offset.y > 100) {
                  setShowConsumeModal(item.id);
                } else if (info.offset.y < -100) {
                  setShowAddModal(true);
                  setNewItem(item);
                }
              }}
              whileHover={{ scale: 1.05, rotate: 2 }}
              whileDrag={{ scale: 1.1, zIndex: 100 }}
              className="w-24 h-24 bg-white rounded-2xl shadow-lg border-2 border-orange-50 flex flex-col items-center justify-center p-2 shrink-0 cursor-grab active:cursor-grabbing"
            >
              <span className="text-2xl mb-1">
                {item.category === 'Vegetables' ? '🥦' : item.category === 'Dairy' ? '🥛' : item.category === 'Meat' ? '🥩' : '📦'}
              </span>
              <p className="text-[10px] font-bold text-gray-900 truncate w-full text-center">{item.name}</p>
              <div className="mt-1 px-1.5 py-0.5 bg-orange-50 rounded-full">
                <p className="text-[8px] font-black text-orange-500 uppercase">{item.macroCategory || 'Other'}</p>
              </div>
            </motion.div>
          ))}
          {items.length === 0 && (
            <div className="w-full py-4 text-center text-xs font-bold text-gray-400 italic">
              Add items to see them in the carousel
            </div>
          )}
        </div>
        <p className="text-[9px] text-center text-gray-400 font-bold uppercase tracking-widest mt-2">
          Drag down to consume • Drag up to restock
        </p>
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
                <defs>
                  <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#fca5a5" stopOpacity={0.8}/>
                  </linearGradient>
                  <linearGradient id="gradOrange" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fb923c" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#fdba74" stopOpacity={0.8}/>
                  </linearGradient>
                  <linearGradient id="gradYellow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#fcd34d" stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
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
                      fill={entry.count > 0 ? (index === 0 ? 'url(#gradRed)' : index < 3 ? 'url(#gradOrange)' : 'url(#gradYellow)') : '#f3f4f6'} 
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
          className="bg-linear-to-br from-orange-300 via-rose-300 to-amber-200 rounded-[2.5rem] p-6 text-white shadow-xl shadow-orange-100/50 relative overflow-hidden"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-white" />
              <h3 className="text-lg font-black uppercase tracking-tight text-white">Expiring Soon</h3>
            </div>
            
            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {expiringSoonItems.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-bold text-white/90">All good! No items expiring in the next 3 days.</p>
                </div>
              ) : (
                expiringSoonItems.map((item) => {
                  const expiry = new Date(item.expiryDate!);
                  const diff = Math.ceil((expiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={item.id} className="bg-white/30 backdrop-blur-md p-3 rounded-2xl flex items-center justify-between border border-white/30">
                      <div className="min-w-0">
                        <p className="font-bold truncate text-sm text-white">{item.name}</p>
                        <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">
                          {diff === 0 ? 'Expires Today' : diff === 1 ? 'Expires Tomorrow' : `In ${diff} days`}
                        </p>
                      </div>
                      <div className="bg-white/90 text-orange-600 px-2 py-1 rounded-lg text-[10px] font-black shadow-sm">
                        {item.quantity} {item.unit}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          {/* Decorative background circle */}
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-white/20 rounded-full blur-3xl" />
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-orange-200/20 rounded-full blur-2xl" />
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
            className={cn(
              'p-6 rounded-[2.5rem] flex flex-col items-center justify-center text-center transition-all hover:scale-105 shadow-xl border-4 border-white',
              stat.color
            )}
          >
            <span className="text-3xl font-black mb-1">{stat.value}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">{stat.label}</span>
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
                    <motion.button 
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowAddModal(true)}
                      className="mt-6 bg-orange-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200"
                    >
                      Add First Item
                    </motion.button>
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
                            <span className={cn(
                              "text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest",
                              item.macroCategory === 'Protein' ? "bg-red-100 text-red-600" :
                              item.macroCategory === 'Carbohydrate' ? "bg-blue-100 text-blue-600" :
                              item.macroCategory === 'Fat' ? "bg-yellow-100 text-yellow-600" :
                              item.macroCategory === 'Fiber' ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-600"
                            )}>
                              {item.macroCategory || 'Other'}
                            </span>
                            {item.glycemicIndex !== undefined && (
                              <span className="text-[8px] font-bold text-gray-400">GI: {item.glycemicIndex}</span>
                            )}
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
                          <motion.button 
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-5 h-5" />
                          </motion.button>
                          {item.quantity === 0 && (
                            <motion.button 
                              whileTap={{ scale: 0.9 }}
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
                            </motion.button>
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
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">How much did you use?</label>
                    <button
                      type="button"
                      onClick={() => consumeFileInputRef.current?.click()}
                      className="flex items-center gap-1 text-[10px] font-black text-orange-500 uppercase tracking-widest hover:bg-orange-50 px-2 py-1 rounded-lg transition-all"
                    >
                      <Camera className="w-3 h-3" /> Visual Estimate
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      ref={consumeFileInputRef}
                      onChange={handleVisualConsume}
                    />
                  </div>
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
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setShowConsumeModal(null)}
                    className="bg-gray-100 text-gray-500 font-bold py-4 rounded-2xl hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    className="bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200"
                  >
                    Confirm
                  </motion.button>
                </div>
              </form>

              {isAiConsuming && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-[3rem] z-50">
                  <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
                  <p className="font-bold text-orange-900">Chef Buddy is estimating...</p>
                </div>
              )}
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
                      <motion.button
                        whileTap={{ scale: 0.95 }}
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
                      </motion.button>
                    ))}
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 mt-4"
                >
                  Create Storage
                </motion.button>
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
                      onBlur={(e) => autoFillItemInfo(e.target.value)}
                      className="w-full bg-gray-50 border-2 border-orange-50 rounded-2xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
                    />
                  </div>

                  {newItem.macroCategory && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-2 p-3 bg-orange-50 rounded-2xl border border-orange-100"
                    >
                      <Sparkles className="w-4 h-4 text-orange-500" />
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-orange-900 uppercase tracking-widest">Chef Buddy's Insight</p>
                        <p className="text-xs text-orange-700 font-medium">
                          {newItem.name} is a <span className="font-bold">{newItem.macroCategory}</span> with a Glycemic Index of <span className="font-bold">{newItem.glycemicIndex}</span>.
                        </p>
                      </div>
                    </motion.div>
                  )}

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
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="flex-1 bg-gray-100 text-gray-500 font-bold py-4 rounded-2xl hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      type="submit"
                      className="flex-1 bg-orange-500 text-white font-bold py-4 rounded-2xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200"
                    >
                      Save Item
                    </motion.button>
                  </div>
                </form>
              )}

              <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-3 gap-2">
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setScannerMode('barcode');
                    setShowScanner(true);
                    setShowAddModal(false);
                  }}
                  className="flex flex-col items-center gap-1 text-orange-600 font-bold text-[10px] uppercase tracking-wider hover:bg-orange-50 p-2 rounded-xl transition-colors"
                >
                  <Camera className="w-5 h-5" /> Barcode
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setScannerMode('photo');
                    fileInputRef.current?.click();
                  }}
                  className="flex flex-col items-center gap-1 text-orange-600 font-bold text-[10px] uppercase tracking-wider hover:bg-orange-50 p-2 rounded-xl transition-colors"
                >
                  <Sparkles className="w-5 h-5" /> AI Photo
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setScannerMode('receipt');
                    fileInputRef.current?.click();
                  }}
                  className="flex flex-col items-center gap-1 text-orange-600 font-bold text-[10px] uppercase tracking-wider hover:bg-orange-50 p-2 rounded-xl transition-colors"
                >
                  <FileText className="w-5 h-5" /> Receipt
                </motion.button>
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
