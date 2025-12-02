import React from "react";
import { Bell, X } from "lucide-react";

const Notification = ({
  isOpen,
  notifications,
  onClose,
  onNotificationClick,
  onMarkAllAsRead,
  getTimeAgo,
}) => {
  if (!isOpen) return null;

  const getActivityIcon = (activityType) => {
    const iconMap = {
      extension: "⏱️",
      status_change: "📋",
      payment: "₱",
      check_in: "✓",
      check_out: "←",
    };
    return iconMap[activityType] || "₱";
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-200 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed right-6 top-20 w-full max-w-md bg-white/95 backdrop-blur-xl border border-blue-100 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0 px-5 py-4 bg-gradient-to-r from-blue-500 to-blue-600">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <Bell size={18} />
            Notifications
          </h3>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                {notifications.length} new
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1 transition-colors rounded-lg hover:bg-white/20"
              title="Close notifications"
            >
              <X size={18} className="text-white" />
            </button>
          </div>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12">
              <div className="flex items-center justify-center w-16 h-16 mb-3 rounded-full bg-gradient-to-br from-blue-100 to-blue-50">
                <Bell size={28} className="text-blue-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">
                No new notifications
              </p>
              <p className="mt-1 text-xs text-gray-400">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-blue-50">
              {notifications.map((note, index) => (
                <div
                  key={note.id}
                  onClick={() => onNotificationClick(note.id)}
                  className="px-4 py-3.5 hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent cursor-pointer transition-all duration-200 group"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 transition-transform duration-200 rounded-full shadow-md bg-gradient-to-br from-blue-500 to-blue-600 group-hover:scale-110">
                      <span className="text-sm font-bold text-white">
                        {getActivityIcon(note.activityType)}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-relaxed text-gray-800">
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
                            ⏱️ +{note.extension} day{note.extension > 1 ? "s" : ""}
                          </span>
                        )}

                        {note.duration && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            🕐 {note.duration}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1.5">
                        <p className="text-xs font-medium text-blue-500">
                          {getTimeAgo(note.timestamp)}
                        </p>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500 capitalize">
                          {note.activityType.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    {/* Dot indicator */}
                    <div className="flex-shrink-0 w-2 h-2 mt-2 transition-transform bg-blue-500 rounded-full group-hover:scale-125"></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="flex-shrink-0 px-5 py-3 border-t border-blue-100 bg-gradient-to-r from-blue-50 to-transparent">
            <button
              onClick={onMarkAllAsRead}
              className="w-full text-sm font-semibold text-center text-blue-600 transition-colors hover:text-blue-700"
            >
              Mark all as read
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default Notification;