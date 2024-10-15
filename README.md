# 2F2Chrome

2F2Chrome is a Chrome extension designed to automatically capture two-factor authentication (2FA) codes from Google Messages for use within the Chrome web browser.

![2F2Chrome Notification Screenshot](https://github.com/Joshua-Wise/2F2Chrome/blob/main/screenshots/Notification.png?raw=true)

## Features

- Automatically detects 2FA codes from various platforms
- Copies detected codes to the clipboard for easy use
- Provides a simple popup interface to view the latest captured code
- Optionally stores a history of recent codes
- Customizable settings for notifications and code history
- Supports both light and dark modes

## How It Works

1. **Content Script**: The extension uses a content script (`content.js`) that runs on the Google Messages website. This script monitors incoming messages for 2FA codes using predefined patterns.

2. **Pattern Matching**: The extension uses a set of regular expressions defined in `patterns.json` to identify 2FA codes from various services. These patterns are designed to catch codes from popular platforms and generic formats. (Thanks to the [2FHey project](https://github.com/SoFriendly/2fhey) for the initial patterns)

3. **Code Extraction**: When a matching pattern is found, the content script extracts the 2FA code and sends it to the background script.

4. **Background Processing**: The background script (`background.js`) receives the extracted code, copies it to the clipboard, and optionally shows a notification.

5. **Popup Interface**: The extension provides a popup interface (`popup.html` and `popup.js`) that displays the most recently captured code and allows users to quickly copy it.

6. **Settings**: Users can customize the extension's behavior through settings in the popup, including enabling/disabling notifications, dark mode, and code history.

## Installation

Option A:

1. Install from the Chrome Web Store: (pending approval) [2F2Chrome](https://chromewebstore.google.com/detail/afbmolpgnihkdnhepngkbkljjkggjhjp)

Option B:

1. Clone this repository or download the source code.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the directory containing the extension files.

## Usage

1. After installation, the 2F2Chrome icon will appear in your Chrome toolbar.
2. Navigate to [Google Messages](https://messages.google.com/) in your browser.
3. When a message containing a 2FA code is received, the extension will automatically detect and copy it.
4. Optionally, Click the 2F2Chrome icon in the toolbar to view the latest captured code, view settings, or access the code history.

## Privacy and Security

2F2Chrome operates entirely within your browser and does not send any data to external servers. All code processing and storage happens locally on your device.

## Contributing

Contributions to 2F2Chrome are welcome! Please feel free to submit pull requests, create issues, or suggest new features.

## Disclaimer

This extension is not affiliated with or endorsed by Google or any of the services it supports. Use at your own discretion and always follow best practices for managing your 2FA codes securely.
