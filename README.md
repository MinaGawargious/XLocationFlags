# X Location & Device Badges

A Chrome extension that displays country flags and device/platform icons next to usernames on X (Twitter).

## Features

- 🌍 Shows the **account's based-in country flag** from their About page
- 🌎 Shows the **connected-via country flag** (the app store region they use)
- 🍎 Apple icon for iOS users (App Store)
- 🤖 Android robot for Android users (Play Store)
- 🌐 Globe for web users
- Works everywhere: timeline, profiles, replies, mentions, follower lists
- Smart caching to avoid rate limits (24 hours for success, 30 minutes for errors)
- Uses Twitter's own emoji CDN (twimg) for consistent styling

## How It Works

1. The extension monitors the page for usernames
2. For each unique username, it queries Twitter's internal GraphQL API (`AboutAccountQuery`)
3. The API returns `account_based_in` and `connected_via` information
4. Flags and platform icons are displayed next to the username
5. Results are cached in localStorage to minimize API calls

## Installation

1. Download and extract the zip file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the extracted `x-location-badges` folder
6. Navigate to X.com - badges will appear automatically!

## What the Badges Mean

| Badge | Meaning |
|-------|---------|
| 🇺🇸 | Country flag where account is based |
| 🇺🇸🇯🇵 | Two flags = based-in and connected-via countries differ |
| 🍎 | User connected via iOS App Store |
| 🤖 | User connected via Android/Play Store |
| 🌐 | User connected via web |
| 🌍🌎🌏 | Region globe when only region is available (not specific country) |

## Technical Details

- Uses page script injection to access Twitter's authenticated session
- Intercepts fetch/XHR to capture auth headers (Bearer token, CSRF token)
- Rate-limited to 200ms between requests to avoid 429 errors
- Maximum 3 concurrent requests at any time
- Cache stored in localStorage with automatic cleanup

## Privacy

- No data is sent to any third-party servers
- All API calls go directly to Twitter/X
- Location data is cached locally only
- The extension only reads public account information

## Troubleshooting

**Badges not appearing?**
- Make sure you're logged into X
- Refresh the page
- Check the browser console for any errors
- Some accounts may not have location information available

**Getting rate limited (429 errors)?**
- The extension automatically handles this with caching
- Wait a few minutes and badges will start appearing again
- Errors are cached for 30 minutes to prevent repeated failed requests

**Badges appearing slowly?**
- This is intentional to avoid rate limits
- Requests are throttled to 200ms intervals
- Cached data loads instantly

## Files

```
x-location-badges/
├── manifest.json      # Extension configuration
├── content.js         # Main content script (DOM manipulation, caching)
├── pageScript.js      # Page context script (API calls)
├── locationMappings.js # Country/region to flag mappings
├── styles.css         # Badge styling
├── icon16.png         # Extension icon
├── icon48.png
├── icon128.png
└── README.md
```

## License

MIT
