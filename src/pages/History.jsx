import React, { useState, useEffect } from 'react';
import { supabase } from "../lib/supabaseClient";
import Swal from 'sweetalert2';
import { Calendar, Clock, DollarSign, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

const History = () => {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [tables, setTables] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser, userRole]);

  const fetchCurrentUser = async () => {
    try {
      const userSession = localStorage.getItem('userSession');
      
      if (userSession) {
        const userData = JSON.parse(userSession);
        
        setCurrentUser({
          account_id: userData.account_id,
          email: userData.email,
          role: userData.role
        });
        setUserRole(userData.role);
      } else {
        Swal.fire({
          icon: 'warning',
          title: 'Not Logged In',
          text: 'Please log in to view transaction history',
        });
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to fetch user information',
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    filterTransactions();
  }, [selectedMonth, selectedStatus, transactions]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: tablesData, error: tablesError } = await supabase
        .from('billiard_table')
        .select('*');

      if (tablesError) throw tablesError;
      setTables(tablesData || []);

      let query = supabase
        .from('transaction_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (userRole === 'customer' && currentUser) {
        query = query.eq('account_id', currentUser.account_id);
      }

      const { data: transactionsData, error: transactionsError } = await query;

      if (transactionsError) throw transactionsError;

      setTransactions(transactionsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to fetch transaction history',
      });
    } finally {
      setLoading(false);
    }
  };

  const filterTransactions = () => {
    let filtered = [...transactions];

    if (selectedMonth !== 'all') {
      filtered = filtered.filter(t => {
        const date = new Date(t.created_at);
        const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return monthYear === selectedMonth;
      });
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(t => t.status?.toLowerCase() === selectedStatus.toLowerCase());
    }

    setFilteredTransactions(filtered);
    setCurrentPage(1);
  };

  const getTableName = (tableId) => {
    const table = tables.find(t => t.table_id === tableId);
    return table ? table.table_name : 'Unknown Table';
  };

  const getStatusStyle = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-gradient-to-r from-green-500 to-emerald-500';
      case 'pending':
        return 'bg-gradient-to-r from-amber-500 to-orange-500';
      case 'cancelled':
        return 'bg-gradient-to-r from-red-500 to-rose-500';
      case 'rescheduled':
        return 'bg-gradient-to-r from-cyan-500 to-blue-500';
      case 'approved':
        return 'bg-gradient-to-r from-blue-500 to-indigo-500';
      case 'ongoing':
        return 'bg-gradient-to-r from-purple-500 to-pink-500';
      default:
        return 'bg-gradient-to-r from-gray-500 to-slate-500';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getUniqueMonths = () => {
    const months = transactions.map(t => {
      const date = new Date(t.created_at);
      return {
        value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      };
    });

    const uniqueMonths = Array.from(new Map(months.map(m => [m.value, m])).values());
    return uniqueMonths.sort((a, b) => b.value.localeCompare(a.value));
  };

  // Pagination
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTransactions = filteredTransactions.slice(startIndex, endIndex);

  const goToPage = (page) => {
    setCurrentPage(page);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-lg font-semibold text-gray-700">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-7xl mx-auto">
        {/* Header - Compact */}
        <div className="backdrop-blur-xl bg-white/70 border border-white/40 rounded-2xl shadow-lg p-4 md:p-6 mb-4">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent text-center">
            Transaction History
          </h1>
        </div>

        {/* Filters - Compact */}
        <div className="backdrop-blur-xl bg-white/70 border border-white/40 rounded-2xl shadow-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-800">Filters</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 text-sm bg-white/80 border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Months</option>
              {getUniqueMonths().map(month => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 text-sm bg-white/80 border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="ongoing">OnGoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rescheduled">Rescheduled</option>
            </select>
          </div>
        </div>

        {/* Transactions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {currentTransactions.length === 0 ? (
            <div className="col-span-full backdrop-blur-xl bg-white/70 border border-white/40 rounded-2xl shadow-lg p-12 text-center">
              <Calendar className="w-12 h-12 text-blue-600 mx-auto mb-3" />
              <p className="text-lg font-semibold text-gray-600">No transactions found</p>
            </div>
          ) : (
            currentTransactions.map(transaction => (
              <div
                key={transaction.id}
                className="backdrop-blur-xl bg-gradient-to-br from-white/80 to-blue-50/50 border border-white/40 rounded-2xl shadow-lg p-4 hover:shadow-xl transition-all duration-300 hover:scale-105"
              >
                {/* Date */}
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(transaction.created_at)}</span>
                </div>

                {/* Table Name */}
                <h3 className="text-lg font-bold text-gray-800 mb-2">
                  {getTableName(transaction.table_id)}
                </h3>

                {/* Billiard Type */}
                <div className="mb-3">
                  <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">
                    {transaction.billiard_type || 'Standard'}
                  </span>
                </div>

                {/* Time Info */}
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-4">
                  <Clock className="w-3 h-3" />
                  <span>{transaction.duration}h • {transaction.start_time} - {transaction.time_end}</span>
                </div>

                {/* Amount and Status */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 text-green-600" />
                    <span className="text-xl font-bold text-green-600">
                      ₱{parseFloat(transaction.amount || 0).toFixed(2)}
                    </span>
                  </div>
                  
                  <div className={`${getStatusStyle(transaction.status)} px-3 py-1 rounded-full`}>
                    <span className="text-xs font-bold text-white uppercase">
                      {transaction.status || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {filteredTransactions.length > 0 && (
          <div className="backdrop-blur-xl bg-white/70 border border-white/40 rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredTransactions.length)} of {filteredTransactions.length} transactions
              </p>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div className="flex gap-1">
                  {[...Array(totalPages)].map((_, index) => (
                    <button
                      key={index + 1}
                      onClick={() => goToPage(index + 1)}
                      className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                        currentPage === index + 1
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                          : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                      }`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default History;