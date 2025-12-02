import React, { useState } from "react";
import { X, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import Swal from "sweetalert2";

function ForgotPassword({ isOpen, onClose, onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (!email) {
      Swal.fire({
        icon: "warning",
        title: "Missing Email",
        text: "Please enter your email address.",
        confirmButtonColor: "#1e293b",
      });
      return;
    }

    setLoading(true);

    try {
      // Send password reset email
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      Swal.fire({
        icon: "success",
        title: "Email Sent!",
        text: "Check your email for the password reset link.",
        confirmButtonColor: "#1e293b",
      });

      setEmail("");
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error("Reset password error:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message || "Failed to send reset email. Please try again.",
        confirmButtonColor: "#1e293b",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X size={24} />
        </button>

        <button
          onClick={() => {
            handleClose();
            onBackToLogin();
          }}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Login
        </button>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Forgot Password?
        </h2>
        <p className="text-gray-600 mb-6">
          Enter your email and we'll send you a link to reset your password.
        </p>

        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-medium mb-2">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="your.email@example.com"
          />
        </div>

        <button
          onClick={handleResetPassword}
          disabled={loading}
          className="w-full bg-gray-900 text-white py-2 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </div>
    </div>
  );
}

export default ForgotPassword;