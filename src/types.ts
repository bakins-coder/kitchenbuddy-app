export type UserRole = 'admin' | 'co-owner' | 'member';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: UserRole;
  dietaryPreferences?: string[];
  householdId?: string;
}

export interface Household {
  id: string;
  name: string;
  adminId: string;
  members: string[];
}

export interface StorageLocation {
  id: string;
  name: string;
  type: 'fridge' | 'freezer' | 'pantry' | 'shelf' | 'other';
  householdId: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiryDate?: string;
  storageLocationId: string;
  householdId: string;
  lowStockThreshold?: number;
  barcode?: string;
  nutritionalScore?: string;
  calories?: number;
  glycemicIndex?: number;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  status: 'pending' | 'bought';
  householdId: string;
  addedBy: string;
}

export interface Recipe {
  id: string;
  title: string;
  ingredients: { name: string; amount: number; unit: string }[];
  instructions: string[];
  dietaryTags?: string[];
  dueScore?: number;
  householdId: string;
}

export interface MealPlan {
  id: string;
  date: string;
  recipeId: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  householdId: string;
}

export interface SharedItem {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  location: { lat: number; lng: number };
  terms: string;
  status: 'available' | 'borrowed';
  expiryDate?: string;
}

export interface BorrowRequest {
  id: string;
  itemId: string;
  borrowerId: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'returned';
  termsAccepted: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
}
