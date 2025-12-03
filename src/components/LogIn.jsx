import React, { useState } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import Swal from "sweetalert2";

function Login({ isOpen, onClose, onLoginSuccess, onSwitchToRegister, onSwitchToForgotPassword }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      Swal.fire({
        icon: "warning",
        title: "Missing Information",
        text: "Please enter both username and password.",
        confirmButtonColor: "#1e293b",
      });
      return;
    }

    setLoading(true);

    try {
      // ✅ Check for hardcoded ADMIN login first
      if (
        username.trim().toUpperCase() === "ADMIN" &&
        password.trim().toUpperCase() === "ADMIN"
      ) {
        const sessionData = {
          account_id: "0000",
          email: "ADMIN",
          role: "admin",
          full_name: "Administrator",
        };
        localStorage.setItem("userSession", JSON.stringify(sessionData));

        try {
          await supabase.from("system_log").insert({
            account_id: "0000",
            action: "Admin login",
          });
        } catch (logErr) {
          console.warn("Log skipped:", logErr.message);
        }

        Swal.fire({
          icon: "success",
          title: "Welcome Admin!",
          text: "You have logged in successfully.",
          showConfirmButton: false,
          timer: 1800,
        });

        setTimeout(() => {
          onClose();
          if (onLoginSuccess) onLoginSuccess(sessionData);
        }, 1800);
        return;
      }

      // ✅ Regular login via Supabase
      const { data: accountData, error: accountError } = await supabase
        .from("accounts")
        .select("account_id, email, role, password")
        .eq("email", username.toLowerCase())
        .single();

      if (accountError || !accountData) {
        throw new Error("Invalid email or password.");
      }

      if (accountData.password !== password) {
        throw new Error("Invalid email or password.");
      }

      let fullName = username;
      if (accountData.role === "customer") {
        const { data: customerData } = await supabase
          .from("customer")
          .select("first_name, middle_name, last_name")
          .eq("account_id", accountData.account_id)
          .single();

        if (customerData) {
          fullName = `${customerData.first_name} ${customerData.middle_name || ""} ${customerData.last_name}`.trim();
        }
      }

      const sessionData = {
        account_id: accountData.account_id,
        email: accountData.email,
        role: accountData.role,
        full_name: fullName,
      };
      localStorage.setItem("userSession", JSON.stringify(sessionData));

      await supabase.from("system_log").insert({
        account_id: accountData.account_id,
        action: "User login",
      });

      Swal.fire({
        icon: "success",
        title: "Login Successful",
        text: `Welcome back, ${fullName}!`,
        showConfirmButton: false,
        timer: 1800,
      });

      setTimeout(() => {
        onClose();
        if (onLoginSuccess) onLoginSuccess(sessionData);
      }, 1800);
    } catch (err) {
      console.error("Login error:", err);
      Swal.fire({
        icon: "error",
        title: "Login Failed",
        text: err.message || "An unexpected error occurred.",
        confirmButtonColor: "#1e293b",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUsername("");
    setPassword("");
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

        <h2 className="text-2xl font-bold text-gray-900 mb-4">Log In</h2>

        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-medium mb-2">
            Email / Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin(e)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Enter your email"
          />
        </div>

        <div className="mb-2">
          <label className="block text-gray-700 text-sm font-medium mb-2">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLogin(e)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter your password"
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

        <div className="text-right mb-4">
          <button
            type="button"
            onClick={() => {
              handleClose();
              onSwitchToForgotPassword();
            }}
            className="text-sm text-purple-600 hover:text-purple-700"
          >
            Forgot Password?
          </button>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-gray-900 text-white py-2 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Log In"}
        </button>

        <p className="text-center text-sm text-gray-600 mt-4">
          Don't have an account?{" "}
          <button
            onClick={() => {
              handleClose();
              onSwitchToRegister();
            }}
            className="text-purple-600 hover:text-purple-700 font-semibold"
          >
            Register here
          </button>
        </p>
      </div>
    </div>
  );
}

export default Login;
