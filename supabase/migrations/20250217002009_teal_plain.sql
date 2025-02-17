/*
  # Add contracts and warehouse management

  1. New Tables
    - `warehouses`
      - `id` (uuid, primary key)
      - `name` (text, required)
      - `address` (text, required)
    
    - `contracts`
      - `id` (uuid, primary key)
      - `client_name` (text, required)
      - `property_address` (text, required)
      - `start_date` (date, required)
      - `end_date` (date, required)
      - `status` (text, required)
      - `notes` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `contract_items`
      - `id` (uuid, primary key)
      - `contract_id` (uuid, foreign key)
      - `furniture_id` (uuid, foreign key)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
*/

-- Create warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create contracts table
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  property_address text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create contract_items junction table
CREATE TABLE IF NOT EXISTS contract_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES contracts(id) ON DELETE CASCADE,
  furniture_id uuid REFERENCES furniture(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(contract_id, furniture_id)
);

-- Enable RLS
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_items ENABLE ROW LEVEL SECURITY;

-- Warehouse policies
CREATE POLICY "Allow authenticated users to read warehouses"
  ON warehouses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert warehouses"
  ON warehouses FOR INSERT TO authenticated WITH CHECK (true);

-- Contract policies
CREATE POLICY "Allow authenticated users to read contracts"
  ON contracts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert contracts"
  ON contracts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update contracts"
  ON contracts FOR UPDATE TO authenticated USING (true);

-- Contract items policies
CREATE POLICY "Allow authenticated users to read contract_items"
  ON contract_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert contract_items"
  ON contract_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete contract_items"
  ON contract_items FOR DELETE TO authenticated USING (true);

-- Add trigger for contracts updated_at
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default warehouse
INSERT INTO warehouses (name, address)
VALUES ('Main Warehouse', '123 Storage Ave, Warehouse District') ON CONFLICT DO NOTHING;