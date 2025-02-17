export interface Furniture {
  id: string;
  name: string;
  category: string;
  condition: string;
  status: string;
  purchase_date?: string;
  purchase_price?: number;
  location?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export const CATEGORIES = [
  'Seating',
  'Tables',
  'Storage',
  'Beds',
  'Lighting',
  'Decor',
  'Rugs',
  'Other'
] as const;

export const CONDITIONS = [
  'New',
  'Excellent',
  'Good',
  'Fair',
  'Poor'
] as const;

export const STATUSES = [
  'Available',
  'In Use',
  'Maintenance',
  'Sold',
  'Retired'
] as const;