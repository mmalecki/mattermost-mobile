// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isCloudflareAccessLoginUrl} from './cloudflare_access';

describe('isCloudflareAccessLoginUrl', () => {
    it('should detect the Cloudflare Access login page', () => {
        expect(isCloudflareAccessLoginUrl('https://team.cloudflareaccess.com/cdn-cgi/access/login/chat.example.com?kid=abc')).toBe(true);
    });

    it('should not flag other urls', () => {
        expect(isCloudflareAccessLoginUrl('https://chat.example.com/login')).toBe(false);
    });
});
