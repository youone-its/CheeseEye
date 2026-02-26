# Photobox Cloud Synchronization Setup Guide

This guide will walk you through setting up a **Supabase** backend to synchronize your templates and Midtrans API keys across all your photobooth laptops.

---

## 1. Create a Supabase Project
Supabase provides a free PostgreSQL database and file storage system.
1. Go to [Supabase.com](https://supabase.com/) and create a free account.
2. Click **New Project**, select an organization, and name it something like `photobox-sync`. Choose a secure database password and a region close to your physical machines.
3. Wait for the project to finish provisioning (takes about 2-3 minutes).

### 2. Get Your API Keys
Once your project is ready, you need to connect it to the app.
1. In your Supabase dashboard, click the **Settings** gear icon (bottom left).
2. Go to **API**.
3. Under *Project URL*, copy the `URL`.
4. Under *Project API Keys*, copy the `anon` `public` key.
5. You also need to invent a unique password for the registration process so random people can't create accounts. Make one up like `SUPERSECRET123`.
6. In your project's main folder (`/home/juanz/Desktop/photobox-v0`), double-check or create a file named `.env` and configure it like this:

```env
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_DEVELOPER_CODE=SUPERSECRET123
```

## 3. Set Up the Database Tables (Multi-Tenant)
Because you have multiple studios (users), each user needs their own isolated settings!
1. In the Supabase dashboard sidebar, go to the **SQL Editor**.
2. Click **New query** and paste the following SQL code, then click **Run**:

```sql
-- Create a table for Global Settings (Midtrans Keys)
CREATE TABLE global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
  midtrans_client_key text,
  midtrans_server_key text
);

-- Enable Row Level Security (RLS) so users only see their own keys
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own keys" ON global_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own keys" ON global_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own keys" ON global_settings FOR UPDATE USING (auth.uid() = user_id);

-- Create a table for Templates
CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL,
  price integer NOT NULL,
  photos_count integer NOT NULL,
  description text,
  image_url text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) so users only see their own templates
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own templates" ON templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON templates FOR DELETE USING (auth.uid() = user_id);
```

## 4. Set Up the Storage Bucket
We need a place to upload the raw `.png` template images securely.
1. In the Supabase sidebar, go to **Storage**.
2. Click **New Bucket**.
3. Name the bucket `templates`.
4. **IMPORTANT**: Toggle **Public bucket** to **ON** (so the app can download the images without needing complex authentication). Click Save.

## 5. Midtrans Configuration (Reminder)
To get your Midtrans keys for the Admin Panel:
1. Log into your [Midtrans Dashboard](https://dashboard.midtrans.com).
2. Go to **Settings > Access Keys**.
3. Copy your `Client Key` and `Server Key`. (Use the Sandbox keys for testing, and Production keys for your live photobooths).
4. You will enter these keys into the "Admin Settings" panel inside the Photobox app itself, which will then push them to Supabase!

---

### You are all set!
The app code has been updated so that when you access the `/admin` screen and click "Save", it uploads the templates to the `templates` bucket and pushes the data to the SQL database.

When any of your photobooth laptops start up, they will fetch the newest data from Supabase and cache the images locally so they remain fast and work continuously!

If your templates are saving and appearing correctly, then the database connection works perfectly!
Good luck setting up your photobooth! Let me know if you run into any other problems.

## 6. Testing Midtrans Sandbox Payments
Because you are in the Sandbox testing phase with Midtrans, scanning the QR code on the screen with your real GoPay app will result in an error. To mock a successful GoPay scan while testing your photobooth:

1. Look at your Photobooth app `PaymentScreen` when the QR code appears.
2. Go to the [Midtrans QRIS Simulator](https://simulator.sandbox.midtrans.com/qris/index).
3. Open your terminal where you run `npm run dev`. When the QR Code generated, there will be an `orderId` logged in the format `PBX-123...`. 
*(Note: Midtrans Simulator actually asks for the raw QR payload or the backend to trigger it, but Midtrans provides a Web Simulator)*
4. The easiest way to trigger a success is: go to your Midtrans Dashboard -> **Transactions** -> Find your recent `PBX-...` order -> Click it -> Click **Mock Payment** -> Change status to `settlement`.
5. The photobooth app polls the server every 3 seconds. Once the Midtrans server registers it as successful, the app will auto-navigate to the Camera screen!
