---
title: Set up iCloud
description: Connect an iCloud Mail account to Pelton using an app-specific password.
---

# iCloud

## Checklist
<div class="checklist" markdown>
- [ ] Turn on two-factor authentication
- [ ] Create an app-specific password
- [ ] Add the account in Pelton
</div>

!!! warning "Two-factor authentication is required"
    Apple only lets you create app-specific passwords once two-factor
    authentication is turned on for your Apple ID. If you haven't enabled
    it yet, turn it on in your Apple ID settings first, you'll be asked to
    confirm sign-in on a trusted device or phone number in addition to your
    password from then on.

!!! warning "You must use an app-specific password, not your Apple ID password"
    Apple rejects your normal Apple ID password for IMAP/SMTP mail apps.
    Pelton's **Password** field needs an app-specific password instead,
    generated separately for Pelton.

- [x] Turn on two-factor authentication

## Adding the account

1. Open **Add mailbox**, choose **Add a mailbox**, then pick **iCloud**
   from the provider list. Fill in your **Email** and **From name**. Pelton
   already knows iCloud's IMAP/SMTP hosts, so you won't need to touch those.

    ![The iCloud form: email, name, and a Password field asking for an app-specific password](../assets/screenshots/screenshot-mailbox-icloud-form.png)

2. Click **Create an app-specific password**. This opens
   [account.apple.com](https://account.apple.com/); sign in with your Apple
   ID if you aren't already.

3. Signing in lands you on **Sign-In & Security**. Scroll down and open
   **App-Specific Passwords**.

    ![account.apple.com's Sign-In & Security page, with App-Specific Passwords highlighted](../assets/screenshots/screenshot-apple-account-signin-security.png)

4. Click the **+** next to **Passwords**.

    ![The App-Specific Passwords panel with the + button to add a new one](../assets/screenshots/screenshot-apple-app-specific-passwords.png)

5. Type a name for it (for example "Pelton") and click **Create**.

    ![The Generate App-Specific Password dialog with "Pelton" typed in](../assets/screenshots/screenshot-apple-generate-app-password.png)

6. Apple shows you the generated password. Copy it, this is what goes in
   Pelton's **Password** field, then click **Done**.

    ![Apple's generated app-specific password dialog](../assets/screenshots/screenshot-apple-app-password-generated.png)

7. Back in Pelton, paste the app-specific password into the **Password**
   field, click **Test connection**, then **Add mailbox**.

- [x] Create an app-specific password
- [x] Add the account in Pelton

## Need help?

See [Support](../support.md).
