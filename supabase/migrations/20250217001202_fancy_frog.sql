/*
  # Create furniture inventory schema

  1. New Tables
    - `furniture`
      - `id` (uuid, primary key)
      - `name` (text, required)
      - `category` (text, required)
      - `condition` (text, required)
      - `status` (text, required)
      - `purchase_date` (date)
      - `purchase_price` (numeric)
      - `location` (text)
      - `notes` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `furniture` table
    - Add policies for authenticated users to perform CRUD operations
*/

CREATE TABLE IF NOT EXISTS furniture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  condition text NOT NULL,
  status text NOT NULL DEFAULT 'available',
  purchase_date date,
  purchase_price numeric(10,2),
  location text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE furniture ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read furniture"
  ON furniture
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert furniture"
  ON furniture
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update furniture"
  ON furniture
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete furniture"
  ON furniture
  FOR DELETE
  TO authenticated
  USING (true);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_furniture_updated_at
  BEFORE UPDATE ON furniture
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();