# Photobox Hardware Setup Guide

This guide covers the physical equipment and wiring necessary to deploy the Photobooth application in a real-world environment.

---

## 1. The Computer (The Brain)
To run the Photobooth reliably, you need a computer.
*   **Recommended:** A Mini-PC (e.g., Intel NUC, Beelink, or Mac Mini). They are small enough to mount behind a monitor or inside a custom wooden photobooth cabinet.
*   **OS:** Windows 10/11, macOS, or Ubuntu Linux. (The Electron app runs on all of them).
*   **Specs:** At least 8GB RAM and an i3/i5 processor (or Apple M1) to handle the live camera feed and image processing without lag.

## 2. The Camera (The Eyes)
While a standard USB webcam (like a Logitech C920) works instantly, professional photobooths use **DSLR or Mirrorless Cameras** (Sony Alpha, Fujifilm X-Series, Canon EOS) for superior image quality and depth of field.

### Connecting a Professional Camera:
You cannot just plug a camera into a PC using a standard USB-C cable (that usually just accesses the SD card storage). You need a **Video Capture Card**.

1.  **Hardware Needed:** 
    *   A Video Capture Card (e.g., Elgato Cam Link 4K, or a generic $15 HDMI-to-USB capture dongle from Amazon/Tokopedia).
    *   A Micro-HDMI or Mini-HDMI to Standard HDMI cable (depending on your camera's port).
    *   A "Dummy Battery" AC Adapter for your specific camera (so it doesn't die mid-event).
2.  **Setup:**
    *   Connect the HDMI cable to your camera's output port.
    *   Plug the other end into the USB Capture Card.
    *   Plug the Capture Card into a USB 3.0 port on your Mini-PC.
3.  **Camera Settings:**
    *   Turn the camera to "Movie" or "Live View" mode.
    *   **Crucial:** Go into the camera's menu and turn **"Clean HDMI Output" ON**. This removes the battery and focus UI overlays from the HDMI feed so they don't show up in the Photobooth.
    *   Turn off Auto-Sleep/Power Saving so the camera stays on permanently.
4.  **App Integration:** Once plugged in, the capture card acts exactly like a generic webcam. The Photobooth app will automatically list it in the Camera selection dropdown.

## 3. The Monitor (The Interface)
You need a Touchscreen monitor for users to interact with the app.
*   **Size:** 15-inch to 24-inch is standard for a photobooth.
*   **Type:** 10-point capacitive touchscreen monitor (e.g., Asus VT series, ViewSonic, or generic portable touch monitors).
*   **Connection:** You will run *two* cables from the monitor to the Mini-PC:
    1.  An HDMI/DisplayPort cable (for the video display).
    2.  A USB cable (to transmit the touch input data to the PC).

## 4. The Printer (The Output)
To print physical photo strips automatically.
*   **Dye-Sublimation Printers:** These are the industry standard for photobooths (e.g., DNP DS620A, Mitsubishi CP-D90DW, Sinfonia CS2, Citizen CX-02). They print instantly, cut the strips automatically (2x6 inches), and the photos are dry and waterproof exactly as they come out of the slot.
*   **Inkjet/Standard Printers (Alternative):** A standard Canon/Epson printer (like the G3070) can also work for budget setups, though it's much slower and requires manual cutting of photo paper.
*   **Setup:**
    *   Connect the printer to the Mini-PC via USB.
    *   Install the official OS driver for the printer.
    *   Set it as the "Default Printer" in your OS settings. The Photobooth app will automatically send jobs to the default printer without popping up a dialog box.

## 5. Lighting (The Look)
Good lighting is arguably more important than a good camera.
*   **Ring Light:** The classic setup. Mount a 14" to 18" LED ring light directly around the camera lens. It provides even, flat illumination that eliminates harsh shadows.
*   **Studio Strobes / Softboxes:** For a premium setup, mount two small softbox continuous LED lights on either side of the camera aiming at a 45-degree angle.

## 6. Internet Connection (The Cloud & Payment)
Because the app syncs templates with Supabase and processes live GoPay/QRIS transactions via Midtrans, **the Photobooth must be connected to the internet.**
*   Connect the Mini-PC via Ethernet (preferred for stability) or robust Wi-Fi.
*   Without internet, the Midtrans QR code will still generate (via the backend API call), but the app won't be able to poll Midtrans to see if the user actually paid!
