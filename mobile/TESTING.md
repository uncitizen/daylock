# Testing Daylock Mobile on Your Phone

## Quick Start - Test on Your Phone (5 minutes)

### Prerequisites
- A smartphone (iOS or Android)
- Install **Expo Go** app (free):
  - iOS: [App Store](https://apps.apple.com/app/apple-store/id982107779)
  - Android: [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

### Steps

1. **Clone and install on your computer:**
   ```bash
   git clone https://github.com/uncitizen/daylock
   cd daylock/mobile
   npm install
   ```

2. **Start the dev server:**
   ```bash
   npx expo start
   ```

3. **Connect your phone:**
   - **iOS**: Open Camera app, scan the QR code shown in terminal
   - **Android**: Open Expo Go app, tap "Scan QR code", scan the QR code
   
   Your phone and computer must be on the **same WiFi network**.

4. **First-time setup in the app:**
   - Enter your Daylock URL (e.g., `http://your-computer-ip:3000` or `https://your-daylock.com`)
   - Enter your API key (get it from your Daylock instance at `/api-keys`)
   - Tap "Connect"

5. **You should see:**
   - My Day screen with your tasks
   - Warm paper aesthetic matching the web app
   - Stream-colored task cards
   - Pull to refresh to update

## Testing the Widget

Widgets need a **built app** (not Expo Go). To test widgets:

### iOS Widget Testing

1. **Build the app:**
   ```bash
   npx expo run:ios
   ```

2. **Add widget to home screen:**
   - Long press on your home screen
   - Tap the "+" button
   - Search for "Daylock"
   - Choose widget size (small, medium, or large)
   - Tap "Add Widget"

### Android Widget Testing

1. **Build the app:**
   ```bash
   npx expo run:android
   ```

2. **Add widget to home screen:**
   - Long press on your home screen
   - Tap "Widgets"
   - Find "Daylock" in the list
   - Long press and drag to your home screen
   - Resize as needed

## Troubleshooting

### "Unable to connect to packager"
- Make sure your phone and computer are on the same WiFi
- Check your firewall isn't blocking port 8081
- Try `npx expo start --tunnel` (requires ngrok)

### "Network error" in the app
- Check your API URL is correct
- Make sure your Daylock instance is accessible from your phone
- If testing locally, use your computer's local IP (e.g., `http://192.168.1.100:3000`)
- Test the API URL in your phone's browser first

### App doesn't update when you make changes
- Shake your phone to open the dev menu
- Tap "Reload" or press `r` in the terminal

### Widget shows "Not configured"
- Open the main app first and configure your API credentials
- The app shares credentials with the widget via secure storage

## Development Tips

### Hot Reload
Changes to `.tsx` files reload automatically. Just save and watch your phone update!

### Debugging
- Shake your phone to open the developer menu
- Enable "Debug Remote JS" to use Chrome DevTools
- Press `j` in the terminal to open the debugger

### Testing on Both Platforms
```bash
# iOS Simulator (requires macOS + Xcode)
npx expo run:ios

# Android Emulator (requires Android Studio)
npx expo run:android
```

## What to Test

### Core Functionality
- [ ] Setup screen accepts API URL and key
- [ ] My Day screen loads your timeline
- [ ] Tasks show correct stream colors
- [ ] Calendar events show with locked (navy) border
- [ ] Hard tasks show with amber background
- [ ] Completed section shows finished tasks
- [ ] Pull to refresh updates the data

### Design System
- [ ] Warm paper background (#f3f0e8)
- [ ] Serif font for headers
- [ ] 4px colored left borders on task cards
- [ ] Proper colors: ink, muted, accent, locked, hard
- [ ] Cards use warm beige background (#e8e4d9)

### Widget (Requires Built App)
- [ ] Widget shows up to 5 upcoming tasks
- [ ] Stream colors appear as left borders
- [ ] Time displays for calendar events
- [ ] Widget updates every 15 minutes
- [ ] Tapping widget opens the app

## Next Steps

Once you've tested the basic functionality:
1. Report any issues you find
2. Try different screen sizes
3. Test with your actual daily schedule
4. Check widget behavior throughout the day

## Getting Help

If you encounter issues:
1. Check the [README](README.md) for setup details
2. Review the [DESIGN](DESIGN.md) docs for expected behavior
3. Open an issue on GitHub with:
   - Your phone model and OS version
   - Steps to reproduce
   - Screenshot if relevant
