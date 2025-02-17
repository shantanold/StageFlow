export interface Warehouse {
  id: string;
  name: string;
  address: string;
  created_at: string;
}

export interface Contract {
  id: string;
  client_name: string;
  property_address: string;
  start_date: string;
  end_date: string;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ContractItem {
  id: string;
  contract_id: string;
  furniture_id: string;
  created_at: string;
}

export const CONTRACT_STATUSES = [
  'Pending',
  'Active',
  'Completed',
  'Cancelled'
] as const;