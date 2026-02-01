## FlowBuildr Codebase Summary

This document summarizes the current frontend and backend (workflow scripts) features, how they work, and where they live. Paths are relative to the repo root.

## High-Level Architecture

- **Frontend**: Next.js 14 (App Router) with TypeScript and Tailwind CSS.
- **Auth + Data**: Supabase (Auth, Database, Storage).
- **PDF Viewing**: `react-pdf` + `pdfjs-dist`, client-only rendering.
- **Image Zoom/Pan**: `react-zoom-pan-pinch`.
- **Backend Workflow**: Standalone Python scripts for image classification and quality checks.

## Frontend Features

### 1) Root App Shell

- **Global layout**: `app/layout.tsx`
  - Loads global styles (`app/globals.css`).
  - Injects Inter font via `next/font/google`.
  - Wraps entire app in `AuthProvider` from `contexts/AuthContext.tsx`, so auth state is available everywhere.

### 2) Navigation (Public Navbar)

- **Component**: `components/ui/Navbar.tsx`
  - Sticky, transparent nav that becomes blurred with a border on scroll.
  - Left: FlowBuildr logo, slightly offset with top/left margins.
  - Center: Anchor links (`Home`, `About`, `Why Choose Us`, `Pricing`, `Contact`) when **not** on `/dashboard`.
  - Right: `Login` and `Sign Up` buttons for public routes, or dashboard links + sign out when in `/dashboard`.
  - Mobile: Hamburger menu with the same link set.

### 3) Landing Page (Hero)

- **Page**: `app/page.tsx`
  - Full-screen hero (minus navbar) with grid overlay and gradient blobs.
  - Centered headline: “Analyzing House Costs with Ease”.
  - AI line with icon (`/public/images/AI Icon.png`).
  - FlowBuildr logo image (`/public/images/FlowBuildrCroppedLogo.png`).
  - “Video Coming Soon!” text.
  - CTA button to sign up.
  - **Currently** the hero is the only section (no cards; features section removed in latest edits).

### 4) Authentication (Sign In / Sign Up)

- **Sign In**: `app/auth/signin/page.tsx`
  - Two-panel layout: left image panel + right login form.
  - Inputs for email/password, login button, and sign-up link.
  - Uses `useAuth().signIn` to authenticate and then redirects to `/dashboard`.

- **Sign Up**: `app/auth/signup/page.tsx`
  - Two-panel layout mirroring the sign-in page.
  - Inputs for email, password, confirm password, validation with error messaging.
  - Uses `useAuth().signUp`, then redirects to `/dashboard` after a short delay.

### 5) Auth State Management

- **Context**: `contexts/AuthContext.tsx`
  - Stores `user`, `loading`, and `error`.
  - Initializes by checking `supabase.auth.getUser`.
  - Subscribes to `supabase.auth.onAuthStateChange` to keep state in sync.
  - Exposes `signIn`, `signUp`, `signOut`.

- **Hooks**: `hooks/useAuth.ts`
  - `useRequireAuth()` redirects unauthenticated users to `/auth/signin`.
  - `useRedirectIfAuthenticated()` redirects authenticated users away from auth pages.

### 6) Dashboard Layout

- **Layout**: `app/dashboard/layout.tsx`
  - Guards all dashboard routes (redirects to sign-in if not authenticated).
  - Fixed top nav with user email/initial and sign-out.
  - Left sidebar with `Dashboard`, `My Projects`, and `Settings`.
  - Main content area scrolls with a subtle gradient.

- **Dashboard landing page**: `app/dashboard/page.tsx`
  - Minimal placeholder with a welcome line and empty state.

### 7) Projects List + Creation

- **Page**: `app/dashboard/projects/page.tsx`
  - Fetches projects for the signed-in user from Supabase.
  - Search input filters projects by name.
  - Grid/List view toggle.
  - “Create project” modal:
    - Requires project name and a file (PDF/JPG/PNG).
    - Validates file types.
    - Uploads to Supabase Storage (`project-files` bucket).
    - Inserts metadata row in the `projects` table.
    - Navigates to the project viewer on success.
  - Folder section is a placeholder with “No folders yet.”

**Data Flow (Create Project)**  
1. User selects a file and name.  
2. File uploaded to Supabase Storage (path: `{user.id}/{projectId}/{safeFilename}`).  
3. Row inserted into `projects` table with `id`, `name`, `file_path`, `file_mime`.  
4. Page navigates to `/dashboard/projects/[projectId]`.  

### 8) Project Viewer

- **Page**: `app/dashboard/projects/[projectId]/page.tsx`
  - Loads project by `projectId` from Supabase.
  - Verifies user ownership and redirects if unauthorized.
  - Generates a signed URL to read the project file.
  - Left column shows project info and PDF page controls.
  - Center column displays either:
    - **PDF** (client-only component), or  
    - **Image** (direct `<img>`).
  - Zoom/pan controls with `react-zoom-pan-pinch`.
  - Right “Tools” column is a placeholder with “coming soon” blocks.

### 9) PDF Viewer (Client-only)

- **Component**: `components/pdf/PdfViewer.tsx`
  - Uses `react-pdf` to render PDF pages.
  - `pdfjs.GlobalWorkerOptions.workerSrc` is set via `import.meta.url`.
  - Accepts: `fileUrl`, `pageNumber`, `onLoadNumPages`.
  - This component is dynamically imported client-side in the project viewer.

### 10) UI Components Library

- **Button**: `components/ui/Button.tsx`
  - Variants (`primary`, `secondary`, `outline`, `danger`) with sizes.
  - Supports loading state with spinner.
- **Card**: `components/ui/Card.tsx`
  - Simple container component + header/content/title helpers.
- **Input**: `components/ui/Input.tsx`
  - Input with optional label/error styling.
- **Alert**: `components/ui/Alert.tsx` (present in repo, minimal usage).

## Supabase Integration (Backend-as-a-Service)

- **Client**: `lib/supabase.ts`
  - Reads from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Warns if missing.

**Expected tables and storage (based on usage):**
- **`projects` table**:
  - `id`, `user_id`, `name`, `file_path`, `file_mime`, `created_at`.
  - RLS should restrict rows to the logged-in user.
- **Storage**:
  - Bucket `project-files`.
  - Files stored by user/project path.
  - Signed URLs used for access in viewer.

## Backend Workflow (Python Scripts)

### `backend-workflow/predict.py`

- Loads a Keras model (`binary_image_classifier_model.keras`).
- Accepts image path via command line argument.
- Resizes to 180x180, runs model prediction.
- Outputs:
  - Raw score,
  - “FLOOR PLAN DETECTED” if score > 0.5,
  - Confidence.

### `backend-workflow/blurry.py`

- Uses OpenCV to check:
  - **Blurriness** (Laplacian variance).
  - **Contrast/Brightness** (pixel mean/std).
  - **Aspect ratio** (width/height validation).
- Currently uses a hardcoded `test5.png` when executed directly.

**Note**: These scripts are **not wired** into the Next.js app yet. They are standalone tools.

## Assets

- **Branding & UI images**: `public/images/*`
  - Includes AI icon, FlowBuildr logos, and a house cost card image.

## Configuration & Utilities

- **Next.js config**: `next.config.js`
  - Adds webpack alias for `canvas` to avoid build-time module resolution issues with `pdfjs-dist`.
- **Constants**: `config/constants.ts`
  - App metadata, routes, auth config, UI constants.
- **Helpers**: `utils/helpers.ts`
  - Email/password validation, formatting, and delay utilities.

## Key User Flows (End-to-End)

1. **Sign Up / Sign In**
   - Auth pages → Supabase Auth → user stored in context → redirect to dashboard.

2. **Create Project**
   - Projects page modal → file validation → upload to Supabase Storage → insert row in `projects` table → open viewer.

3. **View Project**
   - Projects viewer → fetch project row → signed URL → render PDF or image → zoom/pan tools.

## Notable Implementation Details

- Auth state is centralized and auto-synced with Supabase events.
- PDF rendering is client-only to avoid SSR build issues.
- Signed URLs expire after 1 hour for storage security.
- Dashboard routes are guarded in the layout to prevent unauthenticated access.

