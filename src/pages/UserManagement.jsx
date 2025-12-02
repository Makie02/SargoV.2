import React, { useState, useEffect } from 'react';
import { FaUserCircle, FaEdit, FaTrash, FaCog, FaChevronLeft, FaChevronRight, FaImage } from 'react-icons/fa';
import { supabase } from '../lib/supabaseClient';
import Swal from 'sweetalert2';

const roleCategories = {
    'Administration': ['Admin', 'Manager'],
    'Staff': ['Front Desk'],
    'Users': ['Customer']
};

const roles = ['Admin', 'Manager', 'Front Desk', 'Customer'];

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        role: 'Admin',
        name: '',
        email: '',
        password: '',
        extra: {}
    });
    const [errors, setErrors] = useState({});
    const [search, setSearch] = useState('');
    const [settingsModal, setSettingsModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [changePasswordModal, setChangePasswordModal] = useState(false);
    const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });
    const [userStatuses, setUserStatuses] = useState({});
    
    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [usersPerPage] = useState(8);
    const [roleFilter, setRoleFilter] = useState('All');

    const fetchUsers = async () => {
        try {
            let allUsers = [];
            for (const role of roles) {
                const table = role.toLowerCase().replace(' ', '_');
                const { data, error } = await supabase.from(table).select('*');
                if (error) {
                    console.error(`Error fetching ${table}:`, error);
                    continue;
                }
                
                const mapped = data.map(u => ({
                    id: u.id || u.admin_id || u.manager_id || u.frontdesk_id || u.customer_id,
                    role,
                    name: role === 'Customer'
                        ? `${u.first_name} ${u.last_name}`
                        : u.name || u.admin_name || u.manager_name || u.staff_name,
                    email: u.email,
                    extra: { ...u, account_id: u.account_id }
                }));
                allUsers.push(...mapped);
            }
            
            // Fetch profile pictures and deactivation status
            const statuses = {};
            const usersWithImages = await Promise.all(allUsers.map(async (user) => {
                if (user.extra.account_id) {
                    // Get profile picture
                    const { data: accountData } = await supabase
                        .from('accounts')
                        .select('ProfilePicuture')
                        .eq('account_id', user.extra.account_id)
                        .single();
                    
                    // Get deactivation status
                    const { data: deactData } = await supabase
                        .from('deact_user')
                        .select('*')
                        .eq('account_id', user.extra.account_id)
                        .eq('status', 'deactivated')
                        .maybeSingle();
                    
                    if (deactData) {
                        const deactivatedUntil = new Date(deactData.deactivated_until);
                        const now = new Date();
                        statuses[user.extra.account_id] = deactivatedUntil > now ? 'deactivated' : 'active';
                    } else {
                        statuses[user.extra.account_id] = 'active';
                    }
                    
                    return {
                        ...user,
                        profilePicture: accountData?.ProfilePicuture || null
                    };
                }
                return user;
            }));
            
            setUserStatuses(statuses);
            setUsers(usersWithImages);
        } catch (err) {
            console.error('Error fetching users:', err);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name.startsWith('extra.')) {
            const key = name.split('.')[1];
            setFormData(prev => ({
                ...prev,
                extra: { ...prev.extra, [key]: value }
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const validate = () => {
        let errs = {};
        if (!formData.name.trim() && formData.role !== 'Customer')
            errs.name = 'Name is required';
        if (!formData.email.trim())
            errs.email = 'Email is required';
        
        if (!formData.extra.account_id && !formData.password.trim()) {
            errs.password = 'Password is required';
        }

        if (formData.role === 'Customer') {
            if (!formData.extra.first_name) errs.firstName = 'First name required';
            if (!formData.extra.last_name) errs.lastName = 'Last name required';
            if (!formData.extra.birthdate) errs.birthdate = 'Birthdate required';
            if (!formData.extra.contact_number) errs.contactNumber = 'Contact number required';
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        try {
            const roleMapping = {
                'Admin': 'admin',
                'Manager': 'manager',
                'Front Desk': 'frontdesk',
                'Customer': 'customer'
            };

            const isEditMode = formData.extra.account_id;

            if (isEditMode) {
                const account_id = formData.extra.account_id;
                let tableName = '';
                let tableData = {};

                if (formData.password.trim()) {
                    const { error: accountError } = await supabase
                        .from('accounts')
                        .update({
                            password: formData.password,
                        })
                        .eq('account_id', account_id);

                    if (accountError) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: 'Error updating account: ' + accountError.message
                        });
                        return;
                    }
                }

                switch (formData.role) {
                    case 'Customer':
                        tableName = 'customer';
                        tableData = {
                            first_name: formData.extra.first_name,
                            middle_name: formData.extra.middle_name || null,
                            last_name: formData.extra.last_name,
                            birthdate: formData.extra.birthdate,
                            email: formData.extra.email || formData.email,
                            contact_number: formData.extra.contact_number,
                        };
                        if (formData.password.trim()) {
                            tableData.password = formData.password;
                        }
                        break;
                    case 'Front Desk':
                        tableName = 'front_desk';
                        tableData = {
                            staff_name: formData.name,
                            email: formData.email,
                        };
                        if (formData.password.trim()) {
                            tableData.password = formData.password;
                        }
                        break;
                    case 'Manager':
                        tableName = 'manager';
                        tableData = {
                            manager_name: formData.name,
                            email: formData.email,
                        };
                        if (formData.password.trim()) {
                            tableData.password = formData.password;
                        }
                        break;
                    case 'Admin':
                        tableName = 'admin';
                        tableData = {
                            admin_name: formData.name,
                            email: formData.email,
                        };
                        if (formData.password.trim()) {
                            tableData.password = formData.password;
                        }
                        break;
                }

                const { error: roleError } = await supabase
                    .from(tableName)
                    .update(tableData)
                    .eq('account_id', account_id);

                if (roleError) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Error updating user: ' + roleError.message
                    });
                    return;
                }

                setModalOpen(false);
                setFormData({ role: 'Admin', name: '', email: '', password: '', extra: {} });
                setErrors({});
                await fetchUsers();
                
                Swal.fire({
                    icon: 'success',
                    title: 'Success!',
                    text: 'User updated successfully!',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                const { data: accountData, error: accountError } = await supabase
                    .from('accounts')
                    .insert([{
                        email: formData.email,
                        password: formData.password,
                        role: roleMapping[formData.role],
                    }])
                    .select('account_id')
                    .single();

                if (accountError) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Error creating account: ' + accountError.message
                    });
                    return;
                }

                const account_id = accountData.account_id;
                let tableData = {};
                let tableName = '';

                switch (formData.role) {
                    case 'Customer':
                        tableName = 'customer';
                        tableData = {
                            account_id,
                            first_name: formData.extra.first_name,
                            middle_name: formData.extra.middle_name || null,
                            last_name: formData.extra.last_name,
                            birthdate: formData.extra.birthdate,
                            email: formData.extra.email || formData.email,
                            contact_number: formData.extra.contact_number,
                            password: formData.extra.password || formData.password,
                            role: 'customer'
                        };
                        break;
                    case 'Front Desk':
                        tableName = 'front_desk';
                        tableData = {
                            account_id,
                            staff_name: formData.name,
                            email: formData.email,
                            password: formData.password
                        };
                        break;
                    case 'Manager':
                        tableName = 'manager';
                        tableData = {
                            account_id,
                            manager_name: formData.name,
                            email: formData.email,
                            password: formData.password
                        };
                        break;
                    case 'Admin':
                        tableName = 'admin';
                        tableData = {
                            account_id,
                            admin_name: formData.name,
                            email: formData.email,
                            password: formData.password
                        };
                        break;
                }

                const { error: roleError } = await supabase.from(tableName).insert([tableData]);
                if (roleError) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Error creating user role: ' + roleError.message
                    });
                    return;
                }

                setModalOpen(false);
                setFormData({ role: 'Admin', name: '', email: '', password: '', extra: {} });
                setErrors({});
                await fetchUsers();
                
                Swal.fire({
                    icon: 'success',
                    title: 'Success!',
                    text: 'User created successfully!',
                    timer: 2000,
                    showConfirmButton: false
                });
            }
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: err.message
            });
        }
    };

    const handleDeleteAccount = async (user) => {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        });

        if (!result.isConfirmed) return;

        try {
            const table = user.role.toLowerCase().replace(' ', '_');
            const { error: roleError } = await supabase
                .from(table)
                .delete()
                .eq('account_id', user.extra.account_id);

            if (roleError) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Error deleting user: ' + roleError.message
                });
                return;
            }

            const { error: accountError } = await supabase
                .from('accounts')
                .delete()
                .eq('account_id', user.extra.account_id);

            if (accountError) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Error deleting account: ' + accountError.message
                });
                return;
            }

            await fetchUsers();
            
            Swal.fire({
                icon: 'success',
                title: 'Deleted!',
                text: 'Account has been deleted.',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: err.message
            });
        }
    };

    const handleDeactivateAccount = async (user, duration) => {
        try {
            const durationDays = { '3days': 3, '7days': 7, '2weeks': 14, '1month': 30, '1year': 365 };
            const deactivateUntil = new Date();
            deactivateUntil.setDate(deactivateUntil.getDate() + durationDays[duration]);
            const accountId = user.extra.account_id;

            if (!accountId) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Account ID not found!'
                });
                return;
            }

            const { data: existing } = await supabase
                .from('deact_user')
                .select('*')
                .eq('account_id', accountId)
                .maybeSingle();

            if (existing) {
                await supabase
                    .from('deact_user')
                    .update({
                        deactivated_until: deactivateUntil.toISOString(),
                        duration_days: durationDays[duration],
                        deactivation_date: new Date().toISOString(),
                        status: 'deactivated'
                    })
                    .eq('deact_id', existing.deact_id);
            } else {
                await supabase
                    .from('deact_user')
                    .insert([{
                        account_id: accountId,
                        deactivated_until: deactivateUntil.toISOString(),
                        duration_days: durationDays[duration],
                        status: 'deactivated'
                    }]);
            }

            setSettingsModal(false);
            await fetchUsers();
            
            const durationText = duration.replace('3days', '3 days').replace('7days', '7 days').replace('2weeks', '2 weeks').replace('1month', '1 month').replace('1year', '1 year');
            
            Swal.fire({
                icon: 'success',
                title: 'Deactivated!',
                text: `Account deactivated for ${durationText}`,
                timer: 2500,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: err.message
            });
        }
    };

    const handleReactivateAccount = async (user) => {
        try {
            const accountId = user.extra.account_id;

            if (!accountId) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Account ID not found!'
                });
                return;
            }

            const { error } = await supabase
                .from('deact_user')
                .update({
                    status: 'reactivated',
                    reactivated_date: new Date().toISOString()
                })
                .eq('account_id', accountId);

            if (error) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Error reactivating account: ' + error.message
                });
                return;
            }

            setSettingsModal(false);
            await fetchUsers();
            
            Swal.fire({
                icon: 'success',
                title: 'Reactivated!',
                text: 'Account reactivated successfully!',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: err.message
            });
        }
    };

    const handleChangePassword = async () => {
        if (!passwordData.new || !passwordData.confirm) {
            Swal.fire({
                icon: 'warning',
                title: 'Missing Fields',
                text: 'Please fill in all password fields!'
            });
            return;
        }
        if (passwordData.new !== passwordData.confirm) {
            Swal.fire({
                icon: 'error',
                title: 'Mismatch',
                text: 'New passwords do not match!'
            });
            return;
        }

        try {
            const table = selectedUser.role.toLowerCase().replace(' ', '_');
            await supabase.from(table).update({ password: passwordData.new }).eq('account_id', selectedUser.extra.account_id);
            await supabase.from('accounts').update({ password: passwordData.new }).eq('account_id', selectedUser.extra.account_id);
            
            setChangePasswordModal(false);
            setPasswordData({ current: '', new: '', confirm: '' });
            
            Swal.fire({
                icon: 'success',
                title: 'Success!',
                text: 'Password changed successfully',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: err.message
            });
        }
    };

    // Filter and pagination logic
    const filteredUsers = users.filter(u => {
        const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase()) ||
            u.role.toLowerCase().includes(search.toLowerCase());
        
        const matchesRole = roleFilter === 'All' || u.role === roleFilter;
        
        return matchesSearch && matchesRole;
    });

    const indexOfLastUser = currentPage * usersPerPage;
    const indexOfFirstUser = indexOfLastUser - usersPerPage;
    const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    return (
        <div className="min-h-screen px-6 py-10 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
            {/* Header */}
            <div className="mb-10">
                <h1 className="text-5xl font-black bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-3">
                    User Management
                </h1>
            </div>
            
            {/* Controls */}
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-gray-100">
                <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto flex-1">
                        <input
                            type="text"
                            placeholder="🔍 Search users..."
                            value={search}
                            onChange={e => {
                                setSearch(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="flex-1 px-5 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-700 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all"
                        />
                        
                        <select
                            value={roleFilter}
                            onChange={e => {
                                setRoleFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="px-5 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-700 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all font-medium"
                        >
                            <option value="All">All Roles</option>
                            <option disabled>──────────</option>
                            {Object.entries(roleCategories).map(([category, categoryRoles]) => (
                                <optgroup key={category} label={category}>
                                    {categoryRoles.map(role => (
                                        <option key={role} value={role}>{role}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    
                    <button
                        className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold flex items-center gap-2"
                        onClick={() => {
                            setFormData({ role: 'Admin', name: '', email: '', password: '', extra: {} });
                            setModalOpen(true);
                        }}
                    >
                        <span className="text-xl">+</span> Add New User
                    </button>
                </div>
                
                {/* Stats */}
                <div className="flex gap-4 mt-6 flex-wrap">
                    <div className="px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
                        <span className="text-blue-600 font-semibold">Total: {filteredUsers.length}</span>
                    </div>
                    <div className="px-4 py-2 bg-green-50 rounded-lg border border-green-200">
                        <span className="text-green-600 font-semibold">Active: {Object.values(userStatuses).filter(s => s === 'active').length}</span>
                    </div>
                    <div className="px-4 py-2 bg-red-50 rounded-lg border border-red-200">
                        <span className="text-red-600 font-semibold">Deactivated: {Object.values(userStatuses).filter(s => s === 'deactivated').length}</span>
                    </div>
                </div>
            </div>

            {/* User Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                {currentUsers.length > 0 ? currentUsers.map(u => (
                    <div
                        key={u.id}
                        className="relative bg-white rounded-2xl shadow-md hover:shadow-2xl p-6 flex flex-col items-center text-center transition-all duration-300 border border-gray-100 group"
                    >
                        {/* Action Buttons */}
                        <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => handleDeleteAccount(u)}
                                className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition shadow-md"
                                title="Delete Account"
                            >
                                <FaTrash size={12} />
                            </button>
                        </div>

                        {/* Profile Picture */}
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center mb-4 shadow-lg overflow-hidden ring-4 ring-blue-100">
                            {u.profilePicture ? (
                                <img 
                                    src={u.profilePicture} 
                                    alt={u.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                            ) : null}
                            <div style={{ display: u.profilePicture ? 'none' : 'flex' }} className="w-full h-full items-center justify-center">
                                <FaUserCircle size={60} className="text-white" />
                            </div>
                        </div>

                        {/* Status Badge */}
                        <div className="mb-3">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full shadow-sm ${
                                userStatuses[u.extra.account_id] === 'deactivated' 
                                    ? 'bg-red-100 text-red-700 ring-2 ring-red-200' 
                                    : 'bg-green-100 text-green-700 ring-2 ring-green-200'
                            }`}>
                                <span className={`w-2 h-2 rounded-full ${
                                    userStatuses[u.extra.account_id] === 'deactivated' ? 'bg-red-500' : 'bg-green-500'
                                } animate-pulse`}></span>
                                {userStatuses[u.extra.account_id] === 'deactivated' ? 'Deactivated' : 'Active'}
                            </span>
                        </div>

                        {/* User Info */}
                        <h2 className="font-bold text-xl text-gray-800 mb-1">{u.name}</h2>
                        <p className="text-indigo-600 font-semibold text-sm mb-1 px-3 py-1 bg-indigo-50 rounded-lg">{u.role}</p>
                        <p className="text-gray-500 text-sm mb-5 break-all">{u.email}</p>

                        {/* Action Buttons */}
                        <div className="flex gap-2 w-full mt-auto">
                            <button
                                className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-4 py-2.5 rounded-xl hover:from-blue-600 hover:to-indigo-600 transition shadow-md flex items-center justify-center gap-2 font-semibold"
                                onClick={() => {
                                    setFormData({
                                        role: u.role,
                                        name: u.name,
                                        email: u.email,
                                        password: '',
                                        extra: u.extra
                                    });
                                    setModalOpen(true);
                                }}
                            >
                                <FaEdit /> Edit
                            </button>

                            <button
                                className="p-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition shadow-md"
                                onClick={() => {
                                    setSelectedUser(u);
                                    setSettingsModal(true);
                                }}
                                title="Settings"
                            >
                                <FaCog size={18} />
                            </button>
                        </div>
                    </div>
                )) : (
                    <div className="col-span-full text-center py-20">
                        <div className="text-gray-400 mb-4">
                            <FaUserCircle size={80} className="mx-auto opacity-50" />
                        </div>
                        <p className="text-gray-500 text-lg font-medium">No users found</p>
                        <p className="text-gray-400 text-sm">Try adjusting your search or filters</p>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-3 mt-8">
                    <button
                        onClick={() => paginate(currentPage - 1)}
                        disabled={currentPage === 1}
                        className={`p-3 rounded-xl font-semibold transition-all ${
                            currentPage === 1
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-white text-blue-600 hover:bg-blue-50 shadow-md'
                        }`}
                    >
                        <FaChevronLeft />
                    </button>
                    
                    <div className="flex gap-2">
                        {[...Array(totalPages)].map((_, i) => (
                            <button
                                key={i + 1}
                                onClick={() => paginate(i + 1)}
                                className={`w-10 h-10 rounded-xl font-bold transition-all ${
                                    currentPage === i + 1
                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                                        : 'bg-white text-gray-700 hover:bg-gray-50 shadow-md'
                                }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                    
                    <button
                        onClick={() => paginate(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className={`p-3 rounded-xl font-semibold transition-all ${
                            currentPage === totalPages
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-white text-blue-600 hover:bg-blue-50 shadow-md'
                        }`}
                    >
                        <FaChevronRight />
                    </button>
                    
                    <span className="ml-4 text-gray-600 font-medium">
                        Page {currentPage} of {totalPages}
                    </span>
                </div>
            )}

            {/* Add/Edit User Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            {formData.extra.account_id ? 'Edit User' : 'Add New User'}
                        </h2>

                        <div className="space-y-5">
                            <div>
                                <label className="block mb-2 font-semibold text-gray-700">Role</label>
                                <select
                                    name="role"
                                    value={formData.role}
                                    onChange={handleChange}
                                    disabled={formData.extra.account_id}
                                    className="w-full border-2 border-gray-200 bg-gray-50 rounded-xl px-4 py-3 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all font-medium"
                                >
                                    {Object.entries(roleCategories).map(([category, categoryRoles]) => (
                                        <optgroup key={category} label={`── ${category} ──`}>
                                            {categoryRoles.map(r => <option key={r} value={r}>{r}</option>)}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>

                            {formData.role !== 'Customer' && (
                                <>
                                    <div>
                                        <label className="block mb-2 font-semibold text-gray-700">Name</label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleChange}
                                            className="w-full border-2 border-gray-200 bg-gray-50 rounded-xl px-4 py-3 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all"
                                            placeholder="Enter full name"
                                        />
                                        {errors.name && <p className="text-red-500 text-sm mt-1 font-medium">{errors.name}</p>}
                                    </div>
                                    <div>
                                        <label className="block mb-2 font-semibold text-gray-700">Email</label>
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleChange}
                                            className="w-full border-2 border-gray-200 bg-gray-50 rounded-xl px-4 py-3 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all"
                                            placeholder="user@example.com"
                                        />
                                        {errors.email && <p className="text-red-500 text-sm mt-1 font-medium">{errors.email}</p>}
                                    </div>
                                    <div>
                                        <label className="block mb-2 font-semibold text-gray-700">Password</label>
                                        <input
                                            type="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={handleChange}
                                            placeholder={formData.extra.account_id ? "Leave blank to keep current password" : "Enter password"}
                                            className="w-full border-2 border-gray-200 bg-gray-50 rounded-xl px-4 py-3 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all"
                                        />
                                        {errors.password && <p className="text-red-500 text-sm mt-1 font-medium">{errors.password}</p>}
                                    </div>
                                </>
                            )}

                            {formData.role === 'Customer' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {[
                                        { label: 'First Name', name: 'first_name', type: 'text', error: 'firstName' },
                                        { label: 'Middle Name', name: 'middle_name', type: 'text' },
                                        { label: 'Last Name', name: 'last_name', type: 'text', error: 'lastName' },
                                        { label: 'Birthdate', name: 'birthdate', type: 'date', error: 'birthdate' },
                                        { label: 'Email', name: 'email', type: 'email', error: 'email' },
                                        { label: 'Contact Number', name: 'contact_number', type: 'text', error: 'contactNumber' },
                                        { label: 'Username', name: 'username', type: 'text' },
                                        { label: 'Password', name: 'password', type: 'password' },
                                    ].map(fld => (
                                        <div key={fld.name} className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl shadow-sm p-4 border border-gray-200">
                                            <label className="block mb-2 font-semibold text-gray-700 text-sm">{fld.label}</label>
                                            <input
                                                type={fld.type}
                                                name={`extra.${fld.name}`}
                                                value={formData.extra[fld.name] || ''}
                                                onChange={handleChange}
                                                className="w-full border-2 border-gray-200 bg-white rounded-lg px-3 py-2 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                                            />
                                            {fld.error && errors[fld.error] && (
                                                <p className="text-red-500 text-xs mt-1 font-medium">{errors[fld.error]}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                                <button
                                    onClick={() => {
                                        setModalOpen(false);
                                        setFormData({ role: 'Admin', name: '', email: '', password: '', extra: {} });
                                        setErrors({});
                                    }}
                                    className="px-6 py-3 rounded-xl border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg transition font-semibold"
                                >
                                    {formData.extra.account_id ? 'Update' : 'Create'} User
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {settingsModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
                        <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Account Settings</h2>
                        
                        <div className="mb-6 p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border-2 border-blue-100">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center shadow-lg overflow-hidden">
                                    {selectedUser.profilePicture ? (
                                        <img 
                                            src={selectedUser.profilePicture} 
                                            alt={selectedUser.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <FaUserCircle size={40} className="text-white" />
                                    )}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 text-lg">{selectedUser.name}</p>
                                    <p className="text-sm text-indigo-600 font-semibold">{selectedUser.role}</p>
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 break-all">{selectedUser.email}</p>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    setSettingsModal(false);
                                    setChangePasswordModal(true);
                                }}
                                className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition font-semibold shadow-lg"
                            >
                                Change Password
                            </button>

                            {userStatuses[selectedUser.extra.account_id] === 'deactivated' ? (
                                <button
                                    onClick={() => handleReactivateAccount(selectedUser)}
                                    className="w-full py-3.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition font-semibold shadow-lg"
                                >
                                    ✓ Reactivate Account
                                </button>
                            ) : (
                                <div className="border-t-2 border-gray-200 pt-4">
                                    <p className="text-sm font-bold text-gray-700 mb-3">⏸️ Deactivate Account</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { label: '3 Days', value: '3days' },
                                            { label: '7 Days', value: '7days' },
                                            { label: '2 Weeks', value: '2weeks' },
                                            { label: '1 Month', value: '1month' },
                                            { label: '1 Year', value: '1year' }
                                        ].map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => handleDeactivateAccount(selectedUser, opt.value)}
                                                className="py-2.5 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition text-sm font-bold border-2 border-yellow-300"
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={() => setSettingsModal(false)}
                                className="w-full py-3.5 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-semibold"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {changePasswordModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
                        <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Change Password</h2>
                        
                        <div className="space-y-5">
                            <div>
                                <label className="block mb-2 font-semibold text-gray-700">Current Password</label>
                                <input
                                    type="password"
                                    value={passwordData.current}
                                    onChange={(e) => setPasswordData(prev => ({ ...prev, current: e.target.value }))}
                                    className="w-full border-2 border-gray-200 bg-gray-50 rounded-xl px-4 py-3 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all"
                                    placeholder="Enter current password"
                                />
                            </div>
                            <div>
                                <label className="block mb-2 font-semibold text-gray-700">New Password</label>
                                <input
                                    type="password"
                                    value={passwordData.new}
                                    onChange={(e) => setPasswordData(prev => ({ ...prev, new: e.target.value }))}
                                    className="w-full border-2 border-gray-200 bg-gray-50 rounded-xl px-4 py-3 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all"
                                    placeholder="Enter new password"
                                />
                            </div>
                            <div>
                                <label className="block mb-2 font-semibold text-gray-700">Confirm New Password</label>
                                <input
                                    type="password"
                                    value={passwordData.confirm}
                                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirm: e.target.value }))}
                                    className="w-full border-2 border-gray-200 bg-gray-50 rounded-xl px-4 py-3 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all"
                                    placeholder="Confirm new password"
                                />
                            </div>

                            <div className="flex gap-3 pt-6 border-t border-gray-200">
                                <button
                                    onClick={() => {
                                        setChangePasswordModal(false);
                                        setPasswordData({ current: '', new: '', confirm: '' });
                                    }}
                                    className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleChangePassword}
                                    className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-lg transition font-semibold"
                                >
                                    Update Password
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}