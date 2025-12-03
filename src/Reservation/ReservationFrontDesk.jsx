import React, { useState, useEffect } from 'react';
import { Search, Calendar, Filter, Eye, RefreshCw, X, Receipt, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import Swal from 'sweetalert2';
import { FileText } from 'lucide-react';

export default function ReservationFrontDesk() {
  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchReservations();
  }, []);

  const fetchReservations = async () => {
    setLoading(true);
    try {
      const { data: reservationData, error: reservationError } = await supabase
        .from('reservation')
        .select('*')
        .order('reservation_date', { ascending: false })
        .order('start_time', { ascending: true });

      if (reservationError) throw reservationError;

      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('account_id, email');

      const { data: customersData, error: customersError } = await supabase
        .from('customer')
        .select('customer_id, account_id, first_name, last_name, middle_name');

      if (accountsError) throw accountsError;
      if (customersError) throw customersError;

      const combinedData = reservationData.map(reservation => {
        const account = accountsData.find(acc => acc.account_id === reservation.account_id);
        const customer = customersData.find(c => c.account_id === reservation.account_id);
        return {
          ...reservation,
          accounts: {
            ...account,
            customer: customer || null
          }
        };
      });

      setReservations(combinedData);
    } catch (error) {
      console.error('Error fetching reservations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchReservations();
    setRefreshing(false);
  };

  const handleViewDetails = (reservation) => {
    setSelectedReservation(reservation);
    setShowModal(true);
  };

  const handleViewReceipt = async (reservation) => {
    // Check if it's GCash payment
    if (reservation.payment_method?.toLowerCase() !== 'gcash' || !reservation.proof_of_payment) {
      Swal.fire({
        icon: 'info',
        title: 'No Receipt',
        text: 'No payment receipt available for this reservation.',
      });
      return;
    }

    try {
      let imageUrl = reservation.proof_of_payment;

      // Check if it's a base64 data URL or a storage path
      if (!reservation.proof_of_payment.startsWith('data:')) {
        // It's a storage path, fetch from Supabase storage
        const { data, error } = await supabase.storage
          .from('payment-proofs')
          .getPublicUrl(reservation.proof_of_payment);

        if (error) throw error;
        imageUrl = data.publicUrl;
      }

      // Verify image exists before displaying
      const img = new Image();
      img.onload = () => {
        Swal.fire({
          title: 'Payment Receipt',
          html: `
          <div class="text-left mb-4">
            <p class="text-sm text-gray-600"><strong>Reference No:</strong> ${reservation.reference_no || 'N/A'}</p>
            <p class="text-sm text-gray-600"><strong>Amount:</strong> ₱${reservation.total_bill || 0}</p>
          </div>
          <img src="${imageUrl}" alt="Payment Receipt" class="w-full rounded-lg" />
        `,
          width: 600,
          confirmButtonText: 'Close',
          confirmButtonColor: '#6366f1',
        });
      };

      img.onerror = () => {
        throw new Error('Failed to load receipt image');
      };

      img.src = imageUrl;

    } catch (error) {
      console.error('Error loading receipt:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to load payment receipt',
      });
    }
  };

  const filteredReservations = reservations.filter(res => {
    const matchesStatus = res.status === activeTab;
    const customerName = `${res.accounts?.customer?.first_name || ''} ${res.accounts?.customer?.last_name || ''}`.toLowerCase();
    const matchesSearch = customerName.includes(searchQuery.toLowerCase()) ||
      res.id.toString().includes(searchQuery);
    const matchesTable = selectedTable === 'all' || res.table_id.toString() === selectedTable;
    const matchesDate = !selectedDate || res.reservation_date === selectedDate;

    return matchesStatus && matchesSearch && matchesTable && matchesDate;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredReservations.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedReservations = filteredReservations.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, selectedTable, selectedDate]);

  const getStatusCount = (status) => {
    return reservations.filter(r => r.status === status).length;
  };

const handleApprove = async (id, payment_method, referenceNo) => {
  // Generate numeric reference for Cash only
  const generateNumericRefNo = () => {
    return Math.floor(100000000 + Math.random() * 900000000).toString();
  };

  let finalRefNo = referenceNo;

  // If GCash, must have reference number from receipt
  if (payment_method?.toLowerCase() === 'gcash') {
    if (!referenceNo) {
      Swal.fire({
        icon: 'error',
        title: 'Missing Reference Number',
        text: 'Please upload a GCash receipt with a valid reference number first.',
      });
      return;
    }

    // Auto-verify GCash reference - show it in modal
    const { isConfirmed } = await Swal.fire({
      title: 'Verify GCash Payment',
      html: `
        <div style="text-align: left; padding: 20px; background-color: #f0f9ff; border-radius: 8px; margin: 10px 0;">
          <p style="margin: 10px 0;"><strong>Reference Number:</strong></p>
          <div style="background-color: white; padding: 12px; border-radius: 6px; border: 2px solid #3b82f6; font-weight: bold; font-size: 16px; letter-spacing: 1px;">
            ${referenceNo}
          </div>
        </div>
        <p style="margin-top: 15px; color: #666;">Please verify this matches the GCash receipt before approving.</p>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Looks Good, Approve',
      cancelButtonText: 'Cancel'
    });

    if (!isConfirmed) return;
    finalRefNo = referenceNo;
  }
  // If Cash, generate numeric reference
  else if (payment_method?.toLowerCase() === 'cash') {
    if (!referenceNo) {
      finalRefNo = generateNumericRefNo();
    } else {
      finalRefNo = referenceNo;
    }
  }

  // Final approval confirmation
  const result = await Swal.fire({
    title: 'Approve Reservation?',
    html: `
      <div style="text-align: left;">
        <p>Are you sure you want to approve this reservation?</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 15px;">
          <p style="margin: 8px 0;"><strong>Payment Method:</strong> <span style="text-transform: uppercase;">${payment_method}</span></p>
          <p style="margin: 8px 0;"><strong>Reference No:</strong></p>
          <div style="background-color: white; padding: 10px; border-radius: 6px; border-left: 4px solid #10b981; font-weight: bold; font-size: 14px;">
            ${finalRefNo}
          </div>
        </div>
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Yes, Approve',
    cancelButtonText: 'Cancel'
  });

  if (!result.isConfirmed) return;

  try {
    const updateData = {
      status: 'approved',
      reference_no: finalRefNo
    };

    const { error } = await supabase
      .from('reservation')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;

    Swal.fire({
      icon: 'success',
      title: 'Approved!',
      html: `
        <p>Reservation approved successfully</p>
        <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin-top: 15px; border: 2px solid #10b981;">
          <p style="margin: 0; font-weight: bold;">Reference No:</p>
          <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #10b981;">${finalRefNo}</p>
        </div>
      `,
      timer: 2500,
      showConfirmButton: false
    });
    fetchReservations();
  } catch (error) {
    console.error('Error approving reservation:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Failed to approve reservation',
    });
  }
};
  const handleReject = async (id) => {
    const result = await Swal.fire({
      title: 'Reject Reservation?',
      text: 'Are you sure you want to reject this reservation?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, reject it!',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      const { error } = await supabase
        .from('reservation')
        .update({ status: 'rejected' })
        .eq('id', id);

      if (error) throw error;

      Swal.fire({
        icon: 'success',
        title: 'Rejected!',
        text: 'Reservation rejected successfully',
        timer: 2000,
        showConfirmButton: false
      });
      fetchReservations();
    } catch (error) {
      console.error('Error rejecting reservation:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to reject reservation',
      });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  const formatTime = (timeString) => {
    if (!timeString) return 'N/A';
    return timeString;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-700 font-semibold text-lg">Loading reservations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Reservation Management</h1>
            <p className="text-gray-600 text-sm mt-1">Manage and track all customer reservations</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-5 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all font-semibold shadow-lg disabled:opacity-50"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Filter size={20} />
          Search & Filters
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Table</label>
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
            >
              <option value="all">All Tables</option>
              <option value="1">Table 1</option>
              <option value="2">Table 2</option>
              <option value="3">Table 3</option>
              <option value="4">Table 4</option>
              <option value="5">Table 5</option>
              <option value="6">Table 6</option>
              <option value="7">Table 7</option>
              <option value="8">Table 8</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Search Customer</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        <TabButton
          active={activeTab === 'pending'}
          onClick={() => setActiveTab('pending')}
          label="Pending"
          count={getStatusCount('pending')}
          color="bg-yellow-100 text-yellow-700 border-yellow-200"
        />
        <TabButton
          active={activeTab === 'approved'}
          onClick={() => setActiveTab('approved')}
          label="Approved"
          count={getStatusCount('approved')}
          color="bg-blue-100 text-blue-700 border-blue-200"
        />
 
        <TabButton
          active={activeTab === 'completed'}
          onClick={() => setActiveTab('completed')}
          label="Completed"
          count={getStatusCount('completed')}
          color="bg-gray-100 text-gray-700 border-gray-200"
        />
      </div>

      {/* Reservations Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">ID</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Reservation #</th>

                <th className="px-4 py-3 text-left text-sm font-semibold">Customer</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Table</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Date</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Time</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Duration</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Amount</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Payment</th>
                <th className="px-4 py-3 text-center text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedReservations.length > 0 ? (
                paginatedReservations.map((reservation) => {
                  const customerName = `${reservation.accounts?.customer?.first_name || ''} ${reservation.accounts?.customer?.last_name || ''}`.trim() || 'N/A';

                  return (
                    <tr key={reservation.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800">#{reservation.id}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800">#{reservation.reservation_no}</td>



                      <td className="px-4 py-3 text-sm text-gray-700">{customerName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        Table {reservation.table_id}
                        <span className="text-xs text-gray-500 ml-1 capitalize">({reservation.billiard_type || 'Standard'})</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(reservation.reservation_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatTime(reservation.start_time)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{reservation.duration} hrs</td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-800">₱{reservation.total_bill || 0}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          {/* Payment Method Badge */}
                          <span className={`px-4 py-2 rounded-full text-xs font-bold capitalize inline-flex items-center gap-2 ${reservation.payment_method?.toLowerCase() === 'gcash'
                              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                              : 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md'
                            }`}>
                            {reservation.payment_method?.toLowerCase() === 'gcash' && (
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="12" r="10" opacity="0.3" />
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                              </svg>
                            )}
                            {reservation.payment_method || 'N/A'}
                          </span>

                          {/* Receipt Button - Only for GCash */}
                          {reservation.payment_method?.toLowerCase() === 'gcash' && (
                            <button
                              onClick={() => handleViewReceipt(reservation)}
                              className="p-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
                              title="View GCash Receipt"
                            >
                              <FileText size={18} strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleViewDetails(reservation)}
                            className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-all"
                            title="View Details"
                          >
                            <Eye size={18} />
                          </button>

                          {activeTab === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(reservation.id, reservation.payment_method, reservation.reference_no)}
                                className="px-4 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-semibold transition-all"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(reservation.id)}
                                className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-all"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" className="px-4 py-12 text-center text-gray-500">
                    No reservations found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredReservations.length > 0 && (
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
              <span className="font-semibold">{Math.min(endIndex, filteredReservations.length)}</span> of{' '}
              <span className="font-semibold">{filteredReservations.length}</span> results
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>

              <div className="flex gap-1">
                {[...Array(totalPages)].map((_, index) => {
                  const pageNum = index + 1;
                  if (
                    pageNum === 1 ||
                    pageNum === totalPages ||
                    (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${currentPage === pageNum
                          ? 'bg-blue-500 text-white'
                          : 'bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  } else if (
                    pageNum === currentPage - 2 ||
                    pageNum === currentPage + 2
                  ) {
                    return <span key={pageNum} className="px-2 text-gray-500">...</span>;
                  }
                  return null;
                })}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {showModal && selectedReservation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Reservation Details</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-white hover:bg-opacity-20 rounded-lg transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Customer Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3 text-lg">Customer Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Full Name</p>
                    <p className="text-gray-800 font-semibold">{`${selectedReservation.accounts?.customer?.first_name || ''} ${selectedReservation.accounts?.customer?.last_name || ''}`.trim() || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Email</p>
                    <p className="text-gray-800 font-semibold">{selectedReservation.accounts?.email || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Reservation Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3 text-lg">Reservation Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Reservation ID</p>
                    <p className="text-gray-800 font-semibold">#{selectedReservation.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Reservation Number</p>
                    <p className="text-gray-800 font-semibold">{selectedReservation.Reservation_No || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Status</p>
                    <p className={`font-semibold capitalize px-2 py-1 rounded w-fit text-sm ${selectedReservation.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      selectedReservation.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                        selectedReservation.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                      }`}>{selectedReservation.status}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Date</p>
                    <p className="text-gray-800 font-semibold">{formatDate(selectedReservation.reservation_date)}</p>
                  </div>
                </div>
              </div>

              {/* Table & Billiard Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3 text-lg">Table Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Table</p>
                    <p className="text-gray-800 font-semibold">Table {selectedReservation.table_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Billiard Type</p>
                    <p className="text-gray-800 font-semibold capitalize">{selectedReservation.billiard_type || 'Standard'}</p>
                  </div>
                </div>
              </div>

              {/* Time Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3 text-lg">Time Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Start Time</p>
                    <p className="text-gray-800 font-semibold">{formatTime(selectedReservation.start_time)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">End Time</p>
                    <p className="text-gray-800 font-semibold">{selectedReservation.time_end || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Duration</p>
                    <p className="text-gray-800 font-semibold">{selectedReservation.duration} hours</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Extension</p>
                    <p className="text-gray-800 font-semibold">{selectedReservation.extension ? `${selectedReservation.extension} hours` : 'None'}</p>
                  </div>
                </div>
              </div>

              {/* Payment Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3 text-lg">Payment Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Total Bill</p>
                    <p className="text-gray-800 font-semibold text-lg">₱{selectedReservation.total_bill || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Payment Method</p>
                    <p className="text-gray-800 font-semibold capitalize">{selectedReservation.payment_method || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Payment Type</p>
                    <p className="text-gray-800 font-semibold capitalize">{selectedReservation.payment_type || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Payment Status</p>
                    <p className={`font-semibold capitalize px-2 py-1 rounded w-fit text-sm ${selectedReservation.payment_status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>{selectedReservation.payment_status ? 'Paid' : 'Pending'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Partial Amount</p>
                    <p className="text-gray-800 font-semibold">₱{selectedReservation.partial_amount || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Full Amount</p>
                    <p className="text-gray-800 font-semibold">₱{selectedReservation.full_amount || 0}</p>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3 text-lg">Additional Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Customer Status</p>
                    <p className="text-gray-800 font-semibold capitalize">{selectedReservation.customer_status || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Created At</p>
                    <p className="text-gray-800 font-semibold">{formatDate(selectedReservation.created_at)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-100 p-4 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-lg font-semibold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label, count, color }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all border-2 whitespace-nowrap ${active
        ? `${color} shadow-md scale-105`
        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
    >
      {label} ({count})
    </button>
  );
}
