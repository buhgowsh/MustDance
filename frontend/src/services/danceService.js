import { LOCAL_DANCES } from "../dances/localDances";

export async function getDanceConfig(nameOrQuery) {
    if(LOCAL_DANCES[nameOrQuery]) return LOCAL_DANCES[nameOrQuery];
    //ADK HERE
    return LOCAL_DANCES["salsa-basic"];
}