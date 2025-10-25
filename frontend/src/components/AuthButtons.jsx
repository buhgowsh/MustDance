import { useAuth0 } from "@auth0/auth0-react";

export default function AuthButtons(){
    const {loginWithRedirect, logout, isAuthenticated, user} = useAuth0();

    return (
        <div className="flex gap-2 items-center">
            {isAuthenticated && <span className = "text-sm">Hi, {user?.name}</span>}
            {!isAuthenticated ? (
                <button className="btn" onClick={() => loginWithRedirect()}>Log in</button>
            ) : (
                <button className="btn" onClick={() => logout({ logoutParams: {returnTo: window.location.origin}})}>
                    Log out
                </button>
            )
            }
        </div>
    )
}