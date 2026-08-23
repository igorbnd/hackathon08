/**
 * Runtime configuration loader for InvoiceIQ SPA.
 *
 * Fetches /config.json at app startup to provide environment-specific values
 * (Cognito IDs, API base path, region) without baking them into the bundle.
 * The config.json file is generated post-deploy from CDK stack outputs.
 */

export interface AppConfig {
  /** Base path for API requests (e.g. '/api') */
  apiBasePath: string;
  /** Cognito User Pool ID */
  cognitoUserPoolId: string;
  /** Cognito User Pool Client ID */
  cognitoClientId: string;
  /** AWS region where Cognito is deployed */
  cognitoRegion: string;
  /** AWS region where the app is deployed */
  appRegion: string;
}

/** Default fallback config for local development */
const DEV_CONFIG: AppConfig = {
  apiBasePath: '/api',
  cognitoUserPoolId: '',
  cognitoClientId: '',
  cognitoRegion: 'eu-west-2',
  appRegion: 'eu-west-2',
};

let cachedConfig: AppConfig | null = null;
let configPromise: Promise<AppConfig> | null = null;

/**
 * Load runtime configuration from /config.json.
 * Returns cached result on subsequent calls.
 * Falls back to dev defaults if fetch fails (e.g. local dev without config.json).
 */
export function loadConfig(): Promise<AppConfig> {
  if (cachedConfig) {
    return Promise.resolve(cachedConfig);
  }

  if (configPromise) {
    return configPromise;
  }

  configPromise = fetch('/config.json')
    .then((response) => {
      if (!response.ok) {
        console.warn('[config] Failed to load /config.json, using dev defaults');
        return DEV_CONFIG;
      }
      return response.json() as Promise<AppConfig>;
    })
    .then((config) => {
      cachedConfig = config;
      return config;
    })
    .catch(() => {
      console.warn('[config] Failed to load /config.json, using dev defaults');
      cachedConfig = DEV_CONFIG;
      return DEV_CONFIG;
    });

  return configPromise;
}

/**
 * Get the cached config synchronously.
 * Throws if loadConfig() has not been called and resolved yet.
 */
export function getConfig(): AppConfig {
  if (!cachedConfig) {
    throw new Error('Config not loaded yet. Call loadConfig() first.');
  }
  return cachedConfig;
}
