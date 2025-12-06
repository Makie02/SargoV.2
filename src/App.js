
import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import { ChevronDown, Bell } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

// Pages
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Reservation from "./pages/Reservation";
import History from "./pages/History";
import ReservationCalendar from "./pages/Calendar";
import UserManagement from "./pages/UserManagement";
import Approvals from "./pages/Approvals";
import AuditTrail from "./pages/AuditTrail";
import Reference from "./pages/Reference";
import CustomerDashboard from "./dashboard/CustomerDashBoard";
import FrontDeskDashboard from "./dashboard/FrontDeskDashboard";
import ManagerDashboard from "./dashboard/ManagerDashboard";
import QRCheckInPage from "./pages/QRCheckInPage";
import ReservationFrontDesk from "./Reservation/ReservationFrontDesk";
import CustomerReservation from "./Reservation/ReservationCustomer";
import FinalizePayment from "./pages/FinalizePayment";
import Payment from "./customer/Payment";
import ViewProfile from "./pages/ViewProfile";
import HomeDashboardUpload from "./components/HomeDashboardUpload";
import ForgotPassword from "./components/ForgotPassword";
import MarketingDashboard from "./dashboard/MarketingDashboard";
import ResetPassword from "./components/ResetPassword";
import CancelBookings from "./components/CancelBookings";
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [currentPage, setCurrentPage] = useState(
    localStorage.getItem("currentPage") || "dashboard"
  );
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isDesktopOpen, setIsDesktopOpen] = useState(true);





  const [permissions, setPermissions] = useState({});
  const [noPermissionsData, setNoPermissionsData] = useState(false);

  // Fetch role permissions
useEffect(() => {
  const loadSession = async () => {
    const sessionData = localStorage.getItem("userSession");
    if (!sessionData) return;

    try {
      const session = JSON.parse(sessionData);
      setUserRole(session.role);
      setIsLoggedIn(true);

      const savedPage = localStorage.getItem("currentPage");

      // ✅ Updated default pages
      const defaultPages = {
        customer: 'Customer Dashboard',
        frontdesk: 'FrontDesk Dashboard',
        manager: 'Manager Dashboard',
        admin: 'Admin Dashboard',
        superadmin: 'Admin Dashboard'
      };

      if (savedPage) {
        setCurrentPage(savedPage);
      } else {
        setCurrentPage(defaultPages[session.role] || 'Admin Dashboard');
      }

      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("email", session.email)
        .single();

      if (!error) {
        setUserProfile({
          name: session.full_name || session.username || "User",
          email: data.email,
          role: data.role,
          profilePicture: data.ProfilePicuture || "",
        });
      }
    } catch (error) {
      console.error("Error parsing session:", error);
      localStorage.removeItem("userSession");
    }
  };
  loadSession();
}, []);
useEffect(() => {
  const fetchRolePermissions = async () => {
    const sessionData = localStorage.getItem("userSession");
    if (!sessionData) return;

    try {
      const session = JSON.parse(sessionData);
      const userRole = session.role;

      if (!userRole) {
        console.warn("⚠️ No role found in session");
        setNoPermissionsData(true);
        return;
      }

      // ✅ ADMIN BYPASS - Grant all permissions
      if (userRole.toLowerCase() === "admin") {
        console.log("✅ Admin detected - Full access granted");
        const allPermissions = {
          "Admin Dashboard": true,
          "Manager Dashboard": true,
          "Customer Dashboard": true,
          "FrontDesk Dashboard": true,
          "Reservation (Admin)": true,
          "Reservation (Manager)": true,
          "Reservation (Customer)": true,
          "Reservation (Front Desk)": true,
          "QR Check-In": true,
          "Finalize Payment": true,
          "Calendar": true,
          "History": true,
          "User Management": true,
          "Reference": true,
          "Audit Trail": true,
          "profile": true,
          "CancelBookings": true,
        };
        setPermissions(allPermissions);
        setNoPermissionsData(false);
        return;
      }

      // Fetch from database for other roles
      const { data: roleData, error: roleError } = await supabase
        .from("UserRole")
        .select("role_id, role")
        .ilike("role", userRole)
        .maybeSingle();

      if (roleError || !roleData) {
        console.error("❌ Error fetching role:", roleError);
        setNoPermissionsData(true);
        return;
      }

      const roleId = roleData.role_id;
      console.log("✅ Found role_id:", roleId, "for role:", roleData.role);

      const { data: permsData, error: permsError } = await supabase
        .from("Role_Permission")
        .select("page, has_access")
        .eq("role_id", roleId);

      if (permsError) {
        console.error("❌ Error fetching permissions:", permsError);
        setNoPermissionsData(true);
        return;
      }

      if (!permsData || permsData.length === 0) {
        console.warn("⚠️ No permissions found for role_id:", roleId);
        
        // Default permissions
        const defaultPerms = {
          frontdesk: {
            "FrontDesk Dashboard": true,
            "Reservation (Front Desk)": true,
            "QR Check-In": true,
            "Finalize Payment": true,
            "Calendar": true,
            "profile": true,
            "History": true,
          },
          customer: {
            "Customer Dashboard": true,
            "Reservation (Customer)": true,
            "Calendar": true,
            "profile": true,
            "History": true,
            "CancelBookings": true,
          },
          manager: {
            "Manager Dashboard": true,
            "Reservation (Manager)": true,
            "Calendar": true,
            "profile": true,
            "History": true,
          }
        };
        
        setPermissions(defaultPerms[userRole.toLowerCase()] || {});
        setNoPermissionsData(false);
        return;
      }

      const permissionsObj = {};
      permsData.forEach(({ page, has_access }) => {
        permissionsObj[page] = has_access === true;
      });

      console.log("✅ Permissions loaded:", permissionsObj);
      setPermissions(permissionsObj);
      setNoPermissionsData(false);

    } catch (error) {
      console.error("❌ Error in fetchRolePermissions:", error);
      setNoPermissionsData(true);
    }
  };

  if (isLoggedIn) {
    fetchRolePermissions();
  }
}, [isLoggedIn]);

  const [userProfile, setUserProfile] = useState({
    name: "",
    email: "",
    role: "",
    profilePicture: "",
  });

  const [notifications, setNotifications] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);

  // Helper function to format time ago
  const getTimeAgo = (timestamp) => {
    const now = new Date();
    const created = new Date(timestamp);
    const diffInSeconds = Math.floor((now - created) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return created.toLocaleDateString();
  };

  // Helper function to format notification message based on activity
  const formatNotificationMessage = (tx) => {
    const activityType = tx.activity_type || 'Transaction';
    const accountId = tx.account_id;
    const amount = tx.amount ? `₱${tx.amount}` : '';
    const status = tx.status || '';
    const extension = tx.extension && tx.extension > 0 ? tx.extension : null;
    const duration = tx.duration || '';

    switch (activityType.toLowerCase()) {
      case 'status_change':
        let statusMsg = `Status updated for Account ${accountId}`;
        if (status) statusMsg += ` - ${status}`;
        if (amount) statusMsg += ` ${amount}`;
        if (duration) statusMsg += ` (${duration})`;
        return statusMsg;

      case 'extension':
        let extMsg = `Extension request from Account ${accountId}`;
        if (extension) extMsg += ` - ${extension} day${extension > 1 ? 's' : ''}`;
        if (amount) extMsg += ` ${amount}`;
        return extMsg;

      case 'payment':
        return `Payment received from Account ${accountId} - ${amount}`;
      case 'reservation':
        let resMsg = `New reservation by Account ${accountId}`;
        if (amount) resMsg += ` - ${amount}`;
        if (duration) resMsg += ` (${duration})`;
        return resMsg;
      case 'check_in':
        return `Check-in by Account ${accountId}`;
      case 'check_out':
        return `Check-out by Account ${accountId}`;
      default:
        return `New transaction by Account ${accountId} ${amount}`;
    }
  };

  // Save current page
  useEffect(() => {
    if (currentPage) localStorage.setItem("currentPage", currentPage);
  }, [currentPage]);

  // Load session & profile
  // Load session & profile
  useEffect(() => {
    const loadSession = async () => {
      const sessionData = localStorage.getItem("userSession");
      if (!sessionData) return;

      try {
        const session = JSON.parse(sessionData);
        setUserRole(session.role);
        setIsLoggedIn(true);

        // ✅ FIXED: Prioritize saved page over default pages
        const savedPage = localStorage.getItem("currentPage");

        // Default pages for first login only
        const defaultPages = {
          customer: 'CustomerDashboard',
          frontdesk: 'frontDeskDashboard',
          manager: 'ManagerDashboard',
          admin: 'dashboard',
          superadmin: 'dashboard'
        };

        // Use saved page if exists, otherwise use default for role
        if (savedPage) {
          setCurrentPage(savedPage);
        } else {
          setCurrentPage(defaultPages[session.role] || 'dashboard');
        }

        const { data, error } = await supabase
          .from("accounts")
          .select("*")
          .eq("email", session.email)
          .single();

        if (!error) {
          setUserProfile({
            name: session.full_name || session.username || "User",
            email: data.email,
            role: data.role,
            profilePicture: data.ProfilePicuture || "",
          });
        }
      } catch (error) {
        console.error("Error parsing session:", error);
        localStorage.removeItem("userSession");
      }
    };
    loadSession();
  }, []);
  // Notifications useEffect
  useEffect(() => {
    if (!userProfile.email) return; // Wait for user profile to load

    // Initial fetch
    const fetchNotifications = async () => {
      const sessionData = localStorage.getItem("userSession");
      if (!sessionData) return;

      const session = JSON.parse(sessionData);
      const currentAccountId = session.account_id || session.id;

      // Build query based on role
      let query = supabase
        .from("transaction_history")
        .select("*")
        .eq("Notification", false);

      // If not admin/superadmin, filter by account_id
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        query = query.eq("account_id", currentAccountId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (!error && data) {
        setNotifications(
          data.map((tx) => ({
            id: tx.id,
            message: formatNotificationMessage(tx),
            timestamp: tx.created_at,
            activityType: tx.activity_type || 'transaction',
            status: tx.status || null,
            extension: tx.extension && tx.extension > 0 ? tx.extension : null,
            duration: tx.duration || null
          }))
        );
      }
    };

    fetchNotifications();

    // Realtime listener
    const channel = supabase
      .channel("transaction_notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transaction_history" },
        (payload) => {
          const newTx = payload.new;
          if (!newTx.Notification) {
            // Get current user's account_id
            const sessionData = localStorage.getItem("userSession");
            if (sessionData) {
              const session = JSON.parse(sessionData);
              const currentAccountId = session.account_id || session.id;

              // Check if should show notification based on role
              const shouldShow =
                userRole === 'admin' ||
                userRole === 'superadmin' ||
                newTx.account_id === currentAccountId;

              if (shouldShow) {
                setNotifications((prev) => [
                  {
                    id: newTx.id,
                    message: formatNotificationMessage(newTx),
                    timestamp: newTx.created_at,
                    activityType: newTx.activity_type || 'transaction',
                    status: newTx.status || null,
                    extension: newTx.extension && newTx.extension > 0 ? newTx.extension : null,
                    duration: newTx.duration || null
                  },
                  ...prev,
                ]);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRole, userProfile.email]);

  // Handle notification click - mark as read
  const handleNotificationClick = async (notificationId) => {
    try {
      const { error } = await supabase
        .from("transaction_history")
        .update({ Notification: true })
        .eq("id", notificationId);

      if (!error) {
        // Remove notification from state
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      } else {
        console.error("Error marking notification as read:", error);
      }
    } catch (error) {
      console.error("Error updating notification:", error);
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    try {
      const notificationIds = notifications.map(n => n.id);

      const { error } = await supabase
        .from("transaction_history")
        .update({ Notification: true })
        .in("id", notificationIds);

      if (!error) {
        setNotifications([]);
      } else {
        console.error("Error marking all as read:", error);
      }
    } catch (error) {
      console.error("Error updating notifications:", error);
    }
  };
const handleLoginSuccess = async (sessionData) => {
  setUserRole(sessionData.role);
  setIsLoggedIn(true);

  setTimeout(() => {
    switch (sessionData.role) {
      case 'customer':
        setCurrentPage('Customer Dashboard');
        break;
      case 'frontdesk':
        setCurrentPage('FrontDesk Dashboard');
        break;
      case 'manager':
        setCurrentPage('Manager Dashboard');
        break;
      case 'admin':
      case 'superadmin':
        setCurrentPage('Admin Dashboard');
        break;
      default:
        setCurrentPage('Admin Dashboard');
    }
  }, 0);
};
  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole(null);
    setUserProfile({ name: "", email: "", role: "", profilePicture: "" });
    setCurrentPage("dashboard");
    localStorage.removeItem("userSession");
  };

  const adminPages = ["approvals", "auditTrail", "maintenance", "userManagement", "Reference", "dashboard"];
  const customerPages = ["CustomerDashboard", "CustomerReservation", "Payment"];
  const frontdeskPages = ["frontDeskDashboard", "ReservationFrontDesk", "QRCheckInPage"];
  const managerPages = ["ManagerDashboard"];
const hasAccess = (page) => {
  // ✅ ADMIN has access to everything
  if (userRole === "admin") return true;

  // Check permissions from database
  if (permissions[page] !== undefined) {
    return permissions[page] === true;
  }

  // Common pages accessible by all (fallback)
  const commonPages = ["Calendar", "profile", "History", "CancelBookings"];
  return commonPages.includes(page);
};


  const [adminNotifications, setAdminNotifications] = useState([]);
  const [adminNotificationOpen, setAdminNotificationOpen] = useState(false);

  const NotFoundPage = () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">403</h1>
        <h2 className="text-2xl font-semibold text-gray-700 mb-2">Access Denied</h2>
        <p className="text-gray-500 mb-6">You don't have permission to access this page.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Refresh Page
        </button>
      </div>
    </div>
  );
  // Show NotFoundPage if no permissions data

  // Admin Notifications from Reservation Table
  // Admin Notifications from Reservation Table
  useEffect(() => {
    // Only for admin and superadmin roles
    if (userRole !== 'admin' && userRole !== 'superadmin') return;

    // Initial fetch
    const fetchAdminNotifications = async () => {
      // Get all reservations where Notification is false or null
      const { data, error } = await supabase
        .from("reservation")
        .select("*")
        .or("Notification.is.null,Notification.eq.false")
        .order("created_at", { ascending: false });

      if (!error && data) {
        console.log("Fetched admin notifications:", data); // Debug log
        setAdminNotifications(
          data.map((res) => ({
            id: res.id,
            accountId: res.account_id,
            tableId: res.table_id,
            date: res.reservation_date,
            startTime: res.start_time,
            duration: res.duration,
            status: res.status,
            totalBill: res.total_bill,
            paymentType: res.payment_type,
            billiardType: res.billiard_type,
            timestamp: res.created_at,
          }))
        );
      } else if (error) {
        console.error("Error fetching admin notifications:", error);
      }
    };

    fetchAdminNotifications();

    // Realtime listener for new reservations
    const channel = supabase
      .channel("admin_reservation_notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reservation" },
        (payload) => {
          const newRes = payload.new;
          console.log("New reservation inserted:", newRes); // Debug log

          // Check if notification should be shown (null or false)
          if (newRes.Notification === null || newRes.Notification === false) {
            setAdminNotifications((prev) => [
              {
                id: newRes.id,
                accountId: newRes.account_id,
                tableId: newRes.table_id,
                date: newRes.reservation_date,
                startTime: newRes.start_time,
                duration: newRes.duration,
                status: newRes.status,
                totalBill: newRes.total_bill,
                paymentType: newRes.payment_type,
                billiardType: newRes.billiard_type,
                timestamp: newRes.created_at,
              },
              ...prev,
            ]);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reservation" },
        (payload) => {
          const updatedRes = payload.new;
          const oldRes = payload.old;

          console.log("Reservation updated:", updatedRes); // Debug log

          // If Notification changed from true to false/null, or status changed
          if (updatedRes.Notification === null || updatedRes.Notification === false) {
            setAdminNotifications((prev) => {
              // Check if already exists
              const exists = prev.find(n => n.id === updatedRes.id);

              if (!exists) {
                // Add new notification if doesn't exist
                return [
                  {
                    id: updatedRes.id,
                    accountId: updatedRes.account_id,
                    tableId: updatedRes.table_id,
                    date: updatedRes.reservation_date,
                    startTime: updatedRes.start_time,
                    duration: updatedRes.duration,
                    status: updatedRes.status,
                    totalBill: updatedRes.total_bill,
                    paymentType: updatedRes.payment_type,
                    billiardType: updatedRes.billiard_type,
                    timestamp: updatedRes.created_at,
                  },
                  ...prev,
                ];
              } else {
                // Update existing notification
                return prev.map(n =>
                  n.id === updatedRes.id
                    ? {
                      ...n,
                      status: updatedRes.status,
                      totalBill: updatedRes.total_bill,
                      paymentType: updatedRes.payment_type,
                      duration: updatedRes.duration,
                      startTime: updatedRes.start_time,
                    }
                    : n
                );
              }
            });
          } else if (updatedRes.Notification === true) {
            // Remove notification if marked as read
            setAdminNotifications((prev) => prev.filter(n => n.id !== updatedRes.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRole,]);

  // Handle admin notification click - mark as read
  const handleAdminNotificationClick = async (notificationId) => {
    try {
      const { error } = await supabase
        .from("reservation")
        .update({ Notification: true })
        .eq("id", notificationId);

      if (!error) {
        setAdminNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      } else {
        console.error("Error marking admin notification as read:", error);
      }
    } catch (error) {
      console.error("Error updating admin notification:", error);
    }
  };

  // Mark all admin notifications as read
  const handleMarkAllAdminAsRead = async () => {
    try {
      const notificationIds = adminNotifications.map(n => n.id);

      const { error } = await supabase
        .from("reservation")
        .update({ Notification: true })
        .in("id", notificationIds);

      if (!error) {
        setAdminNotifications([]);
      } else {
        console.error("Error marking all admin notifications as read:", error);
      }
    } catch (error) {
      console.error("Error updating admin notifications:", error);
    }
  };
const renderPage = () => {
  // Check access before rendering
  if (!hasAccess(currentPage)) {
    const defaultPages = {
      customer: 'Customer Dashboard',
      frontdesk: 'FrontDesk Dashboard',
      manager: 'Manager Dashboard',
      admin: 'Admin Dashboard',
      superadmin: 'Admin Dashboard'
    };

    const defaultPage = defaultPages[userRole] || 'Admin Dashboard';
    
    // Redirect to default page
    setTimeout(() => setCurrentPage(defaultPage), 0);
    
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

  if (isLoggedIn && noPermissionsData) {
    return <NotFoundPage />;
  }

  const pages = {
    // ✅ NEW - With Spaces (matches Sidebar & Database)
    "Admin Dashboard": <Dashboard />,
    "Manager Dashboard": <ManagerDashboard />,
    "Customer Dashboard": <CustomerDashboard />,
    "FrontDesk Dashboard": <FrontDeskDashboard />,
    "Reservation (Admin)": <Reservation />,
    "Reservation (Manager)": <Reservation />,
    "Reservation (Customer)": <CustomerReservation />,
    "Reservation (Front Desk)": <ReservationFrontDesk />,
    "QR Check-In": <QRCheckInPage />,
    "Finalize Payment": <FinalizePayment />,
    "Calendar": <ReservationCalendar />,
    "History": <History />,
    "User Management": <UserManagement />,
    "Reference": <Reference />,
    "Audit Trail": <AuditTrail />,
    
    // ✅ Keep these for backward compatibility
    "Profile": <ViewProfile />,
    "CancelBookings": <CancelBookings />,
    "Payment": <Payment />,
    "ResetPassword": <ResetPassword />,
    "homeDashboardUpload": <HomeDashboardUpload />,


    };

    return pages[currentPage] || <Dashboard />;
  };

  const [isResetPasswordPage, setIsResetPasswordPage] = useState(false);

  // ... rest of your existing state

  // ✅ Check URL on mount
  useEffect(() => {
    const hash = window.location.hash;

    // Check if it's a password reset link from Supabase
    if (hash.includes('type=recovery')) {
      setIsResetPasswordPage(true);
    }
  }, []);

  // ... rest of your existing code

  // ✅ If on reset password page, show that component
  if (isResetPasswordPage) {
    return <ResetPassword onSuccess={() => {
      setIsResetPasswordPage(false);
      window.location.href = '/';
    }} />;
  }

  if (!isLoggedIn) {
    return (
      <>
        <Home
          onLoginSuccess={handleLoginSuccess}
        />

        <ForgotPassword
          isOpen={showForgotPassword}
          onClose={() => setShowForgotPassword(false)}
          onBackToLogin={() => setShowForgotPassword(false)}
        />
      </>
    );
  }
  return (
    <div className="flex h-screen bg-white">
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        userRole={userRole}
        isDesktopOpen={isDesktopOpen}
        setIsDesktopOpen={setIsDesktopOpen}
      />
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900 capitalize">
          </h1>

          <div className="flex items-center gap-4">
            {/* Customer Notification - BLUE */}
            {(userRole === 'customer') && (
              <div className="relative">
                <button
                  onClick={() => setNotificationOpen(!notificationOpen)}
                  className="p-2 rounded-full hover:bg-blue-50 transition-all duration-200 focus:outline-none relative"
                  title="Notifications"
                >
                  <Bell size={24} className="text-blue-600" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs font-bold text-white bg-gradient-to-r from-red-500 to-pink-500 rounded-full shadow-lg animate-pulse">
                      {notifications.length}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown */}
                {notificationOpen && (
                  <div className="absolute right-0 mt-3 w-96 bg-white/95 backdrop-blur-xl border border-blue-100 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-white font-semibold text-base flex items-center gap-2">
                          <Bell size={18} />
                          Notifications
                        </h3>
                        {notifications.length > 0 && (
                          <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                            {notifications.length} new
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4">
                          <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-50 rounded-full flex items-center justify-center mb-3">
                            <Bell size={28} className="text-blue-400" />
                          </div>
                          <p className="text-gray-500 text-sm font-medium">No new notifications</p>
                          <p className="text-gray-400 text-xs mt-1">You're all caught up!</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-blue-50">
                          {notifications.map((note, index) => (
                            <div
                              key={note.id}
                              onClick={() => handleNotificationClick(note.id)}
                              className="px-4 py-3.5 hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent cursor-pointer transition-all duration-200 group"
                              style={{ animationDelay: `${index * 50}ms` }}
                            >
                              <div className="flex items-start gap-3">
                                {/* Icon */}
                                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-200">
                                  <span className="text-white text-sm font-bold">
                                    {note.activityType === 'extension' ? '⏱️' :
                                      note.activityType === 'status_change' ? '📋' :
                                        note.activityType === 'payment' ? '₱' :
                                          note.activityType === 'check_in' ? '✓' :
                                            note.activityType === 'check_out' ? '←' : '₱'}
                                  </span>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800 font-medium leading-relaxed">
                                    {note.message}
                                  </p>

                                  {/* Status, Extension, Duration Display */}
                                  <div className="flex flex-wrap items-center gap-2 mt-2">
                                    {note.status && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                        📋 {note.status}
                                      </span>
                                    )}

                                    {note.extension && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                        ⏱️ +{note.extension} day{note.extension > 1 ? 's' : ''}
                                      </span>
                                    )}

                                    {note.duration && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                        🕐 {note.duration}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 mt-1.5">
                                    <p className="text-xs text-blue-500 font-medium">
                                      {getTimeAgo(note.timestamp)}
                                    </p>
                                    <span className="text-xs text-gray-400">•</span>
                                    <span className="text-xs text-gray-500 capitalize">
                                      {note.activityType.replace('_', ' ')}
                                    </span>
                                  </div>
                                </div>

                                {/* Dot indicator */}
                                <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2 group-hover:scale-125 transition-transform"></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                      <div className="bg-gradient-to-r from-blue-50 to-transparent px-5 py-3 border-t border-blue-100">
                        <button
                          onClick={handleMarkAllAsRead}
                          className="text-blue-600 text-sm font-semibold hover:text-blue-700 transition-colors w-full text-center"
                        >
                          Mark all as read
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Admin Notification - GREEN */}
            {(userRole === 'admin' || userRole === 'superadmin' || userRole === 'frontdesk') && (
              <div className="relative">
                <button
                  onClick={() => setAdminNotificationOpen(!adminNotificationOpen)}
                  className="p-2 rounded-full hover:bg-green-50 transition-all duration-200 focus:outline-none relative"
                  title="Reservation Notifications"
                >
                  <Bell size={24} className="text-green-600" />
                  {adminNotifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs font-bold text-white bg-gradient-to-r from-green-500 to-emerald-500 rounded-full shadow-lg animate-pulse">
                      {adminNotifications.length}
                    </span>
                  )}
                </button>

                {/* Admin Notification Dropdown */}
                {adminNotificationOpen && (
                  <div className="absolute right-0 mt-3 w-96 bg-white/95 backdrop-blur-xl border border-green-100 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-green-500 to-green-600 px-5 py-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-white font-semibold text-base flex items-center gap-2">
                          <Bell size={18} />
                          Reservation Notifications
                        </h3>
                        {adminNotifications.length > 0 && (
                          <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                            {adminNotifications.length} new
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-96 overflow-y-auto">
                      {adminNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4">
                          <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-green-50 rounded-full flex items-center justify-center mb-3">
                            <Bell size={28} className="text-green-400" />
                          </div>
                          <p className="text-gray-500 text-sm font-medium">No new reservations</p>
                          <p className="text-gray-400 text-xs mt-1">You're all caught up!</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-green-50">
                          {adminNotifications.map((note, index) => (
                            <div
                              key={note.id}
                              onClick={() => handleAdminNotificationClick(note.id)}
                              className="px-4 py-3.5 hover:bg-gradient-to-r hover:from-green-50 hover:to-transparent cursor-pointer transition-all duration-200 group"
                              style={{ animationDelay: `${index * 50}ms` }}
                            >
                              <div className="flex items-start gap-3">
                                {/* Icon */}
                                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-200">
                                  <span className="text-white text-sm font-bold">🎱</span>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800 font-medium leading-relaxed">
                                    New reservation from Account #{note.accountId}
                                  </p>

                                  {/* Reservation Details */}
                                  <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                      📅 {new Date(note.date).toLocaleDateString()}
                                    </span>

                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                      🕐 {note.startTime}
                                    </span>

                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                      ⏱️ {note.duration}h
                                    </span>

                                    {note.status && (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${note.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                        note.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                          note.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                            'bg-gray-100 text-gray-700'
                                        }`}>
                                        📋 {note.status}
                                      </span>
                                    )}
                                  </div>

                                  {/* Additional Info */}
                                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                                    {note.billiardType && (
                                      <span>🎱 {note.billiardType}</span>
                                    )}
                                    {note.totalBill && (
                                      <span>• ₱{note.totalBill}</span>
                                    )}
                                    {note.paymentType && (
                                      <span>• {note.paymentType}</span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 mt-1.5">
                                    <p className="text-xs text-green-500 font-medium">
                                      {getTimeAgo(note.timestamp)}
                                    </p>
                                    <span className="text-xs text-gray-400">•</span>
                                    <span className="text-xs text-gray-500">
                                      Table #{note.tableId}
                                    </span>
                                  </div>
                                </div>

                                {/* Dot indicator */}
                                <div className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full mt-2 group-hover:scale-125 transition-transform"></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    {adminNotifications.length > 0 && (
                      <div className="bg-gradient-to-r from-green-50 to-transparent px-5 py-3 border-t border-green-100">
                        <button
                          onClick={handleMarkAllAdminAsRead}
                          className="text-green-600 text-sm font-semibold hover:text-green-700 transition-colors w-full text-center"
                        >
                          Mark all as read
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Profile Dropdown */}
            {!isDesktopOpen && (
              <div className="relative">
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex items-center gap-3 focus:outline-none hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent px-3 py-2 rounded-xl transition-all duration-200 group"
                >
                  <div className="relative">
                    <img
                      src={
                        userProfile.profilePicture ||
                        `https://ui-avatars.com/api/?name=${userProfile.name || "User"}&background=3B82F6&color=fff`
                      }
                      alt="Profile"
                      className="w-10 h-10 rounded-full object-cover border-2 border-blue-200 shadow-md group-hover:border-blue-400 transition-all duration-200"
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                  </div>

                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-semibold text-gray-900 truncate max-w-[120px]">
                      {userProfile.name}
                    </p>
                    <p className="text-xs text-gray-500 capitalize truncate">
                      {userProfile.role}
                    </p>
                  </div>

                  <ChevronDown
                    size={16}
                    className={`text-gray-500 transition-transform duration-200 ${profileMenuOpen ? "rotate-180" : ""
                      }`}
                  />
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-3 w-72 bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
                    {/* Profile Header with Gradient */}
                    <div className="relative bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 px-6 py-8">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12"></div>

                      <div className="relative flex flex-col items-center">
                        <div className="relative mb-3">
                          <img
                            src={
                              userProfile.profilePicture ||
                              `https://ui-avatars.com/api/?name=${userProfile.name || "User"}&background=fff&color=3B82F6&size=128`
                            }
                            alt="Profile"
                            className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-xl"
                          />
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 border-4 border-white rounded-full"></div>
                        </div>

                        <h3 className="text-white font-bold text-lg truncate max-w-full px-2">
                          {userProfile.name}
                        </h3>
                        <p className="text-blue-100 text-sm font-medium capitalize mt-1">
                          {userProfile.role}
                        </p>
                        <p className="text-blue-200 text-xs mt-1 truncate max-w-full px-2">
                          {userProfile.email}
                        </p>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="p-2">
                      <button
                        onClick={() => {
                          setCurrentPage('profile');
                          setProfileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent rounded-xl transition-all duration-200 group"
                      >
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                          <span className="text-lg">👤</span>
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium">View Profile</p>
                          <p className="text-xs text-gray-500">Manage your account</p>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          // Add settings functionality here
                          setProfileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent rounded-xl transition-all duration-200 group"
                      >
                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                          <span className="text-lg">⚙️</span>
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium">Settings</p>
                          <p className="text-xs text-gray-500">Preferences & privacy</p>
                        </div>
                      </button>
                    </div>

                    {/* Logout Button */}
                    <div className="p-2 border-t border-gray-100">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-gradient-to-r hover:from-red-50 hover:to-transparent rounded-xl transition-all duration-200 group"
                      >
                        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center group-hover:bg-red-200 transition-colors">
                          <span className="text-lg">🚪</span>
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-semibold">Logout</p>
                          <p className="text-xs text-red-400">Sign out of your account</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="bg-gray-50 min-h-full p-0">{renderPage()}</div>
      </div>
    </div>
  );
}

export default App;
