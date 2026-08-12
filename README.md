<p align="center">
  <h1 align="center">📷 ABO BAKR</h1>
  <p align="center">
    <strong>Professional Photography Portfolio & Client Delivery Platform</strong>
  </p>
  <p align="center">
    A full-stack web application that serves as both a stunning public portfolio for a professional photographer and a secure, private client gallery system for event photo delivery.
  </p>
  <p align="center">
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#api-reference">API Reference</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#deployment">Deployment</a>
  </p>
</p>

---

## ✨ Features

### 🌐 Public Portfolio
- **Home Page** — Paginated showcase of the photographer's best work
- **Gallery Collections** — Organized photo collections with cover images and full-screen lightbox viewer
- **Packages** — Photography service packages with pricing, hours, and details
- **Testimonials** — Public feedback system with star ratings (admin-moderated)

### 🔒 Client Portal (Password-Protected)
- **Private Event Access** — Clients enter an event ID + password to view their event photos
- **Folder Organization** — Event photos organized into browsable folders
- **Image Downloads** — Single image download or bulk ZIP download with real-time progress tracking
- **Client-Side ZIP** — Efficient in-browser ZIP creation using JSZip with batched parallel downloads

### 🛡️ Admin Panel
- **Secure Authentication** — Session-based admin login with bcrypt password hashing
- **Content Management** — Full CRUD for home images, gallery collections, packages, and client events
- **Event Management** — Create client events with bride/groom names, passwords, background images with focal point control
- **Folder Management** — Organize event photos into folders with customizable cover images
- **Feedback Moderation** — Approve, reject, or delete client testimonials
- **Direct Cloud Upload** — Presigned URL workflow for uploading images directly to Backblaze B2

---

## 🛠 Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| **Node.js 22** | Runtime (Alpine Docker image) |
| **Express.js 4.21** | Web framework (ES Modules) |
| **MongoDB** (Mongoose 8.5) | Database |
| **express-session** + **connect-mongo** | Session management (stored in MongoDB) |
| **Backblaze B2** (via AWS S3 SDK) | Object storage for images |
| **bcrypt** | Password hashing |
| **Winston** | Logging with daily rotation |
| **Sharp** | Image processing library |
| **Multer** | File upload handling |
| **ws** | WebSocket server |

### Frontend

| Technology | Purpose |
|---|---|
| **Angular 19.2** | Frontend framework (standalone components, lazy-loaded routes) |
| **Tailwind CSS 3.4** + **SCSS** | Styling |
| **Cormorant Garamond** + **Inter** | Typography (serif display + sans-serif body) |
| **JSZip 3.10** | Client-side ZIP creation for bulk downloads |
| **Angular SSR** | Server-side rendering support |

### Infrastructure

| Component | Platform |
|---|---|
| **Backend Hosting** | Railway |
| **Frontend Hosting** | Vercel |
| **Database** | MongoDB Atlas |
| **Object Storage** | Backblaze B2 (S3-compatible) |
| **Containerization** | Docker + Docker Compose |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 22+
- **MongoDB** instance (local or Atlas)
- **Backblaze B2** account with a bucket configured
- **npm** or **yarn**

### Backend Setup

```bash
# Navigate to backend
cd BackEnd

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Configure your `.env` file with the following variables:

```env
# Server
PORT=4000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>

# Session
SESSION_SECRET=your-session-secret

# Backblaze B2
B2_KEY_ID=your-b2-key-id
B2_APP_KEY=your-b2-app-key
B2_BUCKET_ID=your-b2-bucket-id
B2_BUCKET_NAME=your-b2-bucket-name
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005
B2_PRIVATE=false                                      # 'true' only for private buckets
CDN_URL=https://f005.backblazeb2.com/file/your-bucket  # Required when B2_PRIVATE=false
OFFICIAL_CDN_URL=https://f005.backblazeb2.com/file/your-bucket

# CORS
FRONTEND_URL=http://localhost:4200
```

```bash
# Set up B2 CORS (one-time)
node setup-cors.js

# Start the development server
npm run dev
```

The backend will be running at `http://localhost:4000`.

### Frontend Setup

```bash
# Navigate to frontend
cd FrontEnd

# Install dependencies
npm install

# Start the development server
ng serve
```

The frontend will be running at `http://localhost:4200`.

### Initial Admin Setup

After both servers are running, make a POST request to create the initial admin account:

```bash
curl -X POST http://localhost:4000/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-secure-password"}'
```

### Docker Setup (Backend)

```bash
cd BackEnd

# Build and run with Docker Compose
docker-compose up --build
```

---

## 📡 API Reference

All endpoints are prefixed with `/api`.

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/setup` | — | One-time admin account creation |
| `POST` | `/auth/login` | — | Admin login (sets session cookie) |
| `POST` | `/auth/logout` | Admin | Admin logout |
| `GET` | `/auth/me` | Admin | Get current session info |
| `PUT` | `/auth/change-password` | Admin | Change admin password |

### Home Images

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/home?page=&limit=` | — | Get home images (paginated) |
| `POST` | `/home/upload` | Admin | Save home image metadata |
| `DELETE` | `/home/:id` | Admin | Delete a home image |

### Gallery

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/gallery` | — | Get all collections with image counts |
| `POST` | `/gallery` | Admin | Create collection |
| `PUT` | `/gallery/:collectionId` | Admin | Update collection |
| `DELETE` | `/gallery/:collectionId` | Admin | Delete collection + all images |
| `GET` | `/gallery/:collectionId/images` | — | Get images in a collection |
| `POST` | `/gallery/:collectionId/images` | Admin | Save image metadata |
| `DELETE` | `/gallery/:collectionId/images/:imageId` | Admin | Delete an image |

### Packages

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/packages` | — | Get all packages (sorted) |
| `GET` | `/packages/:id` | — | Get single package |
| `POST` | `/packages` | Admin | Create package |
| `PUT` | `/packages/:id` | Admin | Update package |
| `DELETE` | `/packages/:id` | Admin | Delete package |

### Client Events

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/client-events` | Admin | Get all events |
| `POST` | `/client-events` | Admin | Create event |
| `PUT` | `/client-events/:id` | Admin | Update event |
| `DELETE` | `/client-events/:id` | Admin | Delete event + all images |
| `POST` | `/client-events/access` | — | Client login (eventId + password) |
| `GET` | `/client-events/access/check` | — | Check client session |
| `GET` | `/client-events/:id/details` | Client/Admin | Get event details + folders |
| `GET` | `/client-events/:id/images` | Client/Admin | Get images (optional `?folder=`) |
| `POST` | `/client-events/:id/images` | Admin | Save image metadata |
| `DELETE` | `/client-events/:eventId/images/:imageId` | Admin | Delete image |
| `DELETE` | `/client-events/:eventId/folders/:folderKey` | Admin | Delete folder + images |

### Feedbacks

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/feedbacks` | Mixed | Admin sees all; public sees approved only |
| `POST` | `/feedbacks` | — | Submit feedback |
| `PATCH` | `/feedbacks/:id/status` | Admin | Update status (pending/approved/rejected) |
| `DELETE` | `/feedbacks/:id` | Admin | Delete feedback |

### Uploads

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/uploads/presign` | Admin | Generate presigned PUT URLs for direct B2 upload |

---

## 🏗 Architecture

### Image Upload Flow

Images never pass through the backend server. The upload follows a **presigned URL pattern** for minimal server load:

```
┌──────────┐    1. Request presigned URLs    ┌──────────┐
│          │ ──────────────────────────────►  │          │
│ Frontend │    2. Return signed PUT URLs     │ Backend  │
│          │ ◄──────────────────────────────  │          │
│          │                                  │          │
│          │    3. Upload directly to B2      │          │
│          │ ──────────────────────────────►  ┌──────────┐
│          │                                  │   B2     │
│          │    4. Save metadata to DB        │ Storage  │
│          │ ──────────────────────────────►  └──────────┘
└──────────┘                                  ┌──────────┐
                                              │ Backend  │
                                              └──────────┘
```

### Multi-Variant Image Storage

Every uploaded image is processed client-side into **4 WebP variants** before upload:

| Variant | Max Width | Use Case |
|---|---|---|
| **Thumbnail** | 400px | Grid previews, collection covers |
| **Medium** | 1200px | Gallery display, default viewing |
| **Hero** | 2000px | Full-width hero banners |
| **Original** | Native | Full-resolution download |

### Database Models

```
┌─────────────────┐     ┌─────────────────────┐
│      User       │     │    GalleryCollection │
│  (Admin auth)   │     │                     │
└─────────────────┘     └──────────┬──────────┘
                                   │ 1:N
                        ┌──────────▼──────────┐
                        │    GalleryImage     │
                        └─────────────────────┘

┌─────────────────┐     ┌─────────────────────┐
│   ClientEvent   │────►│  ClientEventImage   │
│ (bride, groom,  │ 1:N │  (folderKey groups) │
│  password)      │     │                     │
└─────────────────┘     └─────────────────────┘

┌─────────────────┐     ┌─────────────────────┐
│      Home       │     │     Feedback        │
│ (hero images)   │     │  (moderated reviews)│
└─────────────────┘     └─────────────────────┘

┌─────────────────┐
│    Package      │
│ (pricing plans) │
└─────────────────┘
```

### Authentication

The app uses a **dual authentication model**:

- **Admin Auth** — Session-based with bcrypt-hashed passwords, `httpOnly` cookies, 7-day session expiry
- **Client Auth** — Simple event password verification, session-stored client event ID

---

## 🌍 Deployment

### Backend → Railway

The backend is containerized with Docker and deployed to **Railway**:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 4000
CMD ["node", "server.js"]
```

### Frontend → Vercel

The Angular frontend is deployed to **Vercel** as a SPA:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.csr.html" }]
}
```

### Environment Requirements

| Service | Required |
|---|---|
| MongoDB Atlas | Database cluster |
| Backblaze B2 | Image storage bucket |
| Railway | Backend hosting |
| Vercel | Frontend hosting |

---

## 📁 Project Structure

```
Bakr/
├── BackEnd/
│   ├── config/          # Database & B2 storage configuration
│   ├── middleware/       # Auth middleware (admin & client)
│   ├── models/          # Mongoose schemas
│   ├── routes/          # Express route handlers
│   ├── services/        # B2 storage service
│   ├── utils/           # Logger & utilities
│   ├── server.js        # Express app entry point
│   ├── setup-cors.js    # B2 CORS configuration script
│   ├── Dockerfile       # Container configuration
│   └── docker-compose.yml
│
├── FrontEnd/
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/    # Angular standalone components
│   │   │   ├── services/      # HTTP & upload services
│   │   │   ├── models/        # TypeScript interfaces
│   │   │   └── guards/        # Route guards (admin, guest)
│   │   ├── assets/            # Static assets
│   │   └── styles.scss        # Global styles
│   ├── angular.json           # Angular CLI config
│   ├── tailwind.config.js     # Tailwind theme config
│   └── vercel.json            # Vercel deployment config
│
└── README.md
```

---

## 🎨 Design System

The frontend uses a carefully curated photography-inspired design:

- **Typography**: *Cormorant Garamond* (elegant serif headings) + *Inter* (clean sans-serif body)
- **Color Palette**: Warm, neutral tones optimized for photography presentation
- **Layout**: Responsive grid layouts with full-screen image lightbox
- **Animations**: Smooth transitions and hover effects for an interactive feel

---

## 📝 License

This project is proprietary. All rights reserved.

---

<p align="center">
  Built with ❤️ by <strong>ABO BAKR</strong>
</p>