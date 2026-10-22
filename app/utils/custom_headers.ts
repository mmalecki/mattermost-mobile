// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import * as ClientConstants from '@client/rest/constants';

export type CustomHeadersError = 'incomplete' | 'invalid_name' | 'invalid_value' | 'reserved' | 'duplicate';

// RFC 9110 token characters
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// Line breaks and other control characters would let a value inject extra headers
const HEADER_VALUE_INVALID_PATTERN = /[\x00-\x08\x0A-\x1F\x7F]/;

// Headers the app sets itself or the platform controls, lowercased
const RESERVED_HEADER_NAMES = new Set([
    ClientConstants.HEADER_ACCEPT,
    ClientConstants.HEADER_ACCEPT_LANGUAGE,
    ClientConstants.HEADER_AUTH,
    ClientConstants.HEADER_CACHE_CONTROL,
    ClientConstants.HEADER_REQUESTED_WITH,
    ClientConstants.HEADER_TOKEN,
    ClientConstants.HEADER_USER_AGENT,
    ClientConstants.HEADER_X_CSRF_TOKEN,
    ClientConstants.HEADER_X_MATTERMOST_PREAUTH_SECRET,
    'Connection',
    'Content-Length',
    'Content-Type',
    'Cookie',
    'Host',
    'Origin',
    'Transfer-Encoding',
].map((name) => name.toLowerCase()));

/**
 * Validates the rows entered by the user and returns the headers to send.
 * Names and values are trimmed and rows left completely empty are ignored.
 */
export function parseCustomHeaders(rows: CustomHeader[]): {headers: CustomHeader[]; error?: undefined} | {headers?: undefined; error: CustomHeadersError} {
    const headers: CustomHeader[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
        const name = row.name.trim();
        const value = row.value.trim();
        if (!name && !value) {
            continue;
        }
        if (!name || !value) {
            return {error: 'incomplete'};
        }
        if (!HEADER_NAME_PATTERN.test(name)) {
            return {error: 'invalid_name'};
        }
        if (HEADER_VALUE_INVALID_PATTERN.test(value)) {
            return {error: 'invalid_value'};
        }

        const lowerCaseName = name.toLowerCase();
        if (RESERVED_HEADER_NAMES.has(lowerCaseName)) {
            return {error: 'reserved'};
        }
        if (seen.has(lowerCaseName)) {
            return {error: 'duplicate'};
        }

        seen.add(lowerCaseName);
        headers.push({name, value});
    }

    return {headers};
}

export function getCustomHeadersRecord(customHeaders?: CustomHeader[]): Record<string, string> {
    const record: Record<string, string> = {};
    for (const {name, value} of customHeaders ?? []) {
        record[name] = value;
    }
    return record;
}

export function areCustomHeadersEqual(a: CustomHeader[] = [], b: CustomHeader[] = []) {
    return a.length === b.length && a.every((header, index) => header.name === b[index].name && header.value === b[index].value);
}
