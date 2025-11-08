# Supabase Authentication Setup

## Email Validation Issue

If you're getting an "Email address is invalid" error, you need to configure Supabase to allow the email format we're using.

## Solution 1: Disable Email Domain Validation (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Settings**
3. Under **Email Auth**, find **Email Domain Allowlist** or **Email Domain Blocklist**
4. Either:
   - Leave both fields empty (allows any domain)
   - Or add `katalyst.app` to the allowlist

## Solution 2: Disable Email Confirmation (For Testing)

1. Go to **Authentication** → **Settings**
2. Under **Email Auth**, disable **"Enable email confirmations"**
3. This allows users to sign up without email verification

## Solution 3: Use a Different Domain

If you prefer, you can modify `lib/supabase/auth.ts` to use a different domain format like:
- `username@example.com`
- `username@test.com`
- Or any domain you own

## Current Implementation

The app uses `username@katalyst.app` format internally, but users only see and enter their username. The email format is hidden from the UI.

