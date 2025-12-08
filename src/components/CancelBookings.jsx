import React, { useState, useEffect } from 'react';
import { XCircle, Eye, RefreshCw, Trash2, Edit } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import Swal from 'sweetalert2';

export default function CancelBookings() {
  const [cancelledBookings, setCancelledBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [syncedPayments, setSyncedPayments] = useState([]);
  const [editPaymentType, setEditPaymentType] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [currentAccountId, setCurrentAccountId] = useState(null);
  
  useEffect(() => {
    const session = JSON.parse(localStorage.getItem('userSession'));
    if (session) {
      setUserRole(session.role);
      setCurrentAccountId(session.account_id);
      console.log('🔐 User Session:', session.role, 'Account ID:', session.account_id);
    }
    fetchCancelledBookings();
  }, []);
  
  const fetchCancelledBookings = async () => {
    setLoading(true);
    try {
      const session = JSON.parse(localStorage.getItem('userSession'));
      const userRole = session?.role;
      const accountId = session?.account_id;

      console.log('🔍 Fetching cancelled bookings for role:', userRole);

      let query = supabase
        .from('reservation')
        .select('*')
        .eq('status', 'cancelled')
        .order('reservation_date', { ascending: false })
        .order('start_time', { ascending: true });

      // ✅ Filter by account_id if customer
      if (userRole === 'customer') {
        query = query.eq('account_id', accountId);
        console.log('👤 Customer filter applied - Account ID:', accountId);
      }

      const { data: reservationData, error: reservationError } = await query;

      if (reservationError) throw reservationError;

      console.log('✅ Fetched reservations:', reservationData.length);

      // Fetch accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('account_id, email');

      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from('customer')
        .select('customer_id, account_id, first_name, last_name, middle_name');

      if (accountsError) throw accountsError;
      if (customersError) throw customersError;

      // Join data
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

      setCancelledBookings(combinedData);

      // Check synced payments
      const { data: syncedData } = await supabase
        .from('payment')
        .select('reservation_id');

      setSyncedPayments(syncedData?.map(p => p.reservation_id) || []);

    } catch (error) {
      console.error('❌ Error fetching cancelled bookings:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to load cancelled bookings.',
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCancelledBookings();
    setRefreshing(false);
  };

  const handleViewDetails = (booking) => {
    setSelectedBooking(booking);
    setShowModal(true);
  };

  const handleDelete = async (booking) => {
    const result = await Swal.fire({
      title: 'Delete Booking?',
      html: `
        <div style="text-align: left; margin: 20px 0;">
          <p style="margin-bottom: 10px;"><strong>Are you sure you want to permanently delete this booking?</strong></p>
          <p style="margin-bottom: 8px;">Customer: <strong>${`${booking.accounts?.customer?.first_name || ''} ${booking.accounts?.customer?.last_name || ''}`.trim() || 'N/A'}</strong></p>
          <p style="margin-bottom: 8px;">Table: <strong>${booking.table_id}</strong></p>
          <p style="margin-bottom: 8px;">Date: <strong>${formatDate(booking.reservation_date)}</strong></p>
          <hr style="margin: 15px 0;">
          <p style="color: #ef4444; font-weight: bold;">⚠️ This action cannot be undone!</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      const { error } = await supabase
        .from('reservation')
        .delete()
        .eq('id', booking.id);

      if (error) throw error;

      await Swal.fire({
        icon: 'success',
        title: 'Deleted!',
        text: 'Booking has been permanently deleted.',
        timer: 2000,
        showConfirmButton: false
      });

      fetchCancelledBookings();
    } catch (error) {
      console.error('Error deleting booking:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to delete booking. Please try again.',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const handleEditClick = (booking) => {
    setSelectedBooking(booking);
    setEditPaymentType(booking.payment_type || '');
    
    if (booking.payment_type === 'Full Payment') {
      setEditAmount(booking.full_amount || '');
    } else if (booking.payment_type === 'Half Payment') {
      setEditAmount(booking.half_amount || '');
    } else if (booking.payment_type === 'Partial Payment') {
      setEditAmount(booking.partial_amount || '');
    } else {
      setEditAmount('');
    }
    
    setShowEditModal(true);
  };

  const handleEditSubmit = async () => {
    if (!editPaymentType) {
      await Swal.fire({
        icon: 'warning',
        title: 'Payment Type Required',
        text: 'Please select a payment type.',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    if (!editAmount || parseInt(editAmount) <= 0) {
      await Swal.fire({
        icon: 'warning',
        title: 'Valid Amount Required',
        text: 'Please enter a valid payment amount.',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    const amount = parseInt(editAmount);
    const totalBill = selectedBooking.total_bill || 0;

    if (amount > totalBill) {
      await Swal.fire({
        icon: 'error',
        title: 'Amount Exceeds Bill',
        text: `Payment amount (₱${amount}) cannot exceed total bill (₱${totalBill})`,
        confirmButtonColor: '#ef4444'
      });
      return;
    }

    try {
      let updateData = {
        payment_type: editPaymentType,
        full_amount: null,
        half_amount: null,
        partial_amount: null
      };

      if (editPaymentType === 'Full Payment') {
        updateData.full_amount = amount;
      } else if (editPaymentType === 'Half Payment') {
        updateData.half_amount = amount;
      } else if (editPaymentType === 'Partial Payment') {
        updateData.partial_amount = amount;
      }

      const { error } = await supabase
        .from('reservation')
        .update(updateData)
        .eq('id', selectedBooking.id);

      if (error) throw error;

      await Swal.fire({
        icon: 'success',
        title: 'Payment Updated!',
        text: 'Payment details have been successfully updated.',
        timer: 2000,
        showConfirmButton: false
      });

      setShowEditModal(false);
      setSelectedBooking(null);
      fetchCancelledBookings();
    } catch (error) {
      console.error('Error updating payment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to update payment. Please try again.',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const handleSyncPayment = async (booking) => {
    setSelectedBooking(booking);
    setReferenceNumber('');

    try {
      const { data: existingPayment } = await supabase
        .from('payment')
        .select('payment_id')
        .eq('reservation_id', booking.id)
        .maybeSingle();

      if (existingPayment) {
        await Swal.fire({
          icon: 'info',
          title: 'Already Synced',
          text: 'This payment has already been synced to the payment table.',
          confirmButtonColor: '#3b82f6'
        });
        return;
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
    }

    setShowSyncModal(true);
  };

  const handleSyncSubmit = async () => {
    if (!referenceNumber.trim()) {
      await Swal.fire({
        icon: 'warning',
        title: 'Reference Number Required',
        text: 'Please enter a reference number.',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    setSyncing(true);

    try {
      const { data: existingPayment } = await supabase
        .from('payment')
        .select('payment_id')
        .eq('reservation_id', selectedBooking.id)
        .maybeSingle();

      if (existingPayment) {
        await Swal.fire({
          icon: 'info',
          title: 'Already Synced',
          text: 'This payment has already been synced to the payment table.',
          confirmButtonColor: '#3b82f6'
        });
        setSyncing(false);
        setShowSyncModal(false);
        return;
      }

      let paymentMethod = (selectedBooking.paymentMethod || selectedBooking.payment_method || 'cash').toLowerCase();
      const validMethods = ['cash', 'gcash', 'card', 'online'];
      if (!validMethods.includes(paymentMethod)) {
        paymentMethod = 'cash';
      }

      let totalAmount = 0;

      if (selectedBooking.payment_type === 'Full Payment') {
        totalAmount = selectedBooking.full_amount || selectedBooking.total_bill || 0;
      } else if (selectedBooking.payment_type === 'Half Payment') {
        totalAmount = selectedBooking.half_amount || 0;
      } else if (selectedBooking.payment_type === 'Partial Payment') {
        totalAmount = selectedBooking.partial_amount || 0;
      }

      const { error } = await supabase
        .from('payment')
        .insert({
          reservation_id: selectedBooking.id,
          account_id: selectedBooking.account_id,
          amount: totalAmount,
          method: paymentMethod,
          payment_date: new Date().toISOString(),
          reference_number: referenceNumber.trim(),
          status: 'cancelled'
        });

      if (error) throw error;

      await Swal.fire({
        icon: 'success',
        title: 'Payment Synced!',
        text: 'Payment data has been successfully transferred.',
        timer: 2000,
        showConfirmButton: false
      });

      setShowSyncModal(false);
      setSelectedBooking(null);
      setReferenceNumber('');
      fetchCancelledBookings();
    } catch (error) {
      console.error('Error syncing payment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Sync Failed',
        html: `<p>${error.message || 'Failed to sync payment data.'}</p>`,
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setSyncing(false);
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-orange-50">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-red-500 rounded-full animate-spin border-t-transparent"></div>
          <p className="text-lg font-semibold text-gray-700">Loading cancelled bookings...</p>
        </div>
      </div>
    );
  }

  // ✅ Check if user is admin
  const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRole === 'frontdesk' || userRole === 'manager';

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-red-50 via-pink-50 to-orange-50">
      <div className="mb-8">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="flex items-center gap-3 mb-2 text-4xl font-bold text-gray-900">
              Cancelled Bookings
            </h1>
            <p className="text-lg text-gray-600">
              {isAdmin ? 'Manage all cancelled reservations' : 'View your cancelled reservations'}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-5 py-3 font-semibold text-white transition-all shadow-lg bg-gradient-to-r from-red-500 to-pink-500 rounded-xl hover:from-red-600 hover:to-pink-600 disabled:opacity-50"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-6 bg-white border-2 border-red-100 shadow-xl rounded-2xl">
        <div className="flex items-center gap-3 mb-6"> 
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Cancelled Reservations</h2>
            <p className="text-sm text-gray-600">
              {cancelledBookings.length} cancelled booking(s) {!isAdmin && 'for your account'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
          {cancelledBookings.length > 0 ? (
            cancelledBookings.map((booking) => {
              const customerName = `${booking.accounts?.customer?.first_name || ''} ${booking.accounts?.customer?.last_name || ''}`.trim() || 'N/A';
              const isSynced = syncedPayments.includes(booking.id);

              return (
                <div key={booking.id} className="p-5 transition-all border-2 border-red-200 bg-gradient-to-r from-red-50 to-pink-50 rounded-xl hover:shadow-lg">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-12 h-12 text-lg font-bold text-white rounded-full bg-gradient-to-br from-red-500 to-pink-600">
                        {customerName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{customerName}</h3>
                        <p className="text-sm text-gray-600">Table {booking.table_id}</p>
                      </div>
                    </div>
                    <span className="px-4 py-1.5 bg-red-500 text-white rounded-full text-sm font-bold shadow-md">
                      Cancelled
                    </span>
                  </div>

                  <div className="mb-3 space-y-1">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Date:</span> {formatDate(booking.reservation_date)}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Time:</span> {formatTime(booking.start_time)}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Duration:</span> {booking.duration} hours
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Payment Type:</span> {booking.payment_type || 'N/A'}
                    </p>
                    <div className="p-2 mt-2 bg-red-100 border border-red-300 rounded-lg">
                      <p className="text-sm text-red-800">
                        <span className="font-semibold">Amount Paid:</span> ₱
                        {booking.payment_type === 'Full Payment' 
                          ? (booking.full_amount || 0)
                          : booking.payment_type === 'Half Payment'
                          ? (booking.half_amount || 0)
                          : booking.payment_type === 'Partial Payment'
                          ? (booking.partial_amount || 0)
                          : 0
                        }
                      </p>
                    </div>
                  </div>

                  {/* View Details - visible for all */}
                  <button
                    onClick={() => handleViewDetails(booking)}
                    className="flex items-center justify-center w-full gap-2 px-3 py-2 mb-2 text-sm font-semibold text-red-700 transition-all bg-white border-2 border-red-300 rounded-lg hover:bg-red-50"
                  >
                    <Eye size={16} />
                    View Details
                  </button>
                  
                  {/* Edit Payment - visible for admin only */}
                  {isAdmin && (
                    <button
                      onClick={() => handleEditClick(booking)}
                      className="flex items-center justify-center w-full gap-2 px-3 py-2 mb-2 text-sm font-semibold text-white transition-all bg-blue-500 rounded-lg hover:bg-blue-600"
                    >
                      <Edit size={16} />
                      Edit Payment
                    </button>
                  )}
                  
                  {/* Sync & Delete - visible for admin only */}
                  {isAdmin && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSyncPayment(booking)}
                        disabled={syncing || isSynced}
                        className={`px-3 py-2 rounded-lg transition-all font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSynced
                            ? 'bg-gray-400 text-white cursor-not-allowed'
                            : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600'
                        }`}
                      >
                        <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                        {isSynced ? 'Synced' : 'Sync'}
                      </button>
                      <button
                        onClick={() => handleDelete(booking)}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white transition-all rounded-lg bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center col-span-full">
              <XCircle size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="font-semibold text-gray-500">No cancelled bookings</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals remain the same... */}
      {showModal && selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 text-white bg-gradient-to-r from-red-500 to-pink-500">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="mb-1 text-2xl font-bold">Booking Details</h3>
                  <p className="text-red-100">Reference #{selectedBooking.id}</p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 text-white transition-all rounded-lg hover:bg-white hover:bg-opacity-20"
                >
                  <XCircle size={24} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Customer Name</p>
                  <p className="font-bold text-gray-900">
                    {`${selectedBooking.accounts?.customer?.first_name || ''} ${selectedBooking.accounts?.customer?.last_name || ''}`.trim() || 'N/A'}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Table Number</p>
                  <p className="font-bold text-gray-900">Table {selectedBooking.table_id}</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Date</p>
                  <p className="font-bold text-gray-900">{formatDate(selectedBooking.reservation_date)}</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Time</p>
                  <p className="font-bold text-gray-900">{formatTime(selectedBooking.start_time)}</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Duration</p>
                  <p className="font-bold text-gray-900">{selectedBooking.duration} hours</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Billiard Type</p>
                  <p className="font-bold text-gray-900 capitalize">{selectedBooking.billiard_type || 'Standard'}</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Payment Method</p>
                  <p className="font-bold text-gray-900">{selectedBooking.paymentMethod || selectedBooking.payment_method || 'N/A'}</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Payment Type</p>
                  <p className="font-bold text-gray-900 capitalize">{selectedBooking.payment_type || 'N/A'}</p>
                </div>
              </div>

              <div className="p-4 mb-6 border-2 border-red-200 rounded-lg bg-gradient-to-r from-red-50 to-pink-50">
                <h4 className="mb-3 text-lg font-bold text-gray-900">Payment Information</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Total Bill:</span>
                    <span className="text-lg font-bold text-gray-900">₱{selectedBooking.total_bill || 0}</span>
                  </div>
                  <hr className="border-gray-300" />
                  {selectedBooking.payment_type === 'Full Payment' && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Full Payment:</span>
                      <span className="text-lg font-bold text-red-600">₱{selectedBooking.full_amount || 0}</span>
                    </div>
                  )}
                  {selectedBooking.payment_type === 'Half Payment' && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Half Payment:</span>
                      <span className="text-lg font-bold text-red-600">₱{selectedBooking.half_amount || 0}</span>
                    </div>
                  )}
                  {selectedBooking.payment_type === 'Partial Payment' && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Partial Payment:</span>
                      <span className="text-lg font-bold text-red-600">₱{selectedBooking.partial_amount || 0}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-2 border-red-200 rounded-lg bg-gradient-to-r from-red-50 to-pink-50">
                <p className="mb-1 text-sm text-gray-600">Status</p>
                <p className="text-2xl font-bold text-red-600 capitalize">{selectedBooking.status}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
