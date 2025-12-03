import React, { useState, useEffect } from 'react';
import { CreditCard, Clock, Hourglass, User, Calendar, CheckCircle, XCircle, Eye, RefreshCw, Plus } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import Swal from 'sweetalert2';

export default function FinalizePayment() {
  const [activePayments, setActivePayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [completedPayments, setCompletedPayments] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedExtension, setSelectedExtension] = useState('');

  useEffect(() => {
    fetchPayments();
    fetchExtensions();
  }, []);

  const fetchExtensions = async () => {
    try {
      const { data, error } = await supabase
        .from('extensionTagging')
        .select('*');

      if (error) throw error;
      setExtensions(data || []);
    } catch (error) {
      console.error('Error fetching extensions:', error);
    }
  };

  const getExtensionPrice = (billiardType, hours) => {
    const extension = extensions.find(
      ext => ext.billiard_type === billiardType && parseFloat(ext.extension_hours) === parseFloat(hours)
    );
    return extension?.price || 0;
  };

  const getAvailableExtensions = (billiardType) => {
    return extensions.filter(ext => ext.billiard_type === billiardType);
  };

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const { data: reservationData, error: reservationError } = await supabase
        .from('reservation')
        .select('*')
        .in('status', ['ongoing', 'approved', 'completed'])
        .order('reservation_date', { ascending: false })
        .order('start_time', { ascending: true });

      if (reservationError) throw reservationError;

   // Fetch accounts
const { data: accountsData, error: accountsError } = await supabase
  .from('accounts')
  .select('account_id, email'); // remove nested customer

// Fetch customers separately
const { data: customersData, error: customersError } = await supabase
  .from('customer')
  .select('customer_id, account_id, first_name, last_name, middle_name');

if (accountsError) throw accountsError;
if (customersError) throw customersError;

// Join manually
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


      const active = combinedData.filter(r => r.status === 'ongoing');
      const pending = combinedData.filter(r => r.status === 'approved');
      const completed = combinedData.filter(r => r.status === 'completed');

      setActivePayments(active);
      setPendingPayments(pending);
      setCompletedPayments(completed);

      // CHECK SYNCED PAYMENTS - DAGDAG TO!
      const { data: syncedData } = await supabase
        .from('payment')
        .select('reservation_id');

      setSyncedPayments(syncedData?.map(p => p.reservation_id) || []);

    } catch (error) {
      // ... error handling
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPayments();
    await fetchExtensions();
    setRefreshing(false);
  };

const handleEndSession = async (id) => {
  const payment = activePayments.find(p => p.id === id);
  if (!payment) return;

  const totalBill = payment.total_bill || 0;
  const paymentType = payment.payment_type;

  let totalPaid = 0;

  if (paymentType === 'Full Payment') {
    totalPaid = payment.full_amount || 0;
  } else if (paymentType === 'Half Payment') {
    totalPaid = payment.half_amount || 0;
  } else if (paymentType === 'Partial Payment') {
    totalPaid = payment.partial_amount || 0;
  }

  if (totalPaid < totalBill) {
    const remaining = totalBill - totalPaid;

    const paymentChoice = await Swal.fire({
      icon: 'warning',
      title: 'Payment Incomplete!',
      html: `
        <div style="text-align: left; margin: 20px 0;">
          <p style="margin-bottom: 10px;"><strong>Cannot end session!</strong></p>
          <p style="margin-bottom: 8px;">Total Bill: <strong>₱${totalBill}</strong></p>
          <p style="margin-bottom: 8px;">Amount Paid: <strong>₱${totalPaid}</strong></p>
          <p style="margin-bottom: 8px; color: #d32f2f;">Remaining Balance: <strong>₱${remaining}</strong></p>
          <hr style="margin: 15px 0;">
          <p style="color: #666;">Please complete the full payment before ending the session.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Pay Now',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6b7280',
    });

    if (!paymentChoice.isConfirmed) return;

    // Process payment for remaining balance
    try {
      let updateData = {
        status: 'completed',
        payment_status: 'Completed'
      };

      if (paymentType === 'Full Payment') {
        updateData.full_amount = totalBill;
      } else if (paymentType === 'Half Payment') {
        updateData.half_amount = totalBill;
      } else if (paymentType === 'Partial Payment') {
        updateData.partial_amount = totalBill;
      }

      const { error } = await supabase
        .from('reservation')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      await Swal.fire({
        icon: 'success',
        title: 'Payment Complete!',
        html: `
          <div style="text-align: center; margin: 20px 0;">
            <p style="margin-bottom: 10px;">Remaining balance of <strong>₱${remaining}</strong> has been paid.</p>
            <p style="color: #10b981; font-weight: bold;">Session completed successfully!</p>
          </div>
        `,
        timer: 2500,
        showConfirmButton: false
      });

      // LOG COMPLETED SESSION
      await supabase
        .from('transaction_history')
        .insert({
          table_id: payment.table_id,
          reservation_date: payment.reservation_date,
          start_time: payment.start_time,
          duration: payment.duration,
          status: 'completed',
          extension: payment.extension || 0,
          time_end: calculateEndTime(payment.start_time, payment.duration),
          paymentMethod: 'Cash',
          billiard_type: payment.billiard_type,
          amount: totalBill
        });

      fetchPayments();
      return;
    } catch (error) {
      console.error('Error processing payment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to process payment. Please try again.',
        confirmButtonColor: '#ef4444'
      });
      return;
    }
  }

  const result = await Swal.fire({
    title: 'End Session?',
    text: 'Are you sure you want to end this session?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Yes, end session',
    cancelButtonText: 'Cancel'
  });

  if (!result.isConfirmed) return;

  try {
    const { error } = await supabase
      .from('reservation')
      .update({ 
        status: 'completed',
        payment_status: 'Completed'
      })
      .eq('id', id);

    if (error) throw error;

    await Swal.fire({
      icon: 'success',
      title: 'Session Ended!',
      text: 'The session has been completed successfully.',
      timer: 2000,
      showConfirmButton: false
    });

    // LOG COMPLETED SESSION
    await supabase
      .from('transaction_history')
      .insert({
        table_id: payment.table_id,
        reservation_date: payment.reservation_date,
        start_time: payment.start_time,
        duration: payment.duration,
        status: 'completed',
        extension: payment.extension || 0,
        time_end: calculateEndTime(payment.start_time, payment.duration),
        paymentMethod: payment.paymentMethod || 'Cash',
        billiard_type: payment.billiard_type,
        amount: totalBill
      });

    fetchPayments();
  } catch (error) {
    console.error('Error ending session:', error);
    await Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Failed to end session. Please try again.',
      confirmButtonColor: '#ef4444'
    });
  }
};

  const handleExtensionClick = (payment) => {
    setSelectedPayment(payment);
    setSelectedExtension('');
    setPaymentAmount('');
    setShowExtensionModal(true);
  };

  const handleExtensionSubmit = async () => {
    if (!selectedExtension) {
      await Swal.fire({
        icon: 'warning',
        title: 'No Extension Selected',
        text: 'Please select an extension duration.',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    const extensionData = extensions.find(ext => ext.id === parseInt(selectedExtension));
    if (!extensionData) return;

    // Ask if they want to pay now or later
    const paymentChoice = await Swal.fire({
      title: 'Extension Payment',
      html: `
      <div style="text-align: left; margin: 20px 0;">
        <p style="margin-bottom: 10px;"><strong>Extension Details:</strong></p>
        <p style="margin-bottom: 8px;">Hours: <strong>${extensionData.extension_hours} hour(s)</strong></p>
        <p style="margin-bottom: 8px;">Price: <strong>₱${extensionData.price}</strong></p>
        <p style="margin-bottom: 8px;">New Total: <strong>₱${(selectedPayment.total_bill || 0) + extensionData.price}</strong></p>
        <hr style="margin: 15px 0;">
        <p style="font-weight: bold; color: #2563eb;">When will customer pay for extension?</p>
      </div>
    `,
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Pay Now (Cash)',
      denyButtonText: 'Pay Later',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#10b981',
      denyButtonColor: '#f59e0b',
      cancelButtonColor: '#6b7280',
    });

    if (paymentChoice.isDismissed) return;

    const payNow = paymentChoice.isConfirmed;

    try {
      const newTotalBill = (selectedPayment.total_bill || 0) + extensionData.price;
      const extensionHours = Math.round(parseFloat(extensionData.extension_hours));
      const newExtension = (selectedPayment.extension || 0) + extensionHours;
      const newDuration = selectedPayment.duration + extensionHours;

      let updateData = {
        extension: newExtension,
        duration: newDuration,
        total_bill: newTotalBill,
        status: 'ongoing', // STAY ONGOING KAHIT PAY LATER
      };

      if (payNow) {
        // Pay Now - Cash payment, update the payment amounts
        const paymentType = selectedPayment.payment_type;

        if (paymentType === 'Full Payment') {
          updateData.full_amount = newTotalBill;
        } else if (paymentType === 'Half Payment') {
          updateData.half_amount = newTotalBill;
        } else if (paymentType === 'Partial Payment') {
          updateData.partial_amount = newTotalBill;
        }

        updateData.paymentMethod = 'Cash';
      }
      // If Pay Later, just update total_bill, don't update payment amounts

      const { error } = await supabase
        .from('reservation')
        .update(updateData)
        .eq('id', selectedPayment.id);

      if (error) throw error;

      await Swal.fire({
        icon: 'success',
        title: payNow ? 'Extension Paid!' : 'Extension Added!',
        text: payNow
          ? 'Extension paid with cash. Session continues.'
          : 'Extension added. Payment can be settled later.',
        timer: 2000,
        showConfirmButton: false
      });

      // DAGDAG TO - LOG EXTENSION SA TRANSACTION HISTORY!
      await supabase
        .from('transaction_history')
        .insert({
          table_id: selectedPayment.table_id,
          reservation_date: selectedPayment.reservation_date,
          start_time: selectedPayment.start_time,
          duration: newDuration,
          status: 'ongoing',
          extension: newExtension,
          time_end: calculateEndTime(selectedPayment.start_time, newDuration),
          paymentMethod: payNow ? 'Cash' : 'Pending',
          billiard_type: selectedPayment.billiard_type,
          amount: newTotalBill
        });


      setShowExtensionModal(false);
      setSelectedPayment(null);
      fetchPayments();
    } catch (error) {
      console.error('Error adding extension:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to add extension. Please try again.',
        confirmButtonColor: '#ef4444'
      });
    }
  };
  const handleConfirmPaymentClick = (payment) => {
    setSelectedPayment(payment);
    setPaymentAmount('');
    setShowConfirmModal(true);
  };

  const handleConfirmPaymentSubmit = async () => {
    if (!selectedPayment) return;

    const paymentType = selectedPayment.payment_type;
    const totalBill = selectedPayment.total_bill || 0;

    if ((paymentType === 'Half Payment' || paymentType === 'Partial Payment') && !paymentAmount) {
      await Swal.fire({
        icon: 'warning',
        title: 'Amount Required',
        text: 'Please enter the payment amount.',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    try {
      let updateData = {};

      if (paymentType === 'Full Payment') {
        updateData = {
          status: 'ongoing',
          full_amount: totalBill
        };
      } else if (paymentType === 'Half Payment') {
        const newAmount = parseInt(paymentAmount) || 0;
        const previousAmount = selectedPayment.half_amount || 0;
        const newTotal = previousAmount + newAmount;

        if (newTotal > totalBill) {
          await Swal.fire({
            icon: 'error',
            title: 'Amount Exceeds Bill',
            text: `Total payment (₱${newTotal}) cannot exceed total bill (₱${totalBill})`,
            confirmButtonColor: '#ef4444'
          });
          return;
        }

        updateData.half_amount = newTotal;

        if (newTotal >= totalBill) {
          updateData.status = 'ongoing';
        } else {
          updateData.status = 'approved';
        }
      } else if (paymentType === 'Partial Payment') {
        const newAmount = parseInt(paymentAmount) || 0;
        const previousAmount = selectedPayment.partial_amount || 0;
        const newTotal = previousAmount + newAmount;

        if (newTotal > totalBill) {
          await Swal.fire({
            icon: 'error',
            title: 'Amount Exceeds Bill',
            text: `Total payment (₱${newTotal}) cannot exceed total bill (₱${totalBill})`,
            confirmButtonColor: '#ef4444'
          });
          return;
        }

        updateData.partial_amount = newTotal;

        if (newTotal >= totalBill) {
          updateData.status = 'ongoing';
        } else {
          updateData.status = 'approved';
        }
      }

      const { error } = await supabase
        .from('reservation')
        .update(updateData)
        .eq('id', selectedPayment.id);

      if (error) throw error;

      const isComplete = paymentType === 'Full Payment' ||
        (paymentType === 'Half Payment' && updateData.half_amount >= totalBill) ||
        (paymentType === 'Partial Payment' && updateData.partial_amount >= totalBill);

      await Swal.fire({
        icon: 'success',
        title: isComplete ? 'Payment Complete!' : 'Payment Recorded',
        text: isComplete
          ? 'Payment completed! Moving to Current sessions.'
          : 'Partial payment recorded. Remaining balance still pending.',
        timer: 2000,
        showConfirmButton: false
      });

      // DAGDAG TO - LOG SA TRANSACTION HISTORY!
      await supabase
        .from('transaction_history')
        .insert({
          table_id: selectedPayment.table_id,
          reservation_date: selectedPayment.reservation_date,
          start_time: selectedPayment.start_time,
          duration: selectedPayment.duration,
          status: isComplete ? 'ongoing' : 'approved',
          extension: selectedPayment.extension || 0,
          time_end: calculateEndTime(selectedPayment.start_time, selectedPayment.duration),
          paymentMethod: selectedPayment.paymentMethod || 'N/A',
          billiard_type: selectedPayment.billiard_type,
          amount: paymentType === 'Full Payment'
            ? totalBill
            : (paymentType === 'Half Payment' ? updateData.half_amount : updateData.partial_amount)
        });


      setShowConfirmModal(false);
      setSelectedPayment(null);
      setPaymentAmount('');
      fetchPayments();
    } catch (error) {
      console.error('Error confirming payment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to confirm payment. Please try again.',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const handleViewDetails = (payment) => {
    setSelectedPayment(payment);
    setShowModal(true);
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

  const calculateEndTime = (startTime, duration) => {
    if (!startTime || !duration) return 'N/A';
    const [time, period] = startTime.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    hours += duration;

    const endPeriod = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    return `${hours}:${minutes.toString().padStart(2, '0')} ${endPeriod}`;
  };

  // 1. States FIRST
  const [syncing, setSyncing] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncedPayments, setSyncedPayments] = useState([]); // DAPAT NANDITO NA!

  // 2. TANGGALIN MUNA YUNG isSynced dito, ilagay sa loob ng map
  const handleSyncPayment = async (payment) => {
    setSelectedPayment(payment);
    setReferenceNumber('');

    // CHECK MUNA IF SYNCED NA
    try {
      const { data: existingPayment } = await supabase
        .from('payment')
        .select('payment_id')
        .eq('reservation_id', payment.id)
        .maybeSingle();

      if (existingPayment) {
        // SHOW ALERT TAPOS RETURN
        await Swal.fire({
          icon: 'info',
          title: 'Already Synced',
          text: 'This payment has already been synced to the payment table.',
          confirmButtonColor: '#3b82f6'
        });
        return; // HINDI NA MAGBUBUKAS NG MODAL
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
    }

    // KUNG WALA PA, OPEN MODAL
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
      // Check if already synced - USE maybeSingle()
      const { data: existingPayment, error: checkError } = await supabase
        .from('payment')
        .select('payment_id')
        .eq('reservation_id', selectedPayment.id)
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

      // Validate payment method
      let paymentMethod = (selectedPayment.paymentMethod || 'cash').toLowerCase();
      const validMethods = ['cash', 'gcash', 'card', 'online'];
      if (!validMethods.includes(paymentMethod)) {
        paymentMethod = 'cash';
      }

      let totalAmount = 0;

      if (selectedPayment.payment_type === 'Full Payment') {
        totalAmount = selectedPayment.full_amount || selectedPayment.total_bill || 0;
      } else if (selectedPayment.payment_type === 'Half Payment') {
        totalAmount = selectedPayment.half_amount || 0;
      } else if (selectedPayment.payment_type === 'Partial Payment') {
        totalAmount = selectedPayment.partial_amount || 0;
      }

      // Log data before insert
      console.log('Inserting payment:', {
        reservation_id: selectedPayment.id,
        amount: totalAmount,
        method: paymentMethod,
        reference_number: referenceNumber.trim(),
        status: 'completed'
      });

      const { data, error } = await supabase
        .from('payment')
        .insert({
          reservation_id: selectedPayment.id,
          account_id: selectedPayment.account_id, // DAGDAG TO!
          amount: totalAmount,
          method: paymentMethod,
          payment_date: new Date().toISOString(),
          reference_number: referenceNumber.trim(),
          status: 'completed'
        })
        .select();

      if (error) {
        console.error('Insert Error:', error);
        throw error;
      }

      console.log('Payment synced successfully:', data);

      await Swal.fire({
        icon: 'success',
        title: 'Payment Synced!',
        text: 'Payment data has been successfully transferred.',
        timer: 2000,
        showConfirmButton: false
      });

      setShowSyncModal(false);
      setSelectedPayment(null);
      setReferenceNumber('');
    } catch (error) {
      console.error('Error syncing payment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Sync Failed',
        html: `<p>${error.message || 'Failed to sync payment data.'}</p><small>${error.details || ''}</small>`,
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-6">
      <div className="mb-8">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
              <CreditCard className="text-indigo-600" size={36} />
              Finalize Payment
            </h1>
            <p className="text-gray-600 text-lg">Manage current sessions and process final payments</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-semibold shadow-lg disabled:opacity-50"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Payments */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-orange-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
           <Hourglass className="text-white" size={24} />

            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Pending</h2>
              <p className="text-sm text-gray-600">{pendingPayments.length} awaiting</p>
            </div>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {pendingPayments.length > 0 ? (
              pendingPayments.map((payment) => {
                const customerName = `${payment.accounts?.customer?.first_name || ''} ${payment.accounts?.customer?.last_name || ''}`.trim() || 'N/A';
                const extensionPrice = payment.extension ? getExtensionPrice(payment.billiard_type, payment.extension) : 0;

                return (
                  <div key={payment.id} className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-5 border-2 border-orange-200 hover:shadow-lg transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {customerName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg">{customerName}</h3>
                          <p className="text-sm text-gray-600">Table {payment.table_id}</p>
                        </div>
                      </div>
                      <span className="px-4 py-1.5 bg-orange-500 text-white rounded-full text-sm font-bold shadow-md">
                        Pending
                      </span>
                    </div>

                    <div className="space-y-1 mb-3">
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Duration:</span> {payment.duration} hours
                      </p>
                      {payment.extension > 0 && (
                        <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg border border-blue-200">
                          <Plus size={14} className="text-blue-600" />
                          <span className="text-sm text-blue-800 font-semibold">
                            Extension: {payment.extension}h - ₱{extensionPrice}
                          </span>
                        </div>
                      )}
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Amount:</span> ₱{payment.total_bill || 0}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button
                        onClick={() => handleViewDetails(payment)}
                        className="px-3 py-2 bg-white border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-all font-semibold text-sm flex items-center justify-center gap-2"
                      >
                        <Eye size={16} />
                        View
                      </button>
                      <button
                        onClick={() => handleExtensionClick(payment)}
                        className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all font-semibold text-sm flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Extend
                      </button>
                    </div>
                    <button
                      onClick={() => handleConfirmPaymentClick(payment)}
                      className="w-full px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-semibold text-sm shadow-md"
                    >
                      Confirm Payment
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <CheckCircle size={48} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-semibold">No pending payments</p>
              </div>
            )}
          </div>
        </div>

        {/* Currently Playing */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-green-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center">
              <Clock className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Ongoing</h2>
              <p className="text-sm text-gray-600">{activePayments.length} playing</p>
            </div>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {activePayments.length > 0 ? (
              activePayments.map((payment) => {
                const customerName = `${payment.accounts?.customer?.first_name || ''} ${payment.accounts?.customer?.last_name || ''}`.trim() || 'N/A';
                const endTime = calculateEndTime(payment.start_time, payment.duration);
                const extensionPrice = payment.extension ? getExtensionPrice(payment.billiard_type, payment.extension) : 0;

                return (
                  <div key={payment.id} className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-5 border-2 border-green-200 hover:shadow-lg transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {customerName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg">{customerName}</h3>
                          <p className="text-sm text-gray-600">Table {payment.table_id}</p>
                        </div>
                      </div>
                      <span className="px-4 py-1.5 bg-green-500 text-white rounded-full text-sm font-bold shadow-md">
                        Active
                      </span>
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Clock size={16} className="text-green-600" />
                        <span className="font-semibold">{formatTime(payment.start_time)} - {endTime}</span>
                      </div>
                      {payment.extension > 0 && (
                        <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg border border-blue-200">
                          <Plus size={14} className="text-blue-600" />
                          <span className="text-sm text-blue-800 font-semibold">
                            Extension: {payment.extension}h - ₱{extensionPrice}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button
                        onClick={() => handleViewDetails(payment)}
                        className="px-3 py-2 bg-white border-2 border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-all font-semibold text-sm flex items-center justify-center gap-2"
                      >
                        <Eye size={16} />
                        View
                      </button>
                      <button
                        onClick={() => handleExtensionClick(payment)}
                        className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all font-semibold text-sm flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Extend
                      </button>
                    </div>
                    <button
                      onClick={() => handleEndSession(payment.id)}
                      className="w-full px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-lg hover:from-red-600 hover:to-pink-600 transition-all font-semibold text-sm shadow-md"
                    >
                      End Session
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <CheckCircle size={48} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-semibold">No active sessions</p>
              </div>
            )}
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-400 to-gray-500 rounded-xl flex items-center justify-center">
              <CheckCircle className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Completed</h2>
              <p className="text-sm text-gray-600">{completedPayments.length} finished</p>
            </div>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {completedPayments.length > 0 ? (
              completedPayments.map((payment) => {
                const customerName = `${payment.accounts?.customer?.first_name || ''} ${payment.accounts?.customer?.last_name || ''}`.trim() || 'N/A';
                const isSynced = syncedPayments.includes(payment.id); // ✅ DITO!

                return (
                  <div key={payment.id} className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-5 border-2 border-gray-200 hover:shadow-lg transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-gray-500 to-gray-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {customerName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg">{customerName}</h3>
                          <p className="text-sm text-gray-600">Table {payment.table_id}</p>
                        </div>
                      </div>
                      <span className="px-4 py-1.5 bg-gray-500 text-white rounded-full text-sm font-bold shadow-md">
                        Done
                      </span>
                    </div>

                    <div className="space-y-1 mb-3">
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Date:</span> {formatDate(payment.reservation_date)}
                      </p>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Amount:</span> ₱{payment.total_bill || 0}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleViewDetails(payment)}
                        className="px-3 py-2 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-semibold text-sm flex items-center justify-center gap-2"
                      >
                        <Eye size={16} />
                        View
                      </button>
                      <button
                        onClick={() => handleSyncPayment(payment)}
                        disabled={syncing || isSynced}
                        className={`px-3 py-2 rounded-lg transition-all font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${isSynced
                          ? 'bg-gray-400 text-white cursor-not-allowed'
                          : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600'
                          }`}
                      >
                        <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                        {isSynced ? 'Synced' : syncing ? 'Syncing...' : 'Sync'}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <CheckCircle size={48} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-semibold">No completed sessions</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Extension Modal */}
      {showExtensionModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-6 text-white">
              <h3 className="text-2xl font-bold mb-1">Add Extension</h3>
              <p className="text-blue-100">
                {`${selectedPayment.accounts?.customer?.first_name || ''} ${selectedPayment.accounts?.customer?.last_name || ''}`.trim() || 'N/A'} - Table {selectedPayment.table_id}
              </p>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Billiard Type</p>
                  <p className="font-bold text-gray-900 capitalize">{selectedPayment.billiard_type || 'Standard'}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Current Duration</p>
                  <p className="font-bold text-gray-900">{selectedPayment.duration} hours</p>
                </div>

                {selectedPayment.extension > 0 && (
                  <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                    <p className="text-sm text-blue-600 mb-1">Current Extension</p>
                    <p className="font-bold text-blue-900">{selectedPayment.extension} hours</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Select Extension
                  </label>
                  <select
                    value={selectedExtension}
                    onChange={(e) => setSelectedExtension(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-semibold"
                  >
                    <option value="">Choose extension hours...</option>
                    {getAvailableExtensions(selectedPayment.billiard_type).map((ext) => (
                      <option key={ext.id} value={ext.id}>
                        {ext.extension_hours} hour{parseFloat(ext.extension_hours) !== 1 ? 's' : ''} - ₱{ext.price}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedExtension && (
                  <div className="bg-indigo-50 rounded-lg p-4 border-2 border-indigo-200">
                    <p className="text-sm text-indigo-600 mb-2">New Total</p>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Duration:</span> {selectedPayment.duration + parseFloat(extensions.find(e => e.id === parseInt(selectedExtension))?.extension_hours || 0)} hours
                      </p>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Amount:</span> ₱{(selectedPayment.total_bill || 0) + (extensions.find(e => e.id === parseInt(selectedExtension))?.price || 0)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowExtensionModal(false);
                    setSelectedPayment(null);
                  }}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExtensionSubmit}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all font-semibold shadow-md"
                >
                  Add Extension
                </button>
              </div>

              <div className="mt-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800 font-semibold">
                  ⚠️ Note: Status will change to Pending after adding extension
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Payment Modal */}
      {showConfirmModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 text-white">
              <h3 className="text-2xl font-bold mb-1">Confirm Payment</h3>
              <p className="text-green-100">Reference #{selectedPayment.id}</p>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Billiard Type</p>
                  <p className="font-bold text-gray-900 capitalize">{selectedPayment.billiard_type || 'Standard'}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Payment Type</p>
                  <p className="font-bold text-gray-900 capitalize">{selectedPayment.payment_type || 'N/A'}</p>
                </div>

                {selectedPayment.extension > 0 && (
                  <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                    <p className="text-sm text-blue-600 mb-1">Extension</p>
                    <p className="font-bold text-blue-900">
                      {selectedPayment.extension} hours - ₱{getExtensionPrice(selectedPayment.billiard_type, selectedPayment.extension)}
                    </p>
                  </div>
                )}

                <div className="bg-indigo-50 rounded-lg p-4 border-2 border-indigo-200">
                  <p className="text-sm text-indigo-600 mb-1">Total Bill</p>
                  <p className="text-3xl font-bold text-indigo-900">₱{selectedPayment.total_bill || 0}</p>
                </div>

                {(selectedPayment.payment_type === 'Half Payment' || selectedPayment.payment_type === 'Partial Payment') && (
                  <>
                    <div className="bg-amber-50 rounded-lg p-4 border-2 border-amber-200">
                      <p className="text-sm text-amber-600 mb-2 font-semibold">Previous Payment</p>
                      <p className="text-2xl font-bold text-amber-900">
                        ₱{selectedPayment.payment_type === 'Half Payment'
                          ? (selectedPayment.half_amount || 0)
                          : (selectedPayment.partial_amount || 0)
                        }
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        Remaining: ₱{selectedPayment.total_bill - (selectedPayment.payment_type === 'Half Payment'
                          ? (selectedPayment.half_amount || 0)
                          : (selectedPayment.partial_amount || 0)
                        )}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Enter Payment Amount
                      </label>
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="Enter amount to pay"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg font-semibold"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Enter the amount customer is paying now
                      </p>
                    </div>

                    {paymentAmount && (
                      <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
                        <p className="text-sm text-green-600 mb-2 font-semibold">New Total Payment</p>
                        <p className="text-2xl font-bold text-green-900">
                          ₱{(selectedPayment.payment_type === 'Half Payment'
                            ? (selectedPayment.half_amount || 0)
                            : (selectedPayment.partial_amount || 0)
                          ) + parseInt(paymentAmount || 0)}
                        </p>
                        <p className="text-sm text-green-700 mt-1">
                          Still Remaining: ₱{Math.max(0, selectedPayment.total_bill - (
                            (selectedPayment.payment_type === 'Half Payment'
                              ? (selectedPayment.half_amount || 0)
                              : (selectedPayment.partial_amount || 0)
                            ) + parseInt(paymentAmount || 0)
                          ))}
                        </p>

                        {(selectedPayment.total_bill - (
                          (selectedPayment.payment_type === 'Half Payment'
                            ? (selectedPayment.half_amount || 0)
                            : (selectedPayment.partial_amount || 0)
                          ) + parseInt(paymentAmount || 0)
                        )) === 0 && (
                            <div className="mt-2 p-2 bg-green-100 rounded-lg">
                              <p className="text-sm text-green-800 font-bold">✅ Payment Complete - Will move to Current!</p>
                            </div>
                          )}

                        {(selectedPayment.total_bill - (
                          (selectedPayment.payment_type === 'Half Payment'
                            ? (selectedPayment.half_amount || 0)
                            : (selectedPayment.partial_amount || 0)
                          ) + parseInt(paymentAmount || 0)
                        )) > 0 && (
                            <div className="mt-2 p-2 bg-yellow-100 rounded-lg border border-yellow-300">
                              <p className="text-sm text-yellow-800 font-bold">⚠️ Partial Payment - Will stay in Pending</p>
                            </div>
                          )}
                      </div>
                    )}
                  </>
                )}

                {selectedPayment.payment_type === 'Full Payment' && (
                  <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
                    <p className="text-sm text-green-600 mb-2 font-semibold">✅ Full Payment</p>
                    <p className="text-sm text-green-700 mb-3">
                      Customer will pay the full amount
                    </p>
                    <p className="text-3xl font-bold text-green-900">₱{selectedPayment.total_bill}</p>
                    <div className="mt-3 p-2 bg-green-100 rounded-lg">
                      <p className="text-sm text-green-800 font-bold">Will move to Current sessions immediately</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setSelectedPayment(null);
                    setPaymentAmount('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPaymentSubmit}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-semibold shadow-md"
                >
                  Confirm Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {showModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-6 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold mb-1">Payment Details</h3>
                  <p className="text-indigo-100">Reference #{selectedPayment.id}</p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-all"
                >
                  <XCircle size={24} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Customer Name</p>
                  <p className="font-bold text-gray-900">
                    {`${selectedPayment.accounts?.customer?.first_name || ''} ${selectedPayment.accounts?.customer?.last_name || ''}`.trim() || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Table Number</p>
                  <p className="font-bold text-gray-900">Table {selectedPayment.table_id}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Date</p>
                  <p className="font-bold text-gray-900">{formatDate(selectedPayment.reservation_date)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Time</p>
                  <p className="font-bold text-gray-900">{formatTime(selectedPayment.start_time)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Duration</p>
                  <p className="font-bold text-gray-900">{selectedPayment.duration} hours</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Billiard Type</p>
                  <p className="font-bold text-gray-900 capitalize">{selectedPayment.billiard_type || 'Standard'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Payment Method</p>
                  <p className="font-bold text-gray-900">{selectedPayment.paymentMethod || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Payment Type</p>
                  <p className="font-bold text-gray-900 capitalize">{selectedPayment.payment_type || 'N/A'}</p>
                </div>
                {selectedPayment.extension > 0 && (
                  <div className="bg-blue-50 rounded-lg p-4 col-span-2 border-2 border-blue-200">
                    <p className="text-sm text-blue-600 mb-1">Extension</p>
                    <p className="font-bold text-blue-900">
                      {selectedPayment.extension} hours - ₱{getExtensionPrice(selectedPayment.billiard_type, selectedPayment.extension)}
                    </p>
                  </div>
                )}
              </div>

              {/* Payment Details Section */}
              <div className="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border-2 border-purple-200">
                <h4 className="text-lg font-bold text-gray-900 mb-3">Payment Information</h4>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Total Bill:</span>
                    <span className="text-lg font-bold text-gray-900">₱{selectedPayment.total_bill || 0}</span>
                  </div>

                  {selectedPayment.payment_type === 'Full Payment' && (
                    <>
                      <hr className="border-gray-300" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-700">Full Payment:</span>
                        <span className="text-lg font-bold text-green-600">₱{selectedPayment.full_amount || 0}</span>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                        <p className="text-sm text-green-800 font-semibold text-center">
                          {(selectedPayment.full_amount || 0) >= (selectedPayment.total_bill || 0)
                            ? '✅ Fully Paid'
                            : '⚠️ Not Yet Paid'}
                        </p>
                      </div>
                    </>
                  )}

                  {selectedPayment.payment_type === 'Half Payment' && (
                    <>
                      <hr className="border-gray-300" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-700">Amount Paid:</span>
                        <span className="text-lg font-bold text-blue-600">₱{selectedPayment.half_amount || 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-700">Remaining:</span>
                        <span className="text-lg font-bold text-orange-600">
                          ₱{Math.max(0, (selectedPayment.total_bill || 0) - (selectedPayment.half_amount || 0))}
                        </span>
                      </div>
                      <div className={`rounded-lg p-2 border ${(selectedPayment.half_amount || 0) >= (selectedPayment.total_bill || 0)
                        ? 'bg-green-50 border-green-200'
                        : 'bg-yellow-50 border-yellow-200'
                        }`}>
                        <p className={`text-sm font-semibold text-center ${(selectedPayment.half_amount || 0) >= (selectedPayment.total_bill || 0)
                          ? 'text-green-800'
                          : 'text-yellow-800'
                          }`}>
                          {(selectedPayment.half_amount || 0) >= (selectedPayment.total_bill || 0)
                            ? '✅ Fully Paid'
                            : '⚠️ Partial Payment'}
                        </p>
                      </div>
                    </>
                  )}

                  {selectedPayment.payment_type === 'Partial Payment' && (
                    <>
                      <hr className="border-gray-300" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-700">Amount Paid:</span>
                        <span className="text-lg font-bold text-blue-600">₱{selectedPayment.partial_amount || 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-700">Remaining:</span>
                        <span className="text-lg font-bold text-orange-600">
                          ₱{Math.max(0, (selectedPayment.total_bill || 0) - (selectedPayment.partial_amount || 0))}
                        </span>
                      </div>
                      <div className={`rounded-lg p-2 border ${(selectedPayment.partial_amount || 0) >= (selectedPayment.total_bill || 0)
                        ? 'bg-green-50 border-green-200'
                        : 'bg-yellow-50 border-yellow-200'
                        }`}>
                        <p className={`text-sm font-semibold text-center ${(selectedPayment.partial_amount || 0) >= (selectedPayment.total_bill || 0)
                          ? 'text-green-800'
                          : 'text-yellow-800'
                          }`}>
                          {(selectedPayment.partial_amount || 0) >= (selectedPayment.total_bill || 0)
                            ? '✅ Fully Paid'
                            : '⚠️ Partial Payment'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border-2 border-indigo-200">
                <p className="text-sm text-gray-600 mb-1">Status</p>
                <p className="text-2xl font-bold text-indigo-600 capitalize">{selectedPayment.status}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSyncModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 text-white">
              <h3 className="text-2xl font-bold mb-1">Sync Payment</h3>
              <p className="text-green-100">Reference #{selectedPayment.id}</p>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Customer Name</p>
                  <p className="font-bold text-gray-900">
                    {`${selectedPayment.accounts?.customer?.first_name || ''} ${selectedPayment.accounts?.customer?.last_name || ''}`.trim() || 'N/A'}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Table Number</p>
                  <p className="font-bold text-gray-900">Table {selectedPayment.table_id}</p>
                </div>

                <div className="bg-indigo-50 rounded-lg p-4 border-2 border-indigo-200">
                  <p className="text-sm text-indigo-600 mb-1">Total Amount</p>
                  <p className="text-3xl font-bold text-indigo-900">₱{selectedPayment.total_bill || 0}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Reference Number *
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Enter reference number"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg font-semibold"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter a unique reference number for this payment
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowSyncModal(false);
                    setSelectedPayment(null);
                    setReferenceNumber('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSyncSubmit}
                  disabled={syncing}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-semibold shadow-md disabled:opacity-50"
                >
                  {syncing ? 'Syncing...' : 'Sync Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
