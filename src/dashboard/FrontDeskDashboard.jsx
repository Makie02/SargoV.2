import React, { useState, useEffect } from 'react';
import { Search, QrCode, DollarSign, Clock, User, Calendar, CheckCircle, XCircle, AlertCircle, TrendingUp, Loader } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function FrontDeskDashboard() {
  const [activeTab, setActiveTab] = useState('qr-checkin');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [animate, setAnimate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentSessions, setCurrentSessions] = useState([]);
  const [reservations, setReservations] = useState([]);

  useEffect(() => {
    setAnimate(true);
    fetchData();

    // Set up real-time subscription
    const subscription = supabase
      .channel('reservation_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'reservation' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const today = new Date().toISOString().split('T')[0];

      // TEST: Get ALL reservations first (remove date filter temporarily)
      const { data: reservationData, error: reservationError } = await supabase
        .from('reservation')
        .select('*')
        // .eq('reservation_date', today)  // Comment out muna para makita lahat
        .order('start_time', { ascending: true });

      console.log('All reservations (no date filter):', reservationData);
      // Fetch accounts separately
      const accountIds = reservationData?.map(r => r.account_id).filter(Boolean) || [];
      const { data: accountsData } = await supabase
        .from('account')
        .select('*')
        .in('id', accountIds);

      // Fetch tables separately
      const tableIds = reservationData?.map(r => r.table_id).filter(Boolean) || [];
      const { data: tablesData } = await supabase
        .from('table')
        .select('*')
        .in('id', tableIds);

      // Create lookup maps
      const accountsMap = {};
      accountsData?.forEach(acc => {
        accountsMap[acc.id] = acc;
      });

      const tablesMap = {};
      tablesData?.forEach(tbl => {
        tablesMap[tbl.id] = tbl;
      });

      // Merge the data
      const sessions = [];
      const upcomingReservations = [];

      reservationData?.forEach(item => {
        const account = accountsMap[item.account_id];
        const table = tablesMap[item.table_id];

        const sessionData = {
          id: item.id,
          customer: account?.name || 'Unknown Customer',
          table: table?.table_number || `T-${item.table_id}`,
          startTime: item.start_time,
          duration: `${item.duration}h`,
          status: item.customer_status || item.status,
          phone: account?.phone || 'N/A',
          amount: item.total_bill ? `₱${item.total_bill}` : '₱0',
          reservationDate: item.reservation_date,
          timeEnd: item.time_end,
          extension: item.extension,
          paymentStatus: item.payment_status,
          rawData: item
        };

        // Para sa Current Sessions - ongoing at active sessions
        // Para sa Current Sessions - ongoing at active sessions
        if (item.status === 'ongoing' || item.customer_status === 'ongoing' ||
          item.customer_status === 'active' || item.customer_status === 'extended' ||
          item.customer_status === 'checked-in') {
          sessions.push(sessionData);
        }
        // Para sa Reservations - pending at confirmed lang
        else if (item.status === 'pending' || item.status === 'confirmed') {
          upcomingReservations.push(sessionData);
        }
      });
      console.log('All reservations for today:', reservationData);
      console.log('Filtered sessions:', sessions);
      console.log('Today date:', today);

      setCurrentSessions(sessions);
      setReservations(upcomingReservations);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const today = new Date().toISOString().split('T')[0];

      // First get reservations for today
      const { data: reservationData, error: reservationError } = await supabase
        .from('reservation')
        .select('*')
        .eq('reservation_date', today);

      if (reservationError) throw reservationError;

      if (!reservationData || reservationData.length === 0) {
        setSelectedCustomer(null);
        alert('No reservations found for today.');
        return;
      }

      // Get all account IDs
      const accountIds = reservationData.map(r => r.account_id);

      // Search in accounts table
      const { data: accountsData, error: accountError } = await supabase
        .from('account')
        .select('*')
        .in('id', accountIds)
        .or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`);

      if (accountError) throw accountError;

      if (accountsData && accountsData.length > 0) {
        // Find the reservation that matches
        const matchedAccount = accountsData[0];
        const matchedReservation = reservationData.find(r => r.account_id === matchedAccount.id);

        if (matchedReservation) {
          // Get table info
          const { data: tableData } = await supabase
            .from('table')
            .select('*')
            .eq('id', matchedReservation.table_id)
            .single();

          setSelectedCustomer({
            id: matchedReservation.id,
            customer: matchedAccount.name || 'Unknown Customer',
            table: tableData?.table_number || `T-${matchedReservation.table_id}`,
            phone: matchedAccount.phone || 'N/A',
            status: matchedReservation.customer_status || matchedReservation.status,
            startTime: matchedReservation.start_time,
            duration: `${matchedReservation.duration}h`,
            amount: matchedReservation.total_bill ? `₱${matchedReservation.total_bill}` : '₱0'
          });
        }
      } else {
        setSelectedCustomer(null);
        alert('No customer found with that name or phone number.');
      }
    } catch (err) {
      console.error('Error searching:', err);
      alert('Error searching for customer');
    }
  };
  const handleCheckIn = async (id) => {
    try {
      const { error } = await supabase
        .from('reservation')
        .update({
          customer_status: 'checked-in',
          status: 'checked-in'
        })
        .eq('id', id);

      if (error) throw error;

      await fetchData();
      alert('Customer checked in successfully!');
    } catch (err) {
      console.error('Error checking in:', err);
      alert('Error checking in customer');
    }
  };

  const handleExtendTime = async (id) => {
    try {
      // Get current reservation data
      const { data: current, error: fetchError } = await supabase
        .from('reservation')
        .select('duration, extension')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const newExtension = (current.extension || 0) + 1;
      const newDuration = current.duration + 1;

      const { error } = await supabase
        .from('reservation')
        .update({
          customer_status: 'extended',
          extension: newExtension,
          duration: newDuration
        })
        .eq('id', id);

      if (error) throw error;

      await fetchData();
      alert('Time extended successfully!');
    } catch (err) {
      console.error('Error extending time:', err);
      alert('Error extending time');
    }
  };

  const handleFinalizePayment = async (id) => {
    try {
      const { error } = await supabase
        .from('reservation')
        .update({
          payment_status: true,
          customer_status: 'completed',
          status: 'completed'
        })
        .eq('id', id);

      if (error) throw error;

      await fetchData();
      alert('Payment finalized successfully!');
    } catch (err) {
      console.error('Error finalizing payment:', err);
      alert('Error finalizing payment');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'extended': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'confirmed': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'checked-in': return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'completed': return 'bg-gray-100 text-gray-700 border-gray-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="animate-spin text-blue-600 mx-auto mb-4" size={48} />
          <p className="text-gray-600 text-lg">Loading dashboard...</p>
        </div>
      </div>
    );
  }


  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl p-8 shadow-lg">
          <AlertCircle className="text-red-600 mx-auto mb-4" size={48} />
          <p className="text-red-600 text-lg font-semibold mb-2">Error loading data</p>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 border border-white/20 shadow-lg rounded-2xl p-6 mb-8">
      {/* Header with Animation */}
      <div className={`mb-8 transition-all duration-700 ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Front Desk Dashboard
            </h1>
            <p className="text-gray-600 mt-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Live monitoring system
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Current Time</div>
            <div className="text-2xl font-bold text-gray-800">{new Date().toLocaleTimeString()}</div>
          </div>
        </div>
      </div>

      {/* Action Cards with Beautiful Design */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* QR Check-in Card */}
        <div
          onClick={() => setActiveTab('qr-checkin')}
          className={`group cursor-pointer relative overflow-hidden rounded-2xl transition-all duration-500 transform hover:scale-105 hover:shadow-2xl ${activeTab === 'qr-checkin'
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-xl scale-105'
            : 'bg-white shadow-md hover:shadow-xl'
            } ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: '100ms' }}
        >
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full -translate-x-20 -translate-y-20"></div>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-white rounded-full translate-x-16 translate-y-16"></div>
          </div>

          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white to-transparent opacity-50 animate-pulse"></div>

          <div className="relative p-6">
            <div className={`flex items-center justify-between mb-4 ${activeTab === 'qr-checkin' ? 'text-white' : 'text-gray-700'}`}>
              <QrCode size={40} className="transition-transform group-hover:rotate-12" />
              <TrendingUp size={20} className="opacity-60" />
            </div>
            <h3 className={`text-xl font-bold mb-2 ${activeTab === 'qr-checkin' ? 'text-white' : 'text-gray-800'}`}>
              QR Check-in
            </h3>
            <p className={`text-sm ${activeTab === 'qr-checkin' ? 'text-blue-100' : 'text-gray-500'}`}>
              Quick customer entry
            </p>
            <div className="mt-4 flex items-center gap-2">
              <div className={`h-1 flex-1 rounded-full ${activeTab === 'qr-checkin' ? 'bg-white/30' : 'bg-blue-200'}`}>
                <div className={`h-1 rounded-full ${activeTab === 'qr-checkin' ? 'bg-white' : 'bg-blue-500'}`} style={{ width: '75%' }}></div>
              </div>
              <span className={`text-xs font-semibold ${activeTab === 'qr-checkin' ? 'text-white' : 'text-blue-600'}`}>75%</span>
            </div>
          </div>
        </div>

        {/* Finalize Payment Card */}
        <div
          onClick={() => setActiveTab('payment')}
          className={`group cursor-pointer relative overflow-hidden rounded-2xl transition-all duration-500 transform hover:scale-105 hover:shadow-2xl ${activeTab === 'payment'
            ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-xl scale-105'
            : 'bg-white shadow-md hover:shadow-xl'
            } ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: '200ms' }}
        >
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full translate-x-20 -translate-y-20"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-16 translate-y-16"></div>
          </div>

          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white to-transparent opacity-50 animate-pulse" style={{ animationDelay: '0.5s' }}></div>

          <div className="relative p-6">
            <div className={`flex items-center justify-between mb-4 ${activeTab === 'payment' ? 'text-white' : 'text-gray-700'}`}>
              <div className="text-[40px] transition-transform group-hover:rotate-12">
                ₱
              </div>
              <TrendingUp size={20} className="opacity-60" />
            </div>
            <h3 className={`text-xl font-bold mb-2 ${activeTab === 'payment' ? 'text-white' : 'text-gray-800'}`}>
              Finalize Payment
            </h3>
            <p className={`text-sm ${activeTab === 'payment' ? 'text-green-100' : 'text-gray-500'}`}>
              Process transactions
            </p>
            <div className="mt-4 flex items-center gap-2">
              <div className={`h-1 flex-1 rounded-full ${activeTab === 'payment' ? 'bg-white/30' : 'bg-green-200'}`}>
                <div className={`h-1 rounded-full ${activeTab === 'payment' ? 'bg-white' : 'bg-green-500'}`} style={{ width: '60%' }}></div>
              </div>
              <span className={`text-xs font-semibold ${activeTab === 'payment' ? 'text-white' : 'text-green-600'}`}>60%</span>
            </div>
          </div>
        </div>

        {/* Time Extensions Card */}
        <div
          onClick={() => setActiveTab('extension')}
          className={`group cursor-pointer relative overflow-hidden rounded-2xl transition-all duration-500 transform hover:scale-105 hover:shadow-2xl ${activeTab === 'extension'
            ? 'bg-gradient-to-br from-orange-500 to-red-500 shadow-xl scale-105'
            : 'bg-white shadow-md hover:shadow-xl'
            } ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: '300ms' }}
        >
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full -translate-x-20 -translate-y-20"></div>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-white rounded-full translate-x-16 translate-y-16"></div>
          </div>

          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white to-transparent opacity-50 animate-pulse" style={{ animationDelay: '1s' }}></div>

          <div className="relative p-6">
            <div className={`flex items-center justify-between mb-4 ${activeTab === 'extension' ? 'text-white' : 'text-gray-700'}`}>
              <Clock size={40} className="transition-transform group-hover:rotate-12" />
              <TrendingUp size={20} className="opacity-60" />
            </div>
            <h3 className={`text-xl font-bold mb-2 ${activeTab === 'extension' ? 'text-white' : 'text-gray-800'}`}>
              Time Extensions
            </h3>
            <p className={`text-sm ${activeTab === 'extension' ? 'text-orange-100' : 'text-gray-500'}`}>
              Extend session time
            </p>
            <div className="mt-4 flex items-center gap-2">
              <div className={`h-1 flex-1 rounded-full ${activeTab === 'extension' ? 'bg-white/30' : 'bg-orange-200'}`}>
                <div className={`h-1 rounded-full ${activeTab === 'extension' ? 'bg-white' : 'bg-orange-500'}`} style={{ width: '85%' }}></div>
              </div>
              <span className={`text-xs font-semibold ${activeTab === 'extension' ? 'text-white' : 'text-orange-600'}`}>85%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Lookup with Modern Design */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-8 border border-white/20">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg mr-3">
            <Search className="text-white" size={24} />
          </div>
          Customer Lookup
        </h2>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search by name or phone number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full px-5 py-3 pl-12 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          </div>
          <button
            onClick={handleSearch}
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:shadow-lg transform hover:scale-105 transition-all font-semibold"
          >
            Search
          </button>
        </div>

        {selectedCustomer && (
          <div className="mt-4 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 animate-pulse" style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) 1' }}>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Customer:</span>
                <span className="text-gray-900">{selectedCustomer.customer}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Table:</span>
                <span className="px-3 py-1 bg-blue-500 text-white rounded-lg font-bold">{selectedCustomer.table}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Phone:</span>
                <span className="text-gray-900">{selectedCustomer.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Status:</span>
                <span className={`px-3 py-1 rounded-lg text-sm font-semibold border ${getStatusColor(selectedCustomer.status)}`}>
                  {selectedCustomer.status}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Current Sessions with Enhanced Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-8 border border-white/20">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <div className="p-2 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg mr-3">
            <User className="text-white" size={24} />
          </div>
          Current Sessions
          <span className="ml-3 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold">
            {currentSessions.length} Active
          </span>
        </h2>
        <div className="overflow-hidden rounded-xl border-2 border-gray-100">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Table</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Start Time</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y-2 divide-gray-50">
              {currentSessions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    No active sessions at the moment
                  </td>
                </tr>
              ) : (
                currentSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{session.customer}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-bold text-sm">
                        {session.table}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{session.startTime}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{session.duration}</td>
                    <td className="px-6 py-4 text-sm font-bold text-emerald-600">{session.amount}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getStatusColor(session.status)}`}>
                        {session.status.toUpperCase()}
                      </span>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Today's Reservations with Enhanced Design */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/20">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg mr-3">
            <Calendar className="text-white" size={24} />
          </div>
          Today's Reservation Schedule
          <span className="ml-3 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
            {reservations.length} Bookings
          </span>
        </h2>
        <div className="overflow-hidden rounded-xl border-2 border-gray-100">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Time</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Table</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y-2 divide-gray-50">
              {reservations.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    No reservations scheduled for today
                  </td>
                </tr>
              ) : (
                reservations.map((reservation) => (
                  <tr key={reservation.id} className="hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-50 transition-all duration-200">
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{reservation.startTime}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg font-bold text-sm">
                        {reservation.table}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{reservation.customer}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{reservation.duration}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getStatusColor(reservation.status)}`}>
                        {reservation.status.toUpperCase()}
                      </span>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enhanced Footer */}
      <div className="mt-8 text-center">
        <div className="inline-block bg-white/80 backdrop-blur-sm rounded-full px-6 py-3 shadow-lg border border-white/20">
          <p className="text-sm text-gray-600 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            Front Desk Dashboard • Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
}