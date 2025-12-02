import React, { useState } from "react";
import { X, Eye, EyeOff, AlertCircle, CheckCircle, Mail } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import emailjs from '@emailjs/browser';
import DatePicker from './DatePicker';

function Register({ isOpen, onClose, onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    birthdate: "",
    gender: "",
    email: "",
    contactNumber: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // OTP States
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError("");
  };

  const validateForm = () => {
    if (!formData.firstName || !formData.lastName || !formData.email ||
      !formData.contactNumber || !formData.birthdate || !formData.gender) {
      setError("Please fill in all required fields");
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return false;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long");
      return false;
    }

    const phoneRegex = /^[0-9]{10,11}$/;
    if (!phoneRegex.test(formData.contactNumber.replace(/\D/g, ""))) {
      setError("Please enter a valid contact number");
      return false;
    }

    const birthDate = new Date(formData.birthdate);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    if (age < 13) {
      setError("You must be at least 13 years old to register");
      return false;
    }

    return true;
  };

  const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const sendOTP = async (otpCode) => {
    try {
      emailjs.init("KkbuKQ2rTv-t7S5KK");

      const templateParams = {
        to_email: formData.email,
        to_name: formData.firstName,
        otp_code: otpCode,
        expiry_time: "10 minutes",
        reply_to: formData.email
      };

      const response = await emailjs.send(
        'service_cchiaxm',
        'template_a41djil',
        templateParams,
        'KkbuKQ2rTv-t7S5KK'
      );

      console.log('OTP sent successfully:', response);
      return true;
    } catch (error) {
      console.error('Failed to send OTP:', error);
      setError(`Email sending failed: ${error.text || error.message}`);
      return false;
    }
  };

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setError("");

    try {
      const otpCode = generateOTP();
      setGeneratedOtp(otpCode);

      const otpSent = await sendOTP(otpCode);

      if (!otpSent) {
        setError("Failed to send OTP. Please try again.");
        setLoading(false);
        return;
      }

      setShowOtpModal(true);
      startResendTimer();
      setLoading(false);

    } catch (err) {
      setError(err.message || "Failed to send OTP.");
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;

    setOtpError("");
    const otpCode = generateOTP();
    setGeneratedOtp(otpCode);

    const otpSent = await sendOTP(otpCode);
    if (otpSent) {
      startResendTimer();
      setOtpError("OTP resent successfully!");
      setTimeout(() => setOtpError(""), 3000);
    } else {
      setOtpError("Failed to resend OTP. Please try again.");
    }
  };

  const handleVerifyOTP = async () => {
    if (otp !== generatedOtp) {
      setOtpError("Invalid OTP. Please try again.");
      return;
    }

    setLoading(true);
    setOtpError("");

    try {
      const { data: accountData, error: accountError } = await supabase
        .from("accounts")
        .insert({
          email: formData.email.toLowerCase(),
          password: formData.password,
          role: 'customer'
        })
        .select()
        .single();

      if (accountError) {
        console.error('Account Insert Error:', accountError);
        setOtpError(`Failed to create account: ${accountError.message}`);
        setLoading(false);
        return;
      }

      const { error: customerError } = await supabase
        .from("customer")
        .insert({
          account_id: accountData.account_id,
          first_name: formData.firstName,
          middle_name: formData.middleName || null,
          last_name: formData.lastName,
          birthdate: formData.birthdate,
          gender: formData.gender,
          email: formData.email.toLowerCase(),
          contact_number: formData.contactNumber,
          password: formData.password,
          role: 'customer',
          username: formData.email.split('@')[0]
        });

      if (customerError) {
        console.error('Customer Insert Error:', customerError);
        await supabase.from("accounts").delete().eq('account_id', accountData.account_id);
        setOtpError(`Registration failed: ${customerError.message}`);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setShowOtpModal(false);
      setFormData({
        firstName: "",
        middleName: "",
        lastName: "",
        birthdate: "",
        gender: "",
        email: "",
        contactNumber: "",
        password: "",
        confirmPassword: "",
      });

      setTimeout(() => {
        setSuccess(false);
        onSwitchToLogin();
      }, 2000);

    } catch (err) {
      console.error('Registration Error:', err);
      setOtpError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50">
        <div className="relative w-full max-w-2xl p-6 my-8 bg-white rounded-lg shadow-xl">
          <button
            onClick={onClose}
            className="absolute text-gray-400 top-4 right-4 hover:text-gray-600"
          >
            <X size={24} />
          </button>

          <h2 className="mb-2 text-2xl font-bold text-gray-900">Create Account</h2>
          <p className="mb-6 text-gray-600">Join ELEV8 Billiards today</p>

          {error && (
            <div className="flex items-start gap-2 p-3 mb-4 border border-red-200 rounded-lg bg-red-50">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 p-3 mb-4 border border-green-200 rounded-lg bg-green-50">
              <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-600">Registration successful! Redirecting to login...</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* First Name */}
            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700">
                First Name *
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="First Name"
              />
            </div>

            {/* Middle Name */}
            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700">
                Middle Name
              </label>
              <input
                type="text"
                name="middleName"
                value={formData.middleName}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Middle Name"
              />
            </div>

            {/* Last Name */}
            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700">
                Last Name *
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Last Name"
              />
            </div>

            {/* Birthdate & Gender */}
            <div className="grid grid-cols-1 gap-4 mb-4 md:grid-cols-2">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Birthdate *
                </label>
                <DatePicker
                  value={formData.birthdate}
                  onChange={(date) => {
                    setFormData({ ...formData, birthdate: date });
                    setError("");
                  }}
                  placeholder="Select date"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Gender *
                </label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Email & Contact */}
            <div className="grid grid-cols-1 gap-4 mb-4 md:grid-cols-2">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Contact Number *
                </label>
                <input
                  type="tel"
                  name="contactNumber"
                  value={formData.contactNumber}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="09123456789"
                />
              </div>
            </div>

            {/* Password & Confirm Password */}
            <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Minimum 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute text-gray-400 -translate-y-1/2 right-3 top-1/2 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Confirm Password *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Re-enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute text-gray-400 -translate-y-1/2 right-3 top-1/2 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full py-2 font-medium text-white transition bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Sending OTP..." : success ? "Success!" : "Create Account"}
            </button>
          </form>

          <p className="mt-4 text-sm text-center text-gray-600">
            Already have an account?{" "}
            <button
              onClick={onSwitchToLogin}
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              Log In
            </button>
          </p>
        </div>
      </div>

      {/* OTP Verification Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50">
          <div className="relative w-full max-w-md p-6 bg-white rounded-lg shadow-xl">
            <button
              onClick={() => {
                setShowOtpModal(false);
                setOtp("");
                setOtpError("");
              }}
              className="absolute text-gray-400 top-4 right-4 hover:text-gray-600"
            >
              <X size={24} />
            </button>

            <div className="flex flex-col items-center mb-6">
              <div className="flex items-center justify-center w-16 h-16 mb-4 bg-blue-100 rounded-full">
                <Mail size={32} className="text-blue-600" />
              </div>
              <h3 className="mb-2 text-2xl font-bold text-gray-900">Verify Your Email</h3>
              <p className="text-center text-gray-600">
                We've sent a 6-digit code to<br />
                <span className="font-medium">{formData.email}</span>
              </p>
            </div>

            {otpError && (
              <div className="flex items-start gap-2 p-3 mb-4 border border-red-200 rounded-lg bg-red-50">
                <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{otpError}</p>
              </div>
            )}

            <div className="mb-6">
              <label className="block mb-2 text-sm font-medium text-center text-gray-700">
                Enter OTP Code
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  if (value.length <= 6) {
                    setOtp(value);
                    setOtpError("");
                  }
                }}
                maxLength={6}
                className="w-full px-4 py-3 text-2xl font-bold text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 tracking-widest"
                placeholder="000000"
              />
            </div>

            <button
              onClick={handleVerifyOTP}
              disabled={loading || otp.length !== 6}
              className="w-full py-3 mb-4 font-medium text-white transition bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Didn't receive the code?{" "}
                <button
                  onClick={handleResendOTP}
                  disabled={resendTimer > 0}
                  className="font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                </button>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Register;