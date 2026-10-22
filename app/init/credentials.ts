// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Platform} from 'react-native';
import * as KeyChain from 'react-native-keychain';

import DatabaseManager from '@database/manager';
import {safeParseJSON} from '@utils/helpers';
import {logWarning} from '@utils/log';
import {getIOSAppGroupDetails} from '@utils/mattermost_managed';

// Custom headers are a generic password keyed by this prefix plus the server url,
// with the headers serialized as a JSON array of {name, value} in the password.
const CUSTOM_HEADERS_SERVICE_PREFIX = 'custom-headers:';
const CUSTOM_HEADERS_USERNAME = 'custom_headers';

const getCustomHeadersService = (serverUrl: string) => `${CUSTOM_HEADERS_SERVICE_PREFIX}${serverUrl}`;

// After initialize(), this is the logged-in DB-active set — not a live Keystore listing.
let cachedServerCredentials: ServerCredential[] | undefined;

export const clearCachedServerCredentials = () => {
    cachedServerCredentials = undefined;
};

const replaceCachedCredential = (serverUrl: string, credential: ServerCredential | null) => {
    if (cachedServerCredentials === undefined) {
        return;
    }

    const rest = cachedServerCredentials.filter((c) => c.serverUrl !== serverUrl);
    cachedServerCredentials = credential ? [...rest, credential] : rest;
};

const getAllKeychainServerUrls = async (): Promise<string[]> => {
    if (Platform.OS === 'ios') {
        return KeyChain.getAllInternetPasswordServers();
    }

    // Android stores internet credentials as generic passwords, so the listing includes our other entries too
    const services = await KeyChain.getAllGenericPasswordServices();
    return services.filter((service) => !service.startsWith(CUSTOM_HEADERS_SERVICE_PREFIX));
};

export const getAllServerCredentials = async (knownServerUrls?: string[]): Promise<ServerCredential[]> => {
    if (cachedServerCredentials !== undefined) {
        return cachedServerCredentials.map((c) => ({...c}));
    }

    let serverUrls: string[];

    // Empty knownServerUrls intentionally lists (wiped/fresh DB).
    if (knownServerUrls?.length) {
        serverUrls = knownServerUrls;
    } else {
        serverUrls = await getAllKeychainServerUrls();
    }

    const serverCredentials = (await Promise.all(
        serverUrls.map((serverUrl) => getServerCredentials(serverUrl)),
    )).filter((credential): credential is ServerCredential => Boolean(credential));

    cachedServerCredentials = serverCredentials;
    return serverCredentials.map((c) => ({...c}));
};

export const getActiveServerUrl = async () => {
    let serverUrl = await DatabaseManager.getActiveServerUrl();
    if (!serverUrl) {
        const serverUrls = await getAllKeychainServerUrls();
        serverUrl = serverUrls[0];
    }
    return serverUrl || undefined;
};

export const setServerCredentials = async (serverUrl: string, token: string, preauthSecret?: string, customHeaders?: CustomHeader[]) => {
    if (!(serverUrl && token)) {
        return;
    }

    try {
        let accessGroup;
        if (Platform.OS === 'ios') {
            const appGroup = getIOSAppGroupDetails();
            accessGroup = appGroup.appGroupIdentifier;
        }

        const options: KeyChain.SetOptions = {
            accessGroup,
            securityLevel: KeyChain.SECURITY_LEVEL.SECURE_SOFTWARE,
        };

        const stored = await KeyChain.setInternetCredentials(serverUrl, token, token, options);
        if (stored === false) {
            throw new Error('failed to store credentials');
        }

        if (preauthSecret) {
            const storedSecret = await KeyChain.setGenericPassword('preshared_secret', preauthSecret, {
                server: serverUrl,
                ...options,
            });
            if (storedSecret === false) {
                throw new Error('failed to store preauth secret');
            }
        } else {
            const reset = await KeyChain.resetGenericPassword({
                server: serverUrl,
                ...options,
            });
            if (reset === false) {
                throw new Error('failed to reset preauth secret');
            }
        }

        const customHeadersService = getCustomHeadersService(serverUrl);
        if (customHeaders?.length) {
            const storedHeaders = await KeyChain.setGenericPassword(CUSTOM_HEADERS_USERNAME, JSON.stringify(customHeaders), {
                service: customHeadersService,
                ...options,
            });
            if (storedHeaders === false) {
                throw new Error('failed to store custom headers');
            }
        } else {
            const reset = await KeyChain.resetGenericPassword({
                service: customHeadersService,
                ...options,
            });
            if (reset === false) {
                throw new Error('failed to reset custom headers');
            }
        }

        replaceCachedCredential(serverUrl, {serverUrl, userId: token, token, preauthSecret, customHeaders});
    } catch (e) {
        logWarning('could not set credentials', e);
    }
};

export const removeServerCredentials = async (serverUrl: string) => {
    await KeyChain.resetInternetCredentials({server: serverUrl});
    replaceCachedCredential(serverUrl, null);
};

export const removePreauthSecret = async (serverUrl: string) => {
    try {
        const reset = await KeyChain.resetGenericPassword({server: serverUrl});
        if (reset === false) {
            return;
        }
        const existing = cachedServerCredentials?.find((c) => c.serverUrl === serverUrl);
        if (existing) {
            existing.preauthSecret = undefined;
        }
    } catch (e) {
        // Preauth secret might not exist, ignore errors
    }
};

export const removeCustomHeaders = async (serverUrl: string) => {
    try {
        const reset = await KeyChain.resetGenericPassword({service: getCustomHeadersService(serverUrl)});
        if (reset === false) {
            return;
        }
        const existing = cachedServerCredentials?.find((c) => c.serverUrl === serverUrl);
        if (existing) {
            existing.customHeaders = undefined;
        }
    } catch (e) {
        // Custom headers might not exist, ignore errors
    }
};

export const getCustomHeaders = async (serverUrl: string): Promise<CustomHeader[] | undefined> => {
    try {
        const credentials = await KeyChain.getGenericPassword({service: getCustomHeadersService(serverUrl)});
        if (!credentials) {
            return undefined;
        }
        const customHeaders = safeParseJSON(credentials.password);
        return Array.isArray(customHeaders) && customHeaders.length ? customHeaders as CustomHeader[] : undefined;
    } catch (e) {
        return undefined;
    }
};

export const getPreauthSecret = async (serverUrl: string): Promise<string | undefined> => {
    try {
        const preauthCredentials = await KeyChain.getGenericPassword({
            server: serverUrl,
        });
        const secret = preauthCredentials ? preauthCredentials.password : undefined;
        return secret;
    } catch (e) {
        return undefined;
    }
};

export const removeActiveServerCredentials = async () => {
    const serverUrl = await getActiveServerUrl();
    if (serverUrl) {
        await removeServerCredentials(serverUrl);
    }
};

export const getServerCredentials = async (serverUrl: string): Promise<ServerCredential|null> => {
    const cached = cachedServerCredentials?.find((c) => c.serverUrl === serverUrl);
    if (cached) {
        return {...cached};
    }

    try {
        // Get main credentials
        const credentials = await KeyChain.getInternetCredentials(serverUrl);

        if (!credentials) {
            return null;
        }

        // TODO: Pre-Gekidou we were concatenating the deviceToken and the userId in
        // credentials.username so we need to check the length of credentials.username.split(',').
        // This check should be removed at some point. https://mattermost.atlassian.net/browse/MM-43483
        const parts = credentials.username.split(',');
        const userId = parts[parts.length - 1];
        const token = credentials.password;

        if (!token || token === 'undefined') {
            return null;
        }

        // Get preauth secret separately
        let preauthSecret: string | undefined;
        try {
            const preauthCredentials = await KeyChain.getGenericPassword({
                server: serverUrl,
            });
            preauthSecret = preauthCredentials ? preauthCredentials.password : undefined;
        } catch (e) {
            // Preauth secret is optional, so ignore errors
            preauthSecret = undefined;
        }

        return {
            serverUrl,
            userId,
            token,
            preauthSecret,
            customHeaders: await getCustomHeaders(serverUrl),
        };
    } catch (e) {
        return null;
    }
};
