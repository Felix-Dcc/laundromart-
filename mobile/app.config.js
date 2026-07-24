/**
 * Expo app config. Replaces the former static app.json so that secrets and
 * environment-specific values (API URL, Google Maps key) come from the
 * environment rather than being committed.
 *
 * APP_ENV is set per build profile in eas.json. Local `expo start` leaves it
 * undefined, which is treated as development.
 */

const APP_ENV = process.env.APP_ENV || 'development';
const IS_PROD = APP_ENV === 'production';

// Brand palette — keep in sync with scripts/brand/generate_icons.py, which
// renders every icon from these same values.
const BRAND_BLUE = '#1B7BF7'; // primary
const BRAND_DEEP = '#0B4FD8'; // splash / adaptive backdrop

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// A production binary that ships pointing at a dev machine is unrecoverable
// once submitted, so fail the build here rather than at review. Gate on
// EAS_BUILD so this only runs inside the real cloud build (where EAS injects
// the secrets) — not during `eas build`'s local config pre-eval, which sets
// APP_ENV=production but intentionally doesn't load .env or the secrets.
if (IS_PROD && process.env.EAS_BUILD) {
  const errors = [];

  if (!API_URL) {
    errors.push('EXPO_PUBLIC_API_URL is not set.');
  } else {
    let host = null;
    try {
      const parsed = new URL(API_URL);
      host = parsed.hostname;
      if (parsed.protocol !== 'https:') {
        errors.push(`EXPO_PUBLIC_API_URL must use https:// (got "${parsed.protocol}//").`);
      }
    } catch {
      errors.push(`EXPO_PUBLIC_API_URL is not a valid URL (got "${API_URL}").`);
    }

    // Private / loopback hosts are unreachable from a reviewer's device.
    const isPrivateHost =
      host &&
      (host === 'localhost' ||
        host.endsWith('.local') ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host));

    if (isPrivateHost) {
      errors.push(`EXPO_PUBLIC_API_URL points at a private address ("${host}"); store reviewers cannot reach it.`);
    }
  }

  // A key that is merely *present* is not enough — the repo shipped with the
  // literal placeholder as its value, which would build cleanly and render
  // blank maps in production.
  if (!MAPS_KEY) {
    errors.push('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set; maps would render blank.');
  } else if (/^YOUR_|_HERE$|PLACEHOLDER|CHANGEME/i.test(MAPS_KEY)) {
    errors.push(`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is still a placeholder ("${MAPS_KEY}").`);
  } else if (!MAPS_KEY.startsWith('AIza')) {
    // Deliberately loose: only reject what is certainly wrong. Google keys
    // begin with "AIza", but exact length is not worth hard-failing a build
    // over. `npm run preflight` reports softer format concerns.
    errors.push(`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY does not look like a Google API key (should start with "AIza").`);
  }

  if (errors.length) {
    throw new Error(
      `\nProduction build blocked — fix the following, then rebuild:\n` +
        errors.map((e) => `  • ${e}`).join('\n') +
        `\n\nSet these as EAS secrets:\n` +
        `  eas secret:create --name EXPO_PUBLIC_API_URL --value https://api.yourdomain.com/api\n` +
        `  eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value <key>\n`
    );
  }
}

module.exports = {
  expo: {
    name: 'LaundroMart',
    slug: 'laundromat',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    scheme: 'laundromat',
    // Lets OTA updates target compatible binaries automatically.
    runtimeVersion: { policy: 'appVersion' },
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: BRAND_DEEP,
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.lms.laundromat',
      // buildNumber is managed remotely by EAS (see appVersionSource in eas.json).
      config: {
        googleMapsApiKey: MAPS_KEY,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'We need your location to find nearby laundromats and provide navigation.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'We need your location to track rider deliveries in real time.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundImage: './assets/adaptive-icon-bg.png',
        // Android 13+ themed icons: OS tints this by alpha.
        monochromeImage: './assets/adaptive-icon-mono.png',
        backgroundColor: BRAND_BLUE,
      },
      package: 'com.lms.laundromat',
      config: {
        googleMaps: {
          apiKey: MAPS_KEY,
        },
      },
      // versionCode is managed remotely by EAS (see appVersionSource in eas.json).
      // Plain HTTP is needed to reach a dev server on the LAN; production is
      // HTTPS-only, and Apple's ATS would reject cleartext regardless.
      usesCleartextTraffic: !IS_PROD,
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-asset',
      'expo-font',
      'expo-secure-store',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Allow LaundroMart to use your location for finding nearby services and rider navigation.',
        },
      ],
      [
        'expo-notifications',
        {
          // Must be a white-on-transparent silhouette: Android keeps only the
          // alpha channel, so a full-colour icon renders as a white blob.
          icon: './assets/notification-icon.png',
          color: BRAND_BLUE,
        },
      ],
    ],
    extra: {
      appEnv: APP_ENV,
      eas: { projectId: 'f1db1707-fb6c-4c19-9c1b-d691917deb1d' },
    },
  },
};
