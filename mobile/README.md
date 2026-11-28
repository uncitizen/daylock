# Daylock Mobile

A React Native mobile app for Daylock with home screen widgets for iOS and Android.

## Features

- **My Day View**: View your daily timeline with tasks, calendar events, and completed items
- **Home Screen Widget**: See your day at a glance without opening the app
  - iOS: WidgetKit support with small, medium, and large sizes
  - Android: App Widget with customizable size
- **Stream Colors**: Tasks are color-coded by their stream (Work, Health, Kids, etc.)
- **Real-time Sync**: Pull to refresh to update your day
- **Secure Storage**: API credentials stored securely on device

## Setup

### Prerequisites

- Node.js 18+ and npm
- iOS: Xcode 15+ and an Apple Developer account
- Android: Android Studio and Android SDK

### Installation

1. Navigate to the mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install
```

3. For iOS, install CocoaPods dependencies:
```bash
cd ios
pod install
cd ..
```

### Running the App

#### iOS
```bash
npm run ios
```

#### Android
```bash
npm run android
```

### Development Server
```bash
npm start
```

## Configuration

On first launch, the app will prompt you to configure:

1. **API URL**: The URL of your Daylock instance (e.g., `https://your-daylock.com`)
2. **API Key**: Your personal API key from Daylock

### Getting an API Key

1. Log in to your Daylock web instance
2. Go to Settings → API Keys
3. Create a new API key
4. Copy the key and paste it into the mobile app

## Widgets

### iOS Widget

1. Long press on your home screen
2. Tap the "+" button in the top left
3. Search for "Daylock"
4. Choose a widget size (small, medium, or large)
5. Tap "Add Widget"

The widget updates every 15 minutes automatically.

### Android Widget

1. Long press on your home screen
2. Tap "Widgets"
3. Find "Daylock" in the list
4. Long press and drag to your home screen
5. Resize as needed

The widget updates every 15 minutes automatically.

## Building for Production

### iOS

1. Open `ios/Daylock.xcworkspace` in Xcode
2. Select your development team
3. Update the bundle identifier if needed
4. Archive and upload to App Store Connect

### Android

1. Generate a keystore:
```bash
keytool -genkey -v -keystore daylock.keystore -alias daylock -keyalg RSA -keysize 2048 -validity 10000
```

2. Build the release APK:
```bash
cd android
./gradlew assembleRelease
```

3. The APK will be at `android/app/build/outputs/apk/release/app-release.apk`

## Architecture

- **React Native**: Cross-platform mobile framework
- **Expo**: Development tooling and native module access
- **TypeScript**: Type-safe development
- **iOS Widget**: Swift + WidgetKit
- **Android Widget**: Kotlin + AppWidget

## API Integration

The app connects to your Daylock instance's REST API:

- `GET /api/v1/my-day?date=YYYY-MM-DD` - Fetch day timeline
- Authentication via Bearer token in the `Authorization` header

## Security

- API credentials stored in iOS Keychain / Android KeyStore
- Credentials shared with widgets via App Groups (iOS) / SharedPreferences (Android)
- HTTPS required for production API endpoints

## Troubleshooting

### Widget not updating

- **iOS**: Check that the widget has background app refresh enabled in Settings
- **Android**: Check that battery optimization is disabled for Daylock

### API connection errors

- Verify your API URL is correct (include `https://`)
- Check that your API key is valid
- Ensure your Daylock instance is accessible from your device's network

### Build errors

- **iOS**: Run `pod install` in the `ios` directory
- **Android**: Clean the build with `cd android && ./gradlew clean`

## License

Part of the Daylock project.
