# ABSI Technical Interview Portal

Local Next.js app for creating technical interviews, sharing candidate links, and testing camera-based interviews.

## Local Start

Run the app:

```powershell
npm run dev
```

Open local admin/login:

```text
http://localhost:3000/login
```

Default local admin account:

```text
Email: admin@example.com
Password: admin123
```

## Ngrok Testing Checklist

Use ngrok when you want to test the app through an HTTPS public link. This is needed for candidate camera testing on another device.

### 1. Start the App

In terminal 1:

```powershell
npm run dev
```

Wait until it shows the app is ready on:

```text
http://localhost:3000
```

Leave this terminal running.

### 2. Start Ngrok

In terminal 2:

```powershell
ngrok http 3000
```

Ngrok will show a line like:

```text
Forwarding  https://abcd-1234.ngrok-free.app -> http://localhost:3000
```

Copy only this part:

```text
https://abcd-1234.ngrok-free.app
```

Do not copy this part:

```text
-> http://localhost:3000
```

Do not copy the ngrok web interface URL:

```text
http://127.0.0.1:4040
```

### 3. Update `.env`

In `.env`, replace `APP_DOMAIN` with the copied ngrok HTTPS URL:

```env
APP_DOMAIN="https://abcd-1234.ngrok-free.app"
AUTH_TRUST_HOST=true
```

Keep `NEXTAUTH_URL` unset or commented out for local/ngrok testing.

### 4. Restart the App

After changing `.env`, restart terminal 1:

```text
Ctrl + C
```

Then:

```powershell
npm run dev
```

Ngrok must stay running in terminal 2.

### 5. Open the Ngrok Login

Use:

```text
https://abcd-1234.ngrok-free.app/login
```

You can also keep local login open at the same time:

```text
http://localhost:3000/login
```

Localhost and ngrok use separate browser cookies, so you may need to log in separately in each tab.

### 6. Common Mistakes

- If the browser searches Yahoo/Google, paste the URL into the browser address bar and press Enter.
- If login works on localhost but not ngrok, confirm `.env` has the same ngrok URL currently shown in the ngrok terminal.
- If ngrok is restarted, the free URL usually changes. Copy the new URL, update `APP_DOMAIN`, and restart `npm run dev`.
- If you see `ERR_NGROK_121`, update ngrok and run `ngrok version`; it must be `3.20.0` or newer.
- For this project, run `ngrok http 3000`, not `ngrok http 80`.

## Gemini API

Get a free Gemini API key from:

```text
https://aistudio.google.com/app/apikey
```

Put it in `.env`:

```env
GEMINI_API_KEY="your-key-here"
```

Restart the app after changing `.env`.
