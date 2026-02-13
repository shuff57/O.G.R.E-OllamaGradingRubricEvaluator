- **Status Indicator Logic Change**: 
  - The old tab system allowed seeing the status of all providers simultaneously (colored dots on each tab).
  - The new dropdown system only shows the status of the *currently selected* provider via the `#providerStatus` indicator.
  - `updateProviderTabStatus(providerId)` was updated to only act if `providerId === currentProviderId`.

- **Desktop Connection UI Strategy**:
  - Used body class `desktop-connected` to control visibility of auth elements via CSS `display: none !important`. This is cleaner than traversing and hiding elements individually in JS.
  - Added `desktopProviderInfo` block inside `desktopModeContent` to respect the visibility logic of that container, ensuring it is hidden when disconnected.
  - Extracted provider info in `applyDesktopProviders` instead of adding a separate message listener, to keep the connection logic centralized.
