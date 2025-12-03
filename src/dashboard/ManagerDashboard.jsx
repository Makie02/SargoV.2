import React, { useState, useEffect } from 'react';
import { supabase } from "../lib/supabaseClient";
import { Calendar, Clock, DollarSign, TrendingUp } from 'lucide-react';

const ManagerDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [todayBookings, setTodayBookings] = useState(0);
  const [yesterdayBookings, setYesterdayBookings] = useState(0);
  const [tableStatuses, setTableStatuses] = useState([]);
  const [dailyRevenue, setDailyRevenue] = useState(0);
  const [revenueTarget, setRevenueTarget] = useState(10000);
  const [rescheduleRequests, setRescheduleRequests] = useState([]); 
   const [currentUser, setCurrentUser] = useState(null);
const [tables, setTables] = useState([]);  

useEffect(() => {
  const userSession = localStorage.getItem('userSession');
  console.log('📦 User Session:', userSession);
  if (userSession) {
    const userData = JSON.parse(userSession);
    console.log('👤 Current User:', userData);
    setCurrentUser(userData);
  }
  
  fetchDashboardData();
}, []);

// Also add this - place it right after the first useEffect
useEffect(() => {
  console.log('🔐 Can View Reschedules:', canViewReschedules());
  console.log('👤 Current User State:', currentUser);
}, [currentUser]);
const canViewReschedules = () => {
  if (!currentUser) return false;
  const allowedRoles = ['admin', 'manager', 'superadmin'];
  return allowedRoles.includes(currentUser.role?.toLowerCase());
};
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getYesterdayDate = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const today = getTodayDate();
      const yesterday = getYesterdayDate();

      // Fetch today's bookings
      const { data: todayData, error: todayError } = await supabase
        .from('reservation')
        .select('*', { count: 'exact' })
        .eq('reservation_date', today);

      if (todayError) throw todayError;
      setTodayBookings(todayData?.length || 0);

      // Fetch yesterday's bookings for comparison
      const { data: yesterdayData, error: yesterdayError } = await supabase
        .from('reservation')
        .select('*', { count: 'exact' })
        .eq('reservation_date', yesterday);

      if (yesterdayError) throw yesterdayError;
      setYesterdayBookings(yesterdayData?.length || 0);

      // Fetch table statuses from billiard_table_info
      const { data: tablesData, error: tablesError } = await supabase
        .from('billiard_table_info')
        .select('*, billiard_table(table_name)')
        .order('table_id', { ascending: true });

      if (tablesError) throw tablesError;
      setTableStatuses(tablesData || []);

      // Calculate daily revenue from today's reservations
    const { data: revenueData, error: revenueError } = await supabase
  .from('reservation')
  .select('total_bill')
  .eq('reservation_date', today)
  .in('status', ['approved', 'completed', 'ongoing']);

  if (revenueError) throw revenueError;

const totalRevenue = revenueData?.reduce((sum, item) => sum + (item.total_bill || 0), 0) || 0;
setDailyRevenue(totalRevenue);
const { data: rescheduleData, error: rescheduleError } = await supabase
  .from('reservation')
  .select('*')
  .eq('status', 'rescheduled')
  .order('created_at', { ascending: false });

if (!rescheduleError && rescheduleData) {
  // Fetch customer details separately for each reservation
  const enrichedData = await Promise.all(
    rescheduleData.map(async (reservation) => {
      const { data: customerData } = await supabase
        .from('customer')
        .select('first_name, middle_name, last_name, email')
        .eq('account_id', reservation.account_id)
        .single();
      
      // Combine name fields
      const fullName = customerData 
        ? `${customerData.first_name} ${customerData.middle_name ? customerData.middle_name + ' ' : ''}${customerData.last_name}`.trim()
        : 'Unknown';
      
      return {
        ...reservation,
        customer: {
          full_name: fullName,
          email: customerData?.email || 'N/A'
        }
      };
    })
  );
  
  console.log('✅ Reschedule Data:', enrichedData);
  setRescheduleRequests(enrichedData || []);
} else if (rescheduleError) {
  console.error('❌ Error fetching reschedules:', rescheduleError);
}


// ✅ ADD THIS: Fetch tables for names
const { data: tablesDataList, error: tablesListError } = await supabase
  .from('billiard_table')
  .select('*');

if (tablesListError) throw tablesListError;
setTables(tablesDataList || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getBookingDifference = () => {
    if (yesterdayBookings === 0) return todayBookings > 0 ? '+100%' : '0%';
    const diff = todayBookings - yesterdayBookings;
    const percentage = ((diff / yesterdayBookings) * 100).toFixed(0);
    return diff >= 0 ? `+${Math.abs(diff)}` : `-${Math.abs(diff)}`;
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'available':
        return '#28a745';
      case 'maintenance':
        return '#ff9800';
      case 'occupied':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const getAvailableTablesCount = () => {
    return tableStatuses.filter(t => t.status?.toLowerCase() === 'available').length;
  };

  const getTotalTablesCount = () => {
    return tableStatuses.length;
  };

 const getInMaintenanceCount = () => {
  return tableStatuses.filter(t => t.status?.toLowerCase() === 'maintenance').length;
};

// ✅ ADD THESE FUNCTIONS
const getTableName = (tableId) => {
  const table = tables.find(t => t.table_id === tableId);
  return table ? table.table_name : 'Unknown Table';
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const handleApproveReschedule = async (reservationId) => {
  try {
    const { error } = await supabase
      .from('reservation')
      .update({ status: 'approved' })
      .eq('id', reservationId);

    if (error) throw error;

    // Refresh data
    fetchDashboardData();
  } catch (error) {
    console.error('Error approving reschedule:', error);
    alert('Failed to approve reschedule request');
  }
};

const handleRejectReschedule = async (reservationId) => {
  try {
    const { error } = await supabase
      .from('reservation')
      .update({ status: 'cancelled' })
      .eq('id', reservationId);

    if (error) throw error;

    // Refresh data
    fetchDashboardData();
  } catch (error) {
    console.error('Error rejecting reschedule:', error);
    alert('Failed to reject reschedule request');
  }
};



  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '40px 20px'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          marginBottom: '30px'
        }}>
          <h1 style={{
            margin: '0 0 10px 0',
            fontSize: '32px',
            fontWeight: '700',
            color: '#333'
          }}>
            Manager Dashboard
          </h1>
          <p style={{
            margin: 0,
            fontSize: '16px',
            color: '#666'
          }}>
            Oversee daily operations and management
          </p>
        </div>

        {/* Stats Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
        }}>
          {/* Today's Bookings */}
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '15px'
            }}>
              <div>
                <p style={{
                  margin: '0 0 5px 0',
                  fontSize: '14px',
                  color: '#666',
                  fontWeight: '500'
                }}>
                  Today's Bookings
                </p>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: '#e3f2fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Calendar size={20} color="#2196F3" />
              </div>
            </div>
            <h2 style={{
              margin: '0 0 10px 0',
              fontSize: '36px',
              fontWeight: '700',
              color: '#333'
            }}>
              {todayBookings}
            </h2>
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: todayBookings >= yesterdayBookings ? '#28a745' : '#dc3545',
              fontWeight: '600'
            }}>
              {getBookingDifference()} from yesterday
            </p>
          </div>

          {/* Peak Hours */}
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '15px'
            }}>
              <div>
                <p style={{
                  margin: '0 0 5px 0',
                  fontSize: '14px',
                  color: '#666',
                  fontWeight: '500'
                }}>
                  Peak Hours
                </p>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: '#fce4ec',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Clock size={20} color="#e91e63" />
              </div>
            </div>
            <h2 style={{
              margin: '0 0 10px 0',
              fontSize: '36px',
              fontWeight: '700',
              color: '#333'
            }}>
              6-9 PM
            </h2>
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: '#666',
              fontWeight: '500'
            }}>
              Highest traffic
            </p>
          </div>

          {/* Available Tables */}
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '15px'
            }}>
              <div>
                <p style={{
                  margin: '0 0 5px 0',
                  fontSize: '14px',
                  color: '#666',
                  fontWeight: '500'
                }}>
                  Available Tables
                </p>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: '#e8f5e9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <TrendingUp size={20} color="#28a745" />
              </div>
            </div>
            <h2 style={{
              margin: '0 0 10px 0',
              fontSize: '36px',
              fontWeight: '700',
              color: '#333'
            }}>
              {getAvailableTablesCount()}/{getTotalTablesCount()}
            </h2>
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: '#666',
              fontWeight: '500'
            }}>
              {getInMaintenanceCount()} in maintenance
            </p>
          </div>

          {/* Daily Revenue */}
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '15px'
            }}>
              <div>
                <p style={{
                  margin: '0 0 5px 0',
                  fontSize: '14px',
                  color: '#666',
                  fontWeight: '500'
                }}>
                  Daily Revenue
                </p>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: '#fff3e0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <DollarSign size={20} color="#ff9800" />
              </div>
            </div>
            <h2 style={{
              margin: '0 0 10px 0',
              fontSize: '36px',
              fontWeight: '700',
              color: '#333'
            }}>
              ₱{dailyRevenue.toLocaleString()}
            </h2>
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: '#666',
              fontWeight: '500'
            }}>
              Target: ₱{revenueTarget.toLocaleString()}
            </p>
          </div>
        </div>
{rescheduleRequests.length > 0 && canViewReschedules() && (
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginBottom: '30px'
          }}>
            <h2 style={{
              margin: '0 0 25px 0',
              fontSize: '20px',
              fontWeight: '700',
              color: '#333'
            }}>
              Pending Approvals - Reschedule Requests
            </h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '15px'
            }}>
{rescheduleRequests.length === 0 ? (
  <div style={{
    padding: '40px',
    textAlign: 'center',
    color: '#999'
  }}>
    <p style={{ margin: 0, fontSize: '14px' }}>No pending reschedule requests</p>
  </div>
) : (
  rescheduleRequests.map((request) => (                <div
                  key={request.id}
                  style={{
                    padding: '20px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#fff9e6',
                    gap: '15px',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '15px',
                    flex: 1,
                    minWidth: '300px'
                  }}>
                    {/* Warning Icon */}
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: '#fff3cd',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Calendar size={20} color="#ff9800" />
                    </div>

                    {/* Request Info */}
                    <div style={{ flex: 1 }}>
                      <h3 style={{
                        margin: '0 0 5px 0',
                        fontSize: '16px',
                        fontWeight: '700',
                        color: '#333'
                      }}>
                        Reschedule Request
                      </h3>
                      <p style={{
                        margin: '0 0 3px 0',
                        fontSize: '14px',
                        color: '#666'
                      }}>
                        {getTableName(request.table_id)} - {request.billiard_type || 'Standard'}
                      </p>
                      <p style={{
                        margin: 0,
                        fontSize: '13px',
                        color: '#999'
                      }}>
Customer: {request.customer?.full_name || 'Unknown'} • {formatDate(request.reservation_date)} at {request.start_time}                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    flexShrink: 0
                  }}>
                    <button
                      onClick={() => handleApproveReschedule(request.id)}
                      style={{
                        padding: '8px 20px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectReschedule(request.id)}
                      style={{
                        padding: '8px 20px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#c82333'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc3545'}
                    >
                      Reject
                    </button>
                  </div>
                </div>
       ))
              )}
            </div>
          </div>
        )}
        {/* Table Status Overview */}
        <div style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            margin: '0 0 25px 0',
            fontSize: '20px',
            fontWeight: '700',
            color: '#333'
          }}>
            Table Status Overview
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '20px'
          }}>
            {tableStatuses.map((table) => (
              <div
                key={table.table_info_id}
                style={{
                  padding: '20px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div>
                  <h3 style={{
                    margin: '0 0 5px 0',
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#333'
                  }}>
                    {table.billiard_table?.table_name || `Table ${table.table_id}`} - {table.billiard_type || 'Standard'}
                  </h3>
                  <p style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#666'
                  }}>
                    ₱{parseFloat(table.price || 0).toFixed(2)}/hour
                  </p>
                </div>
                <div style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '700',
                  backgroundColor: getStatusColor(table.status),
                  color: 'white',
                  textTransform: 'uppercase'
                }}>
                  {table.status || 'Unknown'}
                </div>
              </div>
            ))}
          </div>
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

export default ManagerDashboard;
