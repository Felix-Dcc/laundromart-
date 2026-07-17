# Project Structure Overview

## 📁 Directory Organization

```
laundry-management-system/
│
├── 📱 mobile/                    # React Native (Expo) Mobile App
│   ├── src/
│   │   ├── api/                  # API client configuration
│   │   ├── components/           # Reusable UI components
│   │   │   ├── AddressSelector.js
│   │   │   ├── DatePicker.js
│   │   │   ├── ETACard.js
│   │   │   ├── GlassCard.js
│   │   │   ├── GlassInput.js
│   │   │   ├── NeonButton.js
│   │   │   ├── PasswordStrength.js
│   │   │   ├── StarRating.js
│   │   │   └── StatusTimeline.js
│   │   ├── context/              # React Context providers
│   │   │   ├── AuthContext.js
│   │   │   └── NotificationContext.js
│   │   ├── navigation/           # Navigation configuration
│   │   │   ├── AdminNavigator.js
│   │   │   ├── AppNavigator.js
│   │   │   ├── ProviderNavigator.js
│   │   │   └── UserNavigator.js
│   │   ├── screens/              # Screen components
│   │   │   ├── admin/            # Admin screens
│   │   │   ├── auth/             # Authentication screens
│   │   │   ├── common/           # Shared screens
│   │   │   ├── provider/         # Provider screens
│   │   │   └── user/             # User screens
│   │   ├── theme/                # Design system
│   │   │   └── colors.js
│   │   └── utils/                # Utility functions
│   │       └── helpers.js
│   ├── assets/                  # App icons & splash (placeholders — replace before release)
│   ├── scripts/
│   │   └── preflight.js         # Store-submission blocker check (npm run preflight)
│   ├── App.js
│   ├── app.config.js            # Expo config (reads env; guards production builds)
│   ├── eas.json                 # EAS build/submit profiles
│   └── package.json
│
├── 🔧 backend/                    # Node.js/Express API Server
│   ├── prisma/
│   │   ├── migrations/           # Database migrations
│   │   ├── schema.prisma         # Database schema
│   │   └── seed.js               # Database seeding
│   ├── src/
│   │   ├── config/               # Configuration
│   │   │   └── index.js
│   │   ├── middleware/           # Middleware
│   │   │   └── auth.js
│   │   ├── routes/               # API routes
│   │   │   ├── admin.js
│   │   │   ├── analytics.js
│   │   │   ├── auth.js
│   │   │   ├── nearby.js
│   │   │   ├── notifications.js
│   │   │   ├── orders.js
│   │   │   ├── pricing.js
│   │   │   ├── provider.js
│   │   │   ├── reviews.js
│   │   │   └── user.js
│   │   ├── services/             # Business logic
│   │   │   ├── audit.js
│   │   │   ├── eta.js
│   │   │   ├── notification.js
│   │   │   └── order.js
│   │   └── index.js              # Entry point
│   ├── env.example
│   └── package.json
│
├── 📦 archive/                    # Legacy/Reference Materials
│   └── legacy-php-system/        # Original PHP system (deprecated)
│
├── 📄 README.md                   # Main project documentation
├── 📄 PROJECT_STRUCTURE.md        # This file
└── 📄 .gitignore                 # Git ignore rules

```

## 🗂️ Key Directories

### `/mobile`
React Native mobile application built with Expo SDK 54.

**Key Features:**
- Premium glassmorphism UI design
- Location-based services
- Push notifications
- Real-time order tracking
- Ratings and reviews

### `/backend`
Node.js/Express RESTful API server.

**Key Features:**
- PostgreSQL database with Prisma ORM
- JWT authentication
- Role-based access control
- Push notification service
- Audit logging
- Analytics aggregation

### `/archive`
Contains legacy code and reference materials.

**Contents:**
- `legacy-php-system/`: Original PHP-based system (deprecated, reference only)

## 📋 File Organization Principles

1. **Separation of Concerns**: Backend and mobile are separate projects
2. **Feature-Based Structure**: Screens and routes organized by feature
3. **Reusable Components**: Shared components in dedicated directory
4. **Configuration Centralized**: Config files in dedicated folders
5. **Legacy Preserved**: Old system archived for reference

## 🧹 Cleanup Summary

### Removed/Archived:
- ✅ Legacy PHP system moved to `archive/legacy-php-system/`
- ✅ Empty `mobile/assets/` directory (kept for future use)

### Created:
- ✅ Root `README.md` with comprehensive documentation
- ✅ `.gitignore` for proper version control
- ✅ Archive documentation

### Maintained:
- ✅ All active code in `backend/` and `mobile/`
- ✅ Database migrations and schema
- ✅ Configuration files
- ✅ Node modules (excluded via .gitignore)

## 🚀 Next Steps

1. Review and customize `README.md` with your specific details
2. Update `.env` files with your actual configuration
3. Ensure all dependencies are installed (`npm install` in both directories)
4. Run database migrations and seed data
5. Start development servers

## 📝 Notes

- The legacy PHP system is preserved in `archive/` for reference only
- All active development should be in `backend/` and `mobile/` directories
- Follow the existing structure when adding new features
- Keep components reusable and well-organized
