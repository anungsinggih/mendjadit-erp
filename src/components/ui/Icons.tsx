/* eslint-disable react-refresh/only-export-components */
import React from 'react';

type IconProps = {
    className?: string;
    size?: number;
    strokeWidth?: number;
};

// Base SVG wrapper for consistency
const IconWrapper: React.FC<IconProps & { children: React.ReactNode }> = ({
    children,
    className = "",
    size = 18,
    strokeWidth = 2
}) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        {children}
    </svg>
);

export const Icons = {
    // Time / Date
    Calendar: (props: IconProps) => (
        <IconWrapper {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></IconWrapper>
    ),
    Clock: (props: IconProps) => (
        <IconWrapper {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></IconWrapper>
    ),

    // Arrows
    ArrowUp: (props: IconProps) => (
        <IconWrapper {...props}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></IconWrapper>
    ),
    ArrowDown: (props: IconProps) => (
        <IconWrapper {...props}><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></IconWrapper>
    ),
    ArrowLeft: (props: IconProps) => (
        <IconWrapper {...props}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></IconWrapper>
    ),
    ArrowRight: (props: IconProps) => (
        <IconWrapper {...props}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></IconWrapper>
    ),

    // Actions
    Eye: (props: IconProps) => (
        <IconWrapper {...props}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></IconWrapper>
    ),
    Plus: (props: IconProps) => (
        <IconWrapper {...props}><path d="M12 5v14M5 12h14" /></IconWrapper>
    ),
    Minus: (props: IconProps) => (
        <IconWrapper {...props}><path d="M5 12h14" /></IconWrapper>
    ),
    Edit: (props: IconProps) => (
        <IconWrapper {...props}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></IconWrapper>
    ),
    Trash: (props: IconProps) => (
        <IconWrapper {...props}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></IconWrapper>
    ),
    Save: (props: IconProps) => (
        <IconWrapper {...props}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></IconWrapper>
    ),
    Search: (props: IconProps) => (
        <IconWrapper {...props}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></IconWrapper>
    ),
    Filter: (props: IconProps) => (
        <IconWrapper {...props}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></IconWrapper>
    ),
    Refresh: (props: IconProps) => (
        <IconWrapper {...props}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></IconWrapper>
    ),
    RotateCcw: (props: IconProps) => (
        <IconWrapper {...props}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></IconWrapper>
    ),
    History: (props: IconProps) => (
        <IconWrapper {...props}><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></IconWrapper>
    ),
    RotateCw: (props: IconProps) => (
        <IconWrapper {...props}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></IconWrapper>
    ),
    ArrowUpRight: (props: IconProps) => (
        <IconWrapper {...props}><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></IconWrapper>
    ),
    ArrowDownLeft: (props: IconProps) => (
        <IconWrapper {...props}><line x1="17" y1="7" x2="7" y2="17" /><polyline points="17 17 7 17 7 7" /></IconWrapper>
    ),
    Sliders: (props: IconProps) => (
        <IconWrapper {...props}><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></IconWrapper>
    ),

    // Navigation / UI
    Menu: (props: IconProps) => (
        <IconWrapper {...props}><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></IconWrapper>
    ),
    Close: (props: IconProps) => (
        <IconWrapper {...props}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></IconWrapper>
    ),
    ChevronDown: (props: IconProps) => (
        <IconWrapper {...props}><polyline points="6 9 12 15 18 9" /></IconWrapper>
    ),
    ChevronRight: (props: IconProps) => (
        <IconWrapper {...props}><polyline points="9 18 15 12 9 6" /></IconWrapper>
    ),
    ChevronLeft: (props: IconProps) => (
        <IconWrapper {...props}><polyline points="15 18 9 12 15 6" /></IconWrapper>
    ),
    Check: (props: IconProps) => (
        <IconWrapper {...props}><polyline points="20 6 9 17 4 12" /></IconWrapper>
    ),
    Upload: (props: IconProps) => (
        <IconWrapper {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></IconWrapper>
    ),
    Download: (props: IconProps) => (
        <IconWrapper {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 12 12 17 17 12" /><line x1="12" y1="17" x2="12" y2="3" /></IconWrapper>
    ),
    MoreVertical: (props: IconProps) => (
        <IconWrapper {...props}><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></IconWrapper>
    ),

    // Status
    Info: (props: IconProps) => (
        <IconWrapper {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></IconWrapper>
    ),
    Warning: (props: IconProps) => (
        <IconWrapper {...props}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></IconWrapper>
    ),

    // Business Specific
    Cart: (props: IconProps) => (
        <IconWrapper {...props}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></IconWrapper>
    ),
    DollarSign: (props: IconProps) => (
        <IconWrapper {...props}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></IconWrapper>
    ),
    FileText: (props: IconProps) => (
        <IconWrapper {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></IconWrapper>
    ),
    Package: (props: IconProps) => (
        <IconWrapper {...props}><line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></IconWrapper>
    ),
    Users: (props: IconProps) => (
        <IconWrapper {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></IconWrapper>
    ),
    Chart: (props: IconProps) => (
        <IconWrapper {...props}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></IconWrapper>
    ),
    Settings: (props: IconProps) => (
        <IconWrapper {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></IconWrapper>
    ),
    TrendingUp: (props: IconProps) => (
        <IconWrapper {...props}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></IconWrapper>
    ),
    TrendingDown: (props: IconProps) => (
        <IconWrapper {...props}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></IconWrapper>
    ),
    Activity: (props: IconProps) => (
        <IconWrapper {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></IconWrapper>
    ),
    AlertCircle: (props: IconProps) => (
        <IconWrapper {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></IconWrapper>
    ),
    CheckCircle: (props: IconProps) => (
        <IconWrapper {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></IconWrapper>
    ),
    Printer: (props: IconProps) => (
        <IconWrapper {...props}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></IconWrapper>
    ),
    Copy: (props: IconProps) => (
        <IconWrapper {...props}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></IconWrapper>
    ),
    Tag: (props: IconProps) => (
        <IconWrapper {...props}><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l4.59-4.59a1 1 0 0 0 0-1.41L12 2Z" /><path d="M7 7h.01" /></IconWrapper>
    ),
    Award: (props: IconProps) => (
        <IconWrapper {...props}><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></IconWrapper>
    ),
    Image: (props: IconProps) => (
        <IconWrapper {...props}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></IconWrapper>
    ),
    User: (props: IconProps) => (
        <IconWrapper {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></IconWrapper>
    ),
    Building: (props: IconProps) => (
        <IconWrapper {...props}><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="9" y1="22" x2="9" y2="12" /><line x1="15" y1="12" x2="15" y2="22" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="7" x2="9.01" y2="7" /><line x1="15" y1="7" x2="15.01" y2="7" /><line x1="9" y1="17" x2="15" y2="17" /></IconWrapper>
    ),
    Wallet: (props: IconProps) => (
        <IconWrapper {...props}><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" /></IconWrapper>
    ),
    LogOut: (props: IconProps) => (
        <IconWrapper {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></IconWrapper>
    ),
    Scissors: (props: IconProps) => (
        <IconWrapper {...props}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" /></IconWrapper>
    ),
    Factory: (props: IconProps) => (
        <IconWrapper {...props}><path d="M4 22V10a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12" /><path d="M12 14V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v7" /><path d="M2 22h20" /></IconWrapper>
    )
};
