import React, { useState, useEffect } from 'react';
import { CreditCard, Clock, Hourglass, User, Calendar, CheckCircle, XCircle, Eye, RefreshCw, Plus } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import Swal from 'sweetalert2';

export default function FinalizePayment() {
  // ============================================
  // ALL STATES AT THE TOP - COMPLETE LIST
  // ============================================
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
  const [combinedData, setCombinedData] = useState([]);

  // SYNC PAYMENT STATES - MUST BE HERE
  const [syncing, setSyncing] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncedPayments, setSyncedPayments] = useState([]);

useEffect(() => {
    fetchPayments();
    fetchExtensions();
  }, []);

  // ✅ AUTO END SESSION - CHECK EVERY MINUTE
  useEffect(() => {
    const checkSessionEnd = async () => {
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      });

      for (const payment of activePayments) {
        if (payment.time_end) {
          const [endTime, endPeriod] = payment.time_end.split(' ');
          const [endHour, endMinute] = endTime.split(':').map(Number);
          
          const [currentTimeStr, currentPeriod] = currentTime.split(' ');
          const [currentHour, currentMinute] = currentTimeStr.split(':').map(Number);

          // Convert to 24-hour format for comparison
          let endHour24 = endHour;
          if (endPeriod === 'PM' && endHour !== 12) endHour24 += 12;
          if (endPeriod === 'AM' && endHour === 12) endHour24 = 0;

          let currentHour24 = currentHour;
          if (currentPeriod === 'PM' && currentHour !== 12) currentHour24 += 12;
          if (currentPeriod === 'AM' && currentHour === 12) currentHour24 = 0;

          const endTimeMinutes = endHour24 * 60 + endMinute;
          const currentTimeMinutes = currentHour24 * 60 + currentMinute;

          // If current time >= end time, auto end session
          if (currentTimeMinutes >= endTimeMinutes) {
            await autoEndSession(payment);
          }
        }
      }
    };

    // Check every minute
    const interval = setInterval(checkSessionEnd, 60000);
    
    // Check immediately on mount
    checkSessionEnd();

    return () => clearInterval(interval);
  }, [activePayments]);

  const autoEndSession = async (payment) => {
    try {
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

      // Check if payment is complete
      if (totalPaid >= totalBill) {
        // ✅ PAYMENT COMPLETE - END SESSION
        const { error } = await supabase
          .from('reservation')
          .update({
            status: 'completed',
            payment_status: 'Completed',
            End_Session: true,
            End_Session_Notice: true
          })
          .eq('id', payment.id);

        if (error) throw error;

        // Log to transaction history
        await supabase
          .from('transaction_history')
          .insert({
            table_id: payment.table_id,
            reservation_date: payment.reservation_date,
            start_time: payment.start_time,
            duration: payment.duration,
            status: 'completed',
            extension: payment.extension || 0,
            time_end: payment.time_end,
            paymentMethod: payment.paymentMethod || 'Cash',
            billiard_type: payment.billiard_type,
            amount: totalBill
          });

        // Show notification
        await Swal.fire({
          icon: 'info',
          title: 'Session Ended Automatically',
          html: `
            <div style="text-align: left; padding: 20px;">
              <p><strong>Table ${payment.table_id}</strong> session has ended.</p>
              <p style="margin-top: 10px; color: #10b981;">✅ Payment Complete</p>
              <p style="margin-top: 5px; font-size: 14px; color: #6b7280;">
                Time: ${payment.time_end}
              </p>
            </div>
          `,
          timer: 3000,
          showConfirmButton: false
        });

        fetchPayments();
      } else {
        // ⚠️ PAYMENT INCOMPLETE - SET NOTICE ONLY
        const { error } = await supabase
          .from('reservation')
          .update({
            End_Session_Notice: true
          })
          .eq('id', payment.id);

        if (error) throw error;

        // Show notification for unpaid balance
        await Swal.fire({
          icon: 'warning',
          title: 'Session Time Ended',
          html: `
            <div style="text-align: left; padding: 20px;">
              <p><strong>Table ${payment.table_id}</strong> time has ended.</p>
              <p style="margin-top: 10px; color: #f59e0b;">⚠️ Payment Incomplete</p>
              <p style="margin-top: 5px;">Total Bill: <strong>₱${totalBill}</strong></p>
              <p>Amount Paid: <strong>₱${totalPaid}</strong></p>
              <p style="color: #dc2626;">Remaining: <strong>₱${totalBill - totalPaid}</strong></p>
              <hr style="margin: 15px 0;">
              <p style="font-size: 14px; color: #6b7280;">
                Please collect remaining payment before ending session.
              </p>
            </div>
          `,
          confirmButtonText: 'OK',
          confirmButtonColor: '#f59e0b'
        });

        fetchPayments();
      }
    } catch (error) {
      console.error('Error auto-ending session:', error);
    }
  };
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
  const handleCancelReservation = async (reservationId) => {
    const result = await Swal.fire({
      title: 'Cancel Reservation?',
      text: 'Are you sure you want to cancel this reservation?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, cancel it!'
    });

    if (result.isConfirmed) {
      try {
        const { error } = await supabase
          .from('reservation')
          .update({ status: 'cancelled' })
          .eq('id', reservationId);

        if (error) throw error;

        await Swal.fire({
          icon: 'success',
          title: 'Cancelled!',
          text: 'The reservation has been cancelled.',
          timer: 1500,
          showConfirmButton: false,
        });

        fetchPayments();
      } catch (error) {
        console.error('Error cancelling reservation:', error);
        await Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Failed to cancel reservation',
        });
      }
    }
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
        .select('account_id, email');

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

      // ✅ START HERE - NO useState CALLS!
      const active = combinedData.filter(r => r.status === 'ongoing');
      const pending = combinedData.filter(r => r.status === 'approved');
      const completed = combinedData.filter(r => r.status === 'completed');

      setActivePayments(active);
      setPendingPayments(pending);
      setCompletedPayments(completed);

      // CHECK SYNCED PAYMENTS
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
        payment_status: 'Completed',
        End_Session: true,              // ✅ DAGDAG TO PRE!
        End_Session_Notice: true        // ✅ DAGDAG TO PRE!
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
        payment_status: 'Completed',
        End_Session: true,              // ✅ DAGDAG TO PRE!
        End_Session_Notice: true        // ✅ DAGDAG TO PRE!
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

  // ============================================
  // FULL PAYMENT - NEW FLOW WITH AUTO REFERENCE
  // ============================================
  if (paymentType === 'Full Payment') {
    const autoReferenceNo = `${Date.now()}`; // Auto-generate reference number
    
    const paymentConfirm = await Swal.fire({
      title: 'Process Full Payment',
      html: `
        <div style="text-align: left; padding: 20px;">
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <p style="margin: 5px 0; color: #6b7280; font-size: 14px;">Reference Number</p>
            <p style="margin: 5px 0; font-weight: bold; font-size: 18px; color: #1f2937;">${autoReferenceNo}</p>
          </div>
          
          <div style="background: #e0f2fe; padding: 15px; border-radius: 8px; border: 2px solid #0ea5e9;">
            <p style="margin: 5px 0; color: #0369a1; font-size: 14px;">Total Bill</p>
            <p style="margin: 5px 0; font-weight: bold; font-size: 28px; color: #0c4a6e;">₱${totalBill}</p>
          </div>
          
          <p style="margin-top: 20px; color: #059669; font-weight: 600; text-align: center;">
            ✅ Customer will pay the full amount
          </p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: '<span style="font-size: 16px;">💳 Process Payment</span>',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6b7280',
      width: '500px'
    });

    if (!paymentConfirm.isConfirmed) {
      setShowConfirmModal(false);
      setSelectedPayment(null);
      return;
    }

    // Show loading
    Swal.fire({
      title: 'Processing Payment...',
      html: '<div style="padding: 20px;"><p style="margin-top: 15px; font-size: 16px;">Please wait...</p></div>',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const updateData = {
        status: 'ongoing',
        full_amount: totalBill,
        payment_status: 'Completed',
        reference_no: autoReferenceNo
      };

      const { error } = await supabase
        .from('reservation')
        .update(updateData)
        .eq('id', selectedPayment.id);

      if (error) throw error;

      // Log to transaction history
      await supabase
        .from('transaction_history')
        .insert({
          table_id: selectedPayment.table_id,
          reservation_date: selectedPayment.reservation_date,
          start_time: selectedPayment.start_time,
          duration: selectedPayment.duration,
          status: 'ongoing',
          extension: selectedPayment.extension || 0,
          time_end: calculateEndTime(selectedPayment.start_time, selectedPayment.duration),
          paymentMethod: 'Cash',
          billiard_type: selectedPayment.billiard_type,
          amount: totalBill,
          reference_no: autoReferenceNo
        });

      await Swal.fire({
        icon: 'success',
        title: 'Payment Successful!',
        html: `
          <div style="text-align: left; padding: 20px;">
            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border: 2px solid #10b981; margin-bottom: 15px;">
              <p style="margin: 5px 0; color: #065f46; font-size: 14px;">Reference Number</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 18px; color: #047857;">${autoReferenceNo}</p>
            </div>
            
            <div style="background: #dbeafe; padding: 15px; border-radius: 8px;">
              <p style="margin: 5px 0; color: #1e40af; font-size: 14px;">Amount Paid</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 24px; color: #1e3a8a;">₱${totalBill}</p>
            </div>
            
            <p style="margin-top: 20px; color: #10b981; font-weight: 600; text-align: center;">
              ✅ Payment completed! Moving to Current sessions.
            </p>
          </div>
        `,
        confirmButtonColor: '#10b981',
        timer: 3000,
        timerProgressBar: true
      });

      setShowConfirmModal(false);
      setSelectedPayment(null);
      fetchPayments();
      return;

    } catch (error) {
      console.error('Error processing full payment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Payment Failed',
        text: 'Failed to process payment. Please try again.',
        confirmButtonColor: '#ef4444'
      });
      return;
    }
  }

  // ============================================
  // HALF PAYMENT & PARTIAL PAYMENT - ORIGINAL FLOW
  // ============================================
 // ============================================
// HALF PAYMENT & PARTIAL PAYMENT - NEW FLOW
// ============================================
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

  if (paymentType === 'Half Payment') {
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

    // ✅ ASK PAYMENT METHOD - CASH OR GCASH
    const paymentMethodChoice = await Swal.fire({
      title: 'Select Payment Method',
      html: `
        <div style="text-align: left; padding: 20px;">
          <div style="background: #e0f2fe; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 2px solid #0ea5e9;">
            <p style="margin: 5px 0; color: #0369a1; font-size: 14px;">Payment Amount</p>
            <p style="margin: 5px 0; font-weight: bold; font-size: 24px; color: #0c4a6e;">₱${newAmount}</p>
          </div>
          <p style="color: #666; font-size: 14px; margin-bottom: 15px;">How will the customer pay?</p>
        </div>
      `,
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: '💵 Cash',
      denyButtonText: '📱 GCash',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#10b981',
      denyButtonColor: '#3b82f6',
      cancelButtonColor: '#6b7280',
    });

    if (paymentMethodChoice.isDismissed) return;

    const isCash = paymentMethodChoice.isConfirmed;
    let refNumber = '';

    // ✅ IF CASH - AUTO GENERATE REFERENCE
    if (isCash) {
      refNumber = `${Date.now()}`;
      
      const confirmCash = await Swal.fire({
        title: 'Confirm Cash Payment',
        html: `
          <div style="text-align: left; padding: 20px;">
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <p style="margin: 5px 0; color: #6b7280; font-size: 14px;">Reference Number</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 18px; color: #1f2937;">${refNumber}</p>
            </div>
            <div style="background: #dbeafe; padding: 15px; border-radius: 8px; border: 2px solid #0ea5e9;">
              <p style="margin: 5px 0; color: #0369a1; font-size: 14px;">Amount</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 24px; color: #0c4a6e;">₱${newAmount}</p>
            </div>
          </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '💳 Process Payment',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#6b7280',
      });

      if (!confirmCash.isConfirmed) return;

    } else {
      // ✅ IF GCASH - INPUT REFERENCE NUMBER
      const gcashInput = await Swal.fire({
        title: 'GCash Payment',
        html: `
          <div style="text-align: left; padding: 20px;">
            <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 2px solid #0ea5e9;">
              <p style="margin: 5px 0; color: #0369a1; font-size: 14px;">Amount</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 24px; color: #0c4a6e;">₱${newAmount}</p>
            </div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">GCash Reference Number *</label>
            <input id="gcash-ref" type="text" placeholder="Enter GCash reference number" 
              style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;" />
            <p style="margin-top: 8px; font-size: 12px; color: #6b7280;">Enter the GCash transaction reference number</p>
          </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '💳 Process Payment',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#6b7280',
        preConfirm: () => {
          const ref = document.getElementById('gcash-ref').value;
          if (!ref.trim()) {
            Swal.showValidationMessage('Reference number is required');
            return false;
          }
          return ref.trim();
        }
      });

      if (!gcashInput.isConfirmed) return;
      refNumber = gcashInput.value;
    }

    // ✅ SHOW LOADING
    Swal.fire({
      title: 'Processing Payment...',
      html: '<div style="padding: 20px;"><p style="margin-top: 15px; font-size: 16px;">Please wait...</p></div>',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // ✅ UPDATE PAYMENT
    updateData.half_amount = newTotal;
    updateData.paymentMethod = isCash ? 'Cash' : 'GCash';
    
    // ✅ HANDLE REFERENCE NUMBERS ARRAY
    const existingRefs = selectedPayment.reference_no 
      ? (Array.isArray(selectedPayment.reference_no) 
          ? selectedPayment.reference_no 
          : [selectedPayment.reference_no])
      : [];
    
    updateData.reference_no = [...existingRefs, refNumber];

    if (newTotal >= totalBill) {
      updateData.status = 'ongoing';
    } else {
      updateData.status = 'approved';
    }

  } else if (paymentType === 'Partial Payment') {
    // ✅ SAME FLOW FOR PARTIAL PAYMENT
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

    // ✅ ASK PAYMENT METHOD
    const paymentMethodChoice = await Swal.fire({
      title: 'Select Payment Method',
      html: `
        <div style="text-align: left; padding: 20px;">
          <div style="background: #e0f2fe; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 2px solid #0ea5e9;">
            <p style="margin: 5px 0; color: #0369a1; font-size: 14px;">Payment Amount</p>
            <p style="margin: 5px 0; font-weight: bold; font-size: 24px; color: #0c4a6e;">₱${newAmount}</p>
          </div>
          <p style="color: #666; font-size: 14px; margin-bottom: 15px;">How will the customer pay?</p>
        </div>
      `,
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: '💵 Cash',
      denyButtonText: '📱 GCash',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#10b981',
      denyButtonColor: '#3b82f6',
      cancelButtonColor: '#6b7280',
    });

    if (paymentMethodChoice.isDismissed) return;

    const isCash = paymentMethodChoice.isConfirmed;
    let refNumber = '';

    if (isCash) {
      refNumber = `${Date.now()}`;
      
      const confirmCash = await Swal.fire({
        title: 'Confirm Cash Payment',
        html: `
          <div style="text-align: left; padding: 20px;">
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <p style="margin: 5px 0; color: #6b7280; font-size: 14px;">Reference Number</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 18px; color: #1f2937;">${refNumber}</p>
            </div>
            <div style="background: #dbeafe; padding: 15px; border-radius: 8px; border: 2px solid #0ea5e9;">
              <p style="margin: 5px 0; color: #0369a1; font-size: 14px;">Amount</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 24px; color: #0c4a6e;">₱${newAmount}</p>
            </div>
          </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '💳 Process Payment',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#6b7280',
      });

      if (!confirmCash.isConfirmed) return;

    } else {
      const gcashInput = await Swal.fire({
        title: 'GCash Payment',
        html: `
          <div style="text-align: left; padding: 20px;">
            <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 2px solid #0ea5e9;">
              <p style="margin: 5px 0; color: #0369a1; font-size: 14px;">Amount</p>
              <p style="margin: 5px 0; font-weight: bold; font-size: 24px; color: #0c4a6e;">₱${newAmount}</p>
            </div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">GCash Reference Number *</label>
            <input id="gcash-ref" type="text" placeholder="Enter GCash reference number" 
              style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;" />
            <p style="margin-top: 8px; font-size: 12px; color: #6b7280;">Enter the GCash transaction reference number</p>
          </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '💳 Process Payment',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#6b7280',
        preConfirm: () => {
          const ref = document.getElementById('gcash-ref').value;
          if (!ref.trim()) {
            Swal.showValidationMessage('Reference number is required');
            return false;
          }
          return ref.trim();
        }
      });

      if (!gcashInput.isConfirmed) return;
      refNumber = gcashInput.value;
    }

    Swal.fire({
      title: 'Processing Payment...',
      html: '<div style="padding: 20px;"><p style="margin-top: 15px; font-size: 16px;">Please wait...</p></div>',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    updateData.partial_amount = newTotal;
    updateData.paymentMethod = isCash ? 'Cash' : 'GCash';
    
    const existingRefs = selectedPayment.reference_no 
      ? (Array.isArray(selectedPayment.reference_no) 
          ? selectedPayment.reference_no 
          : [selectedPayment.reference_no])
      : [];
    
    updateData.reference_no = [...existingRefs, refNumber];

    if (newTotal >= totalBill) {
      updateData.status = 'ongoing';
    } else {
      updateData.status = 'approved';
    }
  }

  // ✅ UPDATE DATABASE
  const { error } = await supabase
    .from('reservation')
    .update(updateData)
    .eq('id', selectedPayment.id);

  if (error) throw error;

  const isComplete = (paymentType === 'Half Payment' && updateData.half_amount >= totalBill) ||
    (paymentType === 'Partial Payment' && updateData.partial_amount >= totalBill);

  // ✅ SUCCESS WITH REFERENCE NUMBERS
  await Swal.fire({
    icon: 'success',
    title: 'Payment Successful!',
    html: `
      <div style="text-align: left; padding: 20px;">
        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border: 2px solid #10b981; margin-bottom: 15px;">
          <p style="margin: 5px 0; color: #065f46; font-size: 14px;">Reference Numbers</p>
          <p style="margin: 5px 0; font-weight: bold; font-size: 16px; color: #047857;">
            ${updateData.reference_no.join(', ')}
          </p>
        </div>
        <div style="background: #dbeafe; padding: 15px; border-radius: 8px;">
          <p style="margin: 5px 0; color: #1e40af; font-size: 14px;">Amount Paid</p>
          <p style="margin: 5px 0; font-weight: bold; font-size: 24px; color: #1e3a8a;">
            ₱${paymentType === 'Half Payment' ? updateData.half_amount : updateData.partial_amount}
          </p>
        </div>
        <p style="margin-top: 20px; color: ${isComplete ? '#10b981' : '#f59e0b'}; font-weight: 600; text-align: center;">
          ${isComplete ? '✅ Payment completed! Moving to Current sessions.' : '⚠️ Partial payment recorded. Remaining balance still pending.'}
        </p>
      </div>
    `,
    confirmButtonColor: '#10b981',
    timer: 3000,
    timerProgressBar: true
  });

  // Log to transaction history
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
      paymentMethod: updateData.paymentMethod,
      billiard_type: selectedPayment.billiard_type,
      amount: paymentType === 'Half Payment' ? updateData.half_amount : updateData.partial_amount,
      reference_no: updateData.reference_no
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
}};

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
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };
  // 2. TANGGALIN MUNA YUNG isSynced dito, ilagay sa loob ng map
  const handleSyncPayment = async (payment) => {
    setSelectedPayment(payment);
    setReferenceNumber('');

    try {
      const { data: existingPayment } = await supabase
        .from('payment')
        .select('payment_id')
        .eq('reservation_id', payment.id)
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
      // Check if already synced
      const { data: existingPayment } = await supabase
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

      // Calculate the total amount paid
      let totalAmountPaid = 0;

      if (selectedPayment.payment_type === 'Full Payment') {
        totalAmountPaid = selectedPayment.full_amount || selectedPayment.total_bill || 0;
      } else if (selectedPayment.payment_type === 'Half Payment') {
        totalAmountPaid = selectedPayment.half_amount || 0;
      } else if (selectedPayment.payment_type === 'Partial Payment') {
        totalAmountPaid = selectedPayment.partial_amount || 0;
      }

      // Validate payment method
      let paymentMethod = (selectedPayment.payment_method || 'cash').toLowerCase();
      const validMethods = ['cash', 'gcash', 'card', 'online'];
      if (!validMethods.includes(paymentMethod)) {
        paymentMethod = 'cash';
      }

      // Get data from reservation table
      const reservationDate = selectedPayment.reservation_date;
      const startTime = selectedPayment.start_time;
      const endTime = selectedPayment.time_end;
      const duration = selectedPayment.duration;
      const extension = selectedPayment.extension || 0;

      // Prepare payment data
      const paymentData = {
        reservation_id: selectedPayment.id,
        account_id: selectedPayment.account_id,
        amount: totalAmountPaid,
        total_bill: selectedPayment.total_bill,
        method: paymentMethod,
        payment_date: new Date().toISOString(),
        reference_number: referenceNumber.trim(),
        status: 'completed',
        payment_type: selectedPayment.payment_type,
        table_id: selectedPayment.table_id,
        billiard_type: selectedPayment.billiard_type,
        reservation_date: reservationDate,
        start_time: startTime,
        time_end: endTime,
        duration: duration,
        extension: extension
      };

      console.log('Syncing payment data:', paymentData);

      // Insert into payment table
      const { data, error } = await supabase
        .from('payment')
        .insert([paymentData])
        .select();

      if (error) {
        console.error('Insert Error:', error);
        throw error;
      }

      console.log('Payment synced successfully:', data);

      // Update reservation as synced
      await supabase
        .from('reservation')
        .update({ synced_to_payment: true })
        .eq('id', selectedPayment.id);

      // Success notification
      await Swal.fire({
        icon: 'success',
        title: 'Payment Synced!',
        html: `
        <div style="text-align: left; font-size: 14px;">
          <p><strong>Date:</strong> ${formatDateForDisplay(reservationDate)}</p>
          <p><strong>Time:</strong> ${startTime} - ${endTime}</p>
          <p><strong>Duration:</strong> ${duration} hours</p>
          ${extension > 0 ? `<p><strong>Extension:</strong> ${extension} hours</p>` : ''}
          <p style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
            <strong>Amount Paid:</strong> ₱${totalAmountPaid}
          </p>
          <p><strong>Total Bill:</strong> ₱${selectedPayment.total_bill || 0}</p>
          <p style="margin-top: 10px; color: ${totalAmountPaid >= selectedPayment.total_bill ? '#10b981' : '#f59e0b'};">
            ${totalAmountPaid >= selectedPayment.total_bill ? '✅ Fully Paid' : '⚠️ Partial Payment'}
          </p>
          <p style="margin-top: 15px; font-size: 12px; color: #6b7280;">
            Reference: ${referenceNumber.trim()}
          </p>
        </div>
      `,
        timer: 2500,
        showConfirmButton: false
      });

      setShowSyncModal(false);
      setSelectedPayment(null);
      setReferenceNumber('');
      fetchPayments();

    } catch (error) {
      console.error('Error syncing payment:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Sync Failed',
        html: `
        <div style="text-align: left;">
          <p>${error.message || 'Failed to sync payment data.'}</p>
          ${error.details ? `<p style="margin-top: 10px; font-size: 12px; color: #6b7280;">${error.details}</p>` : ''}
        </div>
      `,
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <div className="mb-8">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="flex items-center gap-3 mb-2 text-4xl font-bold text-gray-900">
              <CreditCard className="text-indigo-600" size={36} />
              Finalize Payment
            </h1>
            <p className="text-lg text-gray-600">Manage current sessions and process final payments</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-5 py-3 font-semibold text-white transition-all shadow-lg bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pending Payments */}
        <div className="p-6 bg-white border-2 border-orange-100 shadow-xl rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl">
              <Hourglass className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Pending</h2>
              <p className="text-sm text-gray-600">{pendingPayments.length} pending</p>
            </div>
          </div>


          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {pendingPayments.length > 0 ? (
              pendingPayments.map((payment) => {
                const customerName = `${payment.accounts?.customer?.first_name || ''} ${payment.accounts?.customer?.last_name || ''}`.trim() || 'N/A';
                const extensionPrice = payment.extension ? getExtensionPrice(payment.billiard_type, payment.extension) : 0;

                return (
                  <div key={payment.id} className="p-5 transition-all border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl hover:shadow-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 text-lg font-bold text-white rounded-full bg-gradient-to-br from-orange-500 to-amber-600">
                          {customerName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{customerName}</h3>
                          <p className="text-sm text-gray-600">Table {payment.table_id}</p>
                        </div>
                      </div>
                      <span className="px-4 py-1.5 bg-orange-500 text-white rounded-full text-sm font-bold shadow-md">
                        Pending
                      </span>
                    </div>


                    <div className="mb-3 flex justify-between items-start">

                      {/* LEFT SIDE */}
                      <div className="space-y-1">
                        <p className="text-sm text-gray-700">
                          <span className="font-semibold">Date:</span> {formatDate(payment.reservation_date)}
                        </p>
                        <p className="text-sm text-gray-700">
                          <span className="font-semibold">Time:</span> {formatTime(payment.start_time)} - {formatTime(payment.time_end)}
                        </p>
                        <p className="text-sm text-gray-700">
                          <span className="font-semibold">Duration:</span> {payment.duration} hours
                        </p>

                        {payment.extension > 0 && (
                          <div className="flex items-center gap-2 p-2 border border-blue-200 rounded-lg bg-blue-50">
                            <Plus size={14} className="text-blue-600" />
                            <span className="text-sm font-semibold text-blue-800">
                              Extension: {payment.extension}h - ₱{extensionPrice}
                            </span>
                          </div>
                        )}

                        <p className="text-sm text-gray-700">
                          <span className="font-semibold">Amount:</span> ₱{payment.total_bill || 0}
                        </p>
                      </div>

                      {/* RIGHT SIDE — RESERVATION NUMBER */}
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-700">Reservation No:</p>
                        <p className="text-sm font-bold text-gray-900">{payment.reservation_no}</p>
                      </div>
                    </div>


                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button
                        onClick={() => handleViewDetails(payment)}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-orange-700 transition-all bg-white border-2 border-orange-300 rounded-lg hover:bg-orange-50"
                      >
                        <Eye size={16} />
                        View
                      </button>
                      <button
                        onClick={() => handleExtensionClick(payment)}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white transition-all bg-blue-500 rounded-lg hover:bg-blue-600"
                      >
                        <Plus size={16} />
                        Extend
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        onClick={() => handleCancelReservation(payment.id)}
                        className="px-4 py-2 text-sm font-semibold text-white transition-all bg-red-500 rounded-lg shadow-md hover:bg-red-600"
                      >
                        Cancel
                      </button>

                    </div>
                    <button
                      onClick={() => handleConfirmPaymentClick(payment)}
                      className="w-full px-4 py-2 text-sm font-semibold text-white transition-all rounded-lg shadow-md bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    >
                      Confirm Payment
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center">
                <CheckCircle size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="font-semibold text-gray-500">No pending payments</p>
              </div>
            )}
          </div>
        </div>

        {/* Currently Playing */}
        <div className="p-6 bg-white border-2 border-green-100 shadow-xl rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl">
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
                  <div key={payment.id} className="p-5 transition-all border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl hover:shadow-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 text-lg font-bold text-white rounded-full bg-gradient-to-br from-green-500 to-emerald-600">
                          {customerName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{customerName}</h3>
                          <p className="text-sm text-gray-600">Table {payment.table_id}</p>
                        </div>
                      </div>
                      <span className="px-4 py-1.5 bg-green-500 text-white rounded-full text-sm font-bold shadow-md">
                        Ongoing
                      </span>
                    </div>

                    <div className="mb-3 space-y-3">

                      {/* Time + Reservation No */}
                      <div className="flex justify-between items-start">
                        {/* TIME */}
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <Clock size={16} className="text-green-600" />
                          <span className="font-semibold">
                            {formatTime(payment.start_time)} - {endTime}
                          </span>
                        </div>

                        {/* RESERVATION NO */}
                        <div className="text-right">
                          <p className="text-xs font-semibold text-gray-700">Reservation No:</p>
                          <p className="text-sm font-bold text-gray-900">{payment.reservation_no}</p>
                        </div>
                      </div>

                      {/* EXTENSION */}
                      {payment.extension > 0 && (
                        <div className="flex items-center gap-2 p-2 border border-blue-200 rounded-lg bg-blue-50">
                          <Plus size={14} className="text-blue-600" />
                          <span className="text-sm font-semibold text-blue-800">
                            Extension: {payment.extension}h - ₱{extensionPrice}
                          </span>
                        </div>
                      )}

                      {/* PAYMENT BOX */}
                      <div className="p-3 border-2 border-green-200 rounded-lg bg-green-50">
                        <div className="space-y-1">

                          <div className="flex justify-between text-sm">
                            <span className="text-gray-700">Total Bill:</span>
                            <span className="font-bold text-gray-900">₱{payment.total_bill || 0}</span>
                          </div>

                          <div className="flex justify-between text-sm">
                            <span className="text-gray-700">Amount Paid:</span>
                            <span className="font-bold text-green-600">
                              ₱{payment.payment_type === 'Full Payment'
                                ? (payment.full_amount || 0)
                                : payment.payment_type === 'Half Payment'
                                  ? (payment.half_amount || 0)
                                  : (payment.partial_amount || 0)
                              }
                            </span>
                          </div>

                          {/* REMAINING */}
                          {(() => {
                            const totalBill = payment.total_bill || 0;
                            const amountPaid = payment.payment_type === 'Full Payment'
                              ? (payment.full_amount || 0)
                              : payment.payment_type === 'Half Payment'
                                ? (payment.half_amount || 0)
                                : (payment.partial_amount || 0);

                            const remaining = totalBill - amountPaid;

                            if (remaining > 0) {
                              return (
                                <div className="pt-2 mt-2 border-t border-green-300">
                                  <div className="flex justify-between text-sm">
                                    <span className="font-semibold text-orange-700">Remaining:</span>
                                    <span className="font-bold text-orange-600">₱{remaining}</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>

                    </div>


                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button
                        onClick={() => handleViewDetails(payment)}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-orange-700 transition-all bg-white border-2 border-orange-300 rounded-lg hover:bg-orange-50"
                      >
                        <Eye size={16} />
                        View
                      </button>
                      <button
                        onClick={() => handleExtensionClick(payment)}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white transition-all bg-blue-500 rounded-lg hover:bg-blue-600"
                      >
                        <Plus size={16} />
                        Extend
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">

                    </div>
                    <button
                      onClick={() => handleEndSession(payment.id)}
                      className="w-full px-4 py-2 text-sm font-semibold text-white transition-all rounded-lg shadow-md bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600"
                    >
                      End Session
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center">
                <CheckCircle size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="font-semibold text-gray-500">No active sessions</p>
              </div>
            )}
          </div>
        </div>

        {/* Completed */}
        <div className="p-6 bg-white border-2 border-gray-100 shadow-xl rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-gray-400 to-gray-500 rounded-xl">
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
                  <div key={payment.id} className="p-5 transition-all border-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl hover:shadow-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 text-lg font-bold text-white rounded-full bg-gradient-to-br from-gray-500 to-gray-600">
                          {customerName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{customerName}</h3>
                          <p className="text-sm text-gray-600">Table {payment.table_id}</p>
                        </div>
                      </div>
                      <span className="px-4 py-1.5 bg-gray-500 text-white rounded-full text-sm font-bold shadow-md">
                        Done
                      </span>
                    </div>

                    <div className="mb-3 flex justify-between items-start">

                      {/* LEFT SIDE (Date + Amount) */}
                      <div className="space-y-1">
                        <p className="text-sm text-gray-700">
                          <span className="font-semibold">Date:</span> {formatDate(payment.reservation_date)}
                        </p>
                        <p className="text-sm text-gray-700">
                          <span className="font-semibold">Amount:</span> ₱{payment.total_bill || 0}
                        </p>
                      </div>

                      {/* RIGHT SIDE (Reservation No) */}
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-700">Reservation No:</p>
                        <p className="text-sm font-bold text-gray-900">{payment.reservation_no}</p>
                      </div>

                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleViewDetails(payment)}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 transition-all bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50"
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
              <div className="py-12 text-center">
                <CheckCircle size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="font-semibold text-gray-500">No completed sessions</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Extension Modal */}
      {showExtensionModal && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="w-full max-w-md bg-white shadow-2xl rounded-2xl">
            <div className="p-6 text-white bg-gradient-to-r from-blue-500 to-indigo-500">
              <h3 className="mb-1 text-2xl font-bold">Add Extension</h3>
              <p className="text-blue-100">
                {`${selectedPayment.accounts?.customer?.first_name || ''} ${selectedPayment.accounts?.customer?.last_name || ''}`.trim() || 'N/A'} - Table {selectedPayment.table_id}
              </p>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Billiard Type</p>
                  <p className="font-bold text-gray-900 capitalize">{selectedPayment.billiard_type || 'Standard'}</p>
                </div>

                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Current Duration</p>
                  <p className="font-bold text-gray-900">{selectedPayment.duration} hours</p>
                </div>

                {selectedPayment.extension > 0 && (
                  <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                    <p className="mb-1 text-sm text-blue-600">Current Extension</p>
                    <p className="font-bold text-blue-900">{selectedPayment.extension} hours</p>
                  </div>
                )}

                <div>
                  <label className="block mb-2 text-sm font-semibold text-gray-700">
                    Select Extension
                  </label>
                  <select
                    value={selectedExtension}
                    onChange={(e) => setSelectedExtension(e.target.value)}
                    className="w-full px-4 py-3 text-sm font-semibold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  <div className="p-4 border-2 border-indigo-200 rounded-lg bg-indigo-50">
                    <p className="mb-2 text-sm text-indigo-600">New Total</p>
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
                  className="flex-1 px-4 py-3 font-semibold text-gray-700 transition-all bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExtensionSubmit}
                  className="flex-1 px-4 py-3 font-semibold text-white transition-all rounded-lg shadow-md bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
                >
                  Add Extension
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Payment Modal */}
  {showConfirmModal && selectedPayment && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
    <div className="w-full max-w-md bg-white shadow-2xl rounded-2xl">
      <div className="p-6 text-white bg-gradient-to-r from-green-500 to-emerald-500">
        <h3 className="mb-1 text-2xl font-bold">Confirm Payment</h3>
        <p className="text-green-100">Reference #{selectedPayment.reservation_no}</p>
      </div>

      <div className="p-6">
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-gray-50">
            <p className="mb-1 text-sm text-gray-600">Billiard Type</p>
            <p className="font-bold text-gray-900 capitalize">{selectedPayment.billiard_type || 'Standard'}</p>
          </div>

          <div className="p-4 rounded-lg bg-gray-50">
            <p className="mb-1 text-sm text-gray-600">Payment Type</p>
            <p className="font-bold text-gray-900 capitalize">{selectedPayment.payment_type || 'N/A'}</p>
          </div>

          {selectedPayment.extension > 0 && (
            <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
              <p className="mb-1 text-sm text-blue-600">Extension</p>
              <p className="font-bold text-blue-900">
                {selectedPayment.extension} hours - ₱{getExtensionPrice(selectedPayment.billiard_type, selectedPayment.extension)}
              </p>
            </div>
          )}

          <div className="p-4 border-2 border-indigo-200 rounded-lg bg-indigo-50">
            <p className="mb-1 text-sm text-indigo-600">Total Bill</p>
            <p className="text-3xl font-bold text-indigo-900">₱{selectedPayment.total_bill || 0}</p>
          </div>

          {(selectedPayment.payment_type === 'Half Payment' || selectedPayment.payment_type === 'Partial Payment') && (
            <>
              <div className="p-4 border-2 rounded-lg bg-amber-50 border-amber-200">
                <p className="mb-2 text-sm font-semibold text-amber-600">Previous Payment</p>
                <p className="text-2xl font-bold text-amber-900">
                  ₱{selectedPayment.payment_type === 'Half Payment'
                    ? (selectedPayment.half_amount || 0)
                    : (selectedPayment.partial_amount || 0)
                  }
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  Remaining: ₱{selectedPayment.total_bill - (selectedPayment.payment_type === 'Half Payment'
                    ? (selectedPayment.half_amount || 0)
                    : (selectedPayment.partial_amount || 0)
                  )}
                </p>
              </div>

              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700">
                  Enter Payment Amount
                </label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount to pay"
                  className="w-full px-4 py-3 text-lg font-semibold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter the amount customer is paying now
                </p>
              </div>

              {paymentAmount && (() => {
                const previousAmount = selectedPayment.payment_type === 'Half Payment'
                  ? (selectedPayment.half_amount || 0)
                  : (selectedPayment.partial_amount || 0);
                const newTotal = previousAmount + parseInt(paymentAmount || 0);
                const remaining = selectedPayment.total_bill - newTotal;
                const isExceeding = newTotal > selectedPayment.total_bill;

                return (
                  <div className={`p-4 border-2 rounded-lg ${
                    isExceeding 
                      ? 'bg-red-50 border-red-300' 
                      : 'bg-green-50 border-green-200'
                  }`}>
                    <p className={`mb-2 text-sm font-semibold ${
                      isExceeding ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {isExceeding ? '⚠️ Amount Exceeds Bill' : 'New Total Payment'}
                    </p>
                    <p className={`text-2xl font-bold ${
                      isExceeding ? 'text-red-900' : 'text-green-900'
                    }`}>
                      ₱{newTotal}
                    </p>
                    <p className={`mt-1 text-sm ${
                      isExceeding ? 'text-red-700' : 'text-green-700'
                    }`}>
                      {isExceeding 
                        ? `Exceeds by: ₱${Math.abs(remaining)}` 
                        : `Still Remaining: ₱${Math.max(0, remaining)}`
                      }
                    </p>

                    {!isExceeding && remaining === 0 && (
                      <div className="p-2 mt-2 bg-green-100 rounded-lg">
                        <p className="text-sm font-bold text-green-800">✅ Payment Complete - Will move to Current!</p>
                      </div>
                    )}

                    {!isExceeding && remaining > 0 && (
                      <div className="p-2 mt-2 bg-yellow-100 border border-yellow-300 rounded-lg">
                        <p className="text-sm font-bold text-yellow-800">⚠️ Partial Payment - Will stay in Pending</p>
                      </div>
                    )}

                    {isExceeding && (
                      <div className="p-2 mt-2 bg-red-100 border border-red-300 rounded-lg">
                        <p className="text-sm font-bold text-red-800">❌ Cannot exceed total bill!</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {selectedPayment.payment_type === 'Full Payment' && (
            <div className="p-4 border-2 border-green-200 rounded-lg bg-green-50">
              <p className="mb-2 text-sm font-semibold text-green-600">✅ Full Payment</p>
              <p className="mb-3 text-sm text-green-700">
                Customer will pay the full amount
              </p>
              <p className="text-3xl font-bold text-green-900">₱{selectedPayment.total_bill}</p>
              <div className="p-2 mt-3 bg-green-100 rounded-lg">
                <p className="text-sm font-bold text-green-800">Will move to Current sessions immediately</p>
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
            className="flex-1 px-4 py-3 font-semibold text-gray-700 transition-all bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmPaymentSubmit}
            className="flex-1 px-4 py-3 font-semibold text-white transition-all rounded-lg shadow-md bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 text-white bg-gradient-to-r from-indigo-500 to-purple-500">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="mb-1 text-2xl font-bold">Payment Details</h3>
                  <p className="text-indigo-100">Reservation #{selectedPayment.reservation_no || 'N/A'}</p>
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
                    {`${selectedPayment.accounts?.customer?.first_name || ''} ${selectedPayment.accounts?.customer?.last_name || ''}`.trim() || 'N/A'}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Table Number</p>
                  <p className="font-bold text-gray-900">Table {selectedPayment.table_id}</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Date</p>
                  <p className="font-bold text-gray-900">{formatDate(selectedPayment.reservation_date)}</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Time</p>
                  <p className="font-bold text-gray-900">{formatTime(selectedPayment.start_time)}</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Duration</p>
                  <p className="font-bold text-gray-900">{selectedPayment.duration} hours</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Billiard Type</p>
                  <p className="font-bold text-gray-900 capitalize">{selectedPayment.billiard_type || 'Standard'}</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Payment Method</p>
                  <p className="font-bold text-gray-900">{selectedPayment.paymentMethod || 'N/A'}</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Payment Type</p>
                  <p className="font-bold text-gray-900 capitalize">{selectedPayment.payment_type || 'N/A'}</p>
                </div>
                {selectedPayment.extension > 0 && (
                  <div className="col-span-2 p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                    <p className="mb-1 text-sm text-blue-600">Extension</p>
                    <p className="font-bold text-blue-900">
                      {selectedPayment.extension} hours - ₱{getExtensionPrice(selectedPayment.billiard_type, selectedPayment.extension)}
                    </p>
                  </div>
                )}
              </div>

              {/* Payment Details Section */}
              <div className="p-4 mb-6 border-2 border-purple-200 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50">
                <h4 className="mb-3 text-lg font-bold text-gray-900">Payment Information</h4>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Total Bill:</span>
                    <span className="text-lg font-bold text-gray-900">₱{selectedPayment.total_bill || 0}</span>
                  </div>

                  {selectedPayment.payment_type === 'Full Payment' && (
                    <>
                      <hr className="border-gray-300" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Full Payment:</span>
                        <span className="text-lg font-bold text-green-600">₱{selectedPayment.full_amount || 0}</span>
                      </div>
                      <div className="p-2 border border-green-200 rounded-lg bg-green-50">
                        <p className="text-sm font-semibold text-center text-green-800">
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
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Amount Paid:</span>
                        <span className="text-lg font-bold text-blue-600">₱{selectedPayment.half_amount || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
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
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Amount Paid:</span>
                        <span className="text-lg font-bold text-blue-600">₱{selectedPayment.partial_amount || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
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

              <div className="p-4 border-2 border-indigo-200 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50">
                <p className="mb-1 text-sm text-gray-600">Status</p>
                <p className="text-2xl font-bold text-indigo-600 capitalize">{selectedPayment.status}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSyncModal && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="w-full max-w-md bg-white shadow-2xl rounded-2xl">
            <div className="p-6 text-white bg-gradient-to-r from-green-500 to-emerald-500">
              <h3 className="mb-1 text-2xl font-bold">Sync Payment</h3>
              <p className="text-green-100">Reference #{selectedPayment.id}</p>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Customer Name</p>
                  <p className="font-bold text-gray-900">
                    {`${selectedPayment.accounts?.customer?.first_name || ''} ${selectedPayment.accounts?.customer?.last_name || ''}`.trim() || 'N/A'}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-gray-50">
                  <p className="mb-1 text-sm text-gray-600">Table Number</p>
                  <p className="font-bold text-gray-900">Table {selectedPayment.table_id}</p>
                </div>

                <div className="p-4 border-2 border-indigo-200 rounded-lg bg-indigo-50">
                  <p className="mb-1 text-sm text-indigo-600">Total Amount</p>
                  <p className="text-3xl font-bold text-indigo-900">₱{selectedPayment.total_bill || 0}</p>
                </div>

                <div>
                  <label className="block mb-2 text-sm font-semibold text-gray-700">
                    Reference Number *
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Enter reference number"
                    className="w-full px-4 py-3 text-lg font-semibold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
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
                  className="flex-1 px-4 py-3 font-semibold text-gray-700 transition-all bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSyncSubmit}
                  disabled={syncing}
                  className="flex-1 px-4 py-3 font-semibold text-white transition-all rounded-lg shadow-md bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:opacity-50"
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
