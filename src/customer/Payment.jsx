import React, { useState, useEffect } from 'react';
import { supabase } from "../lib/supabaseClient";
import Swal from 'sweetalert2';
import QRCode from 'qrcode';

const Payment = ({ reservationData, onBack, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [formData, setFormData] = useState({
    payment_method: 'GCash',
    paymentType: 'full',
    amountPaid: '',
    proofOfPayment: null,
    referenceNumber: ''
  });

  const [totalBill, setTotalBill] = useState(0);
  const [minimumPayment, setMinimumPayment] = useState(0);
  const [availableQRCodes, setAvailableQRCodes] = useState([]);
  const [loadingQRCodes, setLoadingQRCodes] = useState(false);
  useEffect(() => {
  if (formData.payment_method === 'GCash') {
    fetchAvailableQRCodes();
  }
}, [formData.payment_method]);

const fetchAvailableQRCodes = async () => {
  try {
    setLoadingQRCodes(true);
    const { data, error } = await supabase
      .from('qr_code')
      .select('*')
      .eq('status', true)
      .order('generated_at', { ascending: false });

    if (error) throw error;
    setAvailableQRCodes(data || []);
  } catch (error) {
    console.error('Error fetching QR codes:', error);
  } finally {
    setLoadingQRCodes(false);
  }
};
  useEffect(() => {
    if (!reservationData) {
      Swal.fire({
        icon: 'error',
        title: 'No Reservation Data',
        text: 'Please select tables first',
      });
      return;
    }

    calculateBill();
  }, [reservationData]);

  const calculateBill = () => {
    if (!reservationData || !reservationData.reservations) return;

    const { reservations } = reservationData;
    
    const total = reservations.reduce((sum, reservation) => {
      return sum + (parseFloat(reservation.table.info.price) * reservation.duration.hours);
    }, 0);

    const minimum = Math.ceil(total / 2);

    setTotalBill(total);
    setMinimumPayment(minimum);
    setFormData(prev => ({
      ...prev,
      amountPaid: total.toString()
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'paymentType') {
      if (value === 'full') {
        setFormData(prev => ({
          ...prev,
          paymentType: value,
          amountPaid: totalBill.toString()
        }));
      } else if (value === 'half') {
        setFormData(prev => ({
          ...prev,
          paymentType: value,
          amountPaid: minimumPayment.toString()
        }));
      } else if (value === 'partial') {
        setFormData(prev => ({
          ...prev,
          paymentType: value,
          amountPaid: minimumPayment.toString()
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      Swal.fire({
        icon: 'error',
        title: 'Invalid File',
        text: 'Please upload an image file',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      Swal.fire({
        icon: 'error',
        title: 'File Too Large',
        text: 'Please upload an image smaller than 5MB',
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setImagePreview(base64String);
      setFormData(prev => ({
        ...prev,
        proofOfPayment: base64String
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    // ============= VALIDATION =============
    if (formData.payment_method === 'GCash') {
      if (!formData.proofOfPayment) {
        Swal.fire({
          icon: 'warning',
          title: 'Missing Proof of Payment',
          text: 'Please upload a screenshot of your GCash payment',
        });
        return;
      }

      if (!formData.referenceNumber || formData.referenceNumber.trim() === '') {
        Swal.fire({
          icon: 'warning',
          title: 'Missing Reference Number',
          text: 'Please enter your GCash reference number',
        });
        return;
      }
    }

    const amountPaid = parseFloat(formData.amountPaid);
    
    if (!amountPaid || amountPaid <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Amount',
        text: 'Please enter a valid payment amount',
      });
      return;
    }

    if (formData.paymentType === 'partial' && amountPaid < minimumPayment) {
      Swal.fire({
        icon: 'warning',
        title: 'Insufficient Payment',
        text: `Partial payment must be at least ₱${minimumPayment.toFixed(2)}`,
      });
      return;
    }

    if (formData.paymentType === 'half' && amountPaid !== minimumPayment) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Amount',
        text: `Half payment must be exactly ₱${minimumPayment.toFixed(2)}`,
      });
      return;
    }

    if (formData.paymentType === 'full' && amountPaid !== totalBill) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Amount',
        text: `Full payment must be exactly ₱${totalBill.toFixed(2)}`,
      });
      return;
    }

    // ============= START SUBMISSION =============
    try {
      setLoading(true);

      const userSessionStr = localStorage.getItem('userSession');
      if (!userSessionStr) {
        throw new Error('Please log in to continue');
      }

      const userSession = JSON.parse(userSessionStr);
      const accountId = userSession.account_id;

      const { reservations } = reservationData;

      console.log('═══════════════════════════════════════');
      console.log('🎯 STARTING RESERVATION SUBMISSION');
      console.log('═══════════════════════════════════════');

      // ============= GENERATE RESERVATION NO =============
      console.log('🔄 [STEP 1] Calling RPC to generate Reservation No...');
      
      const { data: reservationNo, error: rpcError } = await supabase
        .rpc('generate_reservation_no');

      if (rpcError) {
        console.error('❌ RPC Error:', rpcError);
        throw new Error(`Failed to generate reservation number: ${rpcError.message}`);
      }

      console.log('✅ [STEP 1 SUCCESS] RPC returned:', reservationNo);

      if (!reservationNo || reservationNo.trim() === '') {
        console.error('❌ ERROR: Reservation number is EMPTY!');
        throw new Error('Failed to generate reservation number - returned empty');
      }

      // ============= PREPARE RECORDS =============
      const totalTableBill = reservations.reduce((sum, r) => 
        sum + (parseFloat(r.table.info.price) * r.duration.hours), 0
      );

      let paymentTypeLabel = 'Full Payment';
      if (formData.paymentType === 'half') {
        paymentTypeLabel = 'Half Payment';
      } else if (formData.paymentType === 'partial') {
        paymentTypeLabel = 'Partial Payment';
      }

      // Determine payment status
      const paymentStatus = formData.paymentType === 'full' ? 'completed' : 'pending';

   const reservationInserts = reservations.map((reservation, idx) => {
  const tableBill = parseFloat(reservation.table.info.price) * reservation.duration.hours;
  const tableRatio = tableBill / totalTableBill;
  
  const record = {
    reservation_no: reservationNo,
    account_id: parseInt(accountId),
    table_id: reservation.table.table_id,
    reservation_date: reservation.date,
    billiard_type: reservation.table.info.billiard_type,
    start_time: reservation.time,
    time_end: reservation.timeEnd,
    duration: parseFloat(reservation.duration.hours), // ✅ STORE HOURS (1.5, 2.5, etc.) NOT ID
    status: 'pending',
    payment_status: paymentStatus,
    payment_method: formData.payment_method,
    payment_type: paymentTypeLabel,
    total_bill: Math.round(tableBill),
    full_amount: formData.paymentType === 'full' ? Math.round(tableBill) : null,
    half_amount: formData.paymentType === 'half' ? Math.round(tableBill / 2) : null,
    partial_amount: formData.paymentType === 'partial' ? Math.round(amountPaid * tableRatio) : null,
    proof_of_payment: formData.payment_method === 'GCash' ? formData.proofOfPayment : null,
    reference_no: formData.payment_method === 'GCash' && formData.referenceNumber ? parseInt(formData.referenceNumber) : null,
    notification: false
  };

  console.log(`📝 [RECORD ${idx + 1}]`, {
    reservation_no: record.reservation_no,
    status: record.status,
    payment_status: record.payment_status,
    reference_no: record.reference_no,
    duration_hours: record.duration, // ✅ LOG TO VERIFY (e.g., 1.5, 2.5)
    duration_id: reservation.duration.id
  });
  
  return record;
});

      console.log('📋 [STEP 2] Total records to insert:', reservationInserts.length);
      
      // ============= INSERT TO DATABASE =============
      console.log('🔄 [STEP 3] Inserting to database...');

      const { data: insertedData, error: insertError } = await supabase
        .from('reservation')
        .insert(reservationInserts)
        .select();

      if (insertError) {
        console.error('❌ [STEP 3 ERROR] Insert failed:', insertError);
        throw insertError;
      }

      console.log('✅ [STEP 3 SUCCESS] Insert completed');

      // ============= CREATE NOTIFICATION =============
      console.log('🔄 [STEP 4] Creating notification...');

      const notificationMessage = `New reservation ${reservationNo} has been submitted and is pending approval.`;

      const { error: notifError } = await supabase
        .from('notification')
        .insert({
          account_id: parseInt(accountId),
          reservation_no: reservationNo,
          message: notificationMessage,
          is_read: false,
          created_at: new Date().toISOString()
        });

      if (notifError) {
        console.error('⚠️ [STEP 4 WARNING] Notification insert failed:', notifError);
      } else {
        console.log('✅ [STEP 4 SUCCESS] Notification created');
      }

   // ============= GENERATE QR CODE =============
console.log('🔄 [STEP 5] Generating QR Code...');

const qrData = JSON.stringify({
  reservationNo: reservationNo,
  accountId: parseInt(accountId)
});

const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
  width: 300,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
});

console.log('✅ [STEP 5 SUCCESS] QR Code generated');

// Save QR code to database
console.log('🔄 [STEP 6] Saving QR Code to database...');

const { data: updateData, error: updateError } = await supabase
  .from('reservation')
  .update({ qr_code: qrCodeDataUrl })
  .eq('reservation_no', reservationNo)
  .select();

if (updateError) {
  console.error('❌ [STEP 6 ERROR] QR update failed:', updateError);
} else {
  console.log('✅ [STEP 6 SUCCESS] QR Code saved to database');
  console.log('📊 Updated records:', updateData?.length || 0);
}

// Convert data URL to Blob
const base64Response = await fetch(qrCodeDataUrl);
const blob = await base64Response.blob();

// Create unique filename
const qrFileName = `${reservationNo}_${Date.now()}.png`;
console.log('📁 QR Filename:', qrFileName);

// Upload to Supabase Storage
const { data: uploadData, error: uploadError } = await supabase
  .storage
  .from('qr-codes')
  .upload(qrFileName, blob, {
    contentType: 'image/png',
    cacheControl: '3600',
    upsert: false
  });

if (uploadError) {
  console.error('❌ [STEP 6 ERROR] QR upload failed:', uploadError);
} else {
  console.log('✅ [STEP 6 SUCCESS] QR Code uploaded:', uploadData);
  
  // Get public URL
  const { data: publicUrlData } = supabase
    .storage
    .from('qr-codes')
    .getPublicUrl(qrFileName);
  
  const qrCodeUrl = publicUrlData.publicUrl;
  console.log('📎 QR Code URL:', qrCodeUrl);
  
  // ✅ FIX: Update ALL reservations with this reservation_no
  console.log('🔄 Updating QR code in database...');
  
  const { data: updateData, error: updateError } = await supabase
    .from('reservation')
    .update({ qr_code: qrCodeUrl })
    .eq('reservation_no', reservationNo)
    .select(); // ✅ ADD .select() to see what was updated
  
  if (updateError) {
    console.error('❌ QR URL update failed:', updateError);
  } else {
    console.log('✅ QR Code URL saved to database');
    console.log('📊 Updated records:', updateData);
    console.log('📊 Number of records updated:', updateData?.length || 0);
  }
}

      // ============= SUCCESS MESSAGE =============
      const paymentTypeDisplay = 
        formData.paymentType === 'full' ? 'Full Payment' :
        formData.paymentType === 'half' ? 'Half Payment (50% Down Payment)' :
        'Partial Payment (Custom Down Payment)';

     const reservationDetailsHtml = reservations.map((res, idx) => `
  <div style="margin-bottom: ${idx < reservations.length - 1 ? '15px' : '0'}; padding: 12px; background-color: #ffffff; border-radius: 8px; border: 2px solid #e0e0e0;">
    <div style="margin-bottom: 8px;">
      <span style="padding: 4px 10px; background-color: #28a745; color: white; border-radius: 12px; font-size: 12px; font-weight: 600;">
        ${res.table.table_name}
      </span>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
      <div>
        <span style="color: #999;">📅 Date:</span>
        <div style="font-weight: 600; color: #333;">${res.date}</div>
      </div>
      <div>
        <span style="color: #999;">🕐 Time:</span>
        <div style="font-weight: 600; color: #333;">${res.time}</div>
      </div>
      <div>
        <span style="color: #999;">⏱️ Duration:</span>
        <div style="font-weight: 600; color: #333;">${res.duration.hours} hour${res.duration.hours > 1 ? 's' : ''}</div>
      </div>
      <div>
        <span style="color: #999;">🏁 End Time:</span>
        <div style="font-weight: 600; color: #333;">${res.timeEnd}</div>
      </div>
    </div>
  </div>
`).join('');

await Swal.fire({
  icon: 'success',
  title: 'Reservation Successful!',
  html: `
    <div style="text-align: center; padding: 20px;">
      <div style="margin-bottom: 30px; padding: 25px; background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); border-radius: 12px; box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);">
        <p style="margin: 0 0 10px 0; color: rgba(255,255,255,0.9); font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">
          📋 Your Reservation Number
        </p>
        <div style="font-size: 32px; font-weight: 900; color: #fff; letter-spacing: 3px; font-family: 'Courier New', monospace; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
          ${reservationNo}
        </div>
        <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.85); font-size: 12px;">
          Save this number for your records
        </p>
      </div>

      <!-- ✅ RESERVATION DETAILS -->
      <div style="text-align: left; background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #28a745;">
        <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 700; color: #333;">
          📌 Reservation Details
        </h3>
        ${reservationDetailsHtml}
      </div>

      <!-- PAYMENT SUMMARY -->
      <div style="text-align: left; background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #28a745;">
        <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 700; color: #333;">
          💳 Payment Summary
        </h3>
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #dee2e6; padding-bottom: 10px;">
          <span style="color: #666;">Reservation:</span>
          <span style="color: #28a745; font-weight: 700; font-family: 'Courier New', monospace;">${reservationNo}</span>
        </div>
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #dee2e6; padding-bottom: 10px;">
          <span style="color: #666;">Total Bill:</span>
          <span style="color: #28a745; font-weight: 700;">₱${totalBill.toFixed(2)}</span>
        </div>
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #dee2e6; padding-bottom: 10px;">
          <span style="color: #666;">Payment Method:</span>
          <span style="color: #333; font-weight: 600;">${formData.payment_method}</span>
        </div>
        ${formData.payment_method === 'GCash' ? `
          <div style="margin-bottom: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #dee2e6; padding-bottom: 10px;">
            <span style="color: #666;">Reference No:</span>
            <span style="color: #333; font-weight: 600; font-family: 'Courier New', monospace;">${formData.referenceNumber}</span>
          </div>
        ` : ''}
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #dee2e6; padding-bottom: 10px;">
          <span style="color: #666;">Payment Type:</span>
          <span style="color: #333; font-weight: 600;">${paymentTypeDisplay}</span>
        </div>
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #dee2e6; padding-bottom: 10px;">
          <span style="color: #666;">Amount Paid:</span>
          <span style="color: #28a745; font-weight: 700;">₱${amountPaid.toFixed(2)}</span>
        </div>
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #dee2e6; padding-bottom: 10px;">
          <span style="color: #666;">Payment Status:</span>
          <span style="color: ${paymentStatus === 'completed' ? '#28a745' : '#ff9800'}; font-weight: 700; text-transform: uppercase;">
            ${paymentStatus}
          </span>
        </div>
        ${formData.paymentType !== 'full' ? `
          <div style="display: flex; justify-content: space-between; background-color: #fff3cd; padding: 8px 10px; border-radius: 6px;">
            <span style="color: #856404; font-weight: 600;">Remaining Balance:</span>
            <span style="color: #856404; font-weight: 700;">₱${(totalBill - amountPaid).toFixed(2)}</span>
          </div>
        ` : ''}
      </div>

      <!-- QR CODE -->
      <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 700; color: #333; text-align: center;">
          📱 Your QR Code
        </p>
        <p style="margin: 0 0 15px 0; font-size: 13px; color: #666; text-align: center;">
          Show this QR code at the front desk
        </p>
         <div style="display: flex; justify-content: center; align-items: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          <img src="${qrCodeDataUrl}" alt="Reservation QR Code" style="max-width: 250px; width: 100%; height: auto; border-radius: 8px;" />
        </div>
        <p style="margin: 15px 0 0 0; font-size: 12px; color: #999; text-align: center; font-style: italic;">
          Screenshot this QR code for easy check-in
        </p>
      </div>
    </div>
  `,
  confirmButtonColor: '#28a745',
  confirmButtonText: 'Done',
  allowOutsideClick: false,
  width: '600px'
});

      console.log('═══════════════════════════════════════');
      console.log('✅ RESERVATION COMPLETE');
      console.log('═══════════════════════════════════════');

      if (onSuccess) onSuccess();

    } catch (error) {
      console.error('❌ FATAL ERROR:', error);
      
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to create reservation',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!reservationData) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '12px',
          textAlign: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <p style={{ margin: '0 0 20px 0', fontSize: '16px', color: '#666' }}>
            No reservation data found
          </p>
          <button
            onClick={onBack}
            style={{
              padding: '12px 30px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '40px 20px'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{
            margin: '0 0 10px 0',
            fontSize: '28px',
            fontWeight: '700',
            color: '#333',
            textAlign: 'center'
          }}>
            Payment Details
          </h1>
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: '#666',
            textAlign: 'center'
          }}>
            Complete your reservation by providing payment details
          </p>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '25px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            margin: '0 0 20px 0',
            fontSize: '20px',
            fontWeight: '600',
            color: '#333'
          }}>
            Reservation Summary
          </h2>

          {reservationData.reservations && reservationData.reservations.map((reservation, index) => (
            <div key={reservation.table.table_id} style={{
              marginBottom: index < reservationData.reservations.length - 1 ? '20px' : '0',
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '2px solid #28a745'
            }}>
              <div style={{ marginBottom: '10px' }}>
                <span style={{
                  padding: '6px 12px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: '600',
                  marginRight: '10px'
                }}>
                  {reservation.table.table_name}
                </span>
                <span style={{
                  fontSize: '16px',
                  fontWeight: '700',
                  color: '#28a745'
                }}>
                  ₱{parseFloat(reservation.table.info.price).toFixed(2)}/hour
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '10px',
                marginTop: '10px'
              }}>
                <div>
                  <p style={{ margin: '0 0 3px 0', fontSize: '12px', color: '#666' }}>Date</p>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    {reservation.date}
                  </p>
                </div>
                <div>
                  <p style={{ margin: '0 0 3px 0', fontSize: '12px', color: '#666' }}>Time</p>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    {reservation.time} - {reservation.timeEnd}
                  </p>
                </div>
                <div>
                  <p style={{ margin: '0 0 3px 0', fontSize: '12px', color: '#666' }}>Duration</p>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    {reservation.duration.hours} hour{reservation.duration.hours > 1 ? 's' : ''}
                  </p>
                </div>
                <div>
                  <p style={{ margin: '0 0 3px 0', fontSize: '12px', color: '#666' }}>Subtotal</p>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#28a745' }}>
                    ₱{(parseFloat(reservation.table.info.price) * reservation.duration.hours).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          ))}

          <div style={{
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '2px solid #e0e0e0'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '18px', fontWeight: '700', color: '#333' }}>Total Bill:</span>
              <span style={{ fontSize: '24px', fontWeight: '700', color: '#28a745' }}>
                ₱{totalBill.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '25px',
          borderRadius: '12px',
          marginBottom: '100px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            margin: '0 0 20px 0',
            fontSize: '20px',
            fontWeight: '600',
            color: '#333'
          }}>
            Payment Information
          </h2>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#555'
            }}>
              Payment Method
            </label>
            <select
              name="payment_method"
              value={formData.payment_method}
              onChange={handleInputChange}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            >
              <option value="GCash">GCash</option>
              <option value="Cash">Cash</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#555'
            }}>
              Payment Type
            </label>
            <select
              name="paymentType"
              value={formData.paymentType}
              onChange={handleInputChange}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            >
              <option value="full">Full Payment - ₱{totalBill.toFixed(2)}</option>
              <option value="half">Half Payment (50%) - ₱{minimumPayment.toFixed(2)}</option>
              <option value="partial">Partial Payment (Custom) - Min ₱{minimumPayment.toFixed(2)}</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#555'
            }}>
              Amount Paid (₱)
            </label>
            <input
              type="number"
              name="amountPaid"
              value={formData.amountPaid}
              onChange={handleInputChange}
              disabled={formData.paymentType === 'full' || formData.paymentType === 'half'}
              min={minimumPayment}
              step="0.01"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px',
                boxSizing: 'border-box',
                backgroundColor: (formData.paymentType === 'full' || formData.paymentType === 'half') ? '#f0f0f0' : 'white',
                cursor: (formData.paymentType === 'full' || formData.paymentType === 'half') ? 'not-allowed' : 'text'
              }}
            />
          </div>

   {formData.payment_method === 'GCash' && (
  <>
    {/* Available GCash Payment Options */}
    <div style={{ marginBottom: '20px' }}>
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '15px',
        fontSize: '15px',
        fontWeight: '700',
        color: '#333'
      }}>
        <span style={{ fontSize: '22px' }}>💳</span>
        Available GCash Payment Options
      </label>
      
      {loadingQRCodes ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          border: '1px solid #e0e0e0'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #28a745',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 15px'
          }}></div>
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Loading payment options...</p>
        </div>
      ) : availableQRCodes.length === 0 ? (
        <div style={{
          padding: '30px',
          textAlign: 'center',
          backgroundColor: '#fff3cd',
          border: '2px dashed #ffc107',
          borderRadius: '12px'
        }}>
          <p style={{ margin: '0 0 5px 0', fontSize: '16px', fontWeight: '600', color: '#856404' }}>
            ⚠️ No Payment Options Available
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: '#856404' }}>
            Please contact support or choose Cash payment method
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: availableQRCodes.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginBottom: '20px'
        }}>
          {availableQRCodes.map((qrCode) => (
            <div key={qrCode.qr_id} style={{
              border: '3px solid #28a745',
              borderRadius: '16px',
              padding: '20px',
              textAlign: 'center',
              backgroundColor: 'white',
              boxShadow: '0 4px 12px rgba(40, 167, 69, 0.15)',
              transition: 'all 0.3s'
            }}>
              <div style={{
                backgroundColor: '#f8f9fa',
                padding: '20px',
                borderRadius: '12px',
                marginBottom: '15px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '200px'
              }}>
                <img 
                  src={qrCode.qr_image} 
                  alt={qrCode.full_name}
                  style={{
                    width: '100%',
                    maxWidth: '200px',
                    height: 'auto',
                    display: 'block'
                  }}
                />
              </div>
              <p style={{
                margin: '0 0 10px 0',
                fontSize: '16px',
                fontWeight: '700',
                color: '#1a1a1a',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {qrCode.full_name}
              </p>
              <p style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: '700',
                color: '#28a745',
                fontFamily: "'Courier New', monospace",
                backgroundColor: '#e7f9ed',
                padding: '8px 12px',
                borderRadius: '8px',
                display: 'inline-block'
              }}>
                {qrCode.cellphone_number}
              </p>
            </div>
          ))}
        </div>
      )}

      <div style={{
        marginTop: '20px',
        padding: '16px 18px',
        backgroundColor: '#e7f3ff',
        border: '2px solid #b3d9ff',
        borderRadius: '12px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start'
      }}>
        <span style={{ fontSize: '20px', flexShrink: 0, marginTop: '2px' }}>ℹ️</span>
        <div style={{ fontSize: '14px', color: '#004085', lineHeight: '1.6' }}>
          <strong style={{ display: 'block', marginBottom: '5px' }}>Instructions:</strong>
          Scan any QR code above to send your payment, then enter the <strong>reference number</strong> and upload the <strong>screenshot</strong> below.
        </div>
      </div>
    </div>

    <div style={{ marginBottom: '20px' }}>
      <label style={{
        display: 'block',
        marginBottom: '8px',
        fontSize: '14px',
        fontWeight: '600',
        color: '#555'
      }}>
        GCash Reference Number *
      </label>
      <input
        type="number"
        name="referenceNumber"
        value={formData.referenceNumber}
        onChange={handleInputChange}
        placeholder="Enter your GCash reference number"
        style={{
          width: '100%',
          padding: '12px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          fontSize: '14px',
          boxSizing: 'border-box',
          fontFamily: "'Courier New', monospace"
        }}
      />
    </div>

    <div style={{ marginBottom: '20px' }}>
      <label style={{
        display: 'block',
        marginBottom: '8px',
        fontSize: '14px',
        fontWeight: '600',
        color: '#555'
      }}>
        Proof of Payment (Screenshot) *
      </label>
      <input
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        style={{
          width: '100%',
          padding: '12px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          fontSize: '14px',
          boxSizing: 'border-box'
        }}
      />
      
      {imagePreview && (
        <div style={{
          marginTop: '15px',
          border: '2px solid #e0e0e0',
          borderRadius: '8px',
          padding: '10px',
          textAlign: 'center'
        }}>
          <p style={{
            margin: '0 0 10px 0',
            fontSize: '13px',
            fontWeight: '600',
            color: '#666'
          }}>
            Preview:
          </p>
          <img 
            src={imagePreview} 
            alt="Payment proof preview"
            style={{
              maxWidth: '100%',
              maxHeight: '300px',
              borderRadius: '8px'
            }}
          />
        </div>
      )}
    </div>
  </>
)}

          <div style={{
            marginTop: '25px',
            padding: '20px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '2px solid #e0e0e0'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '10px'
            }}>
              <span style={{ fontSize: '14px', color: '#666' }}>Total Bill:</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
                ₱{totalBill.toFixed(2)}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '10px'
            }}>
              <span style={{ fontSize: '14px', color: '#666' }}>Payment Type:</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
                {formData.paymentType === 'full' ? 'Full' : formData.paymentType === 'half' ? 'Half (50%)' : 'Partial'}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '10px'
            }}>
              <span style={{ fontSize: '14px', color: '#666' }}>Amount to Pay:</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#28a745' }}>
                ₱{parseFloat(formData.amountPaid || 0).toFixed(2)}
              </span>
            </div>
            {formData.paymentType !== 'full' && parseFloat(formData.amountPaid) > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '10px',
                borderTop: '1px solid #ddd'
              }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#ff9800' }}>
                  Remaining Balance:
                </span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#ff9800' }}>
                  ₱{(totalBill - parseFloat(formData.amountPaid || 0)).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{
          position: 'fixed',
          bottom: 0,
          left: '255px',
          right: 0,
          backgroundColor: '#5a5a5a',
          padding: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
          zIndex: 100
        }}>
          <button
            onClick={onBack}
            disabled={loading}
            style={{
              padding: '12px 30px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            ← Back
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '12px 40px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid white',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                Processing...
              </>
            ) : (
              'Submit Reservation'
            )}
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default Payment;
