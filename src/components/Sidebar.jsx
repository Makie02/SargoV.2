import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  LayoutDashboard, CheckSquare, FileText, Calendar,
  Clock, Wrench, HelpCircle, Settings,
  Search, ChevronDown, User, Users, Shield, ClipboardList, QrCode, Menu, X, XCircle, TrendingUp
} from "lucide-react";
import logo from "../logo/logo.jpg"
// NAV ITEM
const NavItem = ({ icon: Icon, label, page, currentPage, onClick, badge, permissions, onMobileClick }) => {
  const isActive = currentPage === page;
  const canAccess = permissions?.[page] ?? true;
  if (!canAccess) return null;

  return (
    <button
      onClick={() => {
        if (page) onClick(page);
        if (onMobileClick) onMobileClick();
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all duration-200
        ${isActive
          ? "bg-purple-50 text-purple-700 font-medium border-r-2 border-purple-600"
          : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"}
      `}
    >
      <Icon size={18} className={isActive ? "text-purple-600" : "text-gray-500"} />
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-medium">
          {badge}
        </span>
      )}
    </button>
  );
};

// SIDEBAR
function Sidebar({ currentPage, setCurrentPage, userRole, isDesktopOpen, setIsDesktopOpen }) {
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [permissions, setPermissions] = useState({});
  const [accountInfo, setAccountInfo] = useState(null);

  const toggleDesktop = () => setIsDesktopOpen(!isDesktopOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  useEffect(() => {
    const sessionData = localStorage.getItem("userSession");
    if (!sessionData) return;

    const session = JSON.parse(sessionData);

    const fetchAccountInfo = async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("account_id, email, role, ProfilePicuture")
        .eq("account_id", session.account_id)
        .single();

      if (!error) setAccountInfo(data);
    };
    fetchAccountInfo();

    const fetchPermissions = async () => {
      const { data: rolesData, error: rolesError } = await supabase.from("UserRole").select("*");
      if (rolesError) return;

      const matchedRole = rolesData.find(r => r.role?.toLowerCase() === session.role?.toLowerCase());
      if (!matchedRole) return;

      const { data: permsData, error: permsError } = await supabase
        .from("Role_Permission")
        .select("*")
        .eq("role_id", matchedRole.role_id);

      if (!permsError) setPermissions(permsData.reduce((acc, p) => ({ ...acc, [p.page]: true }), {}));
    };
    fetchPermissions();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("userSession");
    window.location.href = "/login";
  };

  // SIDEBAR CONTENT
  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w- h-8 rounded-xl overflow-hidden shadow-lg">
              <img
                src={logo}
                alt="Logo"
                className="w-full h-full object-cover"
              />
            </div>

            <span className="font-bold text-gray-900 text-lg">Elev8</span>
          </div>
          <button
            onClick={() => {
              closeMobileMenu();
              toggleDesktop();
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors lg:block hidden"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-200">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* NAV ITEMS */}
      <nav className="flex-1 overflow-y-auto py-2">

        {/* DASHBOARDS - Role Based */}
        {userRole === "admin" && (
          <NavItem icon={LayoutDashboard} label="Admin Dashboard" page="dashboard"
            currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
        )}

        {userRole === "manager" && (
          <>
            <NavItem icon={LayoutDashboard} label="Manager Dashboard" page="ManagerDashboard"
              currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
            <NavItem icon={TrendingUp} label="Marketing Dashboard" page="MarketingDashboard"
              currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
          </>
        )}

        {userRole === "customer" && (
          <NavItem icon={LayoutDashboard} label="Dashboard" page="CustomerDashboard"
            currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
        )}

        {userRole === "frontdesk" && (
          <NavItem icon={LayoutDashboard} label="Dashboard" page="frontDeskDashboard"
            currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
        )}

        {userRole === "admin" && (
          <>

            <NavItem icon={LayoutDashboard} label="Manager Dashboard" page="ManagerDashboard"
              currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
            <NavItem icon={TrendingUp} label="Marketing Dashboard" page="MarketingDashboard"
              currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
            <NavItem icon={LayoutDashboard} label="Customer Dashboard" page="CustomerDashboard"
              currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
            <NavItem icon={LayoutDashboard} label="FrontDesk Dashboard" page="frontDeskDashboard"
              currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
          </>
        )}

        <div className="my-2 border-t border-gray-200"></div>

        {/* RESERVATIONS - Role Based */}
        {(userRole === "admin" || userRole === "admin") && (
          <NavItem icon={Shield} label="Reservations (Admin)" page="reservation_admin"
            currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
        )}

        {(userRole === "manager" || userRole === "admin") && (
          <NavItem icon={Users} label="Reservations (Manager)" page="reservation_manager"
            currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
        )}

        {(userRole === "customer" || userRole === "admin") && (
          <NavItem icon={ClipboardList} label="My Reservations" page="CustomerReservation"
            currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
        )}

        {(userRole === "frontdesk" || userRole === "admin") && (
          <>
            <NavItem icon={User} label="Reservations" page="ReservationFrontDesk"
              currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
            <NavItem icon={QrCode} label="QR Check-In" page="QRCheckInPage"
              currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
            <NavItem icon={QrCode} label="Finalize Payment" page="FinalizePayment"
              currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
          </>
        )}

        <div className="my-2 border-t border-gray-200"></div>

        {/* COMMON PAGES */}
        <NavItem icon={Calendar} label="Calendar" page="calendar"
          currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />

        <NavItem icon={User} label="Profile" page="profile"
          currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />

        <NavItem icon={XCircle} label="Cancel Bookings" page="CancelBookings"
          currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />

        <NavItem icon={Clock} label="History" page="history"
          currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />

        <div className="my-2 border-t border-gray-200"></div>

        {/* MAINTENANCE (Admin/admin only) */}
        {(userRole === "admin" || userRole === "admin") && (
          <div>
            <button
              onClick={() => setMaintenanceOpen(!maintenanceOpen)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Wrench size={18} className="text-gray-500" />
              <span className="flex-1 text-left font-medium">Maintenance</span>
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform duration-200 ${maintenanceOpen ? "rotate-180" : ""}`}
              />
            </button>

            {maintenanceOpen && (
              <div className="bg-gray-50 border-l-2 border-purple-200">
                <NavItem icon={Settings} label="User Management" page="UserManagement"
                  currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
                <NavItem icon={CheckSquare} label="Reference" page="Reference"
                  currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
                <NavItem icon={FileText} label="Audit Trail" page="auditTrail"
                  currentPage={currentPage} onClick={setCurrentPage} permissions={permissions} onMobileClick={closeMobileMenu} />
              </div>
            )}
          </div>
        )}
      </nav>

      {/* SUPPORT */}
      <div className="border-t border-gray-200 p-2">
        <NavItem
          icon={HelpCircle}
          label="Support"
          page="Support"
          currentPage={currentPage}
          onClick={setCurrentPage}
          permissions={permissions}
          badge="Online"
          onMobileClick={closeMobileMenu}
        />
      </div>

      {/* FOOTER - Profile & Logout */}
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        {/* Profile Section */}
        <div className="flex items-center gap-3 mb-3">
          <img
            src={
              accountInfo?.ProfilePicuture
                ? accountInfo.ProfilePicuture
                : "https://ui-avatars.com/api/?name=" + (accountInfo?.email || "User") + "&background=9333ea&color=fff"
            }
            alt="Profile"
            className="w-10 h-10 rounded-full object-cover border-2 border-purple-200 shadow-sm"
          />
          <div className="flex flex-col overflow-hidden flex-1">
            <span
              className="text-sm font-semibold text-gray-900 truncate"
              title={accountInfo?.email || "Loading..."}
            >
              {accountInfo?.email?.split('@')[0] || "Loading..."}
            </span>
            <span
              className="text-xs text-gray-500 truncate font-medium"
              title={accountInfo?.role?.toUpperCase() || ""}
            >
              {accountInfo?.role?.toUpperCase() || ""}
            </span>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium border border-red-200 hover:border-red-300"
        >
          <span>Logout</span>
        </button>
      </div>
    </>
  );

return (
    <>
      {/* Mobile Menu toggle */}
      <button
        onClick={() => {
          setIsMobileMenuOpen(true);
          setIsDesktopOpen(true);
        }}
        className={`fixed top-4 left-4 z-40 p-2 bg-white rounded-lg shadow-lg border border-gray-200 hover:bg-gray-50 transition-opacity
          ${isMobileMenuOpen || isDesktopOpen ? "lg:opacity-0 lg:pointer-events-none" : ""}`}
      >
        <Menu size={24} className="text-gray-700" />
      </button>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && <div onClick={closeMobileMenu} className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40" />}

      {/* Desktop */}
      <div className={`hidden lg:flex border-r border-gray-200 flex-col bg-white h-screen transition-all duration-300
        ${isDesktopOpen ? "w-64" : "w-0 overflow-hidden"}`}>
        <SidebarContent />
      </div>

      {/* Mobile */}
      <div className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <SidebarContent />
      </div>
    </>
  );
}

export default Sidebar;
