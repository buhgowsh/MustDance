import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { Auth0Provider } from "@auth0/auth0-react";

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

if (!domain || !clientId) {
  // This is the #1 cause of a white screen (Auth0 throws on undefined).
  console.error("Missing VITE_AUTH0_DOMAIN or VITE_AUTH0_CLIENT_ID in your env.");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin, // back to Home after login
      }}
      cacheLocation="localstorage"   // survive page refresh
      useRefreshTokens={true}        // keep session valid
      onRedirectCallback={(appState) => {
        // Return where we came from, otherwise stay on current route.
        const url = appState?.returnTo || window.location.pathname;
        window.history.replaceState({}, document.title, url);
      }}
    >
      <App />
    </Auth0Provider>
  </React.StrictMode>
);
