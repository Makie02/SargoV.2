import React, { useState, useEffect } from 'react';
import { Calendar, TrendingUp, Clock, DollarSign, Users, XCircle, Layers, Activity } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function MarketingDashboard() {
  const [dateRange, setDateRange] = useState('today');
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    todayBookings: 0,
    weeklyRevenue: 0,
    cancelledBookings: 0,
    availableTables: 0,
    peakHours: [],
    bookingsPerDay: [],
    revenueByType: [],
    bookingStatus: []
  });

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Today's Bookings
      const { data: todayData } = await supabase
        .from('reservation')
        .select('*')
        .eq('reservation_date', today);

      // Weekly Revenue from payment table
      const { data: weeklyPayments } = await supabase
        .from('payment')
        .select('amount, payment_date')
        .gte('payment_date', oneWeekAgo);

      const weeklyRevenue = weeklyPayments?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0;

      // Cancelled Bookings
      const { data: cancelledData } = await supabase
        .from('reservation')
        .select('*')
        .eq('status', 'cancelled')
        .gte('reservation_date', oneWeekAgo);

      // Available Tables
      const { data: allTables } = await supabase
        .from('billiard_table_info')
        .select('*');

      const { data: occupiedTables } = await supabase
        .from('reservation')
        .select('table_id')
        .eq('reservation_date', today)
        .in('status', ['ongoing', 'approved']);

      const occupiedTableIds = occupiedTables?.map(r => r.table_id) || [];
      const availableTables = allTables?.filter(t => !occupiedTableIds.includes(t.table_id)).length || 0;

      // Peak Hours (from last month)
      const { data: monthlyReservations } = await supabase
        .from('reservation')
        .select('start_time')
        .gte('reservation_date', oneMonthAgo);

      const hourCounts = {};
      monthlyReservations?.forEach(r => {
        const hour = r.start_time?.split(':')[0] || '00';
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });

      const peakHours = Object.entries(hourCounts)
        .map(([hour, count]) => ({
          hour: `${hour}:00`,
          bookings: count
        }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 24);

      // Bookings Per Day (last 7 days)
      const bookingsPerDay = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        
        const { data: dayData } = await supabase
          .from('reservation')
          .select('*')
          .eq('reservation_date', dateStr);

        bookingsPerDay.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          bookings: dayData?.length || 0
        });
      }

      // Revenue by Billiard Type
      const { data: revenueByTypeData } = await supabase
        .from('payment')
        .select('billiard_type, amount')
        .gte('payment_date', oneWeekAgo);

      const typeRevenue = {};
      revenueByTypeData?.forEach(p => {
        const type = p.billiard_type || 'Standard';
        typeRevenue[type] = (typeRevenue[type] || 0) + parseFloat(p.amount || 0);
      });

      const revenueByType = Object.entries(typeRevenue).map(([type, amount]) => ({
        name: type,
        value: amount
      }));

      // Booking Status Distribution
      const { data: statusData } = await supabase
        .from('reservation')
        .select('status')
        .gte('reservation_date', oneWeekAgo);

      const statusCounts = {};
      statusData?.forEach(r => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      });

      const bookingStatus = Object.entries(statusCounts).map(([status, count]) => ({
        name: status.charAt(0).toUpperCase() + status.slice(1),
        value: count
      }));

      setDashboardData({
        todayBookings: todayData?.length || 0,
        weeklyRevenue,
        cancelledBookings: cancelledData?.length || 0,
        availableTables,
        peakHours,
        bookingsPerDay,
        revenueByType,
        bookingStatus
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];



  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <div className="mb-8">
        <h1 className="flex items-center gap-3 mb-2 text-4xl font-bold text-gray-900">
          <Activity className="text-blue-600" size={36} />
          MASTER MARKETING DASHBOARD
        </h1>
        <p className="text-lg text-gray-600">Real-time insights and analytics</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-2 lg:grid-cols-4">
        <div className="p-6 transition-all bg-white shadow-lg rounded-2xl hover:shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-xl">
              <Calendar className="text-blue-600" size={24} />
            </div>
            <span className="px-3 py-1 text-xs font-semibold text-blue-600 bg-blue-100 rounded-full">Today</span>
          </div>
          <p className="text-sm text-gray-600">Today's Bookings</p>
          <p className="text-3xl font-bold text-gray-900">{dashboardData.todayBookings}</p>
        </div>

        <div className="p-6 transition-all bg-white shadow-lg rounded-2xl hover:shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-xl">
              <DollarSign className="text-green-600" size={24} />
            </div>
            <span className="px-3 py-1 text-xs font-semibold text-green-600 bg-green-100 rounded-full">7 Days</span>
          </div>
          <p className="text-sm text-gray-600">Weekly Revenue</p>
          <p className="text-3xl font-bold text-gray-900">₱{dashboardData.weeklyRevenue.toLocaleString()}</p>
        </div>

        <div className="p-6 transition-all bg-white shadow-lg rounded-2xl hover:shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-xl">
              <Layers className="text-purple-600" size={24} />
            </div>
            <span className="px-3 py-1 text-xs font-semibold text-purple-600 bg-purple-100 rounded-full">Now</span>
          </div>
          <p className="text-sm text-gray-600">Available Tables</p>
          <p className="text-3xl font-bold text-gray-900">{dashboardData.availableTables}</p>
        </div>

        <div className="p-6 transition-all bg-white shadow-lg rounded-2xl hover:shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-xl">
              <XCircle className="text-red-600" size={24} />
            </div>
            <span className="px-3 py-1 text-xs font-semibold text-red-600 bg-red-100 rounded-full">7 Days</span>
          </div>
          <p className="text-sm text-gray-600">Cancelled Bookings</p>
          <p className="text-3xl font-bold text-gray-900">{dashboardData.cancelledBookings}</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bookings Per Day */}
        <div className="p-6 bg-white shadow-lg rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="text-blue-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Bookings Per Day (Last 7 Days)</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dashboardData.bookingsPerDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="bookings" stroke="#3b82f6" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Peak Hours */}
        <div className="p-6 bg-white shadow-lg rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="text-purple-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Peak Hours (Last Month)</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dashboardData.peakHours.slice(0, 12)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="bookings" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by Billiard Type */}
        <div className="p-6 bg-white shadow-lg rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <DollarSign className="text-green-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Revenue by Table Type</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={dashboardData.revenueByType}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ₱${value.toLocaleString()}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {dashboardData.revenueByType.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `₱${value.toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Booking Status Distribution */}
        <div className="p-6 bg-white shadow-lg rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <Users className="text-indigo-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Booking Status (Last 7 Days)</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={dashboardData.bookingStatus}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {dashboardData.bookingStatus.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
