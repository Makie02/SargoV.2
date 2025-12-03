import React, { useState, useEffect, useRef } from 'react';
import { QrCode, CheckCircle, X, AlertCircle, FileImage, FolderOpen } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabaseClient';
import Swal from 'sweetalert2';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function QRCheckInPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [reservations, setReservations] = useState([]);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [confirmationModal, setConfirmationModal] = useState(false);
  const [generatedRefNo, setGeneratedRefNo] = useState(null);
  const [gcashRefNo, setGcashRefNo] = useState('');
  const [scannerActive, setScannerActive] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const html5QrCodeRef = useRef(null);
  const cardRef = useRef(null);

  // Fetch reservations on load
  useEffect(() => {
    fetchReservations();
    checkCameras();
  }, []);

  // Check available cameras
  const checkCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      setCameraDevices(devices);
      if (devices && devices.length > 0) {
        // Default to back camera if available, otherwise first camera
        const backCamera = devices.find(d => d.label.toLowerCase().includes('back')) || devices[0];
        setSelectedCamera(backCamera.id);
      }
    } catch (err) {
      console.error("Error checking cameras:", err);
    }
  };

  // Handle QR Scanner
  useEffect(() => {
    const startScanner = async () => {
      if (scannerActive && !isScanning) {
        // Check if camera is available
        if (cameraDevices.length === 0) {
          Swal.fire({
            icon: 'error',
            title: 'No Camera Found',
            html: `
              <p>No camera detected on this device.</p>
              <br>
              <p><strong>Solutions:</strong></p>
              <ul style="text-align: left; margin-left: 20px;">
                <li>Make sure your camera is connected and enabled</li>
                <li>Check if another app is using the camera</li>
                <li>Try refreshing the page</li>
                <li>Use the manual search below instead</li>
              </ul>
            `,
            confirmButtonColor: '#3085d6'
          });
          setScannerActive(false);
          return;
        }

        try {
          const html5QrCode = new Html5Qrcode("qr-reader");
          html5QrCodeRef.current = html5QrCode;

          // Use selected camera or default
          const cameraId = selectedCamera || cameraDevices[0].id;

          await html5QrCode.start(
            cameraId,
            {
              fps: 10,
              qrbox: { width: 250, height: 250 }
            },
            onScanSuccess,
            onScanError
          );
          
          setIsScanning(true);
        } catch (err) {
          console.error("Error starting scanner:", err);
          
          let errorMessage = 'Unable to access camera. Please check permissions.';
          
          if (err.toString().includes('NotFoundError')) {
            errorMessage = 'Camera not found. Please make sure your camera is connected and enabled.';
          } else if (err.toString().includes('NotAllowedError')) {
            errorMessage = 'Camera access denied. Please allow camera permissions in your browser settings.';
          } else if (err.toString().includes('NotReadableError')) {
            errorMessage = 'Camera is already in use by another application. Please close other apps using the camera.';
          }
          
          Swal.fire({
            icon: 'error',
            title: 'Camera Error',
            text: errorMessage,
            confirmButtonColor: '#3085d6'
          });
          setScannerActive(false);
          setIsScanning(false);
        }
      }
    };

    startScanner();

    return () => {
      if (html5QrCodeRef.current && isScanning) {
        html5QrCodeRef.current
          .stop()
          .then(() => {
            html5QrCodeRef.current = null;
            setIsScanning(false);
          })
          .catch(err => {
            console.error("Error stopping scanner:", err);
            setIsScanning(false);
          });
      }
    };
  }, [scannerActive]);

  const fetchReservations = async () => {
    try {
      const { data, error } = await supabase
        .from('reservation')
        .select('*')
        .in('status', ['pending', 'approved']);

      if (error) throw error;
      setReservations(data || []);
    } catch (err) {
      console.error('Error fetching reservations:', err);
    }
  };

  const onScanSuccess = (decodedText) => {
    handleSearch(decodedText);
    stopScanner();
  };

  const onScanError = (error) => {
    // Silent - normal scanning errors
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current && isScanning) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
        setIsScanning(false);
        setScannerActive(false);
      } catch (err) {
        console.error("Error stopping scanner:", err);
        setIsScanning(false);
        setScannerActive(false);
      }
    } else {
      setScannerActive(false);
      setIsScanning(false);
    }
  };

  const toggleScanner = async () => {
    if (scannerActive) {
      await stopScanner();
    } else {
      setScannerActive(true);
    }
  };

  const handleSearch = async (query = searchQuery) => {
    const searchTerm = String(query).trim();
    if (!searchTerm) return;

    const found = reservations.find(r => r.reservation_no === searchTerm);
    
    if (!found) {
      return Swal.fire("Not Found", "Reservation does not exist.", "error");
    }

    if (found.status !== "pending" && found.status !== "approved") {
      return Swal.fire("Invalid Status", `Reservation is already: ${found.status}`, "error");
    }

    setSelectedReservation(found);
  };

  const handleCheckInClick = () => {
    const refNo = selectedReservation.paymentMethod === 'Cash' && 
                  selectedReservation.payment_type === 'Full Payment' 
                  ? generateReferenceNumber() 
                  : null;
    setGeneratedRefNo(refNo);
    setConfirmationModal(true);
  };

  const generateReferenceNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    return `${year}${month}${day}${hour}${minute}${second}${random}`;
  };

  const handleConfirmCheckIn = async () => {
    if (!selectedReservation) return;

    const paymentMethod = selectedReservation.paymentMethod;
    const paymentType = selectedReservation.payment_type;

    if (paymentMethod === 'GCash' && !gcashRefNo.trim()) {
      return Swal.fire("Error", "Please enter GCash Reference Number", "error");
    }

    if (paymentMethod === 'Cash' && paymentType === 'Full Payment') {
      try {
        const { error } = await supabase
          .from('reservation')
          .update({ 
            status: 'approved',
            payment_status: true,
            reference_no: generatedRefNo
          })
          .eq('id', selectedReservation.id);

        if (error) throw error;

        await Swal.fire({
          icon: 'success',
          title: 'Check-in Successful!',
          html: `<div style="text-align: left;">
            <p style="margin-bottom: 10px;">Customer checked in and payment marked as complete.</p>
            <p style="margin-top: 15px; padding: 10px; background-color: #f0f0f0; border-radius: 5px;">
              <strong>Reference No:</strong> ${generatedRefNo}
            </p>
          </div>`,
          timer: 3000,
          showConfirmButton: false
        });

        fetchReservations();
        setSelectedReservation(null);
        setConfirmationModal(false);
        setGcashRefNo('');
      } catch (error) {
        console.error('Error during check-in:', error);
        Swal.fire("Error", "Check-in failed. Please try again.", "error");
      }
    } else if (paymentMethod === 'GCash') {
      try {
        const { error } = await supabase
          .from('reservation')
          .update({ 
            status: 'approved',
            reference_no: gcashRefNo
          })
          .eq('id', selectedReservation.id);

        if (error) throw error;

        await Swal.fire({
          icon: 'success',
          title: 'Check-in Successful!',
          html: `<div style="text-align: left;">
            <p style="margin-bottom: 10px;">Customer checked in.</p>
            <p style="margin-top: 15px; padding: 10px; background-color: #f0f0f0; border-radius: 5px;">
              <strong>GCash Ref No:</strong> ${gcashRefNo}
            </p>
          </div>`,
          timer: 3000,
          showConfirmButton: false
        });

        fetchReservations();
        setSelectedReservation(null);
        setConfirmationModal(false);
        setGcashRefNo('');
      } catch (error) {
        console.error('Error during check-in:', error);
        Swal.fire("Error", "Check-in failed. Please try again.", "error");
      }
    } else {
      try {
        const { error } = await supabase
          .from('reservation')
          .update({ status: 'approved' })
          .eq('id', selectedReservation.id);

        if (error) throw error;

        await Swal.fire({
          icon: 'success',
          title: 'Check-in Successful!',
          text: 'Customer checked in.',
          timer: 2000,
          showConfirmButton: false
        });

        fetchReservations();
        setSelectedReservation(null);
        setConfirmationModal(false);
        setGcashRefNo('');
      } catch (error) {
        console.error('Error during check-in:', error);
        Swal.fire("Error", "Check-in failed. Please try again.", "error");
      }
    }
  };

  const saveAsImage = async () => {
    const card = cardRef.current;

    const canvas = await html2canvas(card, {
      scale: 4,
      useCORS: true
    });

    const maxWidth = 1000;
    const scaleFactor = maxWidth / canvas.width;

    const outputCanvas = document.createElement("canvas");
    const ctx = outputCanvas.getContext("2d");

    outputCanvas.width = maxWidth;
    outputCanvas.height = canvas.height * scaleFactor;

    ctx.drawImage(
      canvas,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height
    );

    const image = outputCanvas.toDataURL("image/png");

    const link = document.createElement("a");
    link.href = image;
    link.download = `reservation_${selectedReservation.reservation_no}.png`;
    link.click();
  };

  const downloadPDF = () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const card = cardRef.current;

    html2canvas(card, { scale: 2 }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`reservation_${selectedReservation.reservation_no}.pdf`);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-6 flex justify-center">

      {/* Left Section (Scanner + Manual Search) */}
      <div className="bg-white shadow-xl rounded-2xl p-6 w-[430px] h-[600px]">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">QR Code Verification</h1>

        <div className="rounded-xl overflow-hidden mb-4" style={{ height: '250px' }}>
          {scannerActive ? (
            <div id="qr-reader" className="w-full h-full"></div>
          ) : (
            <div className="bg-gray-100 rounded-xl p-8 border-2 border-dashed border-gray-300 h-full flex flex-col justify-center items-center">
              <QrCode size={50} className="text-gray-400" />
              <p className="text-gray-500 text-sm mt-2">Camera Preview</p>
              <p className="text-gray-400 text-xs mt-1">Click "Start Scanner" to begin</p>
            </div>
          )}
        </div>

        <button
          onClick={toggleScanner}
          disabled={cameraDevices.length === 0}
          className={`w-full px-4 py-3 rounded-xl text-sm font-semibold transition ${
            cameraDevices.length === 0
              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
              : 'bg-black text-white hover:bg-gray-800'
          }`}
        >
          {scannerActive ? "Stop Camera" : cameraDevices.length === 0 ? "No Camera Detected" : "Start Scanner"}
        </button>

        {cameraDevices.length > 1 && !scannerActive && (
          <div className="mt-3">
            <select
              value={selectedCamera || ''}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              {cameraDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label || `Camera ${device.id}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="text-center text-gray-400 text-xs mt-4 mb-2">OR</p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Reservation Number"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 border p-2 rounded-lg"
          />
          <button
            onClick={() => handleSearch()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition"
          >
            Verify
          </button>
        </div>
      </div>

      {/* MODAL FOR RESERVATION DETAILS */}
      {selectedReservation && !confirmationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-[600px] relative">

            <button
              onClick={() => setSelectedReservation(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-black"
            >
              <X size={22} />
            </button>

            <div ref={cardRef}>
              <h2 className="text-2xl font-bold text-green-600 flex items-center gap-2">
                <CheckCircle size={26} className="text-green-500" />
                Reservation Verified
              </h2>

              <div className="mt-4 space-y-2 text-gray-700">
                <Detail label="Reservation No" value={selectedReservation.reservation_no || "N/A"} />
                <Detail label="Reservation ID" value={`#${selectedReservation.id}`} />
                <Detail label="Table" value={`Table ${selectedReservation.table_id}`} />
                <Detail label="Date" value={selectedReservation.reservation_date} />
                <Detail label="Start Time" value={selectedReservation.start_time} />
                <Detail label="Duration" value={`${selectedReservation.duration} hr(s)`} />
                <Detail label="Payment Method" value={selectedReservation.paymentMethod || "N/A"} />
                <Detail label="Payment Type" value={selectedReservation.payment_type || "N/A"} />
                <Detail label="Total Bill" value={`₱${selectedReservation.total_bill || 0}`} />
                <Detail label="Payment Status" value={selectedReservation.payment_status ? "Paid" : "Pending"} />
                <Detail label="Billiard Type" value={selectedReservation.billiard_type || "N/A"} />
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={downloadPDF}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
              >
                Download PDF
              </button>

              <button
                onClick={saveAsImage}
                className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition"
              >
                Save Image
              </button>

              <button
                onClick={() => setShowProofModal(true)}
                className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition flex items-center justify-center gap-2"
              >
                {selectedReservation.proof_of_payment ? (
                  <>
                    <FileImage size={18} />
                    View Proof
                  </>
                ) : (
                  <>
                    <FolderOpen size={18} />
                    No Proof
                  </>
                )}
              </button>
            </div>

            <button
              onClick={handleCheckInClick}
              className="mt-4 w-full py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition"
            >
              Check-in Customer
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {selectedReservation && confirmationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-[500px] relative">
            
            <button
              onClick={() => setConfirmationModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-black"
            >
              <X size={22} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <AlertCircle size={28} className="text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-800">Confirm Check-in</h2>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3">
              <Detail label="Reservation No" value={selectedReservation.reservation_no || "N/A"} />
              <Detail label="Table" value={`Table ${selectedReservation.table_id}`} />
              <Detail label="Payment Method" value={selectedReservation.paymentMethod || "N/A"} />
              <Detail label="Payment Type" value={selectedReservation.payment_type || "N/A"} />
              <Detail label="Total Bill" value={`₱${selectedReservation.total_bill || 0}`} />
              {generatedRefNo && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded p-2 mt-3">
                  <Detail label="Reference No" value={generatedRefNo} />
                </div>
              )}
            </div>

            {selectedReservation.paymentMethod === 'GCash' && (
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  GCash Reference Number <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter GCash Reference Number"
                  value={gcashRefNo}
                  onChange={(e) => setGcashRefNo(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            )}

            {selectedReservation.paymentMethod === 'Cash' && selectedReservation.payment_type === 'Full Payment' && (
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-6">
                <p className="text-green-700 font-semibold text-sm">
                  ✓ Payment will be marked as <strong>COMPLETE</strong> upon check-in
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmationModal(false)}
                className="flex-1 py-3 bg-gray-300 text-gray-800 rounded-xl font-semibold hover:bg-gray-400 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCheckIn}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition"
              >
                Confirm Check-in
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROOF OF PAYMENT MODAL */}
      {selectedReservation && showProofModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-[700px] max-h-[90vh] overflow-y-auto relative">
            
            <button
              onClick={() => setShowProofModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-black z-10"
            >
              <X size={22} />
            </button>

            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <FileImage size={26} className="text-amber-600" />
              Proof of Payment
            </h2>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <Detail label="Reservation No" value={selectedReservation.reservation_no || "N/A"} />
              <Detail label="Payment Method" value={selectedReservation.paymentMethod || "N/A"} />
            </div>

            {selectedReservation.proof_of_payment ? (
              <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                <img 
                  src={selectedReservation.proof_of_payment} 
                  alt="Proof of Payment"
                  className="w-full h-auto rounded-lg shadow-md"
                />
              </div>
            ) : (
              <div className="bg-gray-100 rounded-lg p-12 flex flex-col items-center justify-center border-2 border-dashed border-gray-300">
                <FolderOpen size={60} className="text-gray-400 mb-4" />
                <p className="text-gray-500 text-lg font-semibold">No Proof of Payment</p>
                <p className="text-gray-400 text-sm mt-2">Customer has not uploaded proof of payment yet.</p>
              </div>
            )}

            <button
              onClick={() => setShowProofModal(false)}
              className="mt-6 w-full py-3 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-900 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex justify-between border-b pb-1">
      <span className="font-medium text-sm">{label}:</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
