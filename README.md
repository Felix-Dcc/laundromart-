# Laundry Management System

A modern, mobile-first laundry management application built with React Native (Expo) and Node.js/Express.

## 🏗️ Project Structure

```
├── backend/          # Node.js/Express API server
│   ├── prisma/      # Database schema and migrations
│   ├── src/         # Source code
│   │   ├── config/  # Configuration files
│   │   ├── middleware/  # Auth and other middleware
│   │   ├── routes/  # API route handlers
│   │   └── services/  # Business logic services
│   └── package.json
│
├── mobile/          # React Native (Expo) mobile app
│   ├── src/
│   │   ├── api/     # API client configuration
│   │   ├── components/  # Reusable UI components
│   │   ├── context/  # React context providers
│   │   ├── navigation/  # Navigation configuration
│   │   ├── screens/  # Screen components
│   │   ├── theme/   # Design system (colors, etc.)
│   │   └── utils/   # Utility functions
│   └── package.json
│
└── archive/         # Legacy PHP system (reference only)
    └── legacy-php-system/
```

## 🚀 Features

### User Features
- **Order Management**: Create, track, and cancel laundry orders
- **Location-Based Discovery**: Find nearby laundromats with distance calculation
- **Order Tracking**: Real-time status timeline with ETA
- **Ratings & Reviews**: Rate and review laundromats after delivery
- **Push Notifications**: Receive updates on order status changes

### Provider Features
- **Order Queue System**: Manage orders in Incoming, In Progress, and Completed queues
- **One-Click Status Updates**: Advance orders through workflow
- **Analytics Dashboard**: View performance metrics and statistics
- **Review Management**: View and respond to customer reviews

### Admin Features
- **User Management**: Manage users and providers
- **Order Oversight**: View and manage all orders
- **Analytics**: System-wide analytics and reporting
- **Audit Logs**: Track all critical actions with immutable audit trail
- **Pricing Management**: Configure service pricing

## 🛠️ Tech Stack

### Backend
- **Node.js** + **Express.js** - RESTful API
- **PostgreSQL** - Database
- **Prisma ORM** - Database access layer
- **JWT** - Authentication
- **Expo Push API** - Push notifications

### Mobile
- **React Native** (Expo SDK 54)
- **React Navigation** - Navigation
- **Expo Blur** - Glassmorphism effects
- **Expo Linear Gradient** - Gradient backgrounds
- **Expo Location** - Location services
- **Expo Notifications** - Push notifications

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Expo CLI (for mobile development)
- iOS Simulator / Android Emulator or physical device

## 🔧 Setup Instructions

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `env.example`):
```bash
cp env.example .env
```

4. Configure database connection in `.env`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/laundry_management_system"
JWT_SECRET="your-secret-key"
```

5. Run database migrations:
```bash
npx prisma migrate dev
```

6. Seed the database:
```bash
npx prisma db seed
```

7. Start the server:
```bash
npm run dev
```

Server runs on `http://localhost:3000`

### Mobile Setup

1. Navigate to mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install
```

3. Update API base URL in `src/api/client.js`:
```javascript
const API_BASE_URL = 'http://YOUR_LOCAL_IP:3000/api';
```

4. Start Expo development server:
```bash
npm start
```

5. Scan QR code with Expo Go app or press `i` for iOS simulator / `a` for Android emulator

## 📱 Key Screens

### Authentication
- **Login Screen**: Premium glassmorphism design with soft ambient glow
- **Sign-up Screen**: Address collection with location detection
- **Forgot Password**: Password recovery flow

### User Screens
- **Dashboard**: Order overview and quick actions
- **New Request**: Create laundry order with date picker
- **My Requests**: List of all orders with status timeline
- **Request Details**: Detailed order view with ETA and review prompt
- **Nearby**: Discover laundromats by location
- **Profile**: User profile management

### Provider Screens
- **Dashboard**: Queue overview and quick actions
- **Order Queue**: Manage orders in three tabs (Incoming, In Progress, Completed)
- **Order Details**: View order details and update status
- **Analytics**: Performance metrics and statistics

### Admin Screens
- **Dashboard**: System overview
- **Users**: Manage all users and providers
- **Orders**: View and manage all orders
- **Pricing**: Configure service pricing
- **Analytics**: System-wide analytics
- **Audit Logs**: View immutable audit trail

## 🎨 Design System

The app uses a premium glassmorphism design with:
- **Dark futuristic background** with ambient light orbs
- **Frosted glass cards** with blur effects
- **Soft neon glow accents** (cyan/purple/blue)
- **Smooth 3D animations** and transitions
- **Consistent color palette** defined in `mobile/src/theme/colors.js`

## 🔐 Authentication

- JWT-based authentication
- Role-based access control (User, Provider, Admin)
- Secure password hashing with bcrypt
- Token refresh mechanism

## 📊 Database Schema

See `backend/prisma/schema.prisma` for complete database schema.

Key models:
- `User` - Users, providers, and admins
- `LaundryRequest` - Orders
- `RequestStatusHistory` - Order status timeline
- `Review` - Ratings and reviews
- `Notification` - In-app notifications
- `AuditLog` - Immutable audit trail
- `LaundryPricing` - Service pricing

## 🧪 Testing

### Backend API
Test endpoints using tools like Postman or curl:
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

## 📝 API Documentation

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/forgot-password` - Request password reset

### Orders
- `GET /api/orders` - List user orders
- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id/cancel` - Cancel order

### Provider
- `GET /api/provider/queue/:bucket` - Get orders by queue
- `PUT /api/provider/orders/:id/status` - Update order status
- `PUT /api/provider/orders/:id/advance` - Advance order status

### Admin
- `GET /api/admin/users` - List all users
- `GET /api/admin/audit-logs` - View audit logs
- `GET /api/analytics` - Get analytics data

See route files in `backend/src/routes/` for complete API documentation.

## 🚨 Important Notes

- **Database**: Ensure PostgreSQL is running before starting the backend
- **Network**: Mobile app must be on the same network as backend server
- **Location**: Update `API_BASE_URL` in mobile app to your local IP address
- **Push Notifications**: Requires Expo development build for full functionality

## 📦 Deployment

### Backend
1. Set production environment variables
2. Run migrations: `npx prisma migrate deploy`
3. Start with PM2 or similar: `pm2 start src/index.js`

### Mobile
1. Build with EAS: `eas build --platform ios/android`
2. Submit to app stores: `eas submit`

## 📄 License

[Add your license here]

## 👥 Contributors

[Add contributors here]

## 📞 Support

[Add support contact information]
