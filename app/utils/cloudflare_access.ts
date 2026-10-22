// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import urlParse from 'url-parse';

// Cloudflare Access sends unauthenticated requests to its login page, served under this path
// either on the team domain (<team>.cloudflareaccess.com) or on the protected hostname itself.
const CLOUDFLARE_ACCESS_LOGIN_PATH = '/cdn-cgi/access/login';

export function isCloudflareAccessLoginUrl(url: string) {
    return urlParse(url).pathname.startsWith(CLOUDFLARE_ACCESS_LOGIN_PATH);
}
