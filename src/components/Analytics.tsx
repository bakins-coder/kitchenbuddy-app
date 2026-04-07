import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { InventoryItem } from '../types';
import { motion } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { TrendingUp, Trash2, DollarSign, PieChart as PieChartIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';

export default function Analytics() {
  const [items, setItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const path = 'households/default-household/inventoryItems';
    const q = query(collection(db, path));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setItems(itemsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, []);

  const data = [
    { name: 'Mon', value: 12 },
    { name: 'Tue', value: 19 },
    { name: 'Wed', value: 15 },
    { name: 'Thu', value: 22 },
    { name: 'Fri', value: 30 },
    { name: 'Sat', value: 25 },
    { name: 'Sun', value: 18 },
  ];

  const categoryData = [
    { name: 'Vegetables', value: 40, color: '#22c55e' },
    { name: 'Dairy', value: 25, color: '#3b82f6' },
    { name: 'Meat', value: 20, color: '#ef4444' },
    { name: 'Pantry', value: 15, color: '#f59e0b' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-orange-900 uppercase tracking-tight">Kitchen Stats</h2>
        <div className="bg-white px-3 py-1 rounded-full border border-orange-100 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-500" />
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Weekly Report</span>
        </div>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Food Waste', value: '$42.50', icon: Trash2, color: 'text-red-600 bg-red-50', trend: '+12%', trendColor: 'text-red-500' },
          { label: 'Money Saved', value: '$128.00', icon: DollarSign, color: 'text-green-600 bg-green-50', trend: '+24%', trendColor: 'text-green-500' },
          { label: 'Items Consumed', value: '84', icon: PieChartIcon, color: 'text-blue-600 bg-blue-50', trend: '-5%', trendColor: 'text-blue-500' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-[2rem] p-6 shadow-sm border border-orange-50 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <div className={cn("p-3 rounded-2xl", card.color)}>
                <card.icon className="w-6 h-6" />
              </div>
              <div className={cn("flex items-center gap-1 text-[10px] font-black uppercase tracking-widest", card.trendColor)}>
                {card.trend.startsWith('+') ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {card.trend}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{card.label}</p>
              <p className="text-2xl font-black text-gray-900">{card.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Weekly Consumption Chart */}
      <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-orange-50">
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-black text-orange-900 uppercase tracking-tight">Weekly Consumption</h3>
          <div className="flex gap-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
              <span className="text-[8px] font-bold text-gray-400 uppercase">This Week</span>
            </div>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                dy={10}
              />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: '#fff7ed' }}
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
              />
              <Bar dataKey="value" fill="#f97316" radius={[10, 10, 10, 10]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-orange-50">
          <h3 className="font-black text-orange-900 uppercase tracking-tight mb-6">Category Mix</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {categoryData.map(cat => (
              <div key={cat.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-orange-50">
          <h3 className="font-black text-orange-900 uppercase tracking-tight mb-6">Top Consumed Items</h3>
          <div className="space-y-4">
            {[
              { name: 'Fresh Milk', count: 12, icon: '🥛' },
              { name: 'Eggs', count: 8, icon: '🥚' },
              { name: 'Avocados', count: 6, icon: '🥑' },
              { name: 'Bread', count: 5, icon: '🍞' },
            ].map((item, i) => (
              <div key={item.name} className="flex items-center justify-between p-3 bg-orange-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-sm font-bold text-gray-700">{item.name}</span>
                </div>
                <span className="text-xs font-black text-orange-600">{item.count}x</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
