import React, { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";

function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user came from password reset email
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Swal.fire({
          icon: "error",
          title: "Invalid Link",
          text: "This password reset link is invalid or has expired.",
          confirmButtonColor: "#1e293b",
        });
        navigate("/");
      }
    };
    checkSession();
  }, [navigate]);

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      Swal.fire({
        icon: "warning",
        title: "Missing Information",
        text: "Please fill in all fields.",
        confirmButtonColor: "#1e293b",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      Swal.fire({
        icon: "error",
        title: "Password Mismatch",
        text: "Passwords do not match.",
        confirmButtonColor: "#1e293b",
      });
      return;
    }

    if (newPassword.length < 6) {
      Swal.fire({
        icon: "warning",
        title: "Weak Password",
        text: "Password must be at least 6 characters long.",
        confirmButtonColor: "#1e293b",
      });
      return;
    }

    setLoading(true);

    try {
      // Update password in Supabase Auth
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      // Get user email to update accounts table
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user?.email) {
        // Update password in accounts table
        await supabase
          .from("accounts")
          .update({ password: newPassword })
          .eq("email", user.email);
      }

      Swal.fire({
        icon: "success",
        title: "Password Reset Successful",
        text: "Your password has been updated. You can now log in.",
        confirmButtonColor: "#1e293b",
      });

      // Sign out and redirect to login
      await supabase.auth.signOut();
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (err) {
      console.error("Reset password error:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message || "Failed to reset password. Please try again.",
        confirmButtonColor: "#1e293b",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Reset Your Password
        </h2>
        <p className="text-gray-600 mb-6">
          Enter your new password below.
        </p>

        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-medium mb-2">
            New Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter new password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-medium mb-2">
            Confirm New Password
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Confirm new password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <button
          onClick={handleResetPassword}
          disabled={loading}
          className="w-full bg-gray-900 text-white py-2 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50"
        >
          {loading ? "Resetting..." : "Reset Password"}
        </button>
      </div>
    </div>
  );
}

export default ResetPassword;