import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Contract, ContractItem } from '../types/contracts';
import { Furniture } from '../types/furniture';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';

function Contracts() {
  const [contracts, setContracts] = useState<(Contract & { items?: Furniture[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedContract, setExpandedContract] = useState<string | null>(null);

  const fetchContracts = async () => {
    try {
      setLoading(true);
      
      // Fetch contracts with their items
      const { data: contractsData, error: contractsError } = await supabase
        .from('contracts')
        .select(`
          *,
          contract_items (
            furniture_id
          )
        `)
        .order('start_date', { ascending: false });

      if (contractsError) throw contractsError;

      // Get all furniture IDs from contract items
      const furnitureIds = new Set(
        contractsData?.flatMap(contract => 
          contract.contract_items.map((item: ContractItem) => item.furniture_id)
        ) || []
      );

      // Fetch furniture details
      const { data: furnitureData, error: furnitureError } = await supabase
        .from('furniture')
        .select('*')
        .in('id', Array.from(furnitureIds));

      if (furnitureError) throw furnitureError;

      // Combine contracts with their furniture items
      const contractsWithItems = contractsData?.map(contract => ({
        ...contract,
        items: contract.contract_items
          .map((item: ContractItem) => 
            furnitureData?.find(furniture => furniture.id === item.furniture_id)
          )
          .filter(Boolean)
      }));

      setContracts(contractsWithItems || []);
    } catch (error) {
      toast.error('Error fetching contracts');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
        <button
          onClick={fetchContracts}
          className="p-2 text-gray-400 hover:text-gray-500"
          title="Refresh"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw size={40} className="animate-spin mx-auto text-gray-400" />
          <p className="mt-2 text-gray-500">Loading contracts...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {contracts.map(contract => (
            <div key={contract.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div
                className="px-6 py-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedContract(
                  expandedContract === contract.id ? null : contract.id
                )}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {contract.client_name}
                    </h3>
                    <p className="text-sm text-gray-500">{contract.property_address}</p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(contract.status)}`}>
                      {contract.status}
                    </span>
                    {expandedContract === contract.id ? (
                      <ChevronUp size={20} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={20} className="text-gray-400" />
                    )}
                  </div>
                </div>
                <div className="mt-2 flex space-x-4 text-sm text-gray-500">
                  <span>Start: {new Date(contract.start_date).toLocaleDateString()}</span>
                  <span>End: {new Date(contract.end_date).toLocaleDateString()}</span>
                  <span>{contract.items?.length || 0} items</span>
                </div>
              </div>

              {expandedContract === contract.id && (
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Furniture Items</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {contract.items?.map(item => (
                      <div key={item.id} className="bg-white p-4 rounded-md shadow-sm">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="text-sm text-gray-500">{item.category}</div>
                        <div className="text-sm text-gray-500">Condition: {item.condition}</div>
                      </div>
                    ))}
                  </div>
                  {contract.notes && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Notes</h4>
                      <p className="text-sm text-gray-500">{contract.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {contracts.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500">No contracts found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Contracts;