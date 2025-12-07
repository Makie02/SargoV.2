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

  const [userProfile, setUserProfile] = useState({
    name: "",
    email: "",
    role: "",
    profilePicture: "",
  });

  const [notifications, setNotifications] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [permissions, setPermissions] = useState({}); // ✅ ADDED: Store user permissions

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

  // ✅ FIXED: Load session, profile & permissions
  useEffect(() => {
    const loadSession = async () => {
      const sessionData = localStorage.getItem("userSession");
      if (!sessionData) return;

      try {
        const session = JSON.parse(sessionData);
        setUserRole(session.role);
        setIsLoggedIn(true);

        // Fetch user account data
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

        // ✅ ADDED: Fetch permissions
        const { data: rolesData, error: rolesError } = await supabase
          .from("UserRole")
          .select("*")
          .ilike("role", session.role);

        if (!rolesError && rolesData?.[0]) {
          const { data: permsData, error: permsError } = await supabase
            .from("Role_Permission")
            .select("page, has_access")
            .eq("role_id", rolesData[0].role_id);

          if (!permsError) {
            const permsObj = {};
            permsData?.forEach(perm => {
              if (perm.has_access) {
                permsObj[perm.page] = true;
              }
            });
            setPermissions(permsObj);

            // ✅ Set default page based on permissions
            const savedPage = localStorage.getItem("currentPage");
            
            // Map permission names to page codes
            const permissionToPageMap = {
              'Manager Dashboard': 'ManagerDashboard',
              'Customer Dashboard': 'CustomerDashboard',
              'FrontDesk Dashboard': 'frontDeskDashboard',
              'Revenue Dashboard': 'MarketingDashboard',
            };

            // Find first accessible dashboard
            let defaultPage = 'dashboard';
            for (const [permName, pageCode] of Object.entries(permissionToPageMap)) {
              if (permsObj[permName]) {
                defaultPage = pageCode;
                break;
              }
            }

            // Use saved page if exists and has access, otherwise use default
            if (savedPage && hasPageAccess(savedPage, permsObj)) {
              setCurrentPage(savedPage);
            } else {
              setCurrentPage(defaultPage);
            }
          }
        }
      } catch (error) {
        console.error("Error parsing session:", error);
        localStorage.removeItem("userSession");
      }
    };
    loadSession();
  }, []);

  // ✅ FIXED: Helper function to check page access
  const hasPageAccess = (page, perms = permissions) => {
    // Map page codes to permission names
    const pagePermissionMap = {
      'ManagerDashboard': 'Manager Dashboard',
      'MarketingDashboard': 'Revenue Dashboard',
      'CustomerDashboard': 'Customer Dashboard',
      'frontDeskDashboard': 'FrontDesk Dashboard',
      'CustomerReservation': 'Reservation (Customer)',
      'ReservationFrontDesk': 'Reservation (Front Desk)',
      'QRCheckInPage': 'QR Check-In',
      'finalize': 'Finalize Payment',
      'calendar': 'Calendar',
      'profile': 'Profile',
      'CancelBookings': 'Cancel Bookings',
      'history': 'History',
      'UserManagement': 'User Management',
      'Reference': 'Reference',
      'auditTrail': 'Audit Trail',
      'Payment': 'Payment',
    };

    const permissionName = pagePermissionMap[page];
    
    // If no permission name mapping, allow access (backwards compatibility)
    if (!permissionName) return true;
    
    // Check if user has permission
    return perms[permissionName] === true;
  };

  // Notifications useEffect
  useEffect(() => {
    if (!userProfile.email) return;

    const fetchNotifications = async () => {
      const sessionData = localStorage.getItem("userSession");
      if (!sessionData) return;

      const session = JSON.parse(sessionData);
      const currentAccountId = session.account_id || session.id;

      let query = supabase
        .from("transaction_history")
        .select("*")
        .eq("Notification", false);

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

    const channel = supabase
      .channel("transaction_notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transaction_history" },
        (payload) => {
          const newTx = payload.new;
          if (!newTx.Notification) {
            const sessionData = localStorage.getItem("userSession");
            if (sessionData) {
              const session = JSON.parse(sessionData);
              const currentAccountId = session.account_id || session.id;

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

  const handleNotificationClick = async (notificationId) => {
    try {
      const { error } = await supabase
        .from("transaction_history")
        .update({ Notification: true })
        .eq("id", notificationId);

      if (!error) {
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      }
    } catch (error) {
      console.error("Error updating notification:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const notificationIds = notifications.map(n => n.id);

      const { error } = await supabase
        .from("transaction_history")
        .update({ Notification: true })
        .in("id", notificationIds);

      if (!error) {
        setNotifications([]);
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
          setCurrentPage('CustomerDashboard');
          break;
        case 'frontdesk':
          setCurrentPage('frontDeskDashboard');
          break;
        case 'manager':
          setCurrentPage('ManagerDashboard');
          break;
        case 'admin':
        case 'superadmin':
          setCurrentPage('ManagerDashboard');
          break;
        default:
          setCurrentPage('dashboard');
      }
    }, 0);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole(null);
    setUserProfile({ name: "", email: "", role: "", profilePicture: "" });
    setPermissions({});
    setCurrentPage("dashboard");
    localStorage.removeItem("userSession");
    localStorage.removeItem("currentPage");
  };

  const [adminNotifications, setAdminNotifications] = useState([]);
  const [adminNotificationOpen, setAdminNotificationOpen] = useState(false);

  // Admin Notifications from Reservation Table
  useEffect(() => {
    if (userRole !== 'admin' && userRole !== 'superadmin') return;

    const fetchAdminNotifications = async () => {
      const { data, error } = await supabase
        .from("reservation")
        .select("*")
        .or("Notification.is.null,Notification.eq.false")
        .order("created_at", { ascending: false });

      if (!error && data) {
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
      }
    };

    fetchAdminNotifications();

    const channel = supabase
      .channel("admin_reservation_notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reservation" },
        (payload) => {
          const newRes = payload.new;
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

          if (updatedRes.Notification === null || updatedRes.Notification === false) {
            setAdminNotifications((prev) => {
              const exists = prev.find(n => n.id === updatedRes.id);

              if (!exists) {
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
            setAdminNotifications((prev) => prev.filter(n => n.id !== updatedRes.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRole]);

  const handleAdminNotificationClick = async (notificationId) => {
    try {
      const { error } = await supabase
        .from("reservation")
        .update({ Notification: true })
        .eq("id", notificationId);

      if (!error) {
        setAdminNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      }
    } catch (error) {
      console.error("Error updating admin notification:", error);
    }
  };

  const handleMarkAllAdminAsRead = async () => {
    try {
      const notificationIds = adminNotifications.map(n => n.id);

      const { error } = await supabase
        .from("reservation")
        .update({ Notification: true })
        .in("id", notificationIds);

      if (!error) {
        setAdminNotifications([]);
      }
    } catch (error) {
      console.error("Error updating admin notifications:", error);
    }
  };

  // ✅ FIXED: Render page with permission check
  const renderPage = () => {
    // Check if user has access to current page
    if (!hasPageAccess(currentPage)) {
      // Find first accessible page
      const pagePermissionMap = {
        'Manager Dashboard': 'ManagerDashboard',
        'Customer Dashboard': 'CustomerDashboard',
        'FrontDesk Dashboard': 'frontDeskDashboard',
        'Revenue Dashboard': 'MarketingDashboard',
      };

      for (const [permName, pageCode] of Object.entries(pagePermissionMap)) {
        if (permissions[permName]) {
          setTimeout(() => setCurrentPage(pageCode), 0);
          return null;
        }
      }
    }

    const pages = {
      dashboard: <Dashboard />,
      reservation: <Reservation />,
      history: <History />,
      calendar: <ReservationCalendar />,
      approvals: <Approvals />,
      auditTrail: <AuditTrail />,
      Reference: <Reference />,
      frontDeskDashboard: <FrontDeskDashboard />,
      CustomerDashboard: <CustomerDashboard />,
      QRCheckInPage: <QRCheckInPage />,
      ReservationFrontDesk: <ReservationFrontDesk />,
      CustomerReservation: <CustomerReservation />,
      Payment: <Payment />,
      finalize: <FinalizePayment />,
      UserManagement: <UserManagement />,
      ManagerDashboard: <ManagerDashboard />,
      profile: <ViewProfile />,
      homeDashboardUpload: <HomeDashboardUpload />,
      MarketingDashboard: <MarketingDashboard />,
      ResetPassword: <ResetPassword />,
      CancelBookings: <CancelBookings />,
    };

    return pages[currentPage] || <Dashboard />;
  };

  const [isResetPasswordPage, setIsResetPasswordPage] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setIsResetPasswordPage(true);
    }
  }, []);

  if (isResetPasswordPage) {
    return <ResetPassword onSuccess={() => {
      setIsResetPasswordPage(false);
      window.location.href = '/';
    }} />;
  }

  if (!isLoggedIn) {
    return (
      <>
        <Home onLoginSuccess={handleLoginSuccess} />
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

                {notificationOpen && (
                  <div className="absolute right-0 mt-3 w-96 bg-white/95 backdrop-blur-xl border border-blue-100 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
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
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-200">
                                  <span className="text-white text-sm font-bold">
                                    {note.activityType === 'extension' ? '⏱️' :
                                      note.activityType === 'status_change' ? '📋' :
                                        note.activityType === 'payment' ? '₱' :
                                          note.activityType === 'check_in' ? '✓' :
                                            note.activityType === 'check_out' ? '←' : '₱'}
                                  </span>
                                </div>

                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800 font-medium leading-relaxed">
                                    {note.message}
                                  </p>

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

                                <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2 group-hover:scale-125 transition-transform"></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

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

                {adminNotificationOpen && (
                  <div className="absolute right-0 mt-3 w-96 bg-white/95 backdrop-blur-xl border border-green-100 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
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

                    <div className="max-h-96 overflow-y-auto">
                      {adminNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4">
                          <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-green -50 rounded-full flex items-center justify-center mb-3">
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
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-200">
                                  <span className="text-white text-sm font-bold">🎱</span>
                                </div>

                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800 font-medium leading-relaxed">
                                    New reservation from Account #{note.accountId}
                                  </p>

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
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        note.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                        note.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                        note.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        📋 {note.status}
                                      </span>
                                    )}
                                  </div>

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

                                <div className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full mt-2 group-hover:scale-125 transition-transform"></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

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
                    className={`text-gray-500 transition-transform duration-200 ${profileMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-3 w-72 bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
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
