import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'react-hot-toast';

function Analytics() {
  const [loading, setLoading] = useState(true);
  const [contractStats, setContractStats] = useState<any[]>([]);
  const [categoryStats, setCategoryStats] = useState<any[]>([]);
  const [monthlyContracts, setMonthlyContracts] = useState<any[]>([]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Fetch contracts
      const { data: contracts, error: contractsError } = await supabase
        .from('contracts')
        .select(`
          *,
          contract_items (
            furniture_id
          )
        `);

      if (contractsError) throw contractsError;

      // Fetch furniture
      const { data: furniture, error: furnitureError } = await supabase
        .from('furniture')
        .select('*');

      if (furnitureError) throw furnitureError;

      // Calculate category statistics
      const categoryCount = furniture.reduce((acc: any, item: any) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
      }, {});

      const categoryData = Object.entries(categoryCount).map(([name, value]) => ({
        name,
        value,
      }));

      // Calculate monthly contract statistics
      const monthlyData = contracts.reduce((acc: any, contract: any) => {
        const month = new Date(contract.start_date).toLocaleString('default', { month: 'short' });
        acc[month] = (acc[month] || 0) + 1;
        return acc;
      }, {});

      const monthlyStats = Object.entries(monthlyData).map(([month, count]) => ({
        month,
        contracts: count,
      }));

      // Calculate contract statistics
      const contractData = [
        { name: 'Active Contracts', value: contracts.filter((c: any) => c.status === 'Active').length },
        { name: 'Completed Contracts', value: contracts.filter((c: any) => c.status === 'Completed').length },
        { name: 'Pending Contracts', value: contracts.filter((c: any) => c.status === 'Pending').length },
      ];

      setCategoryStats(categoryData);
      setMonthlyContracts(monthlyStats);
      setContractStats(contractData);
    } catch (error) {
      toast.error('Error fetching analytics data');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
        <button
          onClick={fetchAnalytics}
          className="p-2 text-gray-400 hover:text-gray-500"
          title="Refresh"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw size={40} className="animate-spin mx-auto text-gray-400" />
          <p className="mt-2 text-gray-500">Loading analytics...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Contract Status Overview */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Contract Status Overview</h2>
            <div className="flex justify-center">
              <PieChart width={400} height={300}>
                <Pie
                  data={contractStats}
                  cx={200}
                  cy={150}
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {contractStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>
          </div>

          {/* Monthly Contract Trends */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Contract Trends</h2>
            <div className="flex justify-center">
              <BarChart width={600} height={300} data={monthlyContracts}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="contracts" fill="#8884d8" name="Number of Contracts" />
              </BarChart>
            </div>
          </div>

          {/* Furniture Category Distribution */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Furniture Category Distribution</h2>
            <div className="flex justify-center">
              <PieChart width={400} height={300}>
                <Pie
                  data={categoryStats}
                  cx={200}
                  cy={150}
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Analytics;

