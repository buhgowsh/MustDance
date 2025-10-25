import { useAuth0 } from "@auth0/auth0-react";

export default function Protected({children}) {
    const{isAuthenticated, isLoading} = useAuth0();
    if(isLoading) return <div className="p-6">Loading...</div>;
    if(!isAuthenticated) return <div className="p-6">Please log in to play.</div>;
    return children;
}