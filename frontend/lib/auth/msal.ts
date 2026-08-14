import {
  Configuration,
  LogLevel,
  PublicClientApplication,
} from "@azure/msal-browser";

const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || "";
const tenantId = process.env.NEXT_PUBLIC_AZURE_TENANT_ID || "";

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isMsalConfigured =
  GUID_RE.test(clientId) && GUID_RE.test(tenantId) && !clientId.startsWith("xxxx");

const msalConfig: Configuration = {
  auth: {
    clientId: isMsalConfigured ? clientId : "00000000-0000-0000-0000-000000000000",
    authority: isMsalConfigured
      ? `https://login.microsoftonline.com/${tenantId}`
      : "https://login.microsoftonline.com/common",
    redirectUri: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Error,
    },
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: ["openid", "profile", "email", "User.Read"],
};

let initialized = false;

export async function ensureMsalInitialized() {
  if (!isMsalConfigured) {
    return null;
  }
  if (!initialized) {
    await msalInstance.initialize();
    initialized = true;
  }
  return msalInstance;
}
