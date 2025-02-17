import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import type { Furniture } from '../types/furniture';
import type { Contract } from '../types/contracts';

export function useInventory() {
  const [furniture, setFurniture] = useState<Furniture[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddContract, setShowAddContract] = useState(false);

  const fetchFurniture = async () => {
    try {
      setLoading(true);
      const { data: furnitureData, error: furnitureError } = await supabase
        .from('furniture')
        .select('*')
        .order('created_at', { ascending: false });

      if (furnitureError) throw furnitureError;
      
      const { data: contractsData, error: contractsError } = await supabase
        .from('contracts')
        .select('*, contract_items(furniture_id)')
        .gte('end_date', new Date().toISOString().split('T')[0])
        .eq('status', 'Active');

      if (contractsError) throw contractsError;

      setFurniture(furnitureData || []);
      setContracts(contractsData || []);
    } catch (error) {
      toast.error('Error fetching data');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFurniture();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const newItem = {
      name: formData.get('name') as string,
      category: formData.get('category') as string,
      condition: formData.get('condition') as string,
      status: formData.get('status') as string,
      purchase_date: formData.get('purchase_date') as string || null,
      purchase_price: formData.get('purchase_price') ? 
        Number(formData.get('purchase_price')) : null,
      location: 'Main Warehouse',
      notes: formData.get('notes') as string || null,
    };

    try {
      const { error } = await supabase
        .from('furniture')
        .insert([newItem]);

      if (error) throw error;
      
      toast.success('Item added successfully');
      form.reset();
      setShowAddForm(false);
      fetchFurniture();
    } catch (error) {
      toast.error('Error adding item');
      console.error('Error:', error);
    }
  };

  const handleAddContract = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      // Create contract
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert([{
          client_name: formData.get('client_name'),
          property_address: formData.get('property_address'),
          start_date: formData.get('start_date'),
          end_date: formData.get('end_date'),
          status: 'Active',
          notes: formData.get('notes'),
        }])
        .select()
        .single();

      if (contractError) throw contractError;

      // Get selected furniture items
      const selectedFurniture = Array.from(formData.getAll('furniture_items'));

      // Create contract items
      const contractItems = selectedFurniture.map(furnitureId => ({
        contract_id: contract.id,
        furniture_id: furnitureId,
      }));

      const { error: itemsError } = await supabase
        .from('contract_items')
        .insert(contractItems);

      if (itemsError) throw itemsError;

      // Update furniture locations
      const { error: updateError } = await supabase
        .from('furniture')
        .update({ location: formData.get('property_address') })
        .in('id', selectedFurniture);

      if (updateError) throw updateError;

      toast.success('Contract created successfully');
      form.reset();
      setShowAddContract(false);
      fetchFurniture();
    } catch (error) {
      toast.error('Error creating contract');
      console.error('Error:', error);
    }
  };

  return {
    furniture,
    contracts,
    loading,
    showAddForm,
    setShowAddForm,
    showAddContract,
    setShowAddContract,
    handleSubmit,
    handleAddContract,
    fetchFurniture,
  };
}