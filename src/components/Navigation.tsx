import { NavLink } from 'react-router-dom';
import { Home, ShoppingCart, Utensils, Users, PieChart, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

const navItems = [
  { path: '/', icon: Home, label: 'Inventory' },
  { path: '/shopping', icon: ShoppingCart, label: 'Shopping' },
  { path: '/recipes', icon: Utensils, label: 'Recipes' },
  { path: '/community', icon: Users, label: 'Community' },
  { path: '/analytics', icon: PieChart, label: 'Stats' },
  { path: '/household', icon: Settings, label: 'Kitchen' },
];

export default function Navigation() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-orange-100 px-4 py-2 flex items-center justify-around z-50 sm:px-8 md:px-16 lg:px-32">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-1 p-2 rounded-xl transition-all relative',
              isActive ? 'text-orange-600' : 'text-gray-400 hover:text-orange-400'
            )
          }
        >
          {({ isActive }) => (
            <motion.div 
              whileTap={{ scale: 0.9 }}
              className="flex flex-col items-center gap-1"
            >
              <item.icon className={cn('w-6 h-6', isActive && 'stroke-[2.5px]')} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
              {isActive && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute -top-2 w-8 h-1 bg-linear-to-r from-orange-400 to-rose-400 rounded-full"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </motion.div>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
