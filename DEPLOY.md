# Tested Electrical Admin — Deployment Guide
# Nathan, follow these steps in order. Each step tells you exactly what to click.

---

## STEP 1 — Create your Anthropic API account (5 min)

1. Go to: https://console.anthropic.com
2. Click "Sign up" — use your testedelec@gmail.com
3. Verify your email
4. Go to "Billing" → add your credit card (pay as you go, ~$20/month typical)
5. Go to "API Keys" → click "Create Key"
6. Name it: "Tested Electrical"
7. COPY the key — it starts with "sk-ant-..." — paste it in a notes app for now
   ⚠️ You only see this once

---

## STEP 2 — Create your Railway account (3 min)

1. Go to: https://railway.app
2. Click "Login with GitHub" (create a free GitHub account first if needed at github.com)
3. Once in Railway, click "New Project"
4. Click "Deploy from GitHub repo" → follow prompts to connect GitHub
5. Come back after connecting — we'll deploy the code next

---

## STEP 3 — Create your Twilio account for SMS (5 min)

1. Go to: https://twilio.com
2. Click "Sign up" — use your mobile number to verify
3. When asked "What do you want to do?" → select "Send SMS messages"
4. Go to "Phone Numbers" → "Buy a number"
5. Search for Australian numbers — pick one, ~$2/month
6. Note down:
   - Account SID (on your dashboard homepage)
   - Auth Token (click the eye icon to reveal)
   - Your new Twilio phone number

---

## STEP 4 — Set up Gmail API (10 min — most complex step)

1. Go to: https://console.cloud.google.com
2. Sign in with testedelec@gmail.com
3. Click "New Project" → name it "Tested Electrical" → Create
4. Click "APIs & Services" → "Enable APIs"
5. Search "Gmail API" → click Enable
6. Click "OAuth consent screen":
   - User type: External
   - App name: Tested Electrical Admin
   - Support email: testedelec@gmail.com
   - Click Save
7. Click "Credentials" → "Create Credentials" → "OAuth Client ID"
   - Application type: Web application
   - Name: Tested Electrical
   - Authorised redirect URIs: add https://developers.google.com/oauthplayground
   - Click Create
8. Download the JSON — open it, note your Client ID and Client Secret
9. Go to: https://developers.google.com/oauthplayground
10. Click the gear icon (top right) → tick "Use your own OAuth credentials"
    - Enter your Client ID and Client Secret
11. In Step 1, find "Gmail API v1" → tick:
    - https://mail.google.com/
12. Click "Authorise APIs" → sign in with testedelec@gmail.com → Allow
13. Click "Exchange authorization code for tokens"
14. Copy the "Refresh token" value

---

## STEP 5 — Deploy to Railway

1. In Railway, create a new project
2. Click "Add Service" → "GitHub Repo"
3. Upload this entire "tested-electrical" folder to a new GitHub repo:
   - Go to github.com → "New repository" → name: "tested-electrical" → Private → Create
   - Upload all files from this folder
4. Back in Railway, connect to your new GitHub repo
5. Railway will try to build — it will fail because we need env variables first

---

## STEP 6 — Add environment variables in Railway

In Railway, click your service → "Variables" → add each one:

```
ANTHROPIC_API_KEY        = sk-ant-... (from Step 1)
GMAIL_CLIENT_ID          = ...apps.googleusercontent.com (from Step 4)
GMAIL_CLIENT_SECRET      = GOCSPX-... (from Step 4)
GMAIL_REFRESH_TOKEN      = 1//... (from Step 4)
GMAIL_USER               = testedelec@gmail.com
TWILIO_ACCOUNT_SID       = AC... (from Step 3)
TWILIO_AUTH_TOKEN        = ... (from Step 3)
TWILIO_PHONE_NUMBER      = +61... (your Twilio number from Step 3)
NATHAN_PHONE_NUMBER      = +61407180596
DASHBOARD_PASSWORD       = (choose any password you want for your dashboard)
NODE_ENV                 = production
```

DATABASE_URL is added automatically by Railway when you add Postgres (next step).

---

## STEP 7 — Add Postgres database in Railway

1. In your Railway project, click "+ New"
2. Click "Database" → "PostgreSQL"
3. Railway creates it automatically
4. Click on the Postgres service → "Variables"
5. Copy the DATABASE_URL value
6. Go back to your app service → Variables → add:
   DATABASE_URL = (paste the value)

---

## STEP 8 — Set up the database tables

1. In Railway, click on your Postgres service
2. Click "Connect" → "Query"
3. Open the file "database.sql" from this folder
4. Copy ALL the contents
5. Paste into the Railway query box
6. Click "Run"
7. You should see "CREATE TABLE" messages — all good ✅

---

## STEP 9 — Deploy and go live

1. In Railway, click on your app service
2. Click "Deploy" (or it may auto-deploy when you pushed to GitHub)
3. Watch the build logs — should take 2-3 minutes
4. Once green, click "Settings" → "Domains" → "Generate Domain"
5. Copy your Railway URL (like: tested-electrical.up.railway.app)

---

## STEP 10 — Set up Twilio SMS webhook

1. Go back to Twilio
2. Click "Phone Numbers" → click your number
3. Under "Messaging" → "A message comes in":
   - Webhook: https://YOUR-RAILWAY-URL.up.railway.app/api/sms
   - Method: HTTP POST
4. Save

---

## STEP 11 — Upload your logo

1. In your GitHub repo, go to the "public" folder
2. Upload your logo file — rename it to exactly: logo.png
3. Commit the change
4. Railway will auto-redeploy

---

## STEP 12 — Test everything

1. Go to your Railway URL in a browser
2. Log in with the DASHBOARD_PASSWORD you set
3. Click "Check Emails" — should process any unread work order emails
4. Send a test SMS to your Twilio number describing a fake job
5. Check the dashboard — a report and invoice should appear

---

## You're live! 🎉

Your workflow from now on:

📬 Agency emails you → auto work order created → you get SMS alert
🔧 You do the job
📱 Text your Twilio number: "J-1001 replaced switchboard at Smith St, took 3hrs, all good"
✅ Report written + invoice sent automatically

Dashboard: https://YOUR-RAILWAY-URL.up.railway.app

---

## Need help?

Paste any error messages into Claude and I'll fix them immediately.
